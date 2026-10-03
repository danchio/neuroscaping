// Card-browser filters <-> URL query, so a filtered view can be shared as a link. Pure logic.
import { FACTIONS, TAGS, SUBTYPES } from './config.js';

export const TYPES = ['Character', 'Program', 'Gear', 'Mainframe'];
export const SORTS = ['id', 'name', 'ram', 'fit'];

export const blankFilters = () => ({ q: '', types: new Set(), factions: new Set(), subtypes: new Set(), tags: new Set(), mytags: new Set(), rarity: new Set(), ram: new Set(), iconic: false, hasAbility: false, inDeck: false });

// filter key -> query parameter
const SETS = { types: 'type', factions: 'fac', subtypes: 'sub', tags: 'tag', mytags: 'my', rarity: 'rar', ram: 'ram' };

/** "fac=Hacker,Mystic&type=Character&ram=1,2&q=draw". `inDeck` is about your deck, so it stays out of links. */
export function encodeFilters(F, sort = 'id') {
  const p = new URLSearchParams();
  if (F.q) p.set('q', F.q);
  for (const [key, name] of Object.entries(SETS)) if (F[key].size) p.set(name, [...F[key]].join(','));
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
  list('ram').map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 8).forEach((n) => F.ram.add(n));
  list('my').filter((x) => /^[a-z0-9-]+$/.test(x)).forEach((x) => F.mytags.add(x));
  F.iconic = p.get('iconic') === '1';
  F.hasAbility = p.get('ab') === '1';
  const sort = p.get('sort');
  return { F, sort: SORTS.includes(sort) ? sort : 'id' };
}

export const hasQuery = (query) => !!(query instanceof URLSearchParams ? query.toString() : query || '');
