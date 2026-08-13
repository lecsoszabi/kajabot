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

let refreshInProgress = false;
let lastAttemptAt = 0;

function isDateStrInActiveWindow(dateStr) {
  return ACTIVE_UTC_DAYS.includes(new Date(`${dateStr}T00:00:00Z`).getUTCDay());
}

async function checkAndRefresh() {
  if (refreshInProgress || (await hasCurrentWeekData())) return;

  const { dateStr, hour } = budapestNow();
  const shouldTryNow = isDateStrInActiveWindow(dateStr) && Number(hour) >= START_HOUR;
  if (!shouldTryNow) return;

  if (Date.now() - lastAttemptAt < HOURLY_RETRY_MS) return;
  lastAttemptAt = Date.now();

  refreshInProgress = true;
  console.log('Famous: hiányzik az új heti menü (hétfő-szerda ablak) — óránkénti újrapróbálkozás...');
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

// Ha FAMOUS_DATA_URL be van állítva, egy külső (pl. GitHub Actions) folyamat gondoskodik a heti
// adat frissítéséről, és a bot csak HTTP-vel olvassa — ilyenkor itt nem indítunk Puppeteert/
// Chromiumot, hogy kis RAM-os hosztokon (pl. Fly.io) is elférjen a bot.
export function startFamousMenuRefresher() {
  if (process.env.FAMOUS_DATA_URL) {
    console.log('FAMOUS_DATA_URL beállítva — a helyi Famous-scraper kikapcsolva, az adatot külső forrásból olvassuk.');
    return;
  }

  checkAndRefresh();
  setInterval(checkAndRefresh, TICK_MS);
}
