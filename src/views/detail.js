// Card detail drawer (#/card/<id>): full card, add controls, and the synergy lens.
import { byId, titleCase } from '../lib/cards.js';
import { lens, describeWants } from '../lib/synergy.js';
import { copiesOf } from '../lib/deck.js';
import { $, esc, onAct, toast, plural } from '../ui/dom.js';
import { plusIcon, minusIcon, closeIcon } from '../ui/glyphs.js';
import { cardFrame, costBox, glyphRow, sectionBanner } from '../ui/card.js';
import { activeDeck, change, newDeck, pickMainframe, setMainframeExact } from '../store.js';
import { href, go } from '../router.js';

let currentId = null;
const showAll = { works: false, asked: false };
let onClose = () => {};
let closing = false;

const lensRow = ({ card, why }) => `<li><a class="lrow" href="${href.card(card.id)}">${costBox(card)}<span class="ln">${esc(titleCase(card.name))}</span>${glyphRow(card, 13)}<span class="lw">${[...new Set(why.map((w) => w.label))].slice(0, 3).map(esc).join(', ')}</span></a></li>`;

function lensList(title, key, items, empty) {
  const list = showAll[key] ? items : items.slice(0, 8);
  return `<section class="lens-sec"><h3 class="plain">${title} <span class="n">${items.length}</span></h3>
    ${items.length ? `<ul class="lens-list">${list.map(lensRow).join('')}</ul>${items.length > 8 ? `<button class="linkbtn" data-act="lens-more" data-key="${key}">${showAll[key] ? 'Show fewer' : `Show all ${items.length}`}</button>` : ''}` : `<p class="dim">${empty}</p>`}</section>`;
}

function body(c) {
  const d = activeDeck();
  const L = lens(c);
  const w = describeWants(c);
  const wants = [...w.factions, ...w.tags, ...w.subtypes.map((s) => `${s.toLowerCase()}s`), ...w.names.map(titleCase)];
  let controls;
  if (c.type === 'Mainframe') {
    controls = `<div class="dctl"><a class="btn primary" href="${href.mainframe(c.id)}">See what it wants</a>${d ? `<button class="btn" data-act="d-mf" data-id="${c.id}">${d.mainframe === c.id ? 'Your mainframe' : `Use in ${esc(d.name)}`}</button><button class="btn ghost" data-act="d-smf" data-id="${c.id}">${d.sideMainframe === c.id ? 'Sideboard mainframe' : 'Use as sideboard mainframe'}</button>` : ''}</div>`;
  } else if (d) {
    const n = d.main[c.id] || 0, s = d.side[c.id] || 0;
    controls = `<div class="dctl"><div class="dline"><span>Cyberdeck</span><span class="stp" role="group" aria-label="Cyberdeck copies"><button data-act="d-dec" data-id="${c.id}" aria-label="Remove one" ${n ? '' : 'disabled'}>${minusIcon}</button><b>${n}</b><button data-act="d-inc" data-id="${c.id}" aria-label="Add one">${plusIcon}</button></span></div>
      <div class="dline"><span>Sideboard</span><span class="stp" role="group" aria-label="Sideboard copies"><button data-act="d-sdec" data-id="${c.id}" aria-label="Remove one from sideboard" ${s ? '' : 'disabled'}>${minusIcon}</button><b>${s}</b><button data-act="d-sinc" data-id="${c.id}" aria-label="Add one to sideboard">${plusIcon}</button></span></div>
      <p class="dim small">In <a href="${href.deck(d.id)}">${esc(d.name)}</a>. ${c.copyLimit ? `Limit ${c.copyLimit} across cyberdeck and sideboard.` : 'No copy limit.'}</p></div>`;
  } else {
    controls = `<div class="dctl"><button class="btn primary" data-act="d-newdeck" data-id="${c.id}">New deck with this card</button></div>`;
  }
  return `<div class="drawer-in">
    <button class="dlg-x" data-act="close-drawer" aria-label="Close card details">${closeIcon}</button>
    ${cardFrame(c, { mode: 'full' })}
    ${controls}
    ${wants.length ? `<p class="wants"><b>Looks for:</b> ${wants.map(esc).join(', ')}.</p>` : ''}
    ${lensList('Works with', 'works', L.worksWith, 'This card does not mention other cards or factions.')}
    ${lensList('Asked for by', 'asked', L.enabledBy, 'No other card or mainframe names it, its factions or its tags.')}
    <p class="dim small">Links come from names, factions, tags and subtypes in rules text. They show who mentions whom, not whether a combo is good.</p>
  </div>`;
}

export function openCard(id, close) {
  const c = byId.get(id);
  const el = $('#drawer');
  if (!c) { close && close(); return; }
  onClose = close || (() => {});
  const changed = currentId !== id;
  currentId = id;
  el.setAttribute('aria-label', `${titleCase(c.name)} details`);
  el.innerHTML = body(c);
  if (!el.open) el.showModal();
  if (changed) el.scrollTop = 0;
}
export function refreshCard() { if (currentId && $('#drawer').open) { const el = $('#drawer'); const t = el.scrollTop; const c = byId.get(currentId); el.innerHTML = body(c); el.scrollTop = t; } }
export function closeCardQuiet() { const el = $('#drawer'); closing = true; if (el.open) el.close(); closing = false; currentId = null; }

export function bindDrawer() {
  const el = $('#drawer');
  el.addEventListener('close', () => { currentId = null; if (!closing) onClose(); });
  el.addEventListener('click', (e) => { if (e.target === el) el.close(); }); // backdrop
}
onAct('close-drawer', () => $('#drawer').close());
onAct('lens-more', (el) => { showAll[el.dataset.key] = !showAll[el.dataset.key]; refreshCard(); });
const dchange = (zone, delta) => (el) => { const d = activeDeck(); if (!d) return; const r = change(d.id, zone, Number(el.dataset.id), delta); if (r.message) toast(r.message); refreshCard(); const again = $(`#drawer [data-act="${el.dataset.act}"]`); again && !again.disabled && again.focus(); };
onAct('d-inc', dchange('main', 1)); onAct('d-dec', dchange('main', -1));
onAct('d-sinc', dchange('side', 1)); onAct('d-sdec', dchange('side', -1));
onAct('d-mf', (el) => { const d = activeDeck(); if (d) { pickMainframe(d.id, Number(el.dataset.id)); refreshCard(); } });
onAct('d-smf', (el) => { const d = activeDeck(); if (d) { pickMainframe(d.id, Number(el.dataset.id), 'sideMainframe'); refreshCard(); } });
onAct('d-newdeck', (el) => { const d = newDeck('New deck'); change(d.id, 'main', Number(el.dataset.id), 1); closeCardQuiet(); go(href.deck(d.id)); });
export { sectionBanner, plural, setMainframeExact, copiesOf, glyphRow };
