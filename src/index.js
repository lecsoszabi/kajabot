import 'dotenv/config';
import { Client, Collection, Events, GatewayIntentBits, MessageFlags } from 'discord.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleButton, handleSelectMenu, handleModalSubmit, handleChannelSelectMenu } from './interactions.js';
import { startDailyMenuPoster } from './lib/scheduler.js';
import { startFamousMenuRefresher } from './lib/famousRefresher.js';
import { isSetupComplete } from './lib/guildConfig.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.commands = new Collection();

const commandsDir = path.join(__dirname, 'commands');
for (const file of fs.readdirSync(commandsDir).filter((f) => f.endsWith('.js'))) {
  const command = await import(path.join(commandsDir, file));
  client.commands.set(command.data.name, command);
}

client.once(Events.ClientReady, (c) => {
  console.log(`Kajabot elindult mint ${c.user.tag}`);
  startDailyMenuPoster(client);
  startFamousMenuRefresher();
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (!command) return;

      if (!interaction.guildId) {
        await interaction.reply({ content: 'Ez a bot csak szerveren belül használható.', flags: MessageFlags.Ephemeral });
        return;
      }

      if (interaction.commandName !== 'setup' && !isSetupComplete(interaction.guildId)) {
        await interaction.reply({
          content: 'A bot még nincs beállítva ezen a szerveren. Futtasd le a `/setup` parancsot (csatorna + kiemelt éttermek kiválasztása), utána minden parancs elérhető lesz.',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      await command.execute(interaction);
      return;
    }

    if (interaction.isAutocomplete()) {
      const command = client.commands.get(interaction.commandName);
      if (!command?.autocomplete) return;
      await command.autocomplete(interaction);
      return;
    }

    if (interaction.isButton()) {
      await handleButton(interaction);
      return;
    }

    if (interaction.isStringSelectMenu()) {
      await handleSelectMenu(interaction);
      return;
    }

    if (interaction.isChannelSelectMenu()) {
      await handleChannelSelectMenu(interaction);
      return;
    }

    if (interaction.isModalSubmit()) {
      await handleModalSubmit(interaction);
      return;
    }
  } catch (err) {
    console.error('Interakció-kezelési hiba:', err);
    const errorPayload = { content: 'Váratlan hiba történt. Próbáld újra kicsit később.', flags: MessageFlags.Ephemeral };
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp(errorPayload).catch(() => {});
    } else if (interaction.isRepliable?.()) {
      await interaction.reply(errorPayload).catch(() => {});
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
