// Deck Lab: boot, routing and the top bar. Views live in src/views, parts in src/ui.
import { byId, titleCase } from './lib/cards.js';
import { decodeShare } from './lib/share.js';
import { searchCards } from './lib/search.js';
import { total } from './lib/deck.js';
import { $, $$, esc, toast } from './ui/dom.js';
import { markSvg } from './ui/glyphs.js';
import { costBox } from './ui/card.js';
import { attachCombo } from './ui/combo.js';
import './ui/dialogs.js';
import './ui/cardimg.js';
import { loadTags, loadRepoTags } from './tagstore.js';
import { load, subscribe, state, activate, addDeck, activeDeck } from './store.js';
import { parse, go, href } from './router.js';
import { reg } from './views/registry.js';
import { mountHome, mountMainframes } from './views/home.js';
import { mountMainframe } from './views/mainframe.js';
import { mountDeck } from './views/deck.js';
import { mountCards, bindActions } from './views/cards.js';
import { openCard, refreshCard, closeCardQuiet, bindDrawer } from './views/detail.js';

bindActions(() => reg.view);
bindDrawer();
$('#brand-mark').innerHTML = markSvg;
load();
loadTags();
loadRepoTags();

// ---- top bar ----
function renderBar(r) {
  const section = { decks: 'decks', deck: 'decks', mainframes: 'mainframes', mainframe: 'mainframes', cards: 'cards', card: 'cards' }[(r || parse()).name === 'card' ? lastKind : (r || parse()).name];
  $$('.nav a').forEach((a) => (a.dataset.nav === section ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
  const d = activeDeck();
  const chip = $('#bar-deck');
  if (d) { chip.hidden = false; chip.href = href.deck(d.id); chip.innerHTML = `<span class="dc-l">Working on</span><b>${esc(d.name)}</b><span class="dc-n">${total(d.main)}</span>`; }
  else chip.hidden = true;
}

attachCombo({
  input: $('#gq'), list: $('#g-list'),
  items: (v) => searchCards(v, { limit: 7 }),
  render: (c) => `${costBox(c)}<span class="cn">${esc(titleCase(c.name))}</span><span class="ct">${esc(c.type)}${c.subtype ? ' ' + esc(c.subtype) : ''}</span>`,
  pick: (c) => { $('#gq').value = ''; $('#g-list').hidden = true; $('#gq').blur(); go(c.type === 'Mainframe' ? href.mainframe(c.id) : href.card(c.id)); },
});

// ---- routing ----
let lastMain = '#/decks';
let lastKind = 'cards';
let mountedKey = '';

function mountRoute(r) {
  reg.view && reg.view.destroy();
  reg.view = null;
  const root = $('#view');
  root.className = `view-${r.name}`;
  switch (r.name) {
    case 'deck': activate(r.id); reg.view = mountDeck(root, r.id, r.tab); break;
    case 'mainframe': reg.view = mountMainframe(root, r.id); break;
    case 'mainframes': reg.view = mountMainframes(root); break;
    case 'cards': reg.view = mountCards(root); break;
    default: reg.view = mountHome(root);
  }
}

function route() {
  const hash = location.hash;
  const share = hash.match(/^#d=([A-Za-z0-9_-]+)$/);
  if (share) {
    try { const nd = decodeShare(share[1]); addDeck(nd); history.replaceState(null, '', `${location.pathname}#/deck/${nd.id}`); toast(`Opened “${nd.name}” as a new deck`); }
    catch { history.replaceState(null, '', `${location.pathname}#/decks`); toast('That share link could not be read'); }
    route(); return;
  }
  const r = parse(hash);
  if (r.name === 'card') {
    if (!reg.view) { mountedKey = '#/cards'; mountRoute({ name: 'cards' }); lastMain = '#/cards'; lastKind = 'cards'; }
    renderBar(r);
    openCard(r.id, () => { if (parse().name === 'card') go(lastMain); });
    return;
  }
  closeCardQuiet();
  const key = (hash || '#/decks').split('?')[0]; // a view's own filters live in the query and must not remount it
  lastMain = hash || '#/decks'; lastKind = r.name;
  if (key !== mountedKey) { mountedKey = key; mountRoute(r); window.scrollTo(0, 0); }
  else if (reg.view && reg.view.onHash) reg.view.onHash();
  renderBar(r);
  document.title = pageTitle(r);
}
function pageTitle(r) {
  const base = 'Neuroscape Deck Lab';
  if (r.name === 'deck') { const d = state.decks.find((x) => x.id === r.id); return d ? `${d.name} | ${base}` : base; }
  if (r.name === 'mainframe') { const m = byId.get(r.id); return m ? `${titleCase(m.name)} | ${base}` : base; }
  return { mainframes: `Mainframes | ${base}`, cards: `Cards | ${base}` }[r.name] || base;
}

subscribe(() => { reg.view && reg.view.refresh(); refreshCard(); renderBar(); });
addEventListener('hashchange', () => { route(); });

// ---- global keys and menus ----
document.addEventListener('keydown', (e) => {
  if (e.key === '/' && !e.metaKey && !e.ctrlKey && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) && !document.querySelector('dialog[open]')) {
    e.preventDefault(); ($('#add') || $('#cq') || $('#gq')).focus();
  }
});
document.addEventListener('click', (e) => {
  $$('details.menu[open]').forEach((m) => { if (!m.contains(e.target) || e.target.closest('.menu-pop button')) m.open = false; });
  const dlg = $('#dlg');
  if (e.target === dlg) dlg.close();
});

route();
