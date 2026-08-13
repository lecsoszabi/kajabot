import { cached } from './cache.js';

const BASE_URL = 'https://menum.hu';
const CITY = 'szeged';
const MENU_TTL_MS = 10 * 60 * 1000; // 10 perc — a menum.hu is csak reggelente frissíti a napi menüket

export const WEEKDAY_LABELS_HU = ['Hétfő', 'Kedd', 'Szerda', 'Csütörtök', 'Péntek'];

function pad(n) {
  return String(n).padStart(2, '0');
}

export function toDateString(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function getMondayOfWeek(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay(); // 0 = vasárnap
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function getWeekdayDates(baseDate = new Date()) {
  const monday = getMondayOfWeek(baseDate);
  return Array.from({ length: 5 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(d.getDate() + i);
    return d;
  });
}

// Hányadik hétköznap indexe (0 = hétfő .. 4 = péntek) van "date"-nek, vagy null hétvégén
export function weekdayIndexOf(date = new Date()) {
  const day = date.getDay();
  if (day === 0 || day === 6) return null;
  return day - 1;
}

async function fetchMenusRaw(dateStr) {
  const url = `${BASE_URL}/api/menus?date=${dateStr}&city=${CITY}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`A menum.hu API hibát adott vissza (${res.status})`);
  }
  const data = await res.json();
  return data
    .filter((menu) => menu.restaurant)
    .sort((a, b) => a.restaurant.name.localeCompare(b.restaurant.name, 'hu'));
}

// Az adott napra vonatkozó ÖSSZES szegedi étterem, akkor is ha aznap nincs menüje (item.length === 0)
export function getMenusForDate(dateStr) {
  return cached(`menus:${dateStr}`, MENU_TTL_MS, () => fetchMenusRaw(dateStr));
}

export function getMenusForToday() {
  return getMenusForDate(toDateString(new Date()));
}

// Csak azok az éttermek, amelyeknek ténylegesen van menütételük az adott napon
export async function getMenusWithItems(dateStr) {
  const menus = await getMenusForDate(dateStr);
  return menus.filter((m) => m.items && m.items.length > 0);
}

export function restaurantLogoUrl(restaurantId) {
  return `${BASE_URL}/api/restaurants/${restaurantId}/logo`;
}

// Magyarországi (Europe/Budapest) idő szerinti dátum/óra/perc, függetlenül attól, milyen
// időzónában fut a szerver, amin a bot van hostolva.
export function budapestNow(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Budapest',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type)?.value;
  return {
    dateStr: `${get('year')}-${get('month')}-${get('day')}`,
    hour: get('hour'),
    minute: get('minute'),
  };
}
