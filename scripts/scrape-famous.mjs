// Önálló szkript a Famous Steakbisztró heti menüjének frissítésére — a GitHub Actions
// futtatja ütemezve, hogy a Puppeteer/Chromium ne a (kis RAM-os) bot-hosztingon fusson.
// A data/famous-week.json ebben a módban verziókezelt, a workflow commitolja, ha változott.
import { scrapeFamousMenu } from '../src/lib/famousScraper.js';
import { saveFamousWeek, hasCurrentWeekData } from '../src/lib/famousStore.js';

if (await hasCurrentWeekData()) {
  console.log('Már van adat a jelenlegi hétre — nincs teendő.');
  process.exit(0);
}

console.log('Nincs adat a jelenlegi hétre — scrapelés indul...');
const result = await scrapeFamousMenu();

if (!result.success) {
  console.error('Scrapelés sikertelen:', result.reason);
  process.exit(1);
}

saveFamousWeek(result.week);
console.log(`Frissítve (hét eleje: ${result.week.weekMonday}), forrás: ${result.sourceUrl}`);
