// Compact filter fields and their popovers: multi-select lists (checkbox options) and a from/to range.
// The popover is appended to <body> and positioned with position:fixed, so the scrolling filter rail never clips it.
// Only one is open at a time. The host (the card browser) owns the filter state and answers four calls:
//   host.spec(key) -> { type: 'multi'|'range', label, ... }   host.toggle(key, value)   host.clear(key)   host.range(key, {min, max})
import { esc } from './dom.js';

const caret = '<svg class="ff-caret" viewBox="0 0 12 12" width="10" height="10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="square" aria-hidden="true"><path d="M2 4.5l4 4 4-4"/></svg>';
const tick = '<svg viewBox="0 0 12 12" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="square" aria-hidden="true"><path d="M2 6.5l2.6 2.6L10 3.2"/></svg>';

let host = null;
let openKey = null;
let pop = null;
let opener = null;

export const setHost = (h) => { host = h; };
export const isOpen = () => !!pop;

/** The closed field: label on the left, summary on the right, a small badge when something is on. */
export function fieldHtml({ key, label, summary, count = 0, type = 'multi' }) {
  const expanded = openKey === key;
  return `<button type="button" class="ffield${count ? ' on' : ''}" data-act="ff" data-key="${esc(key)}" aria-haspopup="${type === 'range' ? 'dialog' : 'listbox'}" aria-expanded="${expanded}" aria-label="${esc(label)}: ${esc(summary)}${count ? `, ${count} selected` : ''}">
    <span class="ff-l">${esc(label)}</span><span class="ff-v">${esc(summary)}</span>${count ? `<span class="ff-n" aria-hidden="true">${count}</span>` : ''}${caret}</button>`;
}

const triggerFor = (key) => document.querySelector(`.ffield[data-key="${CSS.escape(key)}"]`);

// ---- building the popover ----
function optionHtml(o, i) {
  const off = o.disabled && !o.on;
  const mark = o.color ? `style="--c:${o.color}"` : '';
  return `<li role="option" id="fpo-${i}" class="fopt${o.on ? ' on' : ''}${off ? ' off' : ''}${o.stripe ? ' stripe' : ''}" aria-selected="${!!o.on}"${off ? ' aria-disabled="true"' : ''} tabindex="-1" data-v="${esc(o.value)}" ${mark}>
    <span class="fbox" aria-hidden="true">${tick}</span>${o.glyph || ''}<span class="fo-l">${esc(o.label)}</span>${o.count != null ? `<span class="fo-n" aria-label="${o.count} cards">${o.count}</span>` : ''}</li>`;
}

function head(spec, anyOn) {
  return `<div class="fpop-h"><span class="fpop-t">${esc(spec.label)}</span>${spec.manage ? `<button type="button" class="linkbtn" data-act="open-mydata" data-fp="manage">Manage</button>` : ''}<button type="button" class="linkbtn" data-fp="clear"${anyOn ? '' : ' disabled'}>Clear</button></div>`;
}

function rangeOptions(values, current, { blank, disabledIf }) {
  return `<option value=""${current == null ? ' selected' : ''}>${blank}</option>` + values.map((v) => `<option value="${v}"${current === v ? ' selected' : ''}${disabledIf(v) ? ' disabled' : ''}>${v >= 8 ? '8+' : v}</option>`).join('');
}

function body(spec) {
  if (spec.type === 'range') {
    const { min, max } = spec;
    const mins = [0, 1, 2, 3, 4, 5, 6, 7, 8], maxs = [0, 1, 2, 3, 4, 5, 6, 7];
    return `${head(spec, min != null || max != null)}
      <div class="rng">
        <label class="rng-f"><span>Min</span><select data-fp="min" aria-label="${esc(spec.label)} minimum">${rangeOptions(mins, min, { blank: 'No min', disabledIf: (v) => max != null && v > max })}</select></label>
        <span class="rng-to" aria-hidden="true">to</span>
        <label class="rng-f"><span>Max</span><select data-fp="max" aria-label="${esc(spec.label)} maximum">${rangeOptions(maxs, max, { blank: 'No max', disabledIf: (v) => min != null && v < min })}</select></label>
      </div>
      <p class="fpop-note">${esc(spec.note || '')}</p>`;
  }
  const anyOn = spec.options.some((o) => o.on);
  return `${head(spec, anyOn)}<ul class="fpop-list" role="listbox" aria-multiselectable="true" aria-label="${esc(spec.label)}">${spec.options.map(optionHtml).join('')}</ul>`;
}

