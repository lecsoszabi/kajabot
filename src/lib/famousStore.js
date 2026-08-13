import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getMenusForDate, getMenusWithItems, getMondayOfWeek, toDateString } from './menumApi.js';
import { cached } from './cache.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.join(__dirname, '..', '..', 'data', 'famous-week.json');
const REMOTE_TTL_MS = 10 * 60 * 1000;

export const FAMOUS_RESTAURANT = {
  id: 'famous-steakbisztro',
  name: 'Famous Steakbisztró',
  url: 'https://www.facebook.com/famousszeged',
  description: 'Szegedi steakhouse — heti menü Facebookról, kézzel frissítve a /famousheti paranccsal.',
};

async function loadRemoteWeek() {
  const res = await fetch(process.env.FAMOUS_DATA_URL);
  if (!res.ok) throw new Error(`Famous remote adat hiba (${res.status})`);
  return res.json();
}

// Ha a FAMOUS_DATA_URL környezeti változó be van állítva, a heti adatot onnan (pl. egy GitHub
// Actions által frissített nyers fájlból) tölti be, HTTP-vel — nem indít Puppeteert/Chromiumot,
// ezért kis RAM-os hosztokon (pl. Fly.io ingyenes 256 MB-os géptípus) is elfér. Ha nincs
// beállítva, a helyi fájlból olvas, ahogy eddig (ilyenkor a beépített scraper tölti fel).
export async function loadFamousWeek() {
  if (process.env.FAMOUS_DATA_URL) {
    try {
      return await cached('famous-week:remote', REMOTE_TTL_MS, loadRemoteWeek);
    } catch {
      return null;
    }
  }
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  } catch {
    return null;
  }
}

export function saveFamousWeek(week) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(week, null, 2), 'utf-8');
}

// A menum.hu-s menu-objektumokkal azonos alakot ad vissza, hogy a meglévő embed/lapozó
// logika (buildMenuEmbed stb.) változtatás nélkül újrahasználható legyen a Famous-ra is.
// Ha az adott napra nincs (még / már) eltárolt adat, null-t ad vissza — nincs külön
// "elavult" ellenőrzés, mert a napok kulcsai konkrét dátumok, ezért egy régi hét adatai
// egyszerűen nem tartalmazzák a mai dátumot.
export async function famousMenuForDate(dateStr) {
  const week = await loadFamousWeek();
  const day = week?.days?.[dateStr];
  if (!day) return null;

  return {
    restaurantId: FAMOUS_RESTAURANT.id,
    restaurant: FAMOUS_RESTAURANT,
    items: day.items.map((item) => ({
      name: item.name,
      category: item.category || 'other',
      price: item.price,
      menuType: 'Napi menü',
      menuPrice: null,
      allergens: [],
      tags: [],
    })),
  };
}

// A jelenlegi hét (hétfő-dátum alapján) van-e már eltárolva — hétvégén ez a lezárult hét
// hétfőjével egyezik meg, amire már biztos van adat, ezért ilyenkor nincs teendő.
export async function hasCurrentWeekData() {
  const week = await loadFamousWeek();
  if (!week) return false;
  const currentMonday = toDateString(getMondayOfWeek(new Date()));
  return week.weekMonday === currentMonday;
}

export async function combinedMenusWithItems(dateStr) {
  const menum = await getMenusWithItems(dateStr);
  const famous = await famousMenuForDate(dateStr);
  return famous ? [famous, ...menum] : menum;
}

export async function combinedDirectory(dateStr) {
  const menum = await getMenusForDate(dateStr);
  return [FAMOUS_RESTAURANT, ...menum.map((m) => m.restaurant)];
}
