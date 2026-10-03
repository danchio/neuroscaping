// Fuzzy name search and the "3 admin" quick-add syntax. Pure logic.
import { cards, norm } from './cards.js';

const words = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** "3 admin" -> { qty: 3, query: 'admin' }. Also accepts "3x admin". Default qty is 1. */
export function parseQuick(input) {
  const m = input.trim().match(/^(\d{1,3})\s*x?\s+(.+)$/i);
  if (m) return { qty: Math.max(1, Number(m[1])), query: m[2].trim() };
  return { qty: 1, query: input.trim() };
}

function nameScore(name, q) {
  const n = words(name);
  if (!q) return 0;
  if (n === q) return 100;
  if (n.startsWith(q)) return 80;
  const nw = n.split(' ');
  const qw = q.split(' ');
  if (qw.every((t) => nw.some((w) => w.startsWith(t)))) return 60;
  if (n.includes(q)) return 40;
  // subsequence: letters in order
  const qn = q.replace(/ /g, '');
  const nn = n.replace(/ /g, '');
  let i = 0, gaps = 0, last = -1;
  for (let j = 0; j < nn.length && i < qn.length; j++) {
    if (nn[j] === qn[i]) { if (last >= 0 && j - last > 1) gaps++; last = j; i++; }
  }
  if (i === qn.length && qn.length >= 4) return Math.max(5, 25 - gaps * 4);
  return 0;
}

/** Ranked cards for a query. `types` filters by card type (default: everything). */
export function searchCards(query, { limit = 8, types } = {}) {
  const q = words(query);
  if (!q) return [];
  const out = [];
  for (const c of cards) {
    if (types && !types.includes(c.type)) continue;
    const s = nameScore(c.name, q);
    if (s > 0) out.push({ card: c, score: s });
  }
  return out.sort((a, b) => b.score - a.score || (a.card.ram ?? 99) - (b.card.ram ?? 99) || a.card.name.localeCompare(b.card.name)).slice(0, limit).map((x) => x.card);
}
export { norm };
