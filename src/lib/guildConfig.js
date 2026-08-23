import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.join(__dirname, '..', '..', 'data', 'guild-config.json');

function loadAll() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  } catch {
    return {};
  }
}

function saveAll(all) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(all, null, 2), 'utf-8');
}

export function getGuildConfig(guildId) {
  return loadAll()[guildId] || null;
}

export function setGuildConfig(guildId, partial) {
  const all = loadAll();
  all[guildId] = { ...all[guildId], ...partial };
  saveAll(all);
  return all[guildId];
}

export function deleteGuildConfig(guildId) {
  const all = loadAll();
  if (all[guildId]) {
    delete all[guildId];
    saveAll(all);
  }
}

export function isSetupComplete(guildId) {
  const cfg = getGuildConfig(guildId);
  return Boolean(cfg?.channelId && cfg?.featuredRestaurants?.length);
}

export function getAllConfiguredGuilds() {
  const all = loadAll();
  return Object.entries(all)
    .filter(([, cfg]) => cfg.channelId && cfg.featuredRestaurants?.length)
    .map(([guildId, cfg]) => ({ guildId, ...cfg }));
}
