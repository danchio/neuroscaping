import { cards } from '../lib/cards.js';
import { isPersistent } from '../lib/synergy.js';
/** How many persistent cards in the set carry any of these factions. */
export const persistentCount = (factions) => cards.filter((c) => c.type !== 'Mainframe' && isPersistent(c) && c.factions.some((f) => factions.includes(f))).length;
