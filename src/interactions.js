import { MessageFlags } from 'discord.js';
import {
  buildTodayPayload,
  buildRestaurantPickPayload,
  buildWeekDayPayload,
  buildRestaurantListPayload,
} from './lib/actions.js';
import { getMondayOfWeek, weekdayIndexOf, toDateString } from './lib/menumApi.js';
import { combinedMenusWithItems, combinedDirectory, saveFamousWeek } from './lib/famousStore.js';
import { parseWeeklyMenuText } from './lib/famousParser.js';
import { buildInfoEmbed, buildPollEmbed } from './lib/embeds.js';
import { buildSetupRestaurantSelectRow, buildPollComponents } from './lib/components.js';
import { getGuildConfig, setGuildConfig } from './lib/guildConfig.js';
import { getPoll, savePoll, POLL_NOT_GOING } from './lib/pollStore.js';

async function guildEmoji(interaction, name) {
  let e = interaction.guild?.emojis.cache.find((x) => x.name === name);
  if (!e) e = (await interaction.guild?.emojis.fetch().catch(() => null))?.find((x) => x.name === name);
  return e ? e.toString() : `:${name}:`;
}

async function maybeVoteEasterEgg(interaction, place) {
  const username = interaction.user.username;
  const coming = Boolean(place) && place !== POLL_NOT_GOING;
  const notGoing = place === POLL_NOT_GOING;

  let text = null;
  if (username === 'occse430' && coming) {
    const laugh = `X${'D'.repeat(2 + Math.floor(Math.random() * 22))}`;
    text = `Patrik el fogsz hízni ${await guildEmoji(interaction, 'pregnant_patrik')} ${laugh}`;
  } else if (username === 'tomi_ohl' && coming) {
    text = 'nem fogsz beférni a volvo-ba';
  } else if (username === 'ricsi69' && coming && Math.floor(Math.random() * 23) === 0) {
    text = 'A MAKKOM';
  } else if (username === 'kolbasz9234' && notGoing) {
    text = `megint fosol? ${'💩'.repeat(5)}`;
  }
  if (!text) return;

  try {
    await interaction.channel.send({
      content: `<@${interaction.user.id}> ${text}`,
      allowedMentions: { users: [interaction.user.id] },
    });
  } catch (err) {
    console.error('Vote easter egg hiba:', err);
  }
}

export async function handleButton(interaction) {
  const [scope, action, ...rest] = interaction.customId.split(':');

  if (scope === 'home') {
    await interaction.deferUpdate();
    if (action === 'mai') {
      return interaction.editReply(await buildTodayPayload(toDateString(new Date()), 0));
    }
    if (action === 'heti') {
      return interaction.editReply(await buildRestaurantPickPayload());
    }
    if (action === 'lista') {
      return interaction.editReply(await buildRestaurantListPayload());
    }
    return;
  }

  if (scope === 'mai' && action === 'nav') {
    const [dateStr, indexStr] = rest;
    await interaction.deferUpdate();
    return interaction.editReply(await buildTodayPayload(dateStr, Number(indexStr)));
  }

  if (scope === 'heti' && action === 'day') {
    const [restaurantId, mondayStr, dayIndexStr] = rest;
    await interaction.deferUpdate();
    return interaction.editReply(await buildWeekDayPayload(restaurantId, mondayStr, Number(dayIndexStr)));
  }

  if (scope === 'heti' && action === 'backpick') {
    await interaction.deferUpdate();
    return interaction.editReply(await buildRestaurantPickPayload());
  }

  if (scope === 'heti' && action === 'frommai') {
    const [dateStr, indexStr] = rest;
    await interaction.deferUpdate();
    const menus = await combinedMenusWithItems(dateStr);
    const menu = menus[Number(indexStr)];
    if (!menu) return interaction.editReply(await buildRestaurantPickPayload());
    const date = new Date(dateStr);
    const mondayStr = toDateString(getMondayOfWeek(date));
    const dayIndex = weekdayIndexOf(date) ?? 0;
    return interaction.editReply(await buildWeekDayPayload(menu.restaurant.id, mondayStr, dayIndex));
  }
}

