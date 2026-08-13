import { SlashCommandBuilder } from 'discord.js';
import { buildHomePayload } from '../lib/actions.js';

export const data = new SlashCommandBuilder()
  .setName('kaja')
  .setDescription('Kajabot főmenü — gombokkal navigálhatsz a szegedi menük között.');

export async function execute(interaction) {
  const payload = await buildHomePayload();
  await interaction.reply(payload);
}
