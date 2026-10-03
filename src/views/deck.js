// Deck page (#/deck/<id>): dense list, live stats, preview pane, suggestions. Moxfield-like.
import { byId, titleCase, FACTIONS } from '../lib/cards.js';
import { validate, deckStats, persistentFactionCounts, copiesOf, total } from '../lib/deck.js';
import { parseQuick, searchCards } from '../lib/search.js';
import { suggestForDeck, SECTION_LABEL, SECTIONS } from '../lib/roles.js';
import { LIMITS } from '../lib/config.js';
import { aiPrompt } from '../lib/share.js';
import { $, $$, esc, onAct, toast, plural, keepFocus, copyText } from '../ui/dom.js';
import { glyph, plusIcon, minusIcon, chevrons, markSvg } from '../ui/glyphs.js';
import { cardFrame, costBox, glyphRow, statPlate, fvar, factionsStyle, sectionBanner, typeLine } from '../ui/card.js';
import { meterHtml, mixBar, legalBadge, mfFactionOrder } from '../ui/parts.js';
import { attachCombo } from '../ui/combo.js';
import { effective } from '../tagstore.js';
import { groupByTag, deckTagBoost } from '../lib/tags.js';
import { tagChips } from '../ui/tags.js';
import { getPref, setPref, getDeck, setDeck, activate, change, moveCard, pickMainframe, setMainframeExact, duplicateDeck } from '../store.js';
import { href, go } from '../router.js';
import { reg } from './registry.js';
import { mountSynergy } from './synergy.js';
import { mountPlaytest } from './playtest.js';
import { shareDialog, importDialog, mainframePicker, confirmDelete } from '../ui/dialogs.js';

const view = { group: 'type', sort: 'ram', role: 'all', suggMax: 12 };
let deckId = null;
let previewId = null;

const RAM_KEYS = [0, 1, 2, 3, 4, 5, 6, 7, 8];

function groupsOf(entries) {
  const defs = [];
  if (view.group === 'tag') { /* built below from your tags */ }
  else if (view.group === 'type') for (const t of ['Character', 'Program', 'Gear']) defs.push({ key: t, title: t === 'Gear' ? 'Gear' : `${t}s`, test: (c) => c.type === t });
  else if (view.group === 'ram') {
    for (const r of RAM_KEYS) defs.push({ key: `r${r}`, title: r === 8 ? '8+ RAM' : `${r} RAM`, test: (c) => c.ram != null && Math.min(c.ram, 8) === r });
    defs.push({ key: 'rn', title: 'No RAM cost', test: (c) => c.ram == null });
  } else {
    for (const f of FACTIONS) defs.push({ key: f, title: f, test: (c) => c.factions[0] === f });
    defs.push({ key: 'none', title: 'No faction', test: (c) => !c.factions.length });
  }
  const cmp = view.sort === 'name'
    ? (a, b) => a.c.name.localeCompare(b.c.name)
    : (a, b) => (a.c.ram ?? -1) - (b.c.ram ?? -1) || a.c.name.localeCompare(b.c.name);
  if (view.group === 'tag') return groupByTag(entries, effective()).map((g) => ({ key: g.key, title: g.tag ? g.tag.name : 'Untagged', rows: g.rows.sort(cmp) }));
  return defs.map((g) => ({ ...g, rows: entries.filter((e) => g.test(e.c)).sort(cmp) })).filter((g) => g.rows.length);
}

const entriesOf = (zone) => Object.entries(zone).map(([id, n]) => ({ c: byId.get(Number(id)), n })).filter((e) => e.c);

