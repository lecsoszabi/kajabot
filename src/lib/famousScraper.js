import puppeteer from 'puppeteer';
import { parseWeeklyMenuText } from './famousParser.js';
import { getMondayOfWeek, toDateString } from './menumApi.js';

const PAGE_SLUG = 'famousszeged';
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// A Facebook háttérbeli lekérései miatt a networkidle2 néha timeoutol akkor is, amikor a DOM
// és a poszt szövege már betöltött — ilyenkor nem dobjuk el az oldalt, ha már van tartalom.
async function safeGoto(page, url, timeout = 25000) {
  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout });
  } catch (err) {
    const hasContent = await page.evaluate(() => (document.body?.innerText?.length || 0) > 100).catch(() => false);
    if (!hasContent) throw err;
  }
}

// Facebook a "cookie elfogadása" / "bejelentkezés" felugrókat aria-label vagy sima
// szöveg alapján jeleníti meg, stabil CSS selector nélkül — szöveg-egyezéssel keressük őket.
// A felugrók nyelve nem mindig igazodik a locale paraméterhez, ezért HU+EN variánst is nézünk.
async function clickByLabel(page, matchers) {
  return page.evaluate((matchers) => {
    const candidates = Array.from(document.querySelectorAll('[role="button"], button, [aria-label]'));
    for (const el of candidates) {
      const label = `${el.getAttribute('aria-label') || ''} ${el.innerText || ''}`.toLowerCase();
      if (matchers.some((m) => label.includes(m))) {
        el.click();
        return true;
      }
    }
    return false;
  }, matchers);
}

// A publikus főoldali hírfolyam nem mindig időrendi, és néha kihagy friss képes posztokat
// (pl. ha aznap eseményt is létrehoztak), viszont a /photos fülön a feltöltött képek
// szigorúan időrendben szerepelnek, és az fbid-jük /posts/<fbid> alatt szöveggel együtt megnyitható.
async function getPhotoCandidates(page) {
  const html = await page.content();
  const seen = new Set();
  const results = [];

  for (const match of html.matchAll(/photo\.php\?fbid=(\d+)/g)) {
    const id = match[1];
    if (!seen.has(id)) {
      seen.add(id);
      results.push({ id, preview: '' });
    }
  }

  if (!results.length) {
    const fallbackIds = [...new Set([...html.matchAll(/[?&]fbid=(\d+)/g)].map((m) => m[1]))].sort((a, b) =>
      BigInt(b) > BigInt(a) ? 1 : -1,
    );
    for (const id of fallbackIds) {
      results.push({ id, preview: '' });
    }
  }

  return results;
}

async function getCandidatePosts(page) {
  return page.evaluate(() => {
    const seen = new Set();
    const results = [];
    const links = Array.from(document.querySelectorAll('a[href*="/posts/"], a[href*="/photo/?fbid="]'));
    for (const link of links) {
      const postMatch = link.href.match(/\/posts\/([^/?]+)/);
      const photoMatch = link.href.match(/[?&]fbid=(\d+)/);
      const id = postMatch ? postMatch[1] : photoMatch ? photoMatch[1] : null;
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const article = link.closest('[role="article"]') || link.closest('article');
      const preview = article ? article.innerText.slice(0, 400) : '';
      results.push({ id, preview });
    }
    return results;
  });
}

// A hírfolyam posztjai lustán (scroll-triggerelt) töltődnek be — fix várakozás helyett addig
// görgetünk, amíg tényleg megjelenik elég poszt, vagy elfogy a próbálkozás.
async function collectCandidates(page, { minCandidates = 3, maxAttempts = 10 } = {}) {
  let candidates = await getCandidatePosts(page);
  for (let i = 0; i < maxAttempts && candidates.length < minCandidates; i++) {
    await page.evaluate(() => window.scrollBy(0, 1200));
    await sleep(1200);
    candidates = await getCandidatePosts(page);
  }
  return candidates;
}

