import { cards } from '../data/cards.js';
import { FACTIONS, TAGS, SUBTYPES } from './config.js';

export { cards, FACTIONS, TAGS, SUBTYPES };

export const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
export const byId = new Map(cards.map((c) => [c.id, c]));
export const byName = new Map(cards.map((c) => [norm(c.name), c]));
export const mainframes = cards.filter((c) => c.type === 'Mainframe');
export const RARITIES = [...new Set(cards.map((c) => c.rarity))];

export const titleCase = (s) => s.toLowerCase().replace(/(^|[\s,'’-])([a-z])/g, (m, a, b) => a + b.toUpperCase());
