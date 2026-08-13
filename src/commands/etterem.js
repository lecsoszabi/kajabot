import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { getMenusForDate, toDateString } from '../lib/menumApi.js';
import { FAMOUS_RESTAURANT, famousMenuForDate, combinedDirectory } from '../lib/famousStore.js';
import { buildMenuEmbed, buildInfoEmbed } from '../lib/embeds.js';
import { currentWeekStartAndDay } from '../lib/actions.js';

export const data = new SlashCommandBuilder()
  .setName('etterem')
  .setDescription('Egy konkrét szegedi étterem mai menüje.')
  .addStringOption((opt) =>
    opt.setName('nev').setDescription('Étterem neve').setAutocomplete(true).setRequired(true),
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
    const restaurantId = interaction.options.getString('nev', true);
    const dateStr = toDateString(new Date());
    const menu =
      restaurantId === FAMOUS_RESTAURANT.id
        ? await famousMenuForDate(dateStr)
        : (await getMenusForDate(dateStr)).find((m) => m.restaurant.id === restaurantId);

    if (!menu) {
      const message =
        restaurantId === FAMOUS_RESTAURANT.id
          ? 'A Famous heti menüje még nincs feltöltve erre a hétre — admin a `/famousheti` paranccsal beillesztheti.'
          : 'Ez az étterem nem szerepel a szegedi listában, vagy ma nincs hozzá menüadat.';
      await interaction.editReply({ embeds: [buildInfoEmbed('Nem található', message)] });
      return;
    }

    const embed = buildMenuEmbed(menu, { index: 0, total: 1, dateLabel: 'Ma' });
    const { mondayStr, dayIndex } = currentWeekStartAndDay();
    const weekBtn = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`heti:day:${restaurantId}:${mondayStr}:${dayIndex}`)
        .setLabel('📅 Heti menü erre az étteremre')
        .setStyle(ButtonStyle.Primary),
    );

    await interaction.editReply({ embeds: [embed], components: [weekBtn] });
  } catch (err) {
    await interaction.editReply(`Hiba történt a menü lekérdezése közben: ${err.message}`);
  }
}
