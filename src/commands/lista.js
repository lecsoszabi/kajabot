import { SlashCommandBuilder } from 'discord.js';
import { buildRestaurantListPayload } from '../lib/actions.js';

export const data = new SlashCommandBuilder()
  .setName('lista')
  .setDescription('Az összes nyilvántartott szegedi étterem listája.');

export async function execute(interaction) {
  await interaction.deferReply();
  try {
    const payload = await buildRestaurantListPayload();
    await interaction.editReply(payload);
  } catch (err) {
    await interaction.editReply(`Hiba történt az éttermek lekérdezése közben: ${err.message}`);
  }
}