function rowHtml({ c, n }, zone, deck) {
  const over = c.copyLimit > 0 && copiesOf(deck, c.id) > c.copyLimit;
  const other = zone === 'main' ? 'side' : 'main';
  const atLimit = c.copyLimit > 0 && copiesOf(deck, c.id) >= c.copyLimit;
  return `<li class="row${over ? ' over' : ''}" data-id="${c.id}" style="--a:${c.factions[0] ? fvar(c.factions[0]) : 'var(--trace-hi)'}">
    <span class="stp" role="group" aria-label="Copies of ${esc(titleCase(c.name))}"><button data-act="r-dec" data-id="${c.id}" data-zone="${zone}" aria-label="Remove one ${esc(titleCase(c.name))}">${minusIcon}</button><b>${n}</b><button data-act="r-inc" data-id="${c.id}" data-zone="${zone}" aria-label="Add one ${esc(titleCase(c.name))}" ${atLimit ? 'aria-disabled="true"' : ''}>${plusIcon}</button></span>
    <span class="rcell"><a class="rname" href="${href.card(c.id)}">${costBox(c)}<span class="rn">${esc(titleCase(c.name))}</span></a>${tagChips(c.id)}</span>
    ${glyphRow(c, 14)}
    <span class="rsub">${esc(c.subtype || '')}</span>
    ${statPlate(c) || '<span></span>'}
    ${over ? `<span class="overtag">Limit ${c.copyLimit}</span>` : '<span></span>'}
    <button class="mv" data-act="r-move" data-id="${c.id}" data-zone="${zone}" title="Move one to the ${other === 'side' ? 'sideboard' : 'cyberdeck'}" aria-label="Move one ${esc(titleCase(c.name))} to the ${other === 'side' ? 'sideboard' : 'cyberdeck'}">${zone === 'main' ? 'Side' : 'Main'}</button>
  </li>`;
}

