// Card-browser filters <-> URL query, so a filtered view can be shared as a link. Pure logic.
import { FACTIONS, TAGS, SUBTYPES } from './config.js';

export const TYPES = ['Character', 'Program', 'Gear', 'Mainframe'];
export const SORTS = ['id', 'name', 'ram', 'fit'];

/** RAM cost is a range ({min, max}, null = open end), the rest are multi-select sets. */
export const blankFilters = () => ({ q: '', types: new Set(), factions: new Set(), subtypes: new Set(), tags: new Set(), mytags: new Set(), rarity: new Set(), ram: { min: null, max: null }, iconic: false, hasAbility: false, inDeck: false });

// multi-select filter key -> query parameter
const SETS = { types: 'type', factions: 'fac', subtypes: 'sub', tags: 'tag', mytags: 'my', rarity: 'rar' };

// ---- RAM cost range ----
export const RAM_CAP = 8; // "8+" is the top of the scale

const clampRam = (n) => Math.max(0, Math.min(RAM_CAP, n));
const toRam = (x) => (x === '' || x == null || !Number.isFinite(Number(x)) || !Number.isInteger(Number(x)) ? null : clampRam(Number(x)));

/** Tidy a range: clamp to 0..8, a max of 8 or more means "no max", and a reversed pair is swapped. */
export function normalizeRange(r = {}) {
  let min = toRam(r.min), max = toRam(r.max);
  if (max != null && max >= RAM_CAP) max = null;
  if (min != null && max != null && min > max) [min, max] = [max, min];
  return { min, max };
}
export const hasRange = (r) => !!r && (r.min != null || r.max != null);

/** "1-3", "2-" (2 or more), "-3" (3 or fewer). Empty string when no range is set. */
export function encodeRange(r) {
  const { min, max } = normalizeRange(r);
  return min == null && max == null ? '' : `${min ?? ''}-${max ?? ''}`;
}

/**
 * Read `ram=`. Accepts the range form ("1-3", "2-", "-3") and the older list form ("1,2,5"),
 * which becomes the range from its lowest to its highest value. Anything else is no range.
 */
export function decodeRange(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return { min: null, max: null };
  const m = s.match(/^(\d{0,2})-(\d{0,2})$/);
  if (m) return normalizeRange({ min: m[1], max: m[2] });
  const nums = s.split(',').map((x) => x.trim()).filter((x) => /^\d{1,2}$/.test(x)).map(Number).filter((n) => n >= 0 && n <= RAM_CAP);
  if (!nums.length) return { min: null, max: null };
  return normalizeRange({ min: Math.min(...nums), max: Math.max(...nums) });
}

/** Closed-field summary: "Any", "2+", "≤3", "1–3", "3". */
export function rangeSummary(r) {
  const { min, max } = normalizeRange(r);
  const lab = (n) => (n >= RAM_CAP ? '8+' : String(n));
  if (min == null && max == null) return 'Any';
  if (min == null) return `\u2264${max}`;
  if (max == null) return `${lab(min)}${min >= RAM_CAP ? '' : '+'}`;
  return min === max ? String(min) : `${min}\u2013${max}`;
}

/** Does this card pass the range? Cards without a RAM cost (mainframes) fail only when a range is set. */
export function inRamRange(c, r) {
  if (!hasRange(r)) return true;
  if (c.ram == null) return false;
  const v = Math.min(c.ram, RAM_CAP);
  return (r.min == null || v >= r.min) && (r.max == null || v <= r.max);
}

// ---- multi-select helpers ----
/** "Any", "Hacker", "Hacker +2" (first in the option order). */
export function multiSummary(selected, order) {
  const picked = order.filter((v) => selected.has(v));
  const extra = [...selected].filter((v) => !order.includes(v));
  const all = [...picked, ...extra];
  return !all.length ? 'Any' : all.length === 1 ? String(all[0]) : `${all[0]} +${all.length - 1}`;
}
/** Toggle a value in a set (returns the same set). */
export function toggleIn(set, v) { set.has(v) ? set.delete(v) : set.add(v); return set; }

export const SET_KEYS = Object.keys(SETS);
export const hasAnyFilter = (F) => !!(F.q || SET_KEYS.some((k) => F[k].size) || hasRange(F.ram) || F.iconic || F.hasAbility || F.inDeck);
/** How many filters (not counting the search box) are on, one per group, for a badge. */
export const activeGroupCount = (F) => SET_KEYS.filter((k) => F[k].size).length + (hasRange(F.ram) ? 1 : 0) + (F.iconic ? 1 : 0) + (F.hasAbility ? 1 : 0) + (F.inDeck ? 1 : 0);

const searchCache = new Map();
const searchText = (c) => {
  if (!searchCache.has(c.id)) searchCache.set(c.id, `${c.name} ${c.type} ${c.subtype} ${c.factions.join(' ')} ${c.tags.join(' ')} ${c.keywords.join(' ')} ${(c.mainframe ? [c.mainframe.lead, ...c.mainframe.tiers.map((t) => t.text)] : c.text).join(' ')} ${(c.abilities || []).map((a) => a.name).join(' ')}`.replace(/[\[\]]/g, '').toLowerCase());
  return searchCache.get(c.id);
};

/**
 * Does a card pass the filters? Within a group any value matches (OR); groups combine with AND.
 * `skip` leaves one group out (a key of SET_KEYS, or 'ram'), which is how option counts are worked out.
 * ctx: { cardTags(id) -> your tag ids on a card, inDeck(card) -> boolean }.
 */
