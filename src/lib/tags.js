// Your own tags on cards ("ramp", "burst", "draw engine"). Pure logic, no DOM, no storage.
// Shape (localStorage and data/my_tags.json): { tags: [{ id, name, color? }], cards: { "<cardId>": ["<tagId>", ...] } }
import { byId } from './cards.js';

/** Muted on purpose: faction colours stay the only saturated colours in the app. */
export const TAG_COLORS = [
  { id: 'steel', hex: '#8aa0b8' }, { id: 'sand', hex: '#c2b280' }, { id: 'moss', hex: '#9aaf8b' },
  { id: 'clay', hex: '#c49a86' }, { id: 'plum', hex: '#b295b8' }, { id: 'glass', hex: '#86b5b0' },
];
const HEXES = new Set(TAG_COLORS.map((c) => c.hex));

export const emptyTags = () => ({ tags: [], cards: {} });
export const slug = (s) => String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
export const cleanName = (s) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, 28);

/**
 * Accept anything, return a valid shape. Unknown cards are dropped. Card lists keep only ids of tags defined in the
 * same object, unless `lenient` (your local layer may point at tags that only the repo file defines).
 */
export function normalizeTags(raw, { lenient = false } = {}) {
  const out = emptyTags();
  if (!raw || typeof raw !== 'object') return out;
  const seen = new Set();
  for (const t of Array.isArray(raw.tags) ? raw.tags : []) {
    const name = cleanName(t && t.name);
    const id = slug((t && t.id) || name);
    if (!name || !id || seen.has(id)) continue;
    seen.add(id);
    out.tags.push(HEXES.has(t.color) ? { id, name, color: t.color } : { id, name });
  }
  for (const [cid, list] of Object.entries(raw.cards && typeof raw.cards === 'object' ? raw.cards : {})) {
    if (!byId.has(Number(cid)) || !Array.isArray(list)) continue;
    const ids = [...new Set(list.map(String))].filter((id) => (lenient ? slug(id) === id && id : seen.has(id)));
    if (ids.length || lenient) out.cards[cid] = ids; // lenient keeps [] : your local "cleared" mark
  }
  return out;
}

/** Add a tag, or return the existing one with the same name (any case). */
export function addTag(data, name, color) {
  const n = cleanName(name);
  if (!n) return { data, tag: null };
  const same = data.tags.find((t) => t.name.toLowerCase() === n.toLowerCase());
  if (same) return { data, tag: same };
  let id = slug(n) || 'tag', k = 2;
  while (data.tags.some((t) => t.id === id)) id = `${slug(n) || 'tag'}-${k++}`;
  const tag = HEXES.has(color) ? { id, name: n, color } : { id, name: n };
  return { data: { ...data, tags: [...data.tags, tag] }, tag };
}
export function editTag(data, id, patch) {
  return { ...data, tags: data.tags.map((t) => {
    if (t.id !== id) return t;
    const name = patch.name != null ? cleanName(patch.name) || t.name : t.name;
    const next = { id, name };
    const color = 'color' in patch ? patch.color : t.color;
    if (HEXES.has(color)) next.color = color;
    return next;
  }) };
}
export function removeTag(data, id) {
  const cards = {};
  for (const [cid, list] of Object.entries(data.cards)) { const rest = list.filter((x) => x !== id); if (rest.length) cards[cid] = rest; }
  return { tags: data.tags.filter((t) => t.id !== id), cards };
}
export function setCardTag(data, cardId, tagId, on) {
  const cur = data.cards[cardId] || [];
  const next = on ? [...new Set([...cur, tagId])] : cur.filter((x) => x !== tagId);
  const cards = { ...data.cards };
  if (next.length) cards[cardId] = next; else delete cards[cardId];
  return { ...data, cards };
}

/**
 * Repo file first, your local edits on top. Tags: by id, local wins. Card lists: if you have edited a card locally
 * its local list replaces the repo list (an empty list means you cleared it); otherwise the repo list stands.
 * Each effective tag carries `source`: 'repo' when only the repo defines it.
 */
export function mergeLayers(repo, local) {
  const tags = new Map();
  for (const t of repo.tags) tags.set(t.id, { ...t, source: 'repo' });
  for (const t of local.tags) tags.set(t.id, { ...t, source: tags.has(t.id) ? 'repo' : 'local' });
  const cards = {};
  for (const cid of new Set([...Object.keys(repo.cards), ...Object.keys(local.cards)])) {
    const list = (cid in local.cards ? local.cards[cid] : repo.cards[cid]).filter((id) => tags.has(id));
    if (list.length) cards[cid] = list;
  }
  return { tags: [...tags.values()], cards };
}

export const tagIdsOf = (eff, cardId) => eff.cards[cardId] || [];
export const tagById = (eff, id) => eff.tags.find((t) => t.id === id) || null;
export const tagsOf = (eff, cardId) => tagIdsOf(eff, cardId).map((id) => tagById(eff, id)).filter(Boolean);
export const usage = (eff) => { const m = new Map(eff.tags.map((t) => [t.id, 0])); for (const list of Object.values(eff.cards)) for (const id of list) m.set(id, (m.get(id) || 0) + 1); return m; };

/** Tags that appear on cards in this deck's cyberdeck, with how many copies carry each. */
export function deckTagCounts(deck, eff) {
  const m = new Map();
  for (const [cid, n] of Object.entries(deck.main)) for (const id of tagIdsOf(eff, cid)) m.set(id, (m.get(id) || 0) + n);
  return m;
}

/** For suggestions: cards (anywhere in the set) that share a tag with cards already in the deck. */
export function deckTagBoost(deck, eff) {
  const counts = deckTagCounts(deck, eff);
  const boost = new Map();
  if (!counts.size) return boost;
  for (const [cid, ids] of Object.entries(eff.cards)) {
    let score = 0; const names = [];
    for (const id of ids) {
      const n = counts.get(id);
      if (!n) continue;
      score += 1 + Math.min(n, 8) / 4;
      names.push(tagById(eff, id).name);
    }
    if (score) boost.set(Number(cid), { score, names });
  }
  return boost;
}

/** Rows grouped by tag. A card with several tags appears under each; untagged cards go last. */
export function groupByTag(entries, eff) {
  const groups = eff.tags.map((t) => ({ key: t.id, tag: t, rows: entries.filter((e) => tagIdsOf(eff, e.c.id).includes(t.id)) }));
  groups.push({ key: 'untagged', tag: null, rows: entries.filter((e) => !tagsOf(eff, e.c.id).length) });
  return groups.filter((g) => g.rows.length);
}

/** Does the card carry any of these tag ids? (An empty set matches everything.) */
export const hasAnyTag = (eff, cardId, ids) => !ids.size || tagIdsOf(eff, cardId).some((id) => ids.has(id));
