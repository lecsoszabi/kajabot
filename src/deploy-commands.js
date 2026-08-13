import 'dotenv/config';
import { REST, Routes } from 'discord.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const commandsDir = path.join(__dirname, 'commands');
const commands = [];
for (const file of fs.readdirSync(commandsDir).filter((f) => f.endsWith('.js'))) {
  const command = await import(path.join(commandsDir, file));
  commands.push(command.data.toJSON());
}

const rest = new REST().setToken(process.env.DISCORD_TOKEN);

const route = process.env.GUILD_ID
  ? Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID)
  : Routes.applicationCommands(process.env.CLIENT_ID);

try {
  console.log(`${commands.length} parancs regisztrálása${process.env.GUILD_ID ? ' (guild)' : ' (globális)'}...`);
  await rest.put(route, { body: commands });
  console.log('Kész.');
} catch (err) {
  console.error(err);
}
