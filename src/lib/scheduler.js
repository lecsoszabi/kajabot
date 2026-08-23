import { budapestNow } from './menumApi.js';
import { combinedMenusWithItems } from './famousStore.js';
import { buildMenuEmbed, buildInfoEmbed, buildPollEmbed } from './embeds.js';
import { buildPollSelectRow } from './components.js';
import { getAllConfiguredGuilds, deleteGuildConfig } from './guildConfig.js';
import { getPoll, savePoll } from './pollStore.js';

const CHECK_INTERVAL_MS = 30 * 1000;
const POST_HOUR = '10';
const POST_MINUTE = '00';

// Discord hibakódok, amik azt jelzik, hogy a bot tartósan nem fér hozzá a beállított
// szerverhez/csatornához (kirakták, törölték a csatornát, elvették a jogot) — ilyenkor a stale
// configot töröljük, hogy ne dobjon minden nap hibát feleslegesen. Új /setup bármikor visszaállítja.
const STALE_CONFIG_CODES = new Set([
  10003, // Unknown Channel
  10004, // Unknown Guild
  50001, // Missing Access
]);

const GYROS_ALERT_RE = /gyros|kebab/i;
const POOP_BORDER = '💩'.repeat(14);
const POOP_COLOR = 0x6d4c26;

function hasGyrosAlert(selected) {
  return selected.some((menu) => menu.items.some((item) => GYROS_ALERT_RE.test(item.name)));
}

export async function buildDailyDigestPayload(dateStr, featuredIds) {
  if (!featuredIds?.length) {
    return {
      embeds: [buildInfoEmbed('Nincs beállított étterem', 'Futtasd le a `/setup` parancsot a kiemelt éttermek kiválasztásához.')],
    };
  }

  const menus = await combinedMenusWithItems(dateStr);
  const selected = featuredIds.map((id) => menus.find((m) => m.restaurant.id === id)).filter(Boolean);

  if (!selected.length) {
    return {
      embeds: [
        buildInfoEmbed(
          'Nincs találat',
          `A kiemelt éttermek egyike sem szerepel a mai (${dateStr}) menüsorban.`,
        ),
      ],
    };
  }

  const embeds = selected.map((menu, i) =>
    buildMenuEmbed(menu, { index: i, total: selected.length, dateLabel: 'Ma' }),
  );

  const alert = hasGyrosAlert(selected);
  if (alert) {
    for (const embed of embeds) embed.setColor(POOP_COLOR);
  }

  const baseContent = `🍲 **Mai menü — ${dateStr}**`;
  const content = alert
    ? `${POOP_BORDER}\n🚨💩 FOSATÓS GYROS RIADÓ 💩🚨\n${baseContent}\n${POOP_BORDER}`
    : baseContent;

  return { content, embeds };
}

// Törli a tegnapi szavazás-üzenetet (ha még megvan) és nyit egy újat a mai napra — csak a
// szavazás cserélődik naponta, a menüs poszt maga a csatornában marad.
export async function refreshPoll(channel, guildId, dateStr) {
  const oldPoll = getPoll(guildId);
  if (oldPoll?.messageId) {
    const oldMessage = await channel.messages.fetch(oldPoll.messageId).catch(() => null);
    if (oldMessage) await oldMessage.delete().catch(() => {});
  }

  const pollMessage = await channel.send({
    embeds: [buildPollEmbed(dateStr, {})],
    components: [buildPollSelectRow()],
  });

  savePoll(guildId, { messageId: pollMessage.id, channelId: channel.id, date: dateStr, votes: {} });
}

const lastPostedDateByGuild = new Map();

export function startDailyMenuPoster(client) {
  setInterval(async () => {
    const { dateStr, hour, minute } = budapestNow();
    if (hour !== POST_HOUR || minute !== POST_MINUTE) return;

    const guilds = getAllConfiguredGuilds();
    for (const guildCfg of guilds) {
      if (lastPostedDateByGuild.get(guildCfg.guildId) === dateStr) continue;
      lastPostedDateByGuild.set(guildCfg.guildId, dateStr);

      try {
        const channel = await client.channels.fetch(guildCfg.channelId);
        const payload = await buildDailyDigestPayload(dateStr, guildCfg.featuredRestaurants);
        // csak sikeres napi menünél pingelünk mindenkit, hibaüzenetnél (pl. nincs mai adat) nem
        const finalPayload = payload.content
          ? { ...payload, content: `@everyone ${payload.content}`, allowedMentions: { parse: ['everyone'] } }
          : payload;
        await channel.send(finalPayload);
        console.log(`Napi menü poszt elküldve (${dateStr}), guild ${guildCfg.guildId}.`);

        await refreshPoll(channel, guildCfg.guildId, dateStr);
      } catch (err) {
        if (STALE_CONFIG_CODES.has(err?.code)) {
          deleteGuildConfig(guildCfg.guildId);
          console.warn(
            `Guild ${guildCfg.guildId} beállítása törölve — a bot nem fér hozzá a csatornához (${err.code}). Új /setup állítja vissza.`,
          );
        } else {
          console.error(`Hiba a napi menü poszt küldésekor (guild ${guildCfg.guildId}):`, err);
        }
      }
    }
  }, CHECK_INTERVAL_MS);

  console.log(`Napi automata poszt bekapcsolva: minden nap ${POST_HOUR}:${POST_MINUTE} (Europe/Budapest), guildenkénti /setup beállítás szerint.`);
}