export function mountDeck(root, id, tab = 'cards') {
  const d0 = getDeck(id);
  if (!d0) {
    root.innerHTML = '<div class="page"><div class="empty-block"><h3>Deck not found</h3><p>It may have been deleted, or it lives in another browser. Import a shared list to bring it here.</p><div class="row"><a class="btn primary" href="#/decks">Your decks</a><button class="btn" data-act="open-import">Import a list</button></div></div></div>';
    return { refresh() {}, destroy() {} };
  }
  deckId = id;
  previewId = null;
  let booted = false;
  const tabsNav = `<nav class="dtabs" aria-label="Deck sections">${[['cards', 'Cards'], ['synergy', 'Synergy'], ['playtest', 'Playtest']].map(([t, l]) => `<a href="${href.deck(id, t)}"${t === tab ? ' aria-current="page"' : ''}>${l}</a>`).join('')}</nav>`;
  const cardsTab = `<section id="d-stats" class="strip" aria-label="Deck statistics"></section>
    <div class="addbar">
      <label class="sr" for="add">Add a card by name</label>
      <div class="add-field"><span class="add-ic">${plusIcon}</span><input id="add" type="text" autocomplete="off" spellcheck="false" placeholder="Add a card: a name, or \u201c3 admin\u201d + Enter">
      <ul id="add-list" class="combo" hidden></ul></div>
      <p class="hint">Press <kbd>/</kbd> to jump here. <kbd>Shift</kbd> + <kbd>Enter</kbd> adds to the sideboard. A mainframe name sets the mainframe.</p>
    </div>
    <div class="dgrid">
      <div class="dmain">
        <div class="lbar"><label for="g-group">Group by</label><select id="g-group"><option value="type">Type</option><option value="ram">RAM cost</option><option value="faction">Faction</option><option value="tag">Your tags</option></select>
        <label for="g-sort">Sort by</label><select id="g-sort"><option value="ram">RAM cost</option><option value="name">Name</option></select><span id="g-note" class="g-note"></span></div>
        <div id="d-list"></div>
        <div id="d-side"></div>
        <div id="d-notes"></div>
      </div>
      <aside class="drail" aria-label="Preview and suggestions"><div id="d-preview" class="preview" aria-live="polite"></div><div id="d-sugg" class="sugg-pane"></div></aside>
    </div>`;
  root.innerHTML = `<div class="deck-page tab-${tab}">
    <header id="d-head" class="dhead"></header>
    ${tabsNav}
    ${tab === 'cards' ? cardsTab : '<div id="d-tab"></div>'}</div>`;
  let sub = null;
  if (tab === 'cards') {
    $('#g-group').value = view.group; $('#g-sort').value = view.sort;
    $('#g-group').addEventListener('change', (e) => { view.group = e.target.value; paintList(); });
    $('#g-sort').addEventListener('change', (e) => { view.sort = e.target.value; paintList(); });
  }

  const D = () => getDeck(deckId);

  // ---- add bar ----
  const input = $('#add');
  if (tab === 'cards') attachCombo({
    input, list: $('#add-list'),
    items: (v) => searchCards(parseQuick(v).query, { limit: 8 }),
    render: (c) => { const d = D(); const n = d ? copiesOf(d, c.id) : 0; return `${costBox(c)}<span class="cn">${esc(titleCase(c.name))}</span><span class="ct">${esc(c.type)}${c.subtype ? ' ' + esc(c.subtype) : ''}</span>${glyphRow(c, 13)}<span class="cs">${c.type === 'Mainframe' ? (d.mainframe === c.id ? 'Your mainframe' : 'Mainframe') : n ? `${n} in deck` : ''}</span>`; },
    pick: (c, e) => {
      const d = D();
      const { qty } = parseQuick(input.value);
      const side = !!e.shiftKey;
      if (c.type === 'Mainframe') { setMainframeExact(d.id, c.id, side ? 'sideMainframe' : 'mainframe'); toast(`${titleCase(c.name)} is now your ${side ? 'sideboard ' : ''}mainframe`); }
      else {
        const r = change(d.id, side ? 'side' : 'main', c.id, 1, qty);
        toast(r.message || `Added ${qty > 1 ? qty + ' ' : ''}${titleCase(c.name)}${side ? ' to the sideboard' : ''}`);
      }
      input.value = ''; input.dispatchEvent(new Event('input'));
      input.focus();
    },
  });
  // name and notes edit in place without repainting
  root.addEventListener('input', (e) => {
    if (e.target.id === 'd-name') setDeck({ ...D(), name: e.target.value }, { silent: true });
    if (e.target.id === 'd-notes-in') setDeck({ ...D(), notes: e.target.value }, { silent: true });
  });
  root.addEventListener('change', (e) => { if (e.target.id === 's-tags') { setPref('preferTags', e.target.checked); paintSugg(); } if (e.target.id === 'd-name') setDeck({ ...D(), name: e.target.value.trim() || 'Untitled deck' }); });

  // ---- preview follows hover and focus ----
  const showPreview = (cid) => {
    if (!cid || cid === previewId) return;
    previewId = cid;
    const c = byId.get(cid);
    $('#d-preview').innerHTML = cardFrame(c, { mode: 'full', link: false }) + `<a class="btn small ghost pv-more" href="${href.card(cid)}">Full details and what it works with</a>`;
  };
  const rowId = (t) => { const r = t.closest('[data-id]'); return r && r.closest('#d-list, #d-side, #d-sugg, #add-list') ? Number(r.dataset.id) : 0; };
  root.addEventListener('mouseover', (e) => showPreview(rowId(e.target)));
  root.addEventListener('focusin', (e) => showPreview(rowId(e.target)));
  root.addEventListener('keydown', (e) => {
    const row = e.target.closest && e.target.closest('#d-list .row, #d-side .row');
    if (!row || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    const cid = Number(row.dataset.id);
    const zone = row.closest('#d-side') ? 'side' : 'main';
    if (e.key === '+' || e.key === '=') { e.preventDefault(); const r = change(deckId, zone, cid, 1); if (r.message) toast(r.message); }
    else if (e.key === '-' || e.key === '_') { e.preventDefault(); change(deckId, zone, cid, -1); }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const links = $$('#d-list .rname, #d-side .rname', root);
      const i = links.indexOf(row.querySelector('.rname'));
      const next = links[i + (e.key === 'ArrowDown' ? 1 : -1)];
      if (next) { e.preventDefault(); next.focus(); }
    }
  });

  // ---- painters ----
  function paintHead() {
    const d = D(), v = validate(d), mf = d.mainframe && byId.get(d.mainframe);
    const fs = mf ? mfFactionOrder(mf) : [];
    const mfChip = mf
      ? `<span class="mf-wrap" style="${factionsStyle(fs)}"><button class="mf-chip" data-act="pick-mf" data-deck="${d.id}" data-slot="mainframe" aria-label="Mainframe: ${esc(titleCase(mf.name))}. Change"><span class="mfc-g">${fs.map((f) => `<span style="color:${fvar(f)}">${glyph(f, 16)}</span>`).join('')}</span><span class="mfc-n">${esc(titleCase(mf.name))}</span><span class="mfc-c">Change</span></button><a class="mfc-link" href="${href.mainframe(mf.id)}">What it wants</a></span>`
      : `<button class="btn hazard" data-act="pick-mf" data-deck="${d.id}" data-slot="mainframe">Choose a mainframe</button>`;
    const el = $('#d-head');
    const hadName = document.activeElement && document.activeElement.id === 'd-name';
    el.innerHTML = `<div class="dh-row">
      <div class="dh-name"><label class="sr" for="d-name">Deck name</label><input id="d-name" class="name-input" value="${esc(d.name)}" maxlength="60" autocomplete="off"></div>
      <div class="dh-actions">
        <button class="btn primary" data-act="open-share" data-deck="${d.id}">Share</button>
        <button class="btn" data-act="copy-ai" data-deck="${d.id}">Copy for AI</button>
        <button class="btn" data-act="copy-text" data-deck="${d.id}">Export</button>
        <button class="btn" data-act="open-import">Import</button>
        <details class="menu"><summary class="btn" aria-label="More deck actions">More</summary><div class="menu-pop">
          <button data-act="dup-deck" data-deck="${d.id}">Duplicate deck</button>
          <button data-act="pick-mf" data-deck="${d.id}" data-slot="sideMainframe">Sideboard mainframe</button>
          <button class="danger" data-act="ask-delete" data-deck="${d.id}">Delete deck</button></div></details>
      </div></div>
      <div class="dh-row sub">${mfChip}${legalBadge(d)}<span class="dh-count"><b>${v.mainCount}</b> of ${LIMITS.mainMin} minimum${v.mainCount < LIMITS.mainMin ? '' : ' reached'}${v.sideCount ? `, ${v.sideCount} in sideboard` : ''}</span></div>
      ${v.ok ? '' : `<ul class="issues" aria-label="Why this deck is not legal yet">${v.issues.map((i) => `<li>${esc(i.text)}</li>`).join('')}</ul>`}`;
    if (hadName) $('#d-name').focus();
  }

  function paintStats() {
    const d = D(), mf = d.mainframe && byId.get(d.mainframe);
    const counts = persistentFactionCounts(d), st = deckStats(d);
    const maxC = Math.max(1, ...RAM_KEYS.map((k) => st.curve[k] || 0));
    const mainCount = total(d.main);
    const withF = entriesOf(d.main).reduce((s, e) => s + (e.c.factions.length ? e.n : 0), 0);
    const legend = FACTIONS.filter((f) => st.factions[f]).sort((a, b) => st.factions[b] - st.factions[a]);
    const types = ['Character', 'Program', 'Gear'].filter((t) => st.byType[t]).map((t) => `${st.byType[t]} ${t === 'Gear' ? 'gear' : t.toLowerCase() + (st.byType[t] === 1 ? '' : 's')}`);
    $('#d-stats').innerHTML = `
      <div class="cell meter-cell"><h2 class="plain">Mainframe tiers</h2>
        ${mf ? meterHtml(mf, counts, { boot: !booted }) : `<div class="empty-mini"><p>Choose a mainframe to see which effects your cards unlock.</p><button class="btn small" data-act="pick-mf" data-deck="${d.id}" data-slot="mainframe">Choose a mainframe</button></div>`}
        ${mf ? '<p class="note">Counts persistent cards in the cyberdeck. In play you will have fewer, so aim above each tier.</p>' : ''}</div>
      <div class="cell"><h2 class="plain">RAM curve${st.avgRam ? ` <span class="avg">average ${st.avgRam.toFixed(1)}</span>` : ''}</h2>
        <div class="curve" role="img" aria-label="RAM curve: ${RAM_KEYS.map((k) => `${st.curve[k] || 0} at ${k === 8 ? '8 or more' : k}`).join(', ')}">${RAM_KEYS.map((k) => `<div class="cv"><span class="cv-n">${st.curve[k] || ''}</span><i style="height:${((st.curve[k] || 0) / maxC) * 100}%"></i><span class="cv-l">${k === 8 ? '8+' : k}</span></div>`).join('')}</div></div>
      <div class="cell"><h2 class="plain">Factions</h2>${mixBar(st.factions, Math.max(0, mainCount - withF))}
        <ul class="legend">${legend.map((f) => `<li style="color:${fvar(f)}">${glyph(f, 14)}<span>${esc(f)}</span><b>${st.factions[f]}</b></li>`).join('') || '<li class="dim">No faction cards yet.</li>'}</ul>
        ${types.length ? `<p class="note">${types.join(', ')}</p>` : ''}</div>`;
    booted = true;
  }

  function paintList() {
    const d = D();
    const entries = entriesOf(d.main);
    $('#g-note').textContent = view.group !== 'tag' ? '' : effective().tags.length ? 'A card with several tags shows under each.' : 'No tags yet. Open any card and add one under \u201cYour tags\u201d.';
    $('#d-list').innerHTML = entries.length
      ? groupsOf(entries).map((g) => `<section class="grp"><h3 class="grp-h"><span>${esc(g.title)}</span><b>${g.rows.reduce((s, r) => s + r.n, 0)}</b></h3><ul class="rows">${g.rows.map((r) => rowHtml(r, 'main', d)).join('')}</ul></section>`).join('')
      : `<div class="empty-block"><h3>This deck has no cards yet</h3><p>Type a card name in the box above, or add from the suggestions on the right.${d.mainframe ? '' : ' Choose a mainframe first and the suggestions will fit it.'}</p></div>`;
    const side = entriesOf(d.side);
    const smf = d.sideMainframe && byId.get(d.sideMainframe);
    const sideSorted = side.sort((a, b) => (a.c.ram ?? -1) - (b.c.ram ?? -1) || a.c.name.localeCompare(b.c.name));
    $('#d-side').innerHTML = `<section class="grp side">${sectionBanner('Sideboard', { count: `${total(d.side)} of ${LIMITS.sideMax}` })}
      ${smf ? `<p class="side-mf">Mainframe: <b>${esc(titleCase(smf.name))}</b> <button class="linkbtn" data-act="pick-mf" data-deck="${d.id}" data-slot="sideMainframe">Change</button></p>` : ''}
      ${sideSorted.length ? `<ul class="rows">${sideSorted.map((r) => rowHtml(r, 'side', d)).join('')}</ul>` : '<p class="dim pad">Nothing here. Use “Side” on a row to move a card, or Shift + Enter in the add box.</p>'}</section>`;
    $('#d-notes').innerHTML = `<section class="grp">${sectionBanner('Notes')}<label class="sr" for="d-notes-in">Deck notes</label><textarea id="d-notes-in" rows="4" placeholder="Game plan, matchups, what to swap in. Notes travel with share links.">${esc(d.notes || '')}</textarea></section>`;
  }

  function paintSugg() {
    const d = D();
    const mf = d.mainframe && byId.get(d.mainframe);
    const eff = effective();
    const preferTags = eff.tags.length > 0 && getPref('preferTags', false);
    let all = suggestForDeck(d, 80, preferTags ? { tagBoost: deckTagBoost(d, eff) } : {});
    const roles = [...new Set(all.map((s) => s.section))];
    if (view.role !== 'all' && !roles.includes(view.role)) view.role = 'all';
    const list = (view.role === 'all' ? all : all.filter((s) => s.section === view.role));
    const shown = list.slice(0, view.suggMax);
    $('#d-sugg').innerHTML = `<div class="sugg-head"><h2 class="sec-banner"><span>Suggested for this deck</span>${chevrons}</h2></div>
      <p class="note">From what your cards and mainframe say about each other. Not play statistics.</p>
      ${eff.tags.length ? `<label class="sugg-tags"><input type="checkbox" id="s-tags"${preferTags ? ' checked' : ''}> Prefer cards that share a tag with this deck</label>` : ''}
      ${all.length ? `<div class="sugg-filter"><label class="sr" for="s-role">Filter suggestions by role</label><select id="s-role"><option value="all">All roles</option>${SECTIONS.filter((s) => roles.includes(s.id)).map((s) => `<option value="${s.id}"${view.role === s.id ? ' selected' : ''}>${esc(s.title)}</option>`).join('')}</select></div>` : ''}
      ${shown.length ? `<ul class="sg-list">${shown.map((s) => `<li class="sg" data-id="${s.card.id}">
        <a class="sg-name" href="${href.card(s.card.id)}">${costBox(s.card)}<span class="rn">${esc(titleCase(s.card.name))}</span>${glyphRow(s.card, 13)}</a>
        <button class="add" data-act="sg-add" data-id="${s.card.id}" aria-label="Add ${esc(titleCase(s.card.name))}">${plusIcon}</button>
        <p class="sg-why"><span class="sg-role">${esc(SECTION_LABEL[s.section] || '')}.</span> ${esc(s.why.join(' '))}</p></li>`).join('')}</ul>
        ${list.length > shown.length ? `<button class="btn small more" data-act="sg-more">Show ${Math.min(12, list.length - shown.length)} more</button>` : ''}
        ${mf ? `<p class="note"><a href="${href.mainframe(mf.id)}">See everything ${esc(titleCase(mf.name))} wants</a></p>` : ''}`
        : `<div class="empty-mini"><p>${mf || total(d.main) ? 'Nothing else stands out for these cards.' : 'Choose a mainframe or add a few cards and suggestions show up here.'}</p></div>`}`;
    const sel = $('#s-role');
    if (sel) sel.addEventListener('change', (e) => { view.role = e.target.value; view.suggMax = 12; paintSugg(); });
  }

  function paintAll() {
    paintHead();
    if (tab !== 'cards') { if (!sub) { sub = (tab === 'synergy' ? mountSynergy : mountPlaytest)($('#d-tab'), deckId); } else sub.refresh(); return; }
    paintStats(); paintList(); paintSugg();
    if (!previewId) {
      const d = D();
      const mf = d.mainframe && byId.get(d.mainframe);
      $('#d-preview').innerHTML = mf
        ? cardFrame(mf, { mode: 'full', link: false }) + '<p class="note pad">Hover or focus a card in the list to preview it here.</p>'
        : '<div class="empty-mini"><p>Hover or focus a card in the list to preview it here.</p></div>';
    }
  }
  paintAll();
  return { refresh: () => { if (!getDeck(deckId)) { go(href.decks()); return; } keepFocus(paintAll); }, destroy() { sub && sub.destroy(); deckId = null; } };
}

