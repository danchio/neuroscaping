// App state: decks in localStorage under the original key and shape ({ decks, activeId }).
import { emptyDeck, changeCount, setMainframe, copiesOf, total } from './lib/deck.js';
import { byId } from './lib/cards.js';
import { LIMITS } from './lib/config.js';

export const STORE = 'neuroscape-deck-lab:v1';
export const state = { decks: [], activeId: null };

const listeners = new Set();
export const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const emit = () => listeners.forEach((fn) => fn());

export function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE) || 'null');
    if (raw && Array.isArray(raw.decks)) { state.decks = raw.decks.filter((d) => d && d.id && d.main && d.side); state.activeId = raw.activeId; }
  } catch { /* storage unavailable: start empty */ }
  if (!state.decks.some((d) => d.id === state.activeId)) state.activeId = state.decks[0]?.id ?? null;
}
function save() {
  try { localStorage.setItem(STORE, JSON.stringify({ decks: state.decks, activeId: state.activeId })); } catch { /* ignore */ }
}

export const getDeck = (id) => state.decks.find((d) => d.id === id) || null;
export const activeDeck = () => getDeck(state.activeId);

export function setDeck(next, { silent = false } = {}) {
  state.decks = state.decks.map((d) => (d.id === next.id ? next : d));
  save();
  if (!silent) emit();
}
export function addDeck(deck, { activate = true } = {}) {
  state.decks = [...state.decks, deck];
  if (activate) state.activeId = deck.id;
  save(); emit();
  return deck;
}
export function activate(id) { if (state.activeId !== id && getDeck(id)) { state.activeId = id; save(); emit(); } }
export function removeDeck(id) {
  state.decks = state.decks.filter((d) => d.id !== id);
  if (state.activeId === id) state.activeId = state.decks[0]?.id ?? null;
  save(); emit();
}
export function newDeck(name = 'New deck', mainframe = null) {
  const d = emptyDeck(name);
  d.mainframe = mainframe;
  return addDeck(d);
}
export function duplicateDeck(id) {
  const d = getDeck(id);
  if (!d) return null;
  const copy = { ...JSON.parse(JSON.stringify(d)), id: emptyDeck().id, name: `${d.name} copy` };
  return addDeck(copy);
}

/** Change copies of a card. Returns { ok, message } so the UI can say why nothing happened. */
export function change(deckId, zone, cardId, delta, qty = 1) {
  const d = getDeck(deckId);
  const c = byId.get(cardId);
  if (!d || !c) return { ok: false, message: '' };
  let cur = d, applied = 0;
  for (let i = 0; i < Math.abs(qty); i++) {
    const next = changeCount(cur, zone, cardId, delta);
    if (next === cur || (next[zone][cardId] || 0) === (cur[zone][cardId] || 0)) break;
    cur = next; applied++;
  }
  if (applied) setDeck(cur);
  if (applied === Math.abs(qty)) return { ok: true, applied, message: '' };
  if (delta > 0) {
    const why = zone === 'side' && total(d.side) >= LIMITS.sideMax && !(c.copyLimit > 0 && copiesOf(d, cardId) >= c.copyLimit)
      ? `Sideboard is full (${LIMITS.sideMax} cards).`
      : `${c.name.toLowerCase().replace(/(^|[\s,'’-])([a-z])/g, (m, a, b) => a + b.toUpperCase())}: limit is ${c.copyLimit} copies across cyberdeck and sideboard.`;
    return { ok: applied > 0, applied, message: why };
  }
  return { ok: applied > 0, applied, message: '' };
}

export function moveCard(deckId, from, to, cardId) {
  const d = getDeck(deckId);
  if (!d || !(d[from][cardId] > 0)) return { ok: false, message: '' };
  if (to === 'side' && total(d.side) >= LIMITS.sideMax) return { ok: false, message: `Sideboard is full (${LIMITS.sideMax} cards).` };
  const one = changeCount(d, from, cardId, -1);
  setDeck(changeCount(one, to, cardId, 1));
  return { ok: true, message: '' };
}

export function pickMainframe(deckId, cardId, slot = 'mainframe') {
  const d = getDeck(deckId);
  if (!d) return;
  setDeck(d[slot] === cardId ? { ...d, [slot]: null } : { ...d, [slot]: cardId });
}
export function setMainframeExact(deckId, cardId, slot = 'mainframe') {
  const d = getDeck(deckId);
  if (d) setDeck({ ...d, [slot]: cardId });
}
export { setMainframe };