// Csak az aktuális (vagy vasárnapi előre-posztolásnál a következő) hét menüjét fogadjuk el —
// a múlt heti (-7 napos) menüt nem, különben a scraper tévesen "sikeresnek" jelentené a régi hetet.
function isWeekReasonable(weekMonday, referenceDate) {
  const monday = new Date(`${weekMonday}T00:00:00Z`);
  const currentMonday = new Date(`${toDateString(getMondayOfWeek(referenceDate))}T00:00:00Z`);
  const diffDays = Math.round((monday - currentMonday) / (1000 * 60 * 60 * 24));
  return diffDays >= 0 && diffDays <= 7;
}

async function tryCandidates(page, candidates, referenceDate, seenIds) {
  for (const candidate of candidates) {
    if (seenIds.has(candidate.id)) continue;
    seenIds.add(candidate.id);
    const sourceUrl = `https://www.facebook.com/${PAGE_SLUG}/posts/${candidate.id}`;
    try {
      await safeGoto(page, `${sourceUrl}?locale=hu_HU`, 20000);
      await sleep(1000);
      const text = await page.evaluate(() => document.body.innerText);
      const week = parseWeeklyMenuText(text, referenceDate);
      if (!isWeekReasonable(week.weekMonday, referenceDate)) continue;
      return { success: true, week, sourceUrl };
    } catch {
      continue;
    }
  }
  return null;
}

async function attemptScrape(referenceDate, maxCandidates) {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent(USER_AGENT);
    await page.setViewport({ width: 900, height: 1000 });
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'hu-HU,hu;q=0.9,en;q=0.5' });

    const seenIds = new Set();

    // 1. Elsődlegesen a /photos oldalról gyűjtjük a legfrissebb képes posztokat, mert a Facebook
    // ott szigorú időrendben adja vissza őket (a főoldali feedből néha kimaradnak posztok).
    try {
      await safeGoto(page, `https://www.facebook.com/${PAGE_SLUG}/photos?locale=hu_HU`, 25000);
      await sleep(1000);
      const photoCandidates = (await getPhotoCandidates(page)).slice(0, maxCandidates);
      const photoHit = await tryCandidates(page, photoCandidates, referenceDate, seenIds);
      if (photoHit) return photoHit;
    } catch {
      // Ha a /photos nem töltene be, továbbmegyünk a főoldali hírfolyamra
    }

    // 2. Tartalékként a főoldali hírfolyamot is átnézzük (pl. ha szöveges posztként került ki a menü).
    await safeGoto(page, `https://www.facebook.com/${PAGE_SLUG}?locale=hu_HU`, 30000);
    await sleep(1500);
    await clickByLabel(page, ['nem kötelező', 'decline optional']);
    await sleep(1000);
    await clickByLabel(page, ['bezárás', 'close']);
    await sleep(1500);

    let candidates = await collectCandidates(page);
    candidates = candidates.slice(0, maxCandidates);
    candidates.sort((a, b) => {
      const aHit = /menü|hétfő/i.test(a.preview) ? 0 : 1;
      const bHit = /menü|hétfő/i.test(b.preview) ? 0 : 1;
      return aHit - bHit;
    });

    if (!candidates.length && !seenIds.size) {
      return { success: false, reason: 'Nem találtam egyetlen posztot sem az oldalon.' };
    }

    const feedHit = await tryCandidates(page, candidates, referenceDate, seenIds);
    if (feedHit) return feedHit;

    return { success: false, reason: 'A legutóbbi posztok egyikéből sem sikerült az aktuális heti menüt kiolvasni.' };
  } catch (err) {
    return { success: false, reason: `Hiba a scrapelés közben: ${err.message}` };
  } finally {
    await browser.close();
  }
}

// Betölti a Famous Steakbisztró Facebook-oldalát bejelentkezés nélkül (fejnélküli Chrome-mal —
// sima HTTP-fetch nem működik, a Facebook bot-detektálása hibaoldalt ad vissza rá), megkeresi a
// legutóbbi posztokat, és permalink-enként megpróbálja a heti menü szöveget kiparse-olni belőlük.
// A betöltési időzítés ingadozhat, ezért egy sikertelen próbálkozás után újra próbálkozik.
export async function scrapeFamousMenu({ maxCandidates = 6, referenceDate = new Date(), retries = 1 } = {}) {
  let lastResult;
  for (let attempt = 0; attempt <= retries; attempt++) {
    lastResult = await attemptScrape(referenceDate, maxCandidates);
    if (lastResult.success) return lastResult;
  }
  return lastResult;
}
