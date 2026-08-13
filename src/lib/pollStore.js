import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.join(__dirname, '..', '..', 'data', 'polls.json');

export const POLL_TIME_SLOTS = ['12:00', '12:30', '13:00', '13:30', '14:00'];
export const POLL_NOT_GOING = 'not_going';

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

export function getPoll(guildId) {
  return loadAll()[guildId] || null;
}

export function savePoll(guildId, poll) {
  const all = loadAll();
  all[guildId] = poll;
  saveAll(all);
}
