import { cards, byId, byName, norm, mainframes } from './cards.js';
import { FACTIONS, TAGS, SUBTYPES, PERSISTENT_TYPES, PERSISTENT_SUBTYPES } from './config.js';

export const isPersistent = (c) =>
  PERSISTENT_TYPES.includes(c.type) || (c.type === 'Program' && PERSISTENT_SUBTYPES.includes(c.subtype));

// ---- What does each card talk about? ----
const bracket = /\[([^\[\]]+)\]/g;
const subtypeRe = Object.fromEntries(SUBTYPES.map((s) => [s, new RegExp(`\\b${s}s?\\b`, 'i')]));

function fullText(c) {
  if (!c.mainframe) return c.text.join(' ');
  return [c.mainframe.lead, ...c.mainframe.tiers.map((t) => t.text)].join(' ');
}

const wants = new Map();
for (const c of cards) {
  const w = { factions: new Set(), tags: new Set(), names: new Set(), subtypes: new Set() };
  const text = fullText(c);
  for (const [, raw] of text.matchAll(bracket)) {
    const m = raw.trim();
    if (m === 'Mainframe' || m === 'Bioframe' || m.length > 30) continue;
    if (FACTIONS.includes(m)) w.factions.add(m);
    else if (TAGS.includes(m)) w.tags.add(m);
    else if (byName.has(norm(m))) w.names.add(byName.get(norm(m)).id);
  }
  if (c.mainframe) for (const t of c.mainframe.tiers) for (const f of Object.keys(t.needs)) w.factions.add(f);
  for (const s of SUBTYPES) if (subtypeRe[s].test(text)) w.subtypes.add(s);
  wants.set(c.id, w);
}

const WEIGHT = { name: 3, tag: 1.5, faction: 1, subtype: 1 };

/** Why does card `a` care about card `b`? Returns [{kind, label, weight}] (empty if it doesn't). */
export function reasons(a, b) {
  if (a.id === b.id) return [];
  const w = wants.get(a.id);
  const out = [];
  if (w.names.has(b.id)) out.push({ kind: 'name', label: b.name, weight: WEIGHT.name });
  for (const t of b.tags) if (w.tags.has(t)) out.push({ kind: 'tag', label: t, weight: WEIGHT.tag });
  for (const f of b.factions) if (w.factions.has(f)) out.push({ kind: 'faction', label: f, weight: WEIGHT.faction });
  if (b.subtype && w.subtypes.has(b.subtype)) out.push({ kind: 'subtype', label: b.subtype, weight: WEIGHT.subtype });
  return out;
}

export const score = (rs) => rs.reduce((s, r) => s + r.weight, 0);
export const describeWants = (c) => {
  const w = wants.get(c.id);
  return { factions: [...w.factions], tags: [...w.tags], names: [...w.names].map((id) => byId.get(id).name), subtypes: [...w.subtypes] };
};

/** Synergy lens for one card. */
export function lens(card) {
  const worksWith = [], enabledBy = [];
  for (const other of cards) {
    if (other.id === card.id) continue;
    const fwd = reasons(card, other);
    if (fwd.length) worksWith.push({ card: other, why: fwd, score: score(fwd) });
    const back = reasons(other, card);
    if (back.length) enabledBy.push({ card: other, why: back, score: score(back) });
  }
  const sort = (a, b) => b.score - a.score || a.card.id - b.card.id;
  return { worksWith: worksWith.sort(sort), enabledBy: enabledBy.sort(sort) };
}

// ---- Mainframe tiers ----
export function tierStatus(mf, counts) {
  return mf.mainframe.tiers.map((tier, i) => {
    const progress = Object.entries(tier.needs).map(([faction, need]) => ({ faction, need, have: counts[faction] || 0 }));
    return { index: i, tier, progress, met: progress.every((p) => p.have >= p.need) };
  });
}

/** Rank mainframes by how well a set of faction counts fits them. */
export function rankMainframes(counts) {
  return mainframes
    .map((mf) => {
      const st = tierStatus(mf, counts);
      const met = st.filter((s) => s.met).length;
      const last = st[st.length - 1].progress;
      const ratio = last.reduce((s, p) => s + Math.min(1, p.have / p.need), 0) / last.length;
      return { mf, met, ratio, total: st.length };
    })
    .sort((a, b) => b.met - a.met || b.ratio - a.ratio || a.mf.id - b.mf.id);
}

// ---- Deck suggestions ----
export function suggest(deck, limit = 12) {
  const inDeck = Object.keys(deck.main).map(Number).map((id) => byId.get(id)).filter(Boolean);
  const anchors = [...inDeck];
  const mf = deck.mainframe && byId.get(deck.mainframe);
  if (mf) anchors.push(mf, mf);
  if (!anchors.length) return [];
  const out = [];
  for (const c of cards) {
    if (c.type === 'Mainframe' || deck.main[c.id]) continue;
    let s = 0;
    const partners = [];
    for (const a of anchors) {
      const v = score(reasons(a, c)) + score(reasons(c, a));
      if (v) { s += v; if (!partners.includes(a.name)) partners.push(a.name); }
    }
    if (s > 0) out.push({ card: c, score: s, partners: partners.slice(0, 3), count: partners.length });
  }
  return out.sort((a, b) => b.score - a.score || a.card.id - b.card.id).slice(0, limit);
}
