// Card browser (#/cards): filters on the left, card images on the right (or a compact list).
import { cards, byId, FACTIONS, TAGS, SUBTYPES, RARITIES } from '../lib/cards.js';
import { copiesOf } from '../lib/deck.js';
import { suggestForDeck } from '../lib/roles.js';
import { $, $$, esc, onAct, toast, keepFocus } from '../ui/dom.js';
import { glyph } from '../ui/glyphs.js';
import { fvar, costBox, glyphRow, statPlate, edgeStyle } from '../ui/card.js';
import { stepper, imageTile } from '../ui/tiles.js';
import { keepImages } from '../ui/cardimg.js';
import { rulesPlain } from '../lib/cardimg.js';
import { activeDeck, change, getPref, setPref } from '../store.js';
import { href, parse, split } from '../router.js';
import { blankFilters, encodeFilters, decodeFilters, hasQuery, matchesFilters, facetCounts, multiSummary, toggleIn, rangeSummary, hasRange, normalizeRange, activeChips, hasAnyFilter, activeGroupCount, SET_KEYS, TYPES } from '../lib/filters.js';
import { fieldHtml, setHost, bindFilterPops, closePop, syncPop, isOpen, toggleField } from '../ui/filterpop.js';
import { closeIcon } from '../ui/glyphs.js';
import { effective } from '../tagstore.js';
import { tagsOf, usage } from '../lib/tags.js';
import { titleCase } from '../lib/cards.js';

const blank = blankFilters;
let F = blank();
let sort = 'id';
let railOpen = false;

export function presetFilter({ factions = [], types = [] } = {}) {
  F = blank();
  factions.forEach((f) => F.factions.add(f));
  types.forEach((t) => F.types.add(t));
}

const ctxFor = (deck) => ({
  cardTags: (id) => tagsOf(effective(), id).map((t) => t.id),
  inDeck: (c) => !!(deck && (copiesOf(deck, c.id) || deck.mainframe === c.id || deck.sideMainframe === c.id)),
});
const matches = (c, deck) => matchesFilters(c, F, ctxFor(deck));

// ---- the filter fields ----
const MULTI = [
  { key: 'types', label: 'Type', values: () => TYPES },
  { key: 'factions', label: 'Faction', values: () => FACTIONS, fac: true },
  { key: 'ram', label: 'RAM cost', range: true },
  { key: 'subtypes', label: 'Subtype', values: () => SUBTYPES },
  { key: 'tags', label: 'Tag', values: () => TAGS },
  { key: 'rarity', label: 'Rarity', values: () => RARITIES },
  { key: 'mytags', label: 'Your tags', mine: true },
];
const labelOf = (key, v) => (key === 'mytags' ? (effective().tags.find((t) => t.id === v) || { name: v }).name : v);

/** What a popover shows right now (counts follow every other active filter). */
function specFor(key) {
  const deck = activeDeck(); const ctx = ctxFor(deck);
  if (key === 'ram') {
    return { type: 'range', label: 'RAM cost', min: F.ram.min, max: F.ram.max, note: 'Mainframes have no RAM cost, so a range hides them.' };
  }
  const def = MULTI.find((d) => d.key === key);
  if (!def) return null;
  const counts = facetCounts(cards, F, ctx, key);
  if (def.mine) {
    return { type: 'multi', label: def.label, manage: true, options: effective().tags.map((t) => ({ value: t.id, label: t.name, color: t.color || 'var(--dim)', stripe: true, on: F.mytags.has(t.id), count: counts.get(t.id) || 0, disabled: !(counts.get(t.id) > 0) })) };
  }
  return { type: 'multi', label: def.label, options: def.values().map((v) => ({ value: v, label: v, on: F[key].has(v), count: counts.get(v) || 0, disabled: !(counts.get(v) > 0), color: def.fac ? fvar(v) : null, glyph: def.fac ? `<span class="fo-g" style="color:${fvar(v)}">${glyph(v, 14)}</span>` : '' })) };
}

function fieldFor(def) {
  if (def.range) return fieldHtml({ key: 'ram', label: def.label, summary: rangeSummary(F.ram), count: hasRange(F.ram) ? 1 : 0, type: 'range' });
  const order = def.mine ? effective().tags.map((t) => t.id) : def.values();
  const sel = F[def.key];
  const summary = multiSummary(sel, order);
  return fieldHtml({ key: def.key, label: def.label, summary: def.mine && sel.size ? multiSummary(new Set([...sel].map((id) => labelOf('mytags', id))), order.map((id) => labelOf('mytags', id))) : summary, count: sel.size });
}

