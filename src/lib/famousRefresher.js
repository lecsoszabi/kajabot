import { budapestNow } from './menumApi.js';
import { hasCurrentWeekData, saveFamousWeek } from './famousStore.js';
import { scrapeFamousMenu } from './famousScraper.js';

const TICK_MS = 30 * 60 * 1000; // 30 percenként vizsgálja, hogy kell-e egyáltalán próbálkozni
const HOURLY_RETRY_MS = 60 * 60 * 1000;
// A Famous mindig hétfőn posztolja a heti menüt, de az időpont ingadozik (megfigyelve: 7-11 óra
// magyar idő között) — hétfőn kellő korai kezdéssel próbálkozunk; ha addig nem jönne ki, kedden
// és szerdán is (tartalékként), utána viszont leállunk a következő hétig.
const ACTIVE_UTC_DAYS = [1, 2, 3]; // hétfő, kedd, szerda
const START_HOUR = 7;
const GITHUB_REPO = process.env.GITHUB_REPO || 'lecsoszabi/kajabot';
const WORKFLOW_FILE = 'famous-scrape.yml';

let refreshInProgress = false;
let lastAttemptAt = 0;

function isDateStrInActiveWindow(dateStr) {
  return ACTIVE_UTC_DAYS.includes(new Date(`${dateStr}T00:00:00Z`).getUTCDay());
}

function isActiveWindowNow() {
  const { dateStr, hour } = budapestNow();
  return isDateStrInActiveWindow(dateStr) && Number(hour) >= START_HOUR;
}

// A GitHub Actions ütemezett cron-ja megbízhatatlan (terheléskor késhet vagy teljesen kimarad),
// ezért a 24/7 futó bot maga is elindítja a scrape workflow-t, ha hétfő-szerda reggel hiányzik az
// e heti adat. A workflow futtatja a (RAM-igényes) Puppeteert, és commitolja a friss menüt, amit a
// bot pár percen belül beolvas a FAMOUS_DATA_URL-ről.
async function triggerGithubScrape() {
  const url = `https://api.github.com/repos/${GITHUB_REPO}/actions/workflows/${WORKFLOW_FILE}/dispatches`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_DISPATCH_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'kajabot',
    },
    body: JSON.stringify({ ref: 'main' }),
  });
  if (res.status !== 204) {
    throw new Error(`GitHub workflow dispatch hiba (${res.status}): ${await res.text()}`);
  }
}

async function checkAndTrigger() {
  if (refreshInProgress || !isActiveWindowNow() || (await hasCurrentWeekData())) return;
  if (Date.now() - lastAttemptAt < HOURLY_RETRY_MS) return;
  lastAttemptAt = Date.now();

  refreshInProgress = true;
  console.log('Famous: hiányzik az e heti menü — GitHub scrape workflow indítása...');
  try {
    await triggerGithubScrape();
    console.log('Famous: GitHub scrape workflow elindítva, a friss adat pár percen belül elérhető lesz.');
  } catch (err) {
    console.error('Famous: nem sikerült elindítani a GitHub scrape workflow-t:', err.message);
  } finally {
    refreshInProgress = false;
  }
}

async function checkAndScrapeLocally() {
  if (refreshInProgress || !isActiveWindowNow() || (await hasCurrentWeekData())) return;
  if (Date.now() - lastAttemptAt < HOURLY_RETRY_MS) return;
  lastAttemptAt = Date.now();

  refreshInProgress = true;
  console.log('Famous: hiányzik az e heti menü (hétfő-szerda ablak) — helyi scrapelés...');
  try {
    const result = await scrapeFamousMenu();
    if (result.success) {
      saveFamousWeek(result.week);
      console.log(`Famous heti menü frissítve (hét eleje: ${result.week.weekMonday}), forrás: ${result.sourceUrl}`);
    } else {
      console.warn(`Famous frissítés sikertelen: ${result.reason} — a /famousheti paranccsal manuálisan is frissíthető.`);
    }
  } catch (err) {
    console.error('Famous frissítés hiba:', err);
  } finally {
    refreshInProgress = false;
  }
}

export function startFamousMenuRefresher() {
  // Remote mód (kis RAM-os hoszt): a bot nem futtat Puppeteert, hanem a GitHub Actions scrape-et
  // indítja el, ha a cron kimaradt. GITHUB_DISPATCH_TOKEN nélkül csak a (megbízhatatlan) cron marad.
  if (process.env.FAMOUS_DATA_URL) {
    if (!process.env.GITHUB_DISPATCH_TOKEN) {
      console.log('FAMOUS_DATA_URL beállítva, de GITHUB_DISPATCH_TOKEN nincs — a bot nem tudja pótolni a kimaradt GitHub cron-t (csak a /famousheti kézi frissítés marad tartalékként).');
      return;
    }
    console.log('FAMOUS_DATA_URL + GITHUB_DISPATCH_TOKEN beállítva — a bot hétfő-szerda reggel elindítja a GitHub scrape-et, ha hiányzik az adat.');
    checkAndTrigger();
    setInterval(checkAndTrigger, TICK_MS);
    return;
  }

  // Helyi mód (nagyobb RAM): a bot maga scrapel Puppeteerrel.
  checkAndScrapeLocally();
  setInterval(checkAndScrapeLocally, TICK_MS);
}
