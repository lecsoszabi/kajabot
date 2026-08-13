import puppeteer from 'puppeteer';
import { parseWeeklyMenuText } from './famousParser.js';
import { getMondayOfWeek } from './menumApi.js';

const PAGE_SLUG = 'famousszeged';
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

async function getCandidatePosts(page) {
  return page.evaluate(() => {
    const seen = new Set();
    const results = [];
    const links = Array.from(document.querySelectorAll('a[href*="/posts/"]'));
    for (const link of links) {
      const match = link.href.match(/\/posts\/([^/?]+)/);
      if (!match) continue;
      const id = match[1];
      if (seen.has(id)) continue;
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

function isWeekReasonable(weekMonday, referenceDate) {
  const monday = new Date(weekMonday);
  const diffDays = (monday - getMondayOfWeek(referenceDate)) / (1000 * 60 * 60 * 24);
  return diffDays >= -10 && diffDays <= 14;
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

    await page.goto(`https://www.facebook.com/${PAGE_SLUG}?locale=hu_HU`, { waitUntil: 'networkidle2', timeout: 30000 });
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

    if (!candidates.length) {
      return { success: false, reason: 'Nem találtam egyetlen posztot sem az oldalon.' };
    }

    for (const candidate of candidates) {
      const url = `https://www.facebook.com/${PAGE_SLUG}/posts/${candidate.id}`;
      try {
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 20000 });
        await sleep(1000);
        const text = await page.evaluate(() => document.body.innerText);
        const week = parseWeeklyMenuText(text, referenceDate);
        if (!isWeekReasonable(week.weekMonday, referenceDate)) continue;
        return { success: true, week, sourceUrl: url };
      } catch {
        continue;
      }
    }

    return { success: false, reason: 'A legutóbbi posztok egyikéből sem sikerült heti menüt kiolvasni.' };
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
