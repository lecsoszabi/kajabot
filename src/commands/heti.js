import { SlashCommandBuilder } from 'discord.js';
import { toDateString } from '../lib/menumApi.js';
import { combinedDirectory } from '../lib/famousStore.js';
import { buildRestaurantPickPayload, buildWeekDayPayload, currentWeekStartAndDay } from '../lib/actions.js';

export const data = new SlashCommandBuilder()
  .setName('heti')
  .setDescription('Egy szegedi étterem heti menüje, naponta lapozható.')
  .addStringOption((opt) =>
    opt
      .setName('etterem')
      .setDescription('Melyik étterem heti menüjére vagy kíváncsi? (üresen hagyva választhatsz listából)')
      .setAutocomplete(true)
      .setRequired(false),
  );

export async function autocomplete(interaction) {
  const focused = interaction.options.getFocused().toLowerCase();
  const restaurants = await combinedDirectory(toDateString(new Date()));
  const choices = restaurants
    .filter((r) => r.name.toLowerCase().includes(focused))
    .slice(0, 25)
    .map((r) => ({ name: r.name, value: r.id }));
  await interaction.respond(choices);
}

export async function execute(interaction) {
  await interaction.deferReply();
  try {
    const restaurantId = interaction.options.getString('etterem');
    if (!restaurantId) {
      const payload = await buildRestaurantPickPayload();
      await interaction.editReply(payload);
      return;
    }
    const { mondayStr, dayIndex } = currentWeekStartAndDay();
    const payload = await buildWeekDayPayload(restaurantId, mondayStr, dayIndex);
    await interaction.editReply(payload);
  } catch (err) {
    await interaction.editReply(`Hiba történt a menü lekérdezése közben: ${err.message}`);
  }
}
