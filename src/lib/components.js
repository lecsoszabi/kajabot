import { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } from 'discord.js';
import { POLL_TIME_SLOTS, POLL_NOT_GOING } from './pollStore.js';

export function buildTodayNavRow(dateStr, index, total) {
  const prev = new ButtonBuilder()
    .setCustomId(`mai:nav:${dateStr}:${index - 1}`)
    .setLabel('◀ Előző')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(index <= 0);

  const next = new ButtonBuilder()
    .setCustomId(`mai:nav:${dateStr}:${index + 1}`)
    .setLabel('Következő ▶')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(index >= total - 1);

  const week = new ButtonBuilder()
    .setCustomId(`heti:frommai:${dateStr}:${index}`)
    .setLabel('📅 Heti menü erre az étteremre')
    .setStyle(ButtonStyle.Primary);

  return new ActionRowBuilder().addComponents(prev, next, week);
}

export function buildTodaySelectRow(dateStr, restaurants, selectedIndex) {
  const options = restaurants.slice(0, 25).map((r, i) => ({
    label: r.name.slice(0, 100),
    value: String(i),
    default: i === selectedIndex,
  }));

  const select = new StringSelectMenuBuilder()
    .setCustomId(`mai:sel:${dateStr}`)
    .setPlaceholder('Ugrás egy másik étteremhez...')
    .addOptions(options);

  return new ActionRowBuilder().addComponents(select);
}

export function buildRestaurantPickRow(restaurants, customId = 'heti:pick') {
  const options = restaurants.slice(0, 25).map((r) => ({
    label: r.name.slice(0, 100),
    value: r.id,
  }));

  const select = new StringSelectMenuBuilder()
    .setCustomId(customId)
    .setPlaceholder('Válassz éttermet a heti menühöz...')
    .addOptions(options);

  return new ActionRowBuilder().addComponents(select);
}

export function buildWeekNavRow(restaurantId, mondayStr, dayIndex) {
  const prev = new ButtonBuilder()
    .setCustomId(`heti:day:${restaurantId}:${mondayStr}:${dayIndex - 1}`)
    .setLabel('◀ Előző nap')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(dayIndex <= 0);

  const next = new ButtonBuilder()
    .setCustomId(`heti:day:${restaurantId}:${mondayStr}:${dayIndex + 1}`)
    .setLabel('Következő nap ▶')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(dayIndex >= 4);

  const back = new ButtonBuilder()
    .setCustomId('heti:backpick')
    .setLabel('🔁 Másik étterem')
    .setStyle(ButtonStyle.Primary);

  return new ActionRowBuilder().addComponents(prev, next, back);
}

export function buildSetupRestaurantSelectRow(restaurants, defaultIds = []) {
  const options = restaurants.slice(0, 25).map((r) => ({
    label: r.name.slice(0, 100),
    value: r.id,
    default: defaultIds.includes(r.id),
  }));

  const select = new StringSelectMenuBuilder()
    .setCustomId('setup:restaurants')
    .setPlaceholder('Válassz 1-5 kiemelt éttermet a napi poszthoz...')
    .setMinValues(1)
    .setMaxValues(Math.min(options.length, 5))
    .addOptions(options);

  return new ActionRowBuilder().addComponents(select);
}

export function buildPollSelectRow() {
  const options = [
    ...POLL_TIME_SLOTS.map((t) => ({ label: t, value: t, emoji: '🕐' })),
    { label: 'Nem megyek', value: POLL_NOT_GOING, emoji: '❌' },
  ];

  const select = new StringSelectMenuBuilder()
    .setCustomId('poll:vote')
    .setPlaceholder('Mikor mész? / Nem megyek')
    .addOptions(options);

  return new ActionRowBuilder().addComponents(select);
}

export function buildHomeRow() {
  const mai = new ButtonBuilder().setCustomId('home:mai').setLabel('🍽️ Mai menü').setStyle(ButtonStyle.Primary);
  const heti = new ButtonBuilder().setCustomId('home:heti').setLabel('📅 Heti menü').setStyle(ButtonStyle.Primary);
  const lista = new ButtonBuilder().setCustomId('home:lista').setLabel('📋 Éttermek').setStyle(ButtonStyle.Secondary);
  return new ActionRowBuilder().addComponents(mai, heti, lista);
}
