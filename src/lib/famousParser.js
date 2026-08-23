import { toDateString } from './menumApi.js';

const WEEKDAY_MAP = {
  hetfo: 0,
  kedd: 1,
  szerda: 2,
  csutortok: 3,
  pentek: 4,
  szombat: 5,
  vasarnap: 6,
};

const DAY_HEADER_RE = /^(HÉTFŐ|KEDD|SZERDA|CSÜTÖRTÖK|PÉNTEK|SZOMBAT|VASÁRNAP)\s*\(?\s*(\d{1,2})\s*\.\s*(\d{1,2})\.?\s*\)?/iu;
// Csak "DESSZERT ... :"-t vár, a köztes szót (pl. "MINDEN NAP") lazán, elgépelés-tűrően kezeli
const DESSERT_RE = /^DESSZERT\b[^:]*:\s*(.*)$/iu;
const PRICE_TAIL_RE = /(\d[\d\s]{0,6})\s*\.-\s*$/;
const MIN_DAYS_FOR_WEEKLY = 4;

function normalize(str) {
  return str
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

function parseItemLine(line) {
  const m = line.match(PRICE_TAIL_RE);
  if (!m) return { name: line.trim(), price: null };
  const price = `${m[1].replace(/\s+/g, '')} Ft`;
  const name = line.slice(0, m.index).trim().replace(/[,;.\s]+$/, '');
  return { name, price };
}

function resolveYear(month, referenceDate) {
  const refYear = referenceDate.getFullYear();
  const refMonth = referenceDate.getMonth() + 1;
  if (refMonth === 12 && month === 1) return refYear + 1;
  if (refMonth === 1 && month === 12) return refYear - 1;
  return refYear;
}

// Facebook heti menü posztból (nap header + tételek soronként, esetleg több sorba törve,
// árral záródva, pl. "890.-") strukturált heti menüt épít, és ellenőrzi hogy a napnevek
// és a bennük szereplő dátumok egy konzisztens, valós hétre esnek-e.
export function parseWeeklyMenuText(text, referenceDate = new Date()) {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const dayEntries = [];
  let current = null;
  let buffer = '';
  let inDessert = false; // a "DESSZERT MINDEN NAP:" fejléc után gyűjtött (több sorba is tördelt) szöveg
  let dessertBuffer = '';

  const flushBuffer = () => {
    const text = buffer.trim();
    if (text) {
      if (inDessert) {
        dessertBuffer = dessertBuffer ? `${dessertBuffer} ${text}` : text;
      } else if (current) {
        current.items.push(parseItemLine(text));
      }
    }
    buffer = '';
  };

  for (const line of lines) {
    const dayMatch = line.match(DAY_HEADER_RE);
    if (dayMatch) {
      flushBuffer();
      inDessert = false;
      current = {
        weekdayIndex: WEEKDAY_MAP[normalize(dayMatch[1])],
        month: Number(dayMatch[2]),
        day: Number(dayMatch[3]),
        items: [],
      };
      dayEntries.push(current);
      continue;
    }

    const dessertMatch = line.match(DESSERT_RE);
    if (dessertMatch) {
      flushBuffer();
      inDessert = true;
      current = null;
      // a fejléc sorában a kettőspont után álló szöveg (ha van) már a desszert része
      if (dessertMatch[1]?.trim()) buffer = dessertMatch[1].trim();
      // amint az ár megvan, lezárjuk a desszertet — így a poszt utáni Facebook-szemét
      // ("Az összes reakció...", "megosztás" stb.) nem ragad hozzá
      if (PRICE_TAIL_RE.test(line)) {
        flushBuffer();
        inDessert = false;
      }
      continue;
    }

    if (!current && !inDessert) continue; // promó szöveg az első nap előtt / desszert után - kihagyjuk

    buffer = buffer ? `${buffer} ${line}` : line;
    if (PRICE_TAIL_RE.test(line)) {
      flushBuffer();
      if (inDessert) inDessert = false; // a desszert egyetlen, árral záruló tétel — utána leállunk
    }
  }
  flushBuffer();

  const dessertLine = dessertBuffer.trim() || null;

  if (!dayEntries.length) {
    throw new Error(
      'Nem találtam egyetlen felismerhető napot sem a szövegben (pl. "HÉTFŐ (08.10.)" formátumban várom).',
    );
  }

  // Egy valódi heti menü poszt több napot sorol fel — egy elszórt napnév-említés (pl. "találkozzunk
  // pénteken") nem heti menü, ezt itt zárjuk ki, nehogy a scraper téves posztot fogadjon el.
  if (dayEntries.length < MIN_DAYS_FOR_WEEKLY) {
    throw new Error(
      `Csak ${dayEntries.length} napot találtam a szövegben — ez valószínűleg nem egy teljes heti menü poszt (legalább ${MIN_DAYS_FOR_WEEKLY} nap kell).`,
    );
  }

  // A Famous posztjaiban napi bontásban az 1. tétel mindig leves, a 2. mindig főétel
  // (a közös desszert a végén, külön sorban jön) — ebből tudjuk kategorizálni az árszámításhoz.
  for (const entry of dayEntries) {
    entry.items = entry.items.map((item, i) => ({
      ...item,
      category: i === 0 ? 'soup' : i === 1 ? 'main' : 'other',
    }));
  }

  if (dessertLine) {
    const dessertItem = { ...parseItemLine(dessertLine), category: 'dessert' };
    for (const entry of dayEntries) entry.items.push(dessertItem);
  }

  const resolved = dayEntries.map((entry) => {
    const year = resolveYear(entry.month, referenceDate);
    const date = new Date(year, entry.month - 1, entry.day);
    const jsDay = date.getDay();
    const mondayBasedIndex = jsDay === 0 ? 6 : jsDay - 1;
    const monday = new Date(date);
    monday.setDate(monday.getDate() - mondayBasedIndex);
    return { entry, date, consistent: mondayBasedIndex === entry.weekdayIndex, monday };
  });

  const inconsistent = resolved.filter((r) => !r.consistent);
  if (inconsistent.length) {
    throw new Error(
      'A napnevek és a mellettük lévő dátumok nem egyeznek (pl. a dátum nem arra a hétköznapra esik). Ellenőrizd a beillesztett szöveget.',
    );
  }

  const mondayStrs = new Set(resolved.map((r) => toDateString(r.monday)));
  if (mondayStrs.size > 1) {
    throw new Error('A napok dátumai nem ugyanabba a hétbe esnek — ellenőrizd a beillesztett szöveget.');
  }

  const weekMonday = toDateString(resolved[0].monday);
  const days = {};
  for (const r of resolved) {
    days[toDateString(r.date)] = { items: r.entry.items };
  }

  return { weekMonday, days };
}