function place() {
  if (!pop) return;
  const t = triggerFor(openKey);
  if (!t) { closePop(); return; }
  const r = t.getBoundingClientRect();
  const vw = document.documentElement.clientWidth, vh = window.innerHeight;
  if (r.bottom < 0 || r.top > vh) { closePop(); return; }
  const wide = pop.dataset.type === 'range' ? 264 : 232;
  // In the side rail the list opens to the right of its field, so the fields below stay visible and clickable.
  const fly = !!t.closest('.rail') && vw > 1040;
  if (fly) {
    const w = wide;
    pop.style.width = w + 'px';
    pop.style.left = Math.min(r.right + 6, vw - w - 8) + 'px';
    const room = vh - 16;
    pop.style.maxHeight = Math.min(380, room) + 'px';
    pop.style.bottom = 'auto';
    pop.style.top = Math.max(8, Math.min(r.top, vh - Math.min(pop.offsetHeight || 0, room) - 8)) + 'px';
    return;
  }
  const w = Math.min(Math.max(r.width, wide), vw - 16);
  const left = Math.max(8, Math.min(r.left, vw - w - 8));
  const below = vh - r.bottom - 8, above = r.top - 8;
  const flip = below < 200 && above > below;
  pop.style.width = w + 'px';
  pop.style.left = left + 'px';
  if (flip) { pop.style.top = 'auto'; pop.style.bottom = (vh - r.top + 4) + 'px'; pop.style.maxHeight = Math.min(380, above) + 'px'; }
  else { pop.style.bottom = 'auto'; pop.style.top = (r.bottom + 4) + 'px'; pop.style.maxHeight = Math.min(380, below) + 'px'; }
}

const options = () => (pop ? [...pop.querySelectorAll('.fopt')] : []);
const focusOpt = (i) => { const o = options(); if (!o.length) return; const el = o[Math.max(0, Math.min(o.length - 1, i))]; el.focus({ preventScroll: true }); el.scrollIntoView({ block: 'nearest' }); };

export function openPop(key) {
  if (!host) return;
  if (pop) closePop({ silent: true });
  const spec = host.spec(key);
  if (!spec) return;
  openKey = key;
  opener = triggerFor(key);
  pop = document.createElement('div');
  pop.className = `fpop ${spec.type}`;
  pop.id = 'fpop';
  pop.dataset.type = spec.type;
  pop.setAttribute('role', spec.type === 'range' ? 'dialog' : 'group');
  pop.setAttribute('aria-label', `${spec.label} filter`);
  pop.innerHTML = body(spec);
  document.body.appendChild(pop);
  if (opener) { opener.setAttribute('aria-expanded', 'true'); opener.setAttribute('aria-controls', 'fpop'); }
  place();
  if (spec.type === 'range') pop.querySelector('select').focus({ preventScroll: true });
  else { const on = options().findIndex((o) => o.classList.contains('on')); focusOpt(on < 0 ? 0 : on); }
}

/** Close. `focus` puts keyboard focus back on the field (Esc, Tab); a click elsewhere leaves focus where it went. */
export function closePop({ focus = false, silent = false } = {}) {
  if (!pop) return;
  const key = openKey;
  pop.remove(); pop = null; openKey = null;
  const t = triggerFor(key);
  if (t) { t.setAttribute('aria-expanded', 'false'); t.removeAttribute('aria-controls'); if (focus) t.focus({ preventScroll: true }); }
  opener = null;
  if (!silent) document.dispatchEvent(new CustomEvent('fpop-close'));
}

