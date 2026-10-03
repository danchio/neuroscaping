import { byId } from './cards.js';
import { LIMITS } from './config.js';
import { isPersistent } from './synergy.js';

let n = 0;
export const uid = () => Date.now().toString(36) + (n++).toString(36) + Math.random().toString(36).slice(2, 5);

export const emptyDeck = (name = 'New deck') => ({ id: uid(), name, mainframe: null, sideMainframe: null, main: {}, side: {}, notes: '' });

export const total = (zone) => Object.values(zone).reduce((a, b) => a + b, 0);
export const copiesOf = (deck, id) => (deck.main[id] || 0) + (deck.side[id] || 0);

/** Returns a new deck with `delta` copies added/removed in zone ('main' | 'side'). Never exceeds the copy limit. */
export function changeCount(deck, zone, id, delta) {
  const card = byId.get(id);
  if (!card || card.type === 'Mainframe') return deck;
  const cur = deck[zone][id] || 0;
  let next = cur + delta;
  if (delta > 0 && card.copyLimit > 0) next = Math.min(next, cur + Math.max(0, card.copyLimit - copiesOf(deck, id)));
  if (zone === 'side' && delta > 0 && total(deck.side) >= LIMITS.sideMax) next = cur;
  next = Math.max(0, next);
  const zoneCopy = { ...deck[zone] };
  if (next === 0) delete zoneCopy[id]; else zoneCopy[id] = next;
  return { ...deck, [zone]: zoneCopy };
}

export function setMainframe(deck, id, slot = 'mainframe') {
  return { ...deck, [slot]: deck[slot] === id ? null : id };
}

export function validate(deck) {
  const issues = [];
  const mainCount = total(deck.main);
  const sideCount = total(deck.side);
  if (!deck.mainframe) issues.push({ level: 'error', text: 'Pick a mainframe.' });
  if (mainCount < LIMITS.mainMin) issues.push({ level: 'error', text: `Cyberdeck needs at least ${LIMITS.mainMin} cards (${LIMITS.mainMin - mainCount} to go).` });
  if (mainCount > LIMITS.mainMax) issues.push({ level: 'error', text: `Cyberdeck can have at most ${LIMITS.mainMax} cards (${mainCount - LIMITS.mainMax} over).` });
  if (sideCount > LIMITS.sideMax) issues.push({ level: 'error', text: `Sideboard holds at most ${LIMITS.sideMax} cards (${sideCount - LIMITS.sideMax} over).` });
  const ids = new Set([...Object.keys(deck.main), ...Object.keys(deck.side)].map(Number));
  for (const id of ids) {
    const c = byId.get(id);
    if (!c) { issues.push({ level: 'error', text: `Unknown card #${id}.` }); continue; }
    if (c.type === 'Mainframe') issues.push({ level: 'error', text: `${c.name} is a mainframe; set it in the mainframe slot.` });
    else if (c.copyLimit > 0 && copiesOf(deck, id) > c.copyLimit) issues.push({ level: 'error', text: `${c.name}: ${copiesOf(deck, id)} copies, limit ${c.copyLimit} (cyberdeck and sideboard together).` });
  }
  return { ok: issues.every((i) => i.level !== 'error'), issues, mainCount, sideCount };
}

export function deckStats(deck) {
  const byType = {}, curve = {}, factions = {};
  let ramTotal = 0, ramCards = 0;
  for (const [sid, count] of Object.entries(deck.main)) {
    const c = byId.get(Number(sid));
    if (!c) continue;
    byType[c.type] = (byType[c.type] || 0) + count;
    if (c.ram != null) {
      const k = Math.min(c.ram, 8);
      curve[k] = (curve[k] || 0) + count;
      ramTotal += c.ram * count; ramCards += count;
    }
    for (const f of c.factions) factions[f] = (factions[f] || 0) + count;
  }
  return { byType, curve, factions, avgRam: ramCards ? ramTotal / ramCards : 0 };
}

export function persistentFactionCounts(deck) {
  const out = {};
  for (const [sid, count] of Object.entries(deck.main)) {
    const c = byId.get(Number(sid));
    if (!c || !isPersistent(c)) continue;
    for (const f of c.factions) out[f] = (out[f] || 0) + count;
  }
  return out;
}