onAct('r-inc', (el) => { const r = change(deckId, el.dataset.zone, Number(el.dataset.id), 1); if (r.message) toast(r.message); });
onAct('r-dec', (el) => { change(deckId, el.dataset.zone, Number(el.dataset.id), -1); });
onAct('r-move', (el) => { const z = el.dataset.zone; const r = moveCard(deckId, z, z === 'main' ? 'side' : 'main', Number(el.dataset.id)); if (r.message) toast(r.message); });
onAct('sg-add', (el) => { const c = byId.get(Number(el.dataset.id)); const r = change(deckId, 'main', c.id, 1); toast(r.message || `Added ${titleCase(c.name)}`); });
onAct('sg-more', () => { view.suggMax += 12; reg.view && reg.view.refresh(); });
onAct('pick-mf', (el) => mainframePicker(el.dataset.deck, el.dataset.slot));
onAct('open-share', (el) => shareDialog(el.dataset.deck));
onAct('dup-deck', (el) => { const d = duplicateDeck(el.dataset.deck); if (d) { go(href.deck(d.id)); toast('Duplicated'); } });
onAct('ask-delete', (el) => confirmDelete(el.dataset.deck));
export { pickMainframe, activate, plural, markSvg, typeLine, aiPrompt, copyText, importDialog };
