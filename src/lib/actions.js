import {
  getMenusForDate,
  toDateString,
  getWeekdayDates,
  getMondayOfWeek,
  weekdayIndexOf,
  WEEKDAY_LABELS_HU,
} from './menumApi.js';
import { FAMOUS_RESTAURANT, famousMenuForDate, combinedMenusWithItems, combinedDirectory } from './famousStore.js';
import { buildMenuEmbed, buildInfoEmbed, buildRestaurantListEmbed } from './embeds.js';
import { buildTodayNavRow, buildTodaySelectRow, buildRestaurantPickRow, buildWeekNavRow, buildHomeRow } from './components.js';

export async function buildHomePayload() {
  return {
    embeds: [
      buildInfoEmbed(
        '🍲 Kajabot — szegedi napi menük',
        'Válassz a gombok közül, vagy használd a `/mai`, `/heti`, `/etterem`, `/lista` parancsokat.',
      ),
    ],
    components: [buildHomeRow()],
  };
}

export async function buildTodayPayload(dateStr, index) {
  const menus = await combinedMenusWithItems(dateStr);
  if (!menus.length) {
    return {
      embeds: [buildInfoEmbed('Nincs elérhető menü', 'Erre a napra egyetlen szegedi étteremhez sem található menüadat.')],
      components: [],
    };
  }
  const clamped = Math.min(Math.max(index, 0), menus.length - 1);
  const dateLabel = dateStr === toDateString(new Date()) ? 'Ma' : dateStr;
  const embed = buildMenuEmbed(menus[clamped], { index: clamped, total: menus.length, dateLabel });
  const components = [
    buildTodayNavRow(dateStr, clamped, menus.length),
    buildTodaySelectRow(dateStr, menus.map((m) => ({ name: m.restaurant.name })), clamped),
  ];
  return { embeds: [embed], components };
}

export async function buildRestaurantPickPayload(customId = 'heti:pick') {
  const restaurants = await combinedDirectory(toDateString(new Date()));
  if (!restaurants.length) {
    return {
      embeds: [buildInfoEmbed('Hiba', 'Jelenleg nem érhető el étteremlista a menum.hu API-ból.')],
      components: [],
    };
  }
  return {
    embeds: [buildInfoEmbed('📅 Heti menü', 'Válaszd ki, melyik étterem heti menüjére vagy kíváncsi:')],
    components: [buildRestaurantPickRow(restaurants, customId)],
  };
}

export async function buildWeekDayPayload(restaurantId, mondayStr, dayIndex) {
  const monday = new Date(mondayStr);
  const dates = getWeekdayDates(monday);
  const clamped = Math.min(Math.max(dayIndex, 0), dates.length - 1);
  const dateStr = toDateString(dates[clamped]);

  const menu =
    restaurantId === FAMOUS_RESTAURANT.id
      ? await famousMenuForDate(dateStr)
      : (await getMenusForDate(dateStr)).find((m) => m.restaurantId === restaurantId || m.restaurant.id === restaurantId);

  if (!menu) {
    return {
      embeds: [buildInfoEmbed('Nincs adat', 'Ehhez az étteremhez nem található menüadat erre a napra.')],
      components: [buildWeekNavRow(restaurantId, mondayStr, clamped)],
    };
  }

  const dateLabel = `${WEEKDAY_LABELS_HU[clamped]} (${dateStr})`;
  const embed = buildMenuEmbed(menu, { index: clamped, total: 5, dateLabel });
  const components = [buildWeekNavRow(restaurantId, mondayStr, clamped)];
  return { embeds: [embed], components };
}

export function currentWeekStartAndDay() {
  const today = new Date();
  const monday = getMondayOfWeek(today);
  const idx = weekdayIndexOf(today);
  return { mondayStr: toDateString(monday), dayIndex: idx ?? 0 };
}

export async function buildRestaurantListPayload() {
  const restaurants = await combinedDirectory(toDateString(new Date()));
  if (!restaurants.length) {
    return {
      embeds: [buildInfoEmbed('Hiba', 'Jelenleg nem érhető el étteremlista a menum.hu API-ból.')],
      components: [],
    };
  }
  return { embeds: [buildRestaurantListEmbed(restaurants)], components: [] };
}
