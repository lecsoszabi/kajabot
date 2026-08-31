import { budapestNow } from './menumApi.js';
import { combinedMenusWithItems } from './famousStore.js';
import { buildMenuEmbed, buildInfoEmbed, buildPollEmbed } from './embeds.js';
import { buildPollSelectRow } from './components.js';
import { getAllConfiguredGuilds, deleteGuildConfig } from './guildConfig.js';
import { getPoll, savePoll } from './pollStore.js';
import { getDailyPost, saveDailyPost } from './dailyPostStore.js';

const CHECK_INTERVAL_MS = 30 * 1000;
const POST_HOUR = '10';
const POST_MINUTE = '00';

// Hétvégén (szombat-vasárnap) sehol nincs napi menü, ezért nem posztolunk és szavazást se nyitunk.
function isWeekend(dateStr) {
  const day = new Date(`${dateStr}T00:00:00Z`).getUTCDay();
  return day === 0 || day === 6;
}

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

// A kiemelt éttermek közül azok, amelyeknek ténylegesen van adata az adott napon (a beállított
// sorrendben). Ebből tudjuk, hogy a poszt teljes-e, vagy egy hiányzó étterem (pl. Famous) adata
// később még megérkezhet.
export async function selectFeaturedMenus(dateStr, featuredIds) {
  if (!featuredIds?.length) return [];
  const menus = await combinedMenusWithItems(dateStr);
  return featuredIds.map((id) => menus.find((m) => m.restaurant.id === id)).filter(Boolean);
}

