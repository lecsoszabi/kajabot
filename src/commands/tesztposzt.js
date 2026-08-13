import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { budapestNow } from '../lib/menumApi.js';
import { buildDailyDigestPayload, refreshPoll } from '../lib/scheduler.js';
import { getGuildConfig } from '../lib/guildConfig.js';

export const data = new SlashCommandBuilder()
  .setName('tesztposzt')
  .setDescription('Előnézet a kiemelt éttermek napi 10 órás automata posztjáról, a szavazással együtt.')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

export async function execute(interaction) {
  await interaction.deferReply();
  const { dateStr } = budapestNow();
  const cfg = getGuildConfig(interaction.guildId);
  const payload = await buildDailyDigestPayload(dateStr, cfg?.featuredRestaurants);
  await interaction.editReply(payload);

  if (cfg?.channelId) {
    try {
      const channel = await interaction.client.channels.fetch(cfg.channelId);
      await refreshPoll(channel, interaction.guildId, dateStr);
      await interaction.followUp({
        content: `📊 A szavazás is elment ide: <#${cfg.channelId}>`,
        flags: MessageFlags.Ephemeral,
      });
    } catch (err) {
      await interaction.followUp({
        content: `Nem sikerült elküldeni a szavazást: ${err.message}`,
        flags: MessageFlags.Ephemeral,
      });
    }
  }
}
