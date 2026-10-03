// Draw odds and sample hands. Pure logic, no DOM.
//
// Assumptions (the UI says them in one line):
//  - Every draw comes from the cyberdeck. The real game lets you take cards from the separate 25-card RAM deck instead,
//    so these are the best case for finding a card. The RAM deck is not modelled.
//  - Opening hand is 5. Each turn INITIALIZE draws or installs 2 cards (1 on the first turn of the player going first).
//  - No mulligan is counted in the odds.
import { byId } from './cards.js';
import { tagIdsOf } from './tags.js';

// ---- hypergeometric ----
const LF = [0];
for (let i = 1; i <= 700; i++) LF[i] = LF[i - 1] + Math.log(i);
const lchoose = (n, k) => (k < 0 || k > n ? -Infinity : LF[n] - LF[k] - LF[n - k]);

/** P(exactly k hits) when drawing n cards from N, K of which are hits. */
export function hypergeomPmf(N, K, n, k) {
  if (![N, K, n, k].every(Number.isInteger) || N < 0 || K < 0 || K > N || n < 0 || n > N || k < 0 || k > n || k > K || n - k > N - K) return 0;
  return Math.exp(lchoose(K, k) + lchoose(N - K, n - k) - lchoose(N, n));
}

/** P(at least k hits). Summed from k upward, so tiny odds keep their precision. */
export function atLeast(N, K, n, k) {
  if (k <= 0) return 1;
  let p = 0;
  for (let i = k; i <= Math.min(K, n); i++) p += hypergeomPmf(N, K, n, i);
  return Math.min(1, Math.max(0, p));
}

export const OPENING_HAND = 5;

/** How many cyberdeck cards you have seen: turn 0 is the opening hand. */
export function cardsSeen(turn, first = true, deckSize = Infinity) {
  const seen = turn <= 0 ? OPENING_HAND : OPENING_HAND + (first ? 1 + 2 * (turn - 1) : 2 * turn);
  return Math.min(seen, deckSize);
}

/** Odds of at least k hits at the opening hand and after each turn up to `turns`. */
export function oddsByTurn({ N, K, k = 1, first = true, turns = 8 }) {
  return Array.from({ length: turns + 1 }, (_, turn) => {
    const seen = cardsSeen(turn, first, N);
    return { turn, seen, p: atLeast(N, K, seen, k) };
  });
}

// ---- groups of cards ----
export const GROUP_KINDS = [
  { id: 'card', label: 'A specific card' },
  { id: 'faction', label: 'A faction' },
  { id: 'type', label: 'A card type' },
  { id: 'tag', label: 'One of your tags' },
  { id: 'ram', label: 'A RAM cost' },
];

/** Does a card belong to the group? `eff` is the effective tag layer (only needed for tag groups). */
export function matchGroup(card, group, eff = { tags: [], cards: {} }) {
  const v = group.value;
  switch (group.kind) {
    case 'card': return card.id === Number(v);
    case 'faction': return card.factions.includes(v);
    case 'type': return card.type === v;
    case 'tag': return tagIdsOf(eff, card.id).includes(v);
    case 'ram': return card.ram != null && (Number(v) >= 8 ? card.ram >= 8 : card.ram === Number(v));
    default: return false;
  }
}

/** Copies in the cyberdeck that belong to the group. */
export function groupSize(deck, group, eff) {
  let n = 0;
  for (const [id, count] of Object.entries(deck.main)) { const c = byId.get(Number(id)); if (c && matchGroup(c, group, eff)) n += count; }
  return n;
}

/** Choices for each kind, only those with at least one copy in the deck. */
export function groupOptions(deck, eff) {
  const opts = Object.fromEntries(GROUP_KINDS.map((k) => [k.id, []]));
  const add = (kind, value, label) => { const count = groupSize(deck, { kind, value }, eff); if (count) opts[kind].push({ value: String(value), label, count }); };
  const inDeck = Object.keys(deck.main).map((id) => byId.get(Number(id))).filter(Boolean);
  for (const c of [...inDeck].sort((a, b) => a.name.localeCompare(b.name))) add('card', c.id, c.name);
  for (const f of [...new Set(inDeck.flatMap((c) => c.factions))].sort()) add('faction', f, f);
  for (const t of ['Character', 'Program', 'Gear']) add('type', t, t);
  for (const t of eff ? eff.tags : []) add('tag', t.id, t.name);
  for (let r = 0; r <= 8; r++) add('ram', r, r === 8 ? '8 or more RAM' : `${r} RAM`);
  return opts;
}

// ---- sample hands ----
/** Fisher-Yates on a copy. `rng` returns [0,1) (pass a seeded one in tests). */
export function shuffle(list, rng = Math.random) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/** One entry per copy, each with its own `uid` so two copies of a card can be told apart. */
export const buildLibrary = (deck) => {
  let uid = 0;
  return Object.entries(deck.main).flatMap(([id, n]) => Array.from({ length: n }, () => ({ id: Number(id), uid: uid++ })));
};

/** Shuffle the cyberdeck and draw the opening hand. */
export function newGame(deck, { first = true, rng = Math.random } = {}) {
  const lib = shuffle(buildLibrary(deck), rng);
  const hand = lib.slice(0, OPENING_HAND);
  return { first, turn: 0, hand, library: lib.slice(OPENING_HAND), fresh: [] };
}

/** Mulligan before turn 1: send the chosen cards (by uid) to the bottom, then draw that many from the top. */
export function mulligan(game, uids) {
  if (game.turn !== 0) return game;
  const away = game.hand.filter((c) => uids.includes(c.uid));
  if (!away.length) return game;
  const keep = game.hand.filter((c) => !uids.includes(c.uid));
  const lib = [...game.library, ...away];
  const drawn = lib.slice(0, away.length);
  return { ...game, hand: [...keep, ...drawn], library: lib.slice(away.length), fresh: drawn.map((c) => c.uid) };
}

/** Cards INITIALIZE gives you from the cyberdeck this turn if you take them all from it. */
export const turnDraws = (game) => (game.turn === 0 && game.first ? 1 : 2);

/** Start the next turn and draw `count` cards (default: the full turn draw). */
export function drawTurn(game, count = turnDraws(game)) {
  const drawn = game.library.slice(0, count);
  return { ...game, turn: game.turn + 1, hand: [...game.hand, ...drawn], library: game.library.slice(count), fresh: drawn.map((c) => c.uid) };
}
