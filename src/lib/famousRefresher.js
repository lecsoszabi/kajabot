import { budapestNow } from './menumApi.js';
import { hasCurrentWeekData, saveFamousWeek } from './famousStore.js';
import { scrapeFamousMenu } from './famousScraper.js';

const TICK_MS = 30 * 60 * 1000; // 30 percenként vizsgálja, hogy kell-e egyáltalán próbálkozni
const DAILY_RETRY_MS = 24 * 60 * 60 * 1000;
const HOURLY_RETRY_MS = 60 * 60 * 1000;
const MONDAY_UTC_DAY = 1;

let refreshInProgress = false;
let lastAttemptAt = 0;

function isDateStrMonday(dateStr) {
  return new Date(`${dateStr}T00:00:00Z`).getUTCDay() === MONDAY_UTC_DAY;
}

async function checkAndRefresh() {
  if (refreshInProgress || (await hasCurrentWeekData())) return;

  const { dateStr, hour } = budapestNow();
  const mondayAfterTen = isDateStrMonday(dateStr) && Number(hour) >= 10;
  const retryIntervalMs = mondayAfterTen ? HOURLY_RETRY_MS : DAILY_RETRY_MS;

  if (Date.now() - lastAttemptAt < retryIntervalMs) return;
  lastAttemptAt = Date.now();

  refreshInProgress = true;
  console.log(
    mondayAfterTen
      ? 'Famous: hétfő 10:00 után is hiányzik az új heti menü — óránkénti újrapróbálkozás...'
      : 'Famous: nincs adat a jelenlegi hétre — napi egyszeri próbálkozás...',
  );
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
