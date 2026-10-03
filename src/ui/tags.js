// Your tags as chips and toggles.
import { esc } from './dom.js';
import { tagsOf } from '../lib/tags.js';
import { effective } from '../tagstore.js';

const stripe = (t) => `--t:${t.color || 'var(--dim)'}`;
export const tagChip = (t) => `<span class="utag" style="${stripe(t)}">${esc(t.name)}</span>`;

/** Up to `max` chips for one card, then "+n". Empty string when it has none. */
export function tagChips(cardId, max = 3) {
  const list = tagsOf(effective(), cardId);
  if (!list.length) return '';
  const more = list.length - max;
  return `<span class="utags">${list.slice(0, max).map(tagChip).join('')}${more > 0 ? `<span class="utag more" title="${esc(list.slice(max).map((t) => t.name).join(', '))}">+${more}</span>` : ''}</span>`;
}

/** A pressable chip. `act` is the data-act name; data-id and data-val carry the card and tag ids (so keepFocus can find it again). */
export const tagToggle = (t, { act, id = '', on = false, extra = '' }) =>
  `<button class="utag btn-tag" style="${stripe(t)}" aria-pressed="${on}" data-act="${act}" data-id="${id}" data-val="${esc(t.id)}"${extra}>${esc(t.name)}</button>`;
