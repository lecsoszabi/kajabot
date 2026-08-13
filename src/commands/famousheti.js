import { SlashCommandBuilder, PermissionFlagsBits, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('famousheti')
  .setDescription('A Famous Steakbisztró heti menüjének frissítése (a Facebook poszt szövegének beillesztésével).')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

export async function execute(interaction) {
  const modal = new ModalBuilder().setCustomId('famousheti:modal').setTitle('Famous heti menü beillesztése');

  const input = new TextInputBuilder()
    .setCustomId('szoveg')
    .setLabel('A Facebook poszt teljes szövege')
    .setPlaceholder('HÉTFŐ (08.10.)\nLeves... 890.-\n...')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(4000);

  modal.addComponents(new ActionRowBuilder().addComponents(input));
  await interaction.showModal(modal);
}
