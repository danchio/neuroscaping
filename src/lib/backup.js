// "My data" backup: all decks and your tags in one JSON file, and a merge that never overwrites. Pure logic.
import { byId } from './cards.js';
import { uid } from './deck.js';
import { normalizeTags, emptyTags, slug } from './tags.js';

export const BACKUP_APP = 'neuroscape-deck-lab';

export function buildBackup(decks, localTags, now = new Date()) {
  return { app: BACKUP_APP, version: 1, exportedAt: now.toISOString(), decks, tags: localTags };
}

const cleanZone = (z) => { const o = {}; for (const [id, n] of Object.entries(z && typeof z === 'object' ? z : {})) if (byId.has(Number(id)) && Number(n) > 0) o[id] = Math.floor(Number(n)); return o; };
function cleanDeck(d) {
  if (!d || typeof d !== 'object' || !d.id || typeof d.name !== 'string') return null;
  const mf = (x) => (byId.get(x)?.type === 'Mainframe' ? x : null);
  return { id: String(d.id), name: d.name.slice(0, 60) || 'Untitled deck', mainframe: mf(d.mainframe), sideMainframe: mf(d.sideMainframe), main: cleanZone(d.main), side: cleanZone(d.side), notes: typeof d.notes === 'string' ? d.notes : '' };
}

/** Read a backup file's text. Throws a readable Error if it is not one of ours. */
export function parseBackup(text) {
  let raw;
  try { raw = JSON.parse(text); } catch { throw new Error('That file is not valid JSON.'); }
  if (!raw || raw.app !== BACKUP_APP || !Array.isArray(raw.decks)) throw new Error('That does not look like a Deck Lab backup.');
  return { decks: raw.decks.map(cleanDeck).filter(Boolean), tags: normalizeTags(raw.tags, { lenient: true }) };
}

const same = (a, b) => JSON.stringify([a.name, a.mainframe, a.sideMainframe, a.main, a.side, a.notes]) === JSON.stringify([b.name, b.mainframe, b.sideMainframe, b.main, b.side, b.notes]);

/**
 * Merge a backup into what is here. Decks: new ids are added; same id and identical content is skipped; same id but
 * different content comes in as a new deck named "<name> (imported)". Tags: matched by name (any case); card tags are
 * only ever added. Nothing existing is changed or removed.
 */
export function mergeBackup(current, incoming) {
  const decks = [...current.decks];
  const sum = { decksAdded: 0, decksSame: 0, decksRenamed: 0, tagsAdded: 0, cardTagsAdded: 0 };
  for (const d of incoming.decks) {
    const have = decks.find((x) => x.id === d.id);
    if (!have) { decks.push(d); sum.decksAdded++; }
    else if (same(have, d)) sum.decksSame++;
    else { decks.push({ ...d, id: uid(), name: `${d.name} (imported)`.slice(0, 60) }); sum.decksRenamed++; sum.decksAdded++; }
  }
  let tags = { tags: [...current.tags.tags], cards: { ...current.tags.cards } };
  const idMap = new Map();
  for (const t of incoming.tags.tags) {
    const hit = tags.tags.find((x) => x.name.toLowerCase() === t.name.toLowerCase());
    if (hit) { idMap.set(t.id, hit.id); continue; }
    let id = t.id, k = 2;
    while (tags.tags.some((x) => x.id === id)) id = `${slug(t.name) || 'tag'}-${k++}`;
    tags.tags.push({ ...t, id }); idMap.set(t.id, id); sum.tagsAdded++;
  }
  for (const [cid, list] of Object.entries(incoming.tags.cards)) {
    const cur = new Set(tags.cards[cid] || []);
    for (const old of list) { const id = idMap.get(old) ?? old; if (id && !cur.has(id)) { cur.add(id); sum.cardTagsAdded++; } }
    if (cur.size) tags.cards[cid] = [...cur];
  }
  return { decks, tags, summary: sum };
}
export { emptyTags };