function chipsHtml() {
  const list = activeChips(F, labelOf);
  if (!list.length) return '';
  const names = { types: 'Type', factions: 'Faction', subtypes: 'Subtype', tags: 'Tag', rarity: 'Rarity', mytags: 'Tag' };
  return list.map((c) => {
    const k = c.kind === 'set' ? names[c.key] : '';
    const fac = c.key === 'factions' ? `<span style="color:${fvar(c.value)}">${glyph(c.value, 12)}</span>` : '';
    const mine = c.key === 'mytags' ? (effective().tags.find((t) => t.id === c.value) || {}).color : '';
    return `<button type="button" class="achip" data-act="chip-x" data-key="${c.key}" data-val="${esc(c.value ?? '')}" ${mine ? `style="--t:${mine}"` : ''} aria-label="Remove filter ${esc(k ? k + ' ' : '')}${esc(c.label)}">${fac}${k ? `<span class="ac-k">${k}</span>` : ''}<span>${esc(c.label)}</span>${closeIcon}</button>`;
  }).join('') + '<button type="button" class="linkbtn small" data-act="c-reset">Clear all</button>';
}

const stepFor = (c, deck) => stepper(c, copiesOf(deck, c.id), { inc: 'b-inc', dec: 'b-dec', label: `Copies in ${deck.name} of` });

/** The control bar under (touch) or over (hover) an image tile. */
function tileBar(c, deck) {
  if (c.type === 'Mainframe') return `<a class="btn small" href="${href.mainframe(c.id)}">Mainframe page</a>`;
  return deck ? stepFor(c, deck) : '';
}

function imageGrid(list, deck) {
  return `<div class="grid igrid">${list.map((c) => imageTile(c, { n: c.type === 'Mainframe' ? 0 : deck ? copiesOf(deck, c.id) : 0, bar: tileBar(c, deck) })).join('')}</div>`;
}

function listRows(list, deck) {
  return `<ul class="crows">${list.map((c) => {
    const act = c.type === 'Mainframe' ? `<a class="btn small" href="${href.mainframe(c.id)}">Mainframe page</a>` : deck ? stepFor(c, deck) : '<span></span>';
    return `<li class="crow" data-id="${c.id}" style="${edgeStyle(c)}">${act}
      <a class="rname" href="${href.card(c.id)}">${costBox(c)}<span class="rn">${esc(titleCase(c.name))}</span></a>
      ${glyphRow(c, 14)}<span class="rsub">${esc(c.type)}${c.subtype ? ' ' + esc(c.subtype) : ''}</span>${statPlate(c) || '<span></span>'}
      <span class="crow-txt">${esc(rulesPlain(c).join(' '))}</span></li>`;
  }).join('')}</ul>`;
}