export async function buildDailyDigestPayload(dateStr, featuredIds) {
  if (!featuredIds?.length) {
    return {
      embeds: [buildInfoEmbed('Nincs beállított étterem', 'Futtasd le a `/setup` parancsot a kiemelt éttermek kiválasztásához.')],
    };
  }

  const selected = await selectFeaturedMenus(dateStr, featuredIds);

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

// A napi menü tartalmához @everyone-t fűz (csak ha van tényleges menü-tartalom, hibaüzenetnél nem).
function withEveryone(payload) {
  return payload.content
    ? { ...payload, content: `@everyone ${payload.content}`, allowedMentions: { parse: ['everyone'] } }
    : payload;
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

function handleGuildError(guildId, err, context) {
  if (STALE_CONFIG_CODES.has(err?.code)) {
    deleteGuildConfig(guildId);
    console.warn(`Guild ${guildId} beállítása törölve — a bot nem fér hozzá a csatornához (${err.code}). Új /setup állítja vissza.`);
    return true;
  }
  console.error(`Hiba (${context}, guild ${guildId}):`, err);
  return false;
}

const lastPostedDateByGuild = new Map();

async function postDailyMenus(client, dateStr) {
  const guilds = getAllConfiguredGuilds();
  for (const guildCfg of guilds) {
    if (lastPostedDateByGuild.get(guildCfg.guildId) === dateStr) continue;
    lastPostedDateByGuild.set(guildCfg.guildId, dateStr);

    try {
      const channel = await client.channels.fetch(guildCfg.channelId);
      const selected = await selectFeaturedMenus(dateStr, guildCfg.featuredRestaurants);
      const payload = await buildDailyDigestPayload(dateStr, guildCfg.featuredRestaurants);
      const message = await channel.send(withEveryone(payload));

      // elmentjük az üzenetet + mely éttermek adata került bele, hogy később kiegészíthessük, ha egy
      // hiányzó étterem (pl. Famous) menüje csak a poszt után érkezik meg. `pinged` = volt-e valódi
      // menü-tartalom (és így @everyone ping) — ha nem, a kiegészítéskor friss posztot küldünk.
      saveDailyPost(guildCfg.guildId, {
        messageId: message.id,
        channelId: channel.id,
        date: dateStr,
        includedIds: selected.map((m) => m.restaurant.id),
        pinged: Boolean(payload.content),
      });
      console.log(`Napi menü poszt elküldve (${dateStr}), guild ${guildCfg.guildId} — ${selected.length}/${guildCfg.featuredRestaurants.length} étterem.`);

      await refreshPoll(channel, guildCfg.guildId, dateStr);
    } catch (err) {
      handleGuildError(guildCfg.guildId, err, 'napi poszt küldése');
    }
  }
}

// Ha a reggeli poszt hiányos volt (nem minden kiemelt éttermnek volt még adata), és időközben
// megérkezett a hiányzó menü (pl. a bot elindította a Famous scrape-et), szerkeszti az üzenetet a
// friss adatokra — így nem kell új posztot küldeni.
async function patchIncompleteDailyPosts(client, dateStr) {
  const guilds = getAllConfiguredGuilds();
  for (const guildCfg of guilds) {
    const record = getDailyPost(guildCfg.guildId);
    if (!record || record.date !== dateStr) continue;
    if (record.includedIds.length >= guildCfg.featuredRestaurants.length) continue; // már teljes

    try {
      const selected = await selectFeaturedMenus(dateStr, guildCfg.featuredRestaurants);
      if (selected.length <= record.includedIds.length) continue; // nincs új adat

      const channel = await client.channels.fetch(record.channelId);
      const payload = await buildDailyDigestPayload(dateStr, guildCfg.featuredRestaurants);
      const includedIds = selected.map((m) => m.restaurant.id);

      if (!record.pinged) {
        // a reggeli poszt üres/placeholder volt (nem pingelt) — most, hogy megjött az adat, friss
        // posztot küldünk valódi @everyone pinggel, a régi placeholdert pedig eltávolítjuk
        const oldMessage = await channel.messages.fetch(record.messageId).catch(() => null);
        if (oldMessage) await oldMessage.delete().catch(() => {});
        const message = await channel.send(withEveryone(payload));
        saveDailyPost(guildCfg.guildId, { ...record, messageId: message.id, includedIds, pinged: Boolean(payload.content) });
        console.log(`Napi menü poszt (friss, pinggel) kiküldve utólag (${dateStr}), guild ${guildCfg.guildId} — ${selected.length}/${guildCfg.featuredRestaurants.length} étterem.`);
        continue;
      }

      const message = await channel.messages.fetch(record.messageId).catch(() => null);
      if (!message) {
        // az üzenet eltűnt (törölték) — ne próbálkozzunk vele tovább
        saveDailyPost(guildCfg.guildId, { ...record, includedIds: guildCfg.featuredRestaurants });
        continue;
      }
      // meglévő, már pingelt poszt: helyben szerkesztjük, hogy ne kapjon mindenki dupla értesítést
      // (az @everyone szöveg marad, de a `parse: []` miatt nem pingel újra)
      await message.edit({ ...withEveryone(payload), allowedMentions: { parse: [] } });
      saveDailyPost(guildCfg.guildId, { ...record, includedIds });
      console.log(`Napi menü poszt kiegészítve (${dateStr}), guild ${guildCfg.guildId} — ${selected.length}/${guildCfg.featuredRestaurants.length} étterem.`);
    } catch (err) {
      handleGuildError(guildCfg.guildId, err, 'napi poszt kiegészítése');
    }
  }
}

export function startDailyMenuPoster(client) {
  setInterval(async () => {
    const { dateStr, hour, minute } = budapestNow();
    if (isWeekend(dateStr)) return;

    if (hour === POST_HOUR && minute === POST_MINUTE) {
      await postDailyMenus(client, dateStr);
    }
    // a poszt utáni kiegészítést minden ellenőrzéskor megpróbáljuk (nem csak 10:00-kor)
    await patchIncompleteDailyPosts(client, dateStr);
  }, CHECK_INTERVAL_MS);

  console.log(`Napi automata poszt bekapcsolva: minden nap ${POST_HOUR}:${POST_MINUTE} (Europe/Budapest), guildenkénti /setup beállítás szerint.`);
}
