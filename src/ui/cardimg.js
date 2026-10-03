// Card images: the real card art, hotlinked, with a fixed 5:7 box so layout never jumps.
// Chain: publisher bucket -> fan CDN -> built-in "text card" (the notched frame with the rules text), so the app works with no images at all.
import { byId, titleCase } from '../lib/cards.js';
import { cardImageUrl, cardAlt, cardAltShort, firstSource, nextSource, markPrimaryFailed } from '../lib/cardimg.js';
import { cardFrame, edgeStyle, glyphRow } from './card.js';
import { esc, onAct, $ } from './dom.js';
import { closeIcon } from './glyphs.js';

export { cardImageUrl, cardAlt };

/**
 * Markup for one card image. Size is a hint for the fallback and the CSS: 'tile' | 'full' | 'lightbox' | 'art' (top slice of the card, used on home).
 * Returns a string so it drops into the template literals the views use; `cardImage` below returns an element.
 */
export function cardImageHtml(c, { size = 'tile', eager = false, cls = '', alt = 'full' } = {}) {
  const start = firstSource();
  const src = cardImageUrl(c, start);
  const text = alt === 'full' ? cardAlt(c) : alt === 'short' ? cardAltShort(c) : alt;
  const img = src
    ? `<img class="ci-img" src="${esc(src)}" alt="${esc(text)}" width="535" height="750" decoding="async" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} draggable="false" data-src="${start}" data-cid="${c.id}">`
    : '';
  // A card with no image address goes straight to the text card on first paint.
  return `<span class="ci ${size}${cls ? ' ' + cls : ''}" style="${edgeStyle(c)}" data-cid="${c.id}" data-state="${src ? 'loading' : 'text'}">${img}${src ? '' : textCard(c, size)}</span>`;
}

export function cardImage(c, opts) {
  const t = document.createElement('template');
  t.innerHTML = cardImageHtml(c, opts).trim();
  return t.content.firstElementChild;
}

/** The last resort. Reuses the notched card frame so a card is never just a hole. */
function textCard(c, size) {
  if (size === 'art') return `<span class="ci-fb art-fb" aria-hidden="true">${glyphRow(c, 34)}</span>`;
  return `<span class="ci-fb">${cardFrame(c, { mode: 'tile', cls: 'ci-frame', link: false })}</span>`;
}

function toText(wrap) {
  const c = byId.get(Number(wrap.dataset.cid));
  if (!c || wrap.dataset.state === 'text') return;
  const img = wrap.querySelector('img');
  if (img) img.remove();
  wrap.insertAdjacentHTML('beforeend', textCard(c, [...wrap.classList].find((k) => ['tile', 'full', 'lightbox', 'art'].includes(k)) || 'tile'));
  wrap.dataset.state = 'text';
}

const isCi = (el) => el instanceof HTMLImageElement && el.classList.contains('ci-img');

// error and load do not bubble, so listen in the capture phase once and handle every image, including ones added later.
document.addEventListener('error', (e) => {
  const img = e.target;
  if (!isCi(img)) return;
  const i = Number(img.dataset.src);
  if (i === 0) {
    markPrimaryFailed(); // from now on this session starts at the fallback
    // Lazy images that were already written with the primary address but have not been fetched yet should not try it either.
    document.querySelectorAll('img.ci-img[data-src="0"]').forEach((o) => {
      if (o !== img && !(o.complete && o.naturalWidth > 0)) { o.dataset.src = '1'; o.src = cardImageUrl(Number(o.dataset.cid), 1); }
    });
  }
  const n = nextSource(i);
  if (n === 'text') { toText(img.closest('.ci')); return; }
  img.dataset.src = String(n);
  img.src = cardImageUrl(Number(img.dataset.cid), n);
}, true);
document.addEventListener('load', (e) => {
  const img = e.target;
  if (isCi(img)) { const w = img.closest('.ci'); if (w) w.dataset.state = 'ready'; }
}, true);

// ---- lightbox: the card as large as the window allows ----
export function openLightbox(id) {
  const c = byId.get(Number(id));
  const box = $('#lightbox');
  if (!c || !box) return;
  box.innerHTML = `<button class="lb-x" data-act="close-lightbox" aria-label="Close enlarged card">${closeIcon}</button>${cardImageHtml(c, { size: 'lightbox', eager: true })}<p class="lb-cap">${esc(titleCase(c.name))}</p>`;
  box.setAttribute('aria-label', `${titleCase(c.name)}, enlarged`);
  if (!box.open) box.showModal();
}
onAct('zoom', (el) => openLightbox(el.dataset.id));
onAct('close-lightbox', () => $('#lightbox').close());
document.addEventListener('click', (e) => { const box = $('#lightbox'); if (box && box.open && (e.target === box || e.target.closest('#lightbox .ci, #lightbox .lb-cap'))) box.close(); });

/**
 * Run a repaint of `root` but keep the image elements that are still wanted (same card, same size), so a stepper click or a filter
 * change never makes a picture blink or reload. The old node is moved into the new markup.
 */
export function keepImages(root, repaint) {
  const keyOf = (el) => `${el.dataset.cid}|${[...el.classList].find((k) => ['tile', 'full', 'lightbox', 'art'].includes(k))}`;
  const old = new Map();
  root.querySelectorAll('.ci').forEach((el) => { const k = keyOf(el); if (!old.has(k)) old.set(k, el); });
  repaint();
  root.querySelectorAll('.ci').forEach((el) => {
    const k = keyOf(el), o = old.get(k);
    if (o && o !== el) { old.delete(k); el.replaceWith(o); }
  });
}
