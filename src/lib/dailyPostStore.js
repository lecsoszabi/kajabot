import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.join(__dirname, '..', '..', 'data', 'daily-posts.json');

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

export function getDailyPost(guildId) {
  return loadAll()[guildId] || null;
}

// Egy szerver aznapi menü-posztjának adatai: melyik üzenet, melyik csatorna, milyen dátumra, és
// mely éttermek adata került bele (includedIds) — utóbbiból tudjuk, hogy teljes-e, vagy később még
// kiegészíthető (pl. ha a Famous adata csak a poszt után érkezett meg).
export function saveDailyPost(guildId, record) {
  const all = loadAll();
  all[guildId] = record;
  saveAll(all);
}
