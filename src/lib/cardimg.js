// Card image sources and alt text. Pure (no DOM), so it is covered by `npm test`.
// Images are hotlinked, never stored in the repo. They belong to Neuroscape, LLC.
import { costPhrase } from './abilities.js';

/** Tried in order. The first is the publisher's own bucket; the second is a fan CDN with the same files. */
export const IMAGE_SOURCES = [
  { id: 'primary', url: (id) => `https://storage.googleapis.com/spicerack_media/cards/neuroscape/GEN-${id}.webp` },
  { id: 'fallback', url: (id) => `https://static.playset.pro/neuroscape/cards/en/GEN-${id}.webp` },
];
export const SOURCE_IDS = IMAGE_SOURCES.map((s) => s.id);

/** Card (or bare numeric id) to the image address for one source ('primary' | 'fallback' | index). '' when there is no such card image. */
export function cardImageUrl(card, source = 'primary') {
  const id = typeof card === 'object' && card ? card.id : card;
  // Ids 1..254 and 256 map straight to GEN-<id>. 255 is Basic RAM, which is not in the dataset and has no usable image here.
  if (!Number.isInteger(id) || id < 1 || id > 256 || id === 255) return '';
  const s = typeof source === 'number' ? IMAGE_SOURCES[source] : IMAGE_SOURCES.find((x) => x.id === source);
  return s ? s.url(id) : '';
}

const plainText = (s) => String(s).replace(/[\[\]]/g, '').replace(/\s+/g, ' ').trim();
const sentence = (s) => (/[.!?)]$/.test(s) ? s : s + '.');

/** Rules text as plain sentences, brackets removed. Mainframes read lead-in then each tier. */
export function rulesPlain(c) {
  if (c.mainframe) {
    const out = [];
    if (c.mainframe.lead) out.push(plainText(c.mainframe.lead));
    for (const t of c.mainframe.tiers) out.push(`At ${Object.entries(t.needs).map(([f, n]) => `${n} ${f}`).join(' and ')} synergy: ${plainText(t.text)}`);
    return out;
  }
  return (c.text || []).map(plainText);
}

/** Alt text: name, type, factions, cost, then the full rules text, so the image never hides the words from a screen reader. */
export function cardAlt(c) {
  const kind = [c.type, c.subtype].filter(Boolean).join(' ');
  const head = [
    `${c.name}.`,
    `${kind}${c.factions.length ? `, ${c.factions.join(' and ')}` : ''}.`,
    c.ram != null ? `RAM cost ${c.ram}.` : '',
  ].filter(Boolean).join(' ');
  const abilities = (c.abilities || []).map((a) => `${a.name}: ${costPhrase(a)}.`);
  const rules = rulesPlain(c).map(sentence);
  return [head, ...rules, ...abilities].join(' ');
}

/** Short alt for places where the text sits right beside the image anyway. */
export const cardAltShort = (c) => `${c.name}, ${[c.type, c.subtype].filter(Boolean).join(' ')}`;

// ---- per-session "the publisher's bucket failed" flag ----
const FLAG = 'neuroscape-deck-lab:img-primary-failed';
let primaryFailed = false;
try { primaryFailed = sessionStorage.getItem(FLAG) === '1'; } catch { /* storage blocked: memory only */ }
export const primaryHasFailed = () => primaryFailed;
export function markPrimaryFailed() {
  primaryFailed = true;
  try { sessionStorage.setItem(FLAG, '1'); } catch { /* ignore */ }
}
/** Test hook. */
export function resetPrimaryFailed() {
  primaryFailed = false;
  try { sessionStorage.removeItem(FLAG); } catch { /* ignore */ }
}

/** Index of the source to try first: straight to the fallback once the primary has failed this session. */
export const firstSource = () => (primaryFailed ? 1 : 0);
/** Next step after source `i` failed: another source index, or 'text' when nothing is left. */
export const nextSource = (i) => (i + 1 < IMAGE_SOURCES.length ? i + 1 : 'text');