/** After the host repaints (new counts, a rebuilt rail): update the open popover in place and re-attach to its field. */
export function syncPop() {
  if (!pop || !host) return;
  const spec = host.spec(openKey);
  const t = triggerFor(openKey);
  if (!spec || !t) { closePop(); return; }
  t.setAttribute('aria-expanded', 'true'); t.setAttribute('aria-controls', 'fpop'); opener = t;
  const a = document.activeElement;
  const inPop = a && pop.contains(a);
  const val = inPop && a.dataset ? (a.dataset.v ?? null) : null;
  const sel = inPop && a.tagName === 'SELECT' ? a.dataset.fp : null;
  const clearFocused = inPop && a.dataset && a.dataset.fp === 'clear';
  pop.innerHTML = body(spec);
  if (val != null) { const el = options().find((o) => o.dataset.v === val); if (el) el.focus({ preventScroll: true }); }
  else if (sel) pop.querySelector(`select[data-fp="${sel}"]`)?.focus({ preventScroll: true });
  else if (clearFocused) { const c = pop.querySelector('[data-fp="clear"]'); (c && !c.disabled ? c : pop.querySelector('.fopt, select'))?.focus({ preventScroll: true }); }
  place();
}

export function toggleField(key) { openKey === key ? closePop({ focus: true }) : openPop(key); }

// ---- events (bound once) ----
export function bindFilterPops() {
  document.addEventListener('pointerdown', (e) => {
    if (!pop) return;
    if (pop.contains(e.target) || e.target.closest('.ffield')) return;
    closePop();
  }, true);

  document.addEventListener('click', (e) => {
    if (!pop || !host) return;
    const opt = e.target.closest('#fpop .fopt');
    if (opt) { if (!opt.classList.contains('off')) host.toggle(openKey, opt.dataset.v); return; }
    const fp = e.target.closest('#fpop [data-fp]');
    if (!fp) return;
    if (fp.dataset.fp === 'clear' && !fp.disabled) host.clear(openKey);
    else if (fp.dataset.fp === 'manage') closePop();
  });

  document.addEventListener('change', (e) => {
    const s = e.target.closest && e.target.closest('#fpop select[data-fp]');
    if (!s || !host) return;
    const read = (n) => { const v = pop.querySelector(`select[data-fp="${n}"]`).value; return v === '' ? null : Number(v); };
    let min = read('min'), max = read('max');
    // keep min <= max: the field you did not touch follows the one you did
    if (min != null && max != null && min > max) { if (s.dataset.fp === 'min') max = min; else min = max; }
    host.range(openKey, { min, max });
  });

  document.addEventListener('keydown', (e) => {
    const t = e.target;
    // field: arrows open
    if (t.classList && t.classList.contains('ffield') && (e.key === 'ArrowDown' || e.key === 'ArrowUp') && !e.altKey) {
      e.preventDefault(); if (openKey !== t.dataset.key) openPop(t.dataset.key); return;
    }
    if (!pop || !pop.contains(t)) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closePop({ focus: true }); return; }
    if (e.key === 'Tab') { closePop({ focus: true }); return; } // focus returns to the field, and Tab carries on from there
    const opt = t.closest && t.closest('.fopt');
    if (!opt) return;
    const list = options(); const i = list.indexOf(opt);
    if (e.key === 'ArrowDown') { e.preventDefault(); focusOpt(i + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); focusOpt(i - 1); }
    else if (e.key === 'Home') { e.preventDefault(); focusOpt(0); }
    else if (e.key === 'End') { e.preventDefault(); focusOpt(list.length - 1); }
    else if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); if (!opt.classList.contains('off')) host.toggle(openKey, opt.dataset.v); }
    else if (e.key.length === 1 && /\S/.test(e.key)) { // type to jump
      const k = e.key.toLowerCase();
      const next = [...list.slice(i + 1), ...list.slice(0, i + 1)].find((o) => o.querySelector('.fo-l').textContent.toLowerCase().startsWith(k));
      if (next) focusOpt(list.indexOf(next));
    }
  }, true);

  const reflow = () => { if (pop) requestAnimationFrame(place); };
  addEventListener('resize', reflow);
  document.addEventListener('scroll', (e) => { if (pop && !pop.contains(e.target)) reflow(); }, true);
}