export function matchesFilters(c, F, ctx = {}, skip = '') {
  if (skip !== 'types' && F.types.size && !F.types.has(c.type)) return false;
  if (skip !== 'factions' && F.factions.size && !c.factions.some((x) => F.factions.has(x))) return false;
  if (skip !== 'subtypes' && F.subtypes.size && !F.subtypes.has(c.subtype)) return false;
  if (skip !== 'tags' && F.tags.size && !c.tags.some((x) => F.tags.has(x))) return false;
  if (skip !== 'mytags' && F.mytags.size && !(ctx.cardTags ? ctx.cardTags(c.id) : []).some((x) => F.mytags.has(x))) return false;
  if (skip !== 'rarity' && F.rarity.size && !F.rarity.has(c.rarity)) return false;
  if (skip !== 'ram' && !inRamRange(c, F.ram)) return false;
  if (F.iconic && !c.iconic) return false;
  if (F.hasAbility && !c.abilities) return false;
  if (F.inDeck && !(ctx.inDeck && ctx.inDeck(c))) return false;
  if (F.q) { const hay = searchText(c); if (!F.q.toLowerCase().split(/\s+/).filter(Boolean).every((w) => hay.includes(w))) return false; }
  return true;
}

const valuesOf = (c, key, ctx) => (key === 'types' ? [c.type] : key === 'factions' ? c.factions : key === 'subtypes' ? [c.subtype] : key === 'tags' ? c.tags : key === 'rarity' ? [c.rarity] : (ctx.cardTags ? ctx.cardTags(c.id) : []));

/** For one multi-select group: how many cards each option would show, given every OTHER active filter. */
export function facetCounts(list, F, ctx, key) {
  const out = new Map();
  for (const c of list) {
    if (!matchesFilters(c, F, ctx, key)) continue;
    for (const v of new Set(valuesOf(c, key, ctx))) if (v) out.set(v, (out.get(v) || 0) + 1);
  }
  return out;
}
/** Same for RAM cost values 0..8 (8 = "8+"). */
export function ramCounts(list, F, ctx) {
  const out = new Map();
  for (const c of list) if (c.ram != null && matchesFilters(c, F, ctx, 'ram')) { const v = Math.min(c.ram, RAM_CAP); out.set(v, (out.get(v) || 0) + 1); }
  return out;
}

/** The removable chips above the grid: [{ kind: 'set'|'ram'|'flag', key, value?, label }]. `labelOf(key, value)` names a value. */
export function activeChips(F, labelOf = (k, v) => String(v)) {
  const chips = [];
  for (const key of SET_KEYS) for (const value of F[key]) chips.push({ kind: 'set', key, value, label: labelOf(key, value) });
  if (hasRange(F.ram)) chips.push({ kind: 'ram', key: 'ram', label: `RAM ${rangeSummary(F.ram)}` });
  if (F.iconic) chips.push({ kind: 'flag', key: 'iconic', label: 'Iconic only' });
  if (F.hasAbility) chips.push({ kind: 'flag', key: 'hasAbility', label: 'Has a RAM-cost ability' });
  if (F.inDeck) chips.push({ kind: 'flag', key: 'inDeck', label: 'In your deck' });
  return chips;
}

/** "fac=Hacker,Mystic&type=Character&ram=1-3&q=draw". `inDeck` is about your deck, so it stays out of links. */
export function encodeFilters(F, sort = 'id') {
  const p = new URLSearchParams();
  if (F.q) p.set('q', F.q);
  for (const [key, name] of Object.entries(SETS)) if (F[key].size) p.set(name, [...F[key]].join(','));
  const ram = encodeRange(F.ram);
  if (ram) p.set('ram', ram);
  if (F.iconic) p.set('iconic', '1');
  if (F.hasAbility) p.set('ab', '1');
  if (sort && sort !== 'id') p.set('sort', sort);
  return p.toString().replace(/%2C/gi, ',').replace(/\+/g, '%20');
}

/**
 * Read a query into filters. Unknown values are dropped (a link from an older or newer version still opens),
 * except your own tag ids, which are kept as written since the tag list may not be loaded yet.
 * `rarities` is the list of rarities in the data set.
 */
export function decodeFilters(query, rarities = []) {
  const p = query instanceof URLSearchParams ? query : new URLSearchParams(query || '');
  const F = blankFilters();
  F.q = (p.get('q') || '').slice(0, 120);
  const list = (name) => (p.get(name) || '').split(',').map((x) => x.trim()).filter(Boolean);
  const keep = (name, allowed) => list(name).filter((x) => allowed.includes(x));
  keep('type', TYPES).forEach((x) => F.types.add(x));
  keep('fac', FACTIONS).forEach((x) => F.factions.add(x));
  keep('sub', SUBTYPES).forEach((x) => F.subtypes.add(x));
  keep('tag', TAGS).forEach((x) => F.tags.add(x));
  keep('rar', rarities).forEach((x) => F.rarity.add(x));
  F.ram = decodeRange(p.get('ram'));
  list('my').filter((x) => /^[a-z0-9-]+$/.test(x)).forEach((x) => F.mytags.add(x));
  F.iconic = p.get('iconic') === '1';
  F.hasAbility = p.get('ab') === '1';
  const sort = p.get('sort');
  return { F, sort: SORTS.includes(sort) ? sort : 'id' };
}

export const hasQuery = (query) => !!(query instanceof URLSearchParams ? query.toString() : query || '');
