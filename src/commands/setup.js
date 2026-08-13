import { SlashCommandBuilder, PermissionFlagsBits, ChannelSelectMenuBuilder, ChannelType, ActionRowBuilder } from 'discord.js';
import { getGuildConfig } from '../lib/guildConfig.js';
import { buildInfoEmbed } from '../lib/embeds.js';

export const data = new SlashCommandBuilder()
  .setName('setup')
  .setDescription('Kajabot beállítása ezen a szerveren: célcsatorna + kiemelt éttermek kiválasztása.')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

export async function execute(interaction) {
  const current = getGuildConfig(interaction.guildId);

  const select = new ChannelSelectMenuBuilder()
    .setCustomId('setup:channel')
    .setPlaceholder('Válaszd ki a csatornát, ahova a bot posztoljon...')
    .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement);

  if (current?.channelId) select.setDefaultChannels(current.channelId);

  await interaction.reply({
    embeds: [
      buildInfoEmbed(
        '⚙️ Kajabot beállítás (1/2)',
        'Válaszd ki a csatornát, ahova a napi 10 órás automata menü-posztot küldje a bot.',
      ),
    ],
    components: [new ActionRowBuilder().addComponents(select)],
  });
}
