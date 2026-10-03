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
import { blankFilters, encodeFilters, decodeFilters, hasQuery } from '../lib/filters.js';
import { tagToggle } from '../ui/tags.js';
import { effective } from '../tagstore.js';
import { hasAnyTag, usage } from '../lib/tags.js';
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

const plainCache = new Map();
const plain = (c) => {
  if (!plainCache.has(c.id)) plainCache.set(c.id, `${c.name} ${c.type} ${c.subtype} ${c.factions.join(' ')} ${c.tags.join(' ')} ${c.keywords.join(' ')} ${(c.mainframe ? [c.mainframe.lead, ...c.mainframe.tiers.map((t) => t.text)] : c.text).join(' ')} ${(c.abilities || []).map((a) => a.name).join(' ')}`.replace(/[\[\]]/g, '').toLowerCase());
  return plainCache.get(c.id);
};

function matches(c, deck) {
  if (F.types.size && !F.types.has(c.type)) return false;
  if (F.factions.size && !c.factions.some((x) => F.factions.has(x))) return false;
  if (F.subtypes.size && !F.subtypes.has(c.subtype)) return false;
  if (F.tags.size && !c.tags.some((x) => F.tags.has(x))) return false;
  if (F.mytags.size && !hasAnyTag(effective(), c.id, F.mytags)) return false;
  if (F.rarity.size && !F.rarity.has(c.rarity)) return false;
  if (F.ram.size && (c.ram == null || !F.ram.has(Math.min(c.ram, 8)))) return false;
  if (F.iconic && !c.iconic) return false;
  if (F.hasAbility && !c.abilities) return false;
  if (F.inDeck && !(deck && (copiesOf(deck, c.id) || deck.mainframe === c.id || deck.sideMainframe === c.id))) return false;
  if (F.q) { const hay = plain(c); if (!F.q.toLowerCase().split(/\s+/).filter(Boolean).every((w) => hay.includes(w))) return false; }
  return true;
}

const group = (title, key, values, { fac = false, label = (v) => v } = {}) =>
  `<fieldset class="fgroup"><legend>${title}</legend><div class="chips">${values.map((v) => {
    const on = F[key].has(v);
    return `<button class="chip${fac ? ' fac' : ''}" aria-pressed="${on}" data-act="chip" data-key="${key}" data-val="${esc(v)}" ${fac ? `style="--c:${fvar(v)}"` : ''}>${fac ? glyph(v, 13) : ''}${esc(label(v))}</button>`;
  }).join('')}</div></fieldset>`;

function myTagGroup() {
  const eff = effective();
  const use = usage(eff);
  if (!eff.tags.length) return `<fieldset class="fgroup"><legend>Your tags</legend><p class="dim small">Tag cards from their details to filter by them here.</p><button class="linkbtn small" data-act="open-mydata">Make tags</button></fieldset>`;
  return `<fieldset class="fgroup"><legend>Your tags <button class="linkbtn small lg-link" data-act="open-mydata">Manage</button></legend><div class="chips">${eff.tags.map((t) => tagToggle(t, { act: 'chip', on: F.mytags.has(t.id), extra: ` data-key="mytags" title="${use.get(t.id) || 0} cards"` })).join('')}</div></fieldset>`;
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
    <aside class="rail" aria-label="Filters"><div class="rail-in" id="c-rail"></div></aside>
    <section class="cards-main" aria-label="Cards">
      <div class="page-head tight"><h1>Cards</h1><p>Genesis set. Open any card to see what it works with.</p></div>
      <div class="cbar">
        <div class="search"><label class="sr" for="cq">Search card names and rules text</label><input id="cq" type="search" placeholder="Search names and rules text" autocomplete="off" value="${esc(F.q)}"></div>
 <div class="seg-ctl" role="group" aria-label="How to show cards"><button data-act="c-view" data-val="images" aria-pressed="${cview === 'images'}">Images</button><button data-act="c-view" data-val="list" aria-pressed="${cview === 'list'}">List</button></div>
        <button class="btn rail-toggle" data-act="rail-toggle" aria-expanded="false" aria-controls="c-rail">Filters</button>
        <span class="sortwrap"><label class="sortlab" for="csort">Sort</label>
        <select id="csort"><option value="id">Set order</option><option value="name">Name</option><option value="ram">RAM cost</option><option value="fit">Best fit for your deck</option></select></span>
        <p id="c-count" class="count" role="status"></p>
      </div>
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
    const active = F.q || F.types.size || F.factions.size || F.subtypes.size || F.tags.size || F.mytags.size || F.rarity.size || F.ram.size || F.iconic || F.hasAbility || F.inDeck;
    $('#c-rail').innerHTML = (effective().tags.length ? myTagGroup() : '') + group('Type', 'types', ['Character', 'Program', 'Gear', 'Mainframe']) + group('Faction', 'factions', FACTIONS, { fac: true })
      + group('RAM cost', 'ram', [0, 1, 2, 3, 4, 5, 6, 7, 8], { label: (v) => (v === 8 ? '8+' : String(v)) }) + group('Subtype', 'subtypes', SUBTYPES) + group('Tag', 'tags', TAGS) + (effective().tags.length ? '' : myTagGroup()) + group('Rarity', 'rarity', RARITIES)
      + `<div class="toggles"><label><input type="checkbox" data-act="c-toggle" data-key="iconic" ${F.iconic ? 'checked' : ''}> Iconic only</label>
         <label><input type="checkbox" data-act="c-toggle" data-key="hasAbility" ${F.hasAbility ? 'checked' : ''}> Has a RAM-cost ability</label>
         <label><input type="checkbox" data-act="c-toggle" data-key="inDeck" ${F.inDeck ? 'checked' : ''}> Only cards in your deck</label></div>`
      + (active ? '<button class="btn small" data-act="c-reset">Clear all filters</button>' : '');
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
    destroy() {},
  };
}

export function bindActions(getView) {
  onAct('chip', (el) => {
    const key = el.dataset.key; const raw = el.dataset.val; const val = key === 'ram' ? Number(raw) : raw;
    F[key].has(val) ? F[key].delete(val) : F[key].add(val);
    keepFocus(() => getView()?.repaintAll());
  });
  document.addEventListener('change', (e) => { if (e.target.dataset?.act === 'c-toggle') { F[e.target.dataset.key] = e.target.checked; keepFocus(() => getView()?.repaintAll()); } });
  onAct('c-reset', () => { F = blank(); const i = $('#cq'); if (i) i.value = ''; getView()?.repaintAll(); });
  onAct('c-view', (el) => { setPref('cardsView', el.dataset.val); getView()?.repaintAll(); });
  onAct('rail-toggle', (el) => { railOpen = !railOpen; el.setAttribute('aria-expanded', String(railOpen)); $('.cards-page').classList.toggle('rail-open', railOpen); });
  onAct('b-inc', (el) => { const d = activeDeck(); if (!d) return; const r = change(d.id, 'main', Number(el.dataset.id), 1); if (r.message) toast(r.message); });
  onAct('b-dec', (el) => { const d = activeDeck(); if (d) change(d.id, 'main', Number(el.dataset.id), -1); });
}
