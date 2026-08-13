import { SlashCommandBuilder } from 'discord.js';
import { toDateString } from '../lib/menumApi.js';
import { buildTodayPayload } from '../lib/actions.js';

export const data = new SlashCommandBuilder()
  .setName('mai')
  .setDescription('A mai szegedi napi menük, étterményként — nyilazd végig a gombokkal.');

export async function execute(interaction) {
  await interaction.deferReply();
  try {
    const payload = await buildTodayPayload(toDateString(new Date()), 0);
    await interaction.editReply(payload);
  } catch (err) {
    await interaction.editReply(`Hiba történt a menük lekérdezése közben: ${err.message}`);
  }
}