export async function handleSelectMenu(interaction) {
  const [scope, action, ...rest] = interaction.customId.split(':');

  if (scope === 'mai' && action === 'sel') {
    const [dateStr] = rest;
    const index = Number(interaction.values[0]);
    await interaction.deferUpdate();
    return interaction.editReply(await buildTodayPayload(dateStr, index));
  }

  if (scope === 'heti' && action === 'pick') {
    const restaurantId = interaction.values[0];
    await interaction.deferUpdate();
    const today = new Date();
    const mondayStr = toDateString(getMondayOfWeek(today));
    const dayIndex = weekdayIndexOf(today) ?? 0;
    return interaction.editReply(await buildWeekDayPayload(restaurantId, mondayStr, dayIndex));
  }

  if (scope === 'poll' && (action === 'place' || action === 'time')) {
    const poll = getPoll(interaction.guildId);
    if (!poll || poll.messageId !== interaction.message.id) {
      await interaction.reply({
        embeds: [buildInfoEmbed('Lejárt szavazás', 'Ez a szavazás már nem aktív — nézd meg a legfrissebb napi posztot.')],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const username = interaction.member?.displayName || interaction.user.username;
    const prev = poll.votes[interaction.user.id] || { username, place: null, time: null };
    poll.votes[interaction.user.id] = { ...prev, username, [action]: interaction.values[0] };
    savePoll(interaction.guildId, poll);

    await interaction.update({
      embeds: [buildPollEmbed(poll.date, poll.votes)],
      components: buildPollComponents(),
    });

    if (action === 'place') await maybeVoteEasterEgg(interaction, interaction.values[0]);
    return;
  }

  if (scope === 'setup' && action === 'restaurants') {
    const featuredRestaurants = interaction.values;
    setGuildConfig(interaction.guildId, { featuredRestaurants });
    const cfg = getGuildConfig(interaction.guildId);
    const restaurants = await combinedDirectory(toDateString(new Date()));
    const names = featuredRestaurants
      .map((id) => restaurants.find((r) => r.id === id)?.name)
      .filter(Boolean)
      .join(', ');

    await interaction.update({
      embeds: [
        buildInfoEmbed(
          '✅ Kajabot beállítva',
          `Célcsatorna: <#${cfg.channelId}>\nKiemelt éttermek: ${names}\n\nMostantól minden parancs elérhető, és a napi 10 órás poszt ide fog menni.`,
        ),
      ],
      components: [],
    });
  }
}

export async function handleChannelSelectMenu(interaction) {
  if (interaction.customId !== 'setup:channel') return;

  const channelId = interaction.values[0];
  setGuildConfig(interaction.guildId, { channelId });

  const restaurants = await combinedDirectory(toDateString(new Date()));
  const current = getGuildConfig(interaction.guildId);

  await interaction.update({
    embeds: [
      buildInfoEmbed(
        '⚙️ Kajabot beállítás (2/2)',
        `Célcsatorna kiválasztva: <#${channelId}>\n\nMost válaszd ki 1-5 kiemelt éttermet, amiket a napi 10 órás poszt kiírjon.`,
      ),
    ],
    components: [buildSetupRestaurantSelectRow(restaurants, current?.featuredRestaurants || [])],
  });
}

export async function handleModalSubmit(interaction) {
  if (interaction.customId !== 'famousheti:modal') return;

  const text = interaction.fields.getTextInputValue('szoveg');
  try {
    const week = parseWeeklyMenuText(text);
    saveFamousWeek(week);

    const dayList = Object.entries(week.days)
      .map(([date, day]) => `**${date}** — ${day.items.map((i) => (i.price ? `${i.name} (${i.price})` : i.name)).join(', ')}`)
      .join('\n');

    await interaction.reply({
      embeds: [buildInfoEmbed('✅ Famous heti menü elmentve', `Hét eleje: ${week.weekMonday}\n\n${dayList}`.slice(0, 4000))],
    });
  } catch (err) {
    await interaction.reply({
      embeds: [buildInfoEmbed('❌ Nem sikerült feldolgozni a szöveget', err.message)],
      flags: MessageFlags.Ephemeral,
    });
  }
}
