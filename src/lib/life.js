// Life counter state (pure). Each player has two health totals, Mainframe and Bioframe, both starting at 20.
export const LIFE_KEY = 'neuroscape-deck-lab:life:v1';
export const START = 20;
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 4;
export const CAP = 999;
export const METERS = [{ id: 'mf', label: 'Mainframe' }, { id: 'bf', label: 'Bioframe' }];

const clamp = (n) => Math.max(0, Math.min(CAP, Math.round(n)));
const fresh = (i) => ({ name: `Player ${i + 1}`, mf: START, bf: START });

export const newLife = (n = 2) => ({ flip: true, players: Array.from({ length: clampPlayers(n) }, (_, i) => fresh(i)) });
export const clampPlayers = (n) => Math.max(MIN_PLAYERS, Math.min(MAX_PLAYERS, Math.round(Number(n)) || MIN_PLAYERS));

/** Add delta to one meter. Returns a new state; the value stays between 0 and CAP. */
export function adjust(s, i, meter, delta) {
  if (!s.players[i] || !METERS.some((m) => m.id === meter)) return s;
  return { ...s, players: s.players.map((p, j) => (j === i ? { ...p, [meter]: clamp(p[meter] + delta) } : p)) };
}
export const rename = (s, i, name) => ({ ...s, players: s.players.map((p, j) => (j === i ? { ...p, name: String(name).trim().slice(0, 16) || fresh(i).name } : p)) });
export const setFlip = (s, flip) => ({ ...s, flip: !!flip });

/** Change the number of players, keeping the ones already there. */
export function setPlayers(s, n) {
  const k = clampPlayers(n);
  return { ...s, players: Array.from({ length: k }, (_, i) => s.players[i] || fresh(i)) };
}
/** Everyone back to 20 and 20; names and layout stay. */
export const resetLife = (s) => ({ ...s, players: s.players.map((p) => ({ ...p, mf: START, bf: START })) });
export const atZero = (p) => METERS.filter((m) => p[m.id] <= 0).map((m) => m.id);

/** Read whatever was stored; anything broken becomes a fresh game. */
export function normalizeLife(raw) {
  if (!raw || !Array.isArray(raw.players) || !raw.players.length) return newLife(2);
  const base = newLife(raw.players.length);
  return {
    flip: raw.flip !== false,
    players: base.players.map((d, i) => {
      const p = raw.players[i] || {};
      const num = (v) => (Number.isFinite(v) ? clamp(v) : START);
      return { name: typeof p.name === 'string' && p.name.trim() ? p.name.trim().slice(0, 16) : d.name, mf: num(p.mf), bf: num(p.bf) };
    }),
  };
}
