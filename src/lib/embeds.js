import { EmbedBuilder } from 'discord.js';
import { restaurantLogoUrl } from './menumApi.js';
import { POLL_TIME_SLOTS, POLL_NOT_GOING } from './pollStore.js';

const CATEGORY_ORDER = ['soup', 'main', 'dessert', 'other'];
const CATEGORY_LABELS = {
  soup: '🥣 Levesek',
  main: '🍽️ Főételek',
  dessert: '🍰 Desszertek',
  other: '🍴 Egyéb',
};

function groupItems(items) {
  const groups = {};
  for (const item of items) {
    const cat = CATEGORY_ORDER.includes(item.category) ? item.category : 'other';
    (groups[cat] ??= []).push(item);
  }
  return CATEGORY_ORDER.filter((c) => groups[c]?.length).map((c) => ({
    category: c,
    items: groups[c],
  }));
}

function formatItem(item) {
  const price = item.menuPrice || item.price;
  let line = `**${item.name}**`;
  if (price) line += ` — ${price}`;
  if (item.menuType && item.menuType !== 'Napi menü') line += ` _(${item.menuType})_`;
  if (item.allergens?.length) line += `\n⚠️ ${item.allergens.join(', ')}`;
  return line;
}

// Egy kategória tételeit annyi mezőre tördeli, hogy egyik se lépje túl a Discord 1024 karakteres limitjét
function buildCategoryFields(group) {
  const fields = [];
  let buffer = [];
  let bufferLen = 0;

  for (const item of group.items) {
    const line = formatItem(item);
    if (bufferLen + line.length + 2 > 1024 && buffer.length) {
      fields.push(buffer.join('\n\n'));
      buffer = [];
      bufferLen = 0;
    }
    buffer.push(line);
    bufferLen += line.length + 2;
  }
  if (buffer.length) fields.push(buffer.join('\n\n'));

  return fields.map((value, i) => ({
    name: i === 0 ? CATEGORY_LABELS[group.category] : `${CATEGORY_LABELS[group.category]} (folyt.)`,
    value,
  }));
}

const SERVICE_CHARGE_RATE = 0.12;

function parsePriceNumber(item) {
  const match = item?.price?.match(/(\d[\d\s]*)/);
  return match ? Number(match[1].replace(/\s/g, '')) : null;
}

// Csak akkor számol összeget, ha egyértelmű mit fizetnél: pontosan 1 leves + 1 főétel van aznap
// (pl. Famous-nál), több választható leves/főétel esetén (pl. menum.hu-s éttermeknél) nem.
function computeMenuTotal(items) {
  const soups = items.filter((i) => i.category === 'soup');
  const mains = items.filter((i) => i.category === 'main');
  const desserts = items.filter((i) => i.category === 'dessert');
  if (soups.length !== 1 || mains.length !== 1) return null;

  const soupPrice = parsePriceNumber(soups[0]);
  const mainPrice = parsePriceNumber(mains[0]);
  if (soupPrice == null || mainPrice == null) return null;

  const withoutDessert = soupPrice + mainPrice;
  const dessertPrice = desserts.length === 1 ? parsePriceNumber(desserts[0]) : null;
  const withDessert = dessertPrice != null ? withoutDessert + dessertPrice : null;

  return {
    withoutDessert,
    withoutDessertPlusService: Math.round(withoutDessert * (1 + SERVICE_CHARGE_RATE)),
    withDessert,
    withDessertPlusService: withDessert != null ? Math.round(withDessert * (1 + SERVICE_CHARGE_RATE)) : null,
  };
}

export function buildMenuEmbed(menu, { index, total, dateLabel }) {
  const embed = new EmbedBuilder()
    .setColor(0xe67e22)
    .setTitle(`🍴 ${menu.restaurant.name}`)
    .setThumbnail(restaurantLogoUrl(menu.restaurant.id))
    .setFooter({ text: `Szeged • ${dateLabel} • ${index + 1}/${total} étterem` });

  if (menu.restaurant.url) embed.setURL(menu.restaurant.url);
  if (menu.restaurant.description) embed.setDescription(menu.restaurant.description);

  if (!menu.items || menu.items.length === 0) {
    embed.addFields({
      name: 'Nincs elérhető menü',
      value: 'Erre a napra nem található menüadat ehhez az étteremhez.',
    });
  } else {
    for (const group of groupItems(menu.items)) {
      embed.addFields(...buildCategoryFields(group));
    }

    const priceTotal = computeMenuTotal(menu.items);
    if (priceTotal) {
      let value = `Leves + főétel: **${priceTotal.withoutDessert} Ft** _(+12% szervizdíjjal: **${priceTotal.withoutDessertPlusService} Ft**)_`;
      if (priceTotal.withDessert != null) {
        value += `\nLeves + főétel + desszert: **${priceTotal.withDessert} Ft** _(+12% szervizdíjjal: **${priceTotal.withDessertPlusService} Ft**)_`;
      }
      embed.addFields({ name: '💰 Összesen', value });
    }
  }

  return embed;
}

export function buildPollEmbed(dateStr, votes = {}) {
  const embed = new EmbedBuilder()
    .setColor(0x2ecc71)
    .setTitle('🍽️ Ki megy ma a Famousba?')
    .setFooter({ text: `Szavazás — ${dateStr}` });

  const entries = Object.values(votes);
  const lines = [];
  for (const time of POLL_TIME_SLOTS) {
    const names = entries.filter((v) => v.answer === time).map((v) => v.username);
    if (names.length) lines.push(`🕐 **${time}** — ${names.join(', ')}`);
  }
  const notGoing = entries.filter((v) => v.answer === POLL_NOT_GOING).map((v) => v.username);
  if (notGoing.length) lines.push(`❌ **Nem megyek** — ${notGoing.join(', ')}`);

  const votesText = lines.length ? lines.join('\n') : '_Még senki nem szavazott — válassz lent!_';
  embed.setDescription(
    `Válaszd ki lent, mikor mész (a napi menü 12:00–14:00 között van), vagy hogy nem mész. A holnapi posztnál ez a szavazás törlődik.\n\n${votesText}`,
  );

  return embed;
}

export function buildInfoEmbed(title, description) {
  return new EmbedBuilder().setColor(0xe67e22).setTitle(title).setDescription(description);
}

export function buildRestaurantListEmbed(restaurants) {
  const embed = new EmbedBuilder()
    .setColor(0xe67e22)
    .setTitle('📋 Nyilvántartott szegedi éttermek')
    .setFooter({ text: `${restaurants.length} étterem • forrás: menum.hu` });

  const lines = restaurants.map((r) => (r.url ? `[${r.name}](${r.url})` : r.name));
  const chunks = [];
  let buffer = [];
  let bufferLen = 0;
  for (const line of lines) {
    if (bufferLen + line.length + 1 > 1024 && buffer.length) {
      chunks.push(buffer.join('\n'));
      buffer = [];
      bufferLen = 0;
    }
    buffer.push(line);
    bufferLen += line.length + 1;
  }
  if (buffer.length) chunks.push(buffer.join('\n'));

  chunks.forEach((value, i) => {
    embed.addFields({ name: i === 0 ? 'Éttermek' : '​', value });
  });

  return embed;
}