export function mountCards(root) {
  // A link with filters in it wins over whatever this browser last had.
  const incoming = split().query;
  if (hasQuery(incoming)) { const r = decodeFilters(incoming, RARITIES); F = r.F; sort = r.sort; }
  let written = '';
  /** Keep the address bar in step with the filters (no history entry per click), so the link can be shared. */
  function writeHash() {
    if (parse().name !== 'cards') return;
    written = encodeFilters(F, sort);
    const h = href.cards(written);
    if (location.hash !== h) history.replaceState(null, '', location.pathname + location.search + h);
  }
  const cview = getPref('cardsView', 'images') === 'list' ? 'list' : 'images';
  root.innerHTML = `<div class="cards-page">
    <div class="rail-back" data-act="rail-close" aria-hidden="true"></div>
    <aside class="rail" id="c-sheet" aria-label="Filters">
      <div class="rail-head"><h2>Filters</h2><button type="button" class="rail-x" data-act="rail-close" aria-label="Close filters">${closeIcon}</button></div>
      <div class="rail-in" id="c-rail"></div>
      <div class="rail-foot"><button type="button" class="btn primary" data-act="rail-close" id="c-show">Show cards</button></div>
    </aside>
    <section class="cards-main" aria-label="Cards">
      <div class="page-head tight"><h1>Cards</h1><p>Genesis set. Open any card to see what it works with.</p></div>
      <div class="cbar">
        <div class="search"><label class="sr" for="cq">Search card names and rules text</label><input id="cq" type="search" placeholder="Search names and rules text" autocomplete="off" value="${esc(F.q)}"></div>
 <div class="seg-ctl" role="group" aria-label="How to show cards"><button data-act="c-view" data-val="images" aria-pressed="${cview === 'images'}">Images</button><button data-act="c-view" data-val="list" aria-pressed="${cview === 'list'}">List</button></div>
        <button type="button" class="btn rail-toggle" id="c-fbtn" data-act="rail-toggle" aria-expanded="false" aria-controls="c-sheet" aria-haspopup="dialog">Filters<span class="ff-n" id="c-fbadge" hidden></span></button>
        <span class="sortwrap"><label class="sortlab" for="csort">Sort</label>
        <select id="csort"><option value="id">Set order</option><option value="name">Name</option><option value="ram">RAM cost</option><option value="fit">Best fit for your deck</option></select></span>
        <p id="c-count" class="count" role="status"></p>
      </div>
      <div id="c-active" class="achips" role="group" aria-label="Active filters" hidden></div>
      <p id="c-deck" class="deckline"></p>
      <div id="c-grid"></div>
    </section></div>`;
  $('#csort').value = sort;
  const input = $('#cq');
  input.addEventListener('input', () => { F.q = input.value.trim(); paintGrid(); paintRail(); });
  $('#csort').addEventListener('change', (e) => { sort = e.target.value; paintGrid(); });

  let gridKey = '';
  function patchTiles(deck) {
    $$('#c-grid .itile').forEach((t) => {
      const c = byId.get(Number(t.dataset.id));
      const n = c.type !== 'Mainframe' && deck ? copiesOf(deck, c.id) : 0;
      const old = t.querySelector('.qb'); if (old) old.remove();
      if (n) t.querySelector('.itile-open').insertAdjacentHTML('afterend', `<span class="qb" title="${n} in the deck"><span class="sr">${n} in deck: </span>&times;${n}</span>`);
      const bar = t.querySelector('.itile-bar'); if (bar) bar.innerHTML = tileBar(c, deck);
    });
  }
  function paintRail() {
    for (const id of [...F.mytags]) if (!effective().tags.some((t) => t.id === id)) F.mytags.delete(id);
    const mineOn = effective().tags.length > 0;
    const defs = MULTI.filter((d) => d.key !== 'mytags' || mineOn);
    $('#c-rail').innerHTML = `<div class="ffields">${defs.map(fieldFor).join('')}</div>
      ${mineOn ? '' : `<p class="ff-hint">Your own tags: <button type="button" class="linkbtn" data-act="open-mydata">make some</button> from any card's details to filter by them.</p>`}
      <div class="toggles"><label><input type="checkbox" data-act="c-toggle" data-key="iconic" ${F.iconic ? 'checked' : ''}> Iconic only</label>
         <label><input type="checkbox" data-act="c-toggle" data-key="hasAbility" ${F.hasAbility ? 'checked' : ''}> Has a RAM-cost ability</label>
         <label><input type="checkbox" data-act="c-toggle" data-key="inDeck" ${F.inDeck ? 'checked' : ''}> Only cards in your deck</label></div>
      ${hasAnyFilter(F) ? '<button type="button" class="linkbtn small" data-act="c-reset">Clear all filters</button>' : ''}`;
    const n = activeGroupCount(F);
    const badge = $('#c-fbadge'); badge.hidden = !n; badge.textContent = n;
    $('#c-fbtn').setAttribute('aria-label', n ? `Filters, ${n} active` : 'Filters');
    const act = $('#c-active'); const html = chipsHtml(); act.innerHTML = html; act.hidden = !html;
    syncPop();
  }
  function paintGrid() { keepImages($('#c-grid'), paintGridNow); }
  function paintGridNow() {
    const deck = activeDeck();
    let list = cards.filter((c) => matches(c, deck));
    if (sort === 'name') list.sort((a, b) => a.name.localeCompare(b.name));
    else if (sort === 'ram') list.sort((a, b) => (a.ram ?? 99) - (b.ram ?? 99) || a.name.localeCompare(b.name));
    else if (sort === 'fit') { const fit = new Map(suggestForDeck(deck || { main: {}, side: {} }, 999).map((s, i) => [s.card.id, i])); list.sort((a, b) => (fit.get(a.id) ?? 9999) - (fit.get(b.id) ?? 9999) || a.id - b.id); }
    writeHash();
    $('#c-count').textContent = `${list.length} ${list.length === 1 ? 'card' : 'cards'}`;
    $('#c-show').textContent = `Show ${list.length} ${list.length === 1 ? 'card' : 'cards'}`;
    $('#c-deck').innerHTML = deck ? `Adding to <a href="${href.deck(deck.id)}">${esc(deck.name)}</a>` : 'You have no deck yet. <button class="linkbtn" data-act="new-deck">Start one</button> to add cards from here.';
    const mode = getPref('cardsView', 'images') === 'list' ? 'list' : 'images';
    $$('[data-act="c-view"]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.val === mode)));
    const key = `${mode}|${deck ? deck.id : ""}|${list.map((c) => c.id).join(',')}`;
    if (mode === 'images' && key === gridKey) { patchTiles(deck); return; } // same cards: update counts in place, so no image is rebuilt
    gridKey = key;
    $('#c-grid').innerHTML = list.length
      ? (mode === 'list' ? listRows(list, deck) : imageGrid(list, deck))
      : '<div class="empty-block"><h3>No cards match</h3><p>Remove a filter or change the search words.</p><button class="btn" data-act="c-reset">Clear all filters</button></div>';
  }
  paintRail(); paintGrid();
  return {
    refresh: () => keepFocus(() => { paintRail(); paintGrid(); }),
    repaintAll: () => { paintRail(); paintGrid(); },
    /** The hash changed under us (pasted link, back button). */
    onHash() {
      const q = split().query;
      if (!hasQuery(q)) { writeHash(); return; }
      const r = decodeFilters(q, RARITIES);
      if (encodeFilters(r.F, r.sort) === written) return;
      F = r.F; sort = r.sort;
      $('#cq').value = F.q; $('#csort').value = sort;
      paintRail(); paintGrid();
    },
    destroy() { closePop({ silent: true }); closeSheet(); setHost(null); },
  };
}

const FLAGS = ['iconic', 'hasAbility', 'inDeck'];
let repaint = () => {};
function closeSheet() { railOpen = false; document.body.classList.remove('sheet-open'); const pg = $('.cards-page'); if (pg) pg.classList.remove('rail-open'); const b = $('#c-fbtn'); if (b) b.setAttribute('aria-expanded', 'false'); }

export function bindActions(getView) {
  repaint = () => getView()?.repaintAll();
  bindFilterPops();
  setHost({
    spec: specFor,
    toggle: (key, v) => { toggleIn(F[key], v); repaint(); },
    clear: (key) => { if (key === 'ram') F.ram = { min: null, max: null }; else F[key].clear(); repaint(); },
    range: (key, r) => { F.ram = normalizeRange(r); repaint(); },
  });
  onAct('ff', (el) => toggleField(el.dataset.key));
  onAct('chip-x', (el) => {
    const { key, val } = el.dataset;
    if (SET_KEYS.includes(key)) F[key].delete(val); else if (key === 'ram') F.ram = { min: null, max: null }; else if (FLAGS.includes(key)) F[key] = false;
    // chips are removed from the row, so keep focus in the row (or on the grid when it empties)
    const chips = $$('#c-active .achip'); const i = chips.indexOf(el);
    repaint();
    const left = $$('#c-active .achip');
    (left[Math.min(i, left.length - 1)] || $('#cq'))?.focus({ preventScroll: true });
  });
  document.addEventListener('change', (e) => { if (e.target.dataset?.act === 'c-toggle') { F[e.target.dataset.key] = e.target.checked; keepFocus(() => repaint()); } });
  onAct('c-reset', () => { F = blank(); const i = $('#cq'); if (i) i.value = ''; closePop({ silent: true }); repaint(); });
  onAct('c-view', (el) => { setPref('cardsView', el.dataset.val); repaint(); });
  onAct('rail-toggle', (el) => {
    railOpen = !railOpen; el.setAttribute('aria-expanded', String(railOpen));
    $('.cards-page').classList.toggle('rail-open', railOpen); document.body.classList.toggle('sheet-open', railOpen);
    if (railOpen) setTimeout(() => $('#c-rail .ffield')?.focus({ preventScroll: true }), 30);
  });
  onAct('rail-close', () => { const was = railOpen; closePop({ silent: true }); closeSheet(); if (was) $('#c-fbtn')?.focus({ preventScroll: true }); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && railOpen && !isOpen()) { e.preventDefault(); const f = $('#c-fbtn'); closeSheet(); f?.focus(); } });
  onAct('b-inc', (el) => { const d = activeDeck(); if (!d) return; const r = change(d.id, 'main', Number(el.dataset.id), 1); if (r.message) toast(r.message); });
  onAct('b-dec', (el) => { const d = activeDeck(); if (d) change(d.id, 'main', Number(el.dataset.id), -1); });
}
