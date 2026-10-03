import { cards, byId, byName, norm, mainframes, FACTIONS, TAGS, SUBTYPES, RARITIES, titleCase } from './lib/cards.js';
import { emptyDeck, changeCount, setMainframe, validate, deckStats, persistentFactionCounts, copiesOf, total } from './lib/deck.js';
import { lens, describeWants, tierStatus, rankMainframes, suggest } from './lib/synergy.js';
import { exportText, parseText, encodeShare, decodeShare, aiPrompt } from './lib/share.js';
import { LIMITS } from './lib/config.js';

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fcol = (f) => `var(--f-${f.toLowerCase()})`;
const bandStyle = (c) => `--a:${c.factions[0] ? fcol(c.factions[0]) : 'var(--muted)'};--b:${c.factions[1] ? fcol(c.factions[1]) : c.factions[0] ? fcol(c.factions[0]) : 'var(--muted)'}`;
const DARK_TEXT = new Set(['Corpo', 'Nanobot']);
const STORE = 'neuroscape-deck-lab:v1';

// ---------------- state ----------------
const blankFilters = () => ({ q: '', types: new Set(), factions: new Set(), subtypes: new Set(), tags: new Set(), rarity: new Set(), ram: new Set(), iconic: false, inDeck: false, hasAbility: false });
const state = {
  decks: [], activeId: null, sel: null, side: 'deck', view: 'browse',
  f: blankFilters(), sort: 'id', showAll: { works: false, enabled: false },
};

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE) || 'null');
    if (raw && Array.isArray(raw.decks) && raw.decks.length) { state.decks = raw.decks; state.activeId = raw.activeId; }
  } catch { /* storage unavailable: start fresh */ }
  if (!state.decks.length) { const d = emptyDeck('My first deck'); state.decks = [d]; state.activeId = d.id; }
  if (!state.decks.some((d) => d.id === state.activeId)) state.activeId = state.decks[0].id;
}
function save() {
  try { localStorage.setItem(STORE, JSON.stringify({ decks: state.decks, activeId: state.activeId })); } catch { /* ignore */ }
}
const deck = () => state.decks.find((d) => d.id === state.activeId);
function setDeck(next) { state.decks = state.decks.map((d) => (d.id === next.id ? next : d)); save(); }

// ---------------- text helpers ----------------
function refHtml(x) {
  const t = x.trim();
  if (t === 'Mainframe') return '<em class="ref mfd">Mainframe</em>';
  if (t === 'Bioframe') return '<em class="ref bfd">Bioframe</em>';
  if (FACTIONS.includes(t)) return `<em class="ref" style="--c:${fcol(t)}">${esc(t)}</em>`;
  if (TAGS.includes(t)) return `<em class="ref">${esc(t)}</em>`;
  const c = byName.get(norm(t));
  if (c) return `<em class="ref card" data-act="select" data-id="${c.id}">${esc(t)}</em>`;
  return esc(`[${x}]`);
}
function rich(raw) {
  let out = '', last = 0;
  for (const m of raw.matchAll(/\[([^\[\]]+)\]/g)) {
    out += esc(raw.slice(last, m.index)) + refHtml(m[1]);
    last = m.index + m[0].length;
  }
  return out + esc(raw.slice(last));
}
const MODE = { base: '', instead: 'Instead', adds: 'Also', or: 'Or' };
const needText = (needs) => Object.entries(needs).map(([f, n]) => `${n} ${f}`).join(' + ');

function tileText(c) {
  if (c.mainframe) {
    const lead = c.mainframe.lead ? rich(c.mainframe.lead) + ' ' : '';
    return lead + c.mainframe.tiers.map((t) => `<b>${esc(needText(t.needs))}:</b> ${rich(t.text)}`).join(' ');
  }
  return c.text.map(rich).join(' ');
}

const costLabel = (a) => [a.ram != null ? `${a.ram} RAM` : '', a.run ? 'Run' : ''].filter(Boolean).join(' + ') || 'Free';
const abilityChips = (c) => (c.abilities || []).map((a) => `<span class="ab" title="${esc(a.name)}: costs ${esc(costLabel(a))}"><b>${a.ram != null ? a.ram : ''}${a.run ? '<i class="runi" aria-hidden="true">↱</i>' : ''}</b>${esc(titleCase(a.name))}</span>`).join('');

const statBadge = (c) => (c.type === 'Character' ? `<span class="stat ${c.frame === 'Bioframe' ? 'bf' : c.frame === 'Mainframe' ? 'mf' : 'none'}" title="${esc(c.frame || 'No frame')} attack">${c.atk}/${c.def}</span>` : '');

// ---------------- filters ----------------
function matches(c) {
  const f = state.f;
  if (f.types.size && !f.types.has(c.type)) return false;
  if (f.factions.size && !c.factions.some((x) => f.factions.has(x))) return false;
  if (f.subtypes.size && !f.subtypes.has(c.subtype)) return false;
  if (f.tags.size && !c.tags.some((x) => f.tags.has(x))) return false;
  if (f.rarity.size && !f.rarity.has(c.rarity)) return false;
  if (f.ram.size) {
    if (c.ram == null) return false;
    if (!f.ram.has(Math.min(c.ram, 8))) return false;
  }
  if (f.iconic && !c.iconic) return false;
  if (f.hasAbility && !c.abilities) return false;
  if (f.inDeck && !(copiesOf(deck(), c.id) || deck().mainframe === c.id || deck().sideMainframe === c.id)) return false;
  if (f.q) {
    const hay = `${c.name} ${c.type} ${c.subtype} ${c.factions.join(' ')} ${c.tags.join(' ')} ${c.keywords.join(' ')} ${tileTextPlain(c)} ${(c.abilities || []).map((a) => a.name).join(' ')}`.toLowerCase();
    if (!f.q.toLowerCase().split(/\s+/).filter(Boolean).every((w) => hay.includes(w))) return false;
  }
  return true;
}
const plainCache = new Map();
function tileTextPlain(c) {
  if (!plainCache.has(c.id)) plainCache.set(c.id, (c.mainframe ? [c.mainframe.lead, ...c.mainframe.tiers.map((t) => t.text)] : c.text).join(' ').replace(/[\[\]]/g, ''));
  return plainCache.get(c.id);
}

function chipGroup(title, key, values, { fac = false, label = (v) => v } = {}) {
  const set = state.f[key];
  return `<div class="fgroup"><h4>${title}</h4><div class="chips">${values
    .map((v) => {
      const on = set.has(v);
      const cls = fac ? `chip fac${DARK_TEXT.has(v) ? ' dark-text' : ''}` : 'chip';
      return `<button class="${cls}" aria-pressed="${on}" data-act="chip" data-key="${key}" data-val="${esc(v)}" ${fac ? `style="--c:${fcol(v)}"` : ''}>${fac ? '<i></i>' : ''}${esc(label(v))}</button>`;
    })
    .join('')}</div></div>`;
}

function renderFilters() {
  const f = state.f;
  const active = f.q || f.types.size || f.factions.size || f.subtypes.size || f.tags.size || f.rarity.size || f.ram.size || f.iconic || f.inDeck || f.hasAbility;
  $('#filter-chips').innerHTML =
    chipGroup('Type', 'types', ['Character', 'Program', 'Gear', 'Mainframe']) +
    chipGroup('Faction', 'factions', FACTIONS, { fac: true }) +
    chipGroup('RAM cost', 'ram', [0, 1, 2, 3, 4, 5, 6, 7, 8], { label: (v) => (v === 8 ? '8+' : String(v)) }) +
    chipGroup('Subtype', 'subtypes', SUBTYPES) +
    chipGroup('Tag', 'tags', TAGS) +
    chipGroup('Rarity', 'rarity', RARITIES) +
    `<div class="fgroup toggles">
      <label><input type="checkbox" data-act="toggle" data-key="iconic" ${f.iconic ? 'checked' : ''}> Iconic only</label>
      <label><input type="checkbox" data-act="toggle" data-key="hasAbility" ${f.hasAbility ? 'checked' : ''}> Has a RAM-cost ability</label>
      <label><input type="checkbox" data-act="toggle" data-key="inDeck" ${f.inDeck ? 'checked' : ''}> Only cards in this deck</label>
    </div>` + (active ? '<button class="reset" data-act="reset">Clear all filters</button>' : '');
}

// ---------------- card grid ----------------
function fitScores() {
  const d = deck();
  if (!total(d.main) && !d.mainframe) return new Map();
  return new Map(suggest(d, Infinity).map((s) => [s.card.id, s]));
}

function tileHtml(c, fit) {
  const d = deck();
  const n = copiesOf(d, c.id);
  const isMf = c.type === 'Mainframe';
  const inMain = d.mainframe === c.id, inSide = d.sideMainframe === c.id;
  const stats = [statBadge(c), c.factions.map((f) => `<span class="fpill" style="--c:${fcol(f)}">${esc(f)}</span>`).join(''), c.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join(''), c.iconic ? '<span class="pill iconic">Iconic</span>' : ''].join('');
  const foot = isMf
    ? `<div class="tile-foot"><div class="mfbtns"><button class="btn small ${inMain ? 'primary' : ''}" data-act="mf" data-id="${c.id}">${inMain ? 'Your mainframe' : 'Use as mainframe'}</button><button class="btn small" data-act="smf" data-id="${c.id}" title="Extra mainframe in the sideboard">${inSide ? 'In sideboard' : 'Side'}</button></div></div>`
    : `<div class="tile-foot">${fit && !n ? `<span class="fit" title="Pairs with: ${esc(fit.partners.join(', '))}">Fits ${fit.count} in deck</span>` : ''}<div class="stepper"><button data-act="dec" data-id="${c.id}" aria-label="Remove one ${esc(c.name)}" ${n ? '' : 'disabled'}>−</button><b>${n}</b><button data-act="inc" data-id="${c.id}" aria-label="Add one ${esc(c.name)}" ${c.copyLimit > 0 && n >= c.copyLimit ? 'disabled' : ''}>+</button></div></div>`;
  return `<article class="tile${isMf ? ' mf' : ''}${state.sel === c.id ? ' selected' : ''}${n || inMain || inSide ? ' in-deck' : ''}" data-id="${c.id}" style="${bandStyle(c)}">
    <div class="tile-head"><h3>${esc(c.name)}</h3>${c.ram != null ? `<span class="cost" title="RAM cost">${c.ram}</span>` : ''}</div>
    <div class="tile-meta"><span>${esc(c.type)}${c.subtype ? ` <span class="pill">${esc(c.subtype)}</span>` : ''}</span>${stats}</div>
    <p class="tile-text">${tileText(c)}</p>${c.abilities ? `<div class="abs">${abilityChips(c)}</div>` : ''}${foot}</article>`;
}

function renderGrid() {
  const fit = fitScores();
  let list = cards.filter(matches);
  const s = state.sort;
  if (s === 'name') list.sort((a, b) => a.name.localeCompare(b.name));
  else if (s === 'ram') list.sort((a, b) => (a.ram ?? 99) - (b.ram ?? 99) || a.name.localeCompare(b.name));
  else if (s === 'fit') list.sort((a, b) => (fit.get(b.id)?.score || 0) - (fit.get(a.id)?.score || 0) || a.id - b.id);
  $('#result-count').textContent = `${list.length} ${list.length === 1 ? 'card' : 'cards'}`;
  $('#grid').innerHTML = list.length
    ? list.map((c) => tileHtml(c, fit.get(c.id))).join('')
    : '<div class="empty"><strong>No cards match</strong>Remove a filter or change the search words.</div>';
}

// ---------------- deck pane ----------------
function meterHtml(mf, counts) {
  const tiers = tierStatus(mf, counts);
  const order = [];
  for (const t of mf.mainframe.tiers) for (const f of Object.keys(t.needs)) if (!order.includes(f)) order.push(f);
  const rows = order.map((f) => {
    const needs = mf.mainframe.tiers.map((t) => t.needs[f]).filter(Boolean);
    const have = counts[f] || 0;
    const max = Math.max(...needs) + Math.max(2, Math.round(Math.max(...needs) / 2));
    const scale = Math.max(max, have);
    return `<div class="track-row" style="--c:${fcol(f)}"><span class="lab"><i></i>${esc(f)}</span>
      <div class="track" role="img" aria-label="${have} ${f} cards; tiers at ${needs.join(', ')}"><div class="fill" style="width:${(have / scale) * 100}%"></div>${needs.map((n) => `<div class="notch" style="left:${(n / scale) * 100}%"><span>${n}</span></div>`).join('')}</div>
      <span class="num">${have}</span></div>`;
  });
  const tierRows = tiers.map((s) => `<div class="tier${s.met ? ' met' : ''}"><span class="need">${esc(needText(s.tier.needs))}</span><span>${rich(s.tier.text)}${MODE[s.tier.mode] ? ` <span class="mode">(${MODE[s.tier.mode].toLowerCase()})</span>` : ''}</span></div>`).join('');
  return `<div class="meter">${rows.join('')}</div><div class="tiers">${tierRows}</div>
    <p class="note-small">Counts persistent cards in your cyberdeck. On the table you will have fewer in play, so aim above the thresholds.</p>`;
}

function mainframeBlock(d, counts) {
  const mf = d.mainframe && byId.get(d.mainframe);
  if (mf) {
    return `<div class="mf-card" style="${bandStyle(mf)}"><div class="mf-head"><h3>${esc(mf.name)}</h3><button class="btn small" data-act="mf" data-id="${mf.id}">Remove</button></div>
      <p class="mf-lead">${mf.mainframe.lead ? rich(mf.mainframe.lead) : 'Always on once you have the synergy.'}</p>${meterHtml(mf, counts)}</div>`;
  }
  const ranked = Object.keys(counts).length ? rankMainframes(counts).slice(0, 5) : [];
  return `<div class="mf-empty"><strong>Choose a mainframe</strong><p>${ranked.length ? 'Best fits for the cards you have so far:' : 'Add some characters first, or browse all 20 mainframes.'}</p>
    ${ranked.length ? `<div class="rank">${ranked.map((r) => `<button data-act="mf" data-id="${r.mf.id}"><b>${esc(r.mf.name)}</b><small>${r.mf.factions.join(', ')}: ${r.met} of ${r.total} tiers</small></button>`).join('')}</div>` : ''}
    <p style="margin-top:10px"><button class="btn small" data-act="browse-mf">Browse mainframes</button></p></div>`;
}

function deckRow(c, n, zone) {
  return `<div class="drow"><span class="n">${n}</span><button class="nm" data-act="select" data-id="${c.id}" title="${esc(c.name)}"><span class="band" style="${bandStyle(c)}"></span>${esc(titleCase(c.name))}</button><span class="rm">${c.ram != null ? c.ram + ' RAM' : ''}</span>
    <span><button class="btn small ghost" data-act="${zone}-dec" data-id="${c.id}" aria-label="Remove one">−</button><button class="btn small ghost" data-act="${zone}-inc" data-id="${c.id}" aria-label="Add one" ${c.copyLimit > 0 && copiesOf(deck(), c.id) >= c.copyLimit ? 'disabled' : ''}>+</button><button class="mv" data-act="move-${zone}" data-id="${c.id}">${zone === 'main' ? 'to side' : 'to main'}</button></span></div>`;
}

function zoneList(zone) {
  const d = deck();
  const rows = Object.entries(d[zone]).map(([id, n]) => ({ c: byId.get(Number(id)), n })).filter((x) => x.c);
  const groups = ['Character', 'Program', 'Gear'];
  return groups
    .map((g) => {
      const r = rows.filter((x) => x.c.type === g).sort((a, b) => (a.c.ram ?? 0) - (b.c.ram ?? 0) || a.c.name.localeCompare(b.c.name));
      if (!r.length) return '';
      return `<div class="dgroup">${g}s (${r.reduce((s, x) => s + x.n, 0)})</div>${r.map((x) => deckRow(x.c, x.n, zone)).join('')}`;
    })
    .join('');
}

function renderDeck() {
  const d = deck();
  const v = validate(d);
  const st = deckStats(d);
  const counts = persistentFactionCounts(d);
  const maxCurve = Math.max(1, ...Object.values(st.curve));
  const smf = d.sideMainframe && byId.get(d.sideMainframe);
  const sugg = suggest(d, 8);
  const mainPct = Math.min(100, (v.mainCount / LIMITS.mainMin) * 100);
  const keepFocus = document.activeElement && document.activeElement.id === 'deck-name';
  $('#deck-pane').innerHTML = `
    <input id="deck-name" class="deck-name" type="text" value="${esc(d.name)}" aria-label="Deck name" maxlength="60">
    ${mainframeBlock(d, counts)}
    <div class="block"><h4>Deck check</h4>
      <div class="counts">
        <div class="count"><b>${v.mainCount}</b><span>of ${LIMITS.mainMin}+ cyberdeck</span><div class="bar ${v.mainCount > LIMITS.mainMax ? 'over' : v.mainCount >= LIMITS.mainMin ? 'good' : ''}"><i style="width:${mainPct}%"></i></div></div>
        <div class="count"><b>${v.sideCount}</b><span>of ${LIMITS.sideMax} sideboard</span><div class="bar ${v.sideCount > LIMITS.sideMax ? 'over' : ''}"><i style="width:${Math.min(100, (v.sideCount / LIMITS.sideMax) * 100)}%"></i></div></div>
      </div>
      <div class="status">${v.ok ? '<div class="line"><span class="dot"></span><span>Legal deck.</span></div>' : v.issues.map((i) => `<div class="line"><span class="dot ${i.level}"></span><span>${esc(i.text)}</span></div>`).join('')}</div>
    </div>
    ${v.mainCount ? `<div class="block"><h4><span class="grow">RAM curve</span><span class="muted">avg ${st.avgRam.toFixed(1)}</span></h4><div class="curve">${[0, 1, 2, 3, 4, 5, 6, 7, 8].map((k) => `<div title="${st.curve[k] || 0} cards"><b>${st.curve[k] || ''}</b><i style="height:${((st.curve[k] || 0) / maxCurve) * 52}px"></i><span>${k === 8 ? '8+' : k}</span></div>`).join('')}</div></div>` : ''}
    <div class="block"><h4>Cyberdeck</h4><div class="dlist">${v.mainCount ? zoneList('main') : '<p class="muted">Empty. Use the + buttons on the cards to add them here.</p>'}</div></div>
    <div class="block"><h4>Sideboard</h4>
      ${smf ? `<div class="drow" style="grid-template-columns:22px 1fr auto"><span class="n">1</span><button class="nm" data-act="select" data-id="${smf.id}"><span class="band" style="${bandStyle(smf)}"></span>${esc(titleCase(smf.name))} (mainframe)</button><button class="btn small ghost" data-act="smf" data-id="${smf.id}">Remove</button></div>` : ''}
      <div class="dlist">${v.sideCount ? zoneList('side') : smf ? '' : '<p class="muted">Up to 12 cards plus one extra mainframe. Use “to side” on a deck card, or the Side button on a mainframe.</p>'}</div></div>
    ${sugg.length ? `<div class="block"><h4>Fits this deck</h4><div class="sugg">${sugg.map((s) => `<div class="it" style="${bandStyle(s.card)}"><div class="t"><b data-act="select" data-id="${s.card.id}">${esc(titleCase(s.card.name))}</b><small>Pairs with ${esc(s.partners.map(titleCase).join(', '))}</small></div><button class="btn small" data-act="inc" data-id="${s.card.id}" aria-label="Add ${esc(s.card.name)}">Add</button></div>`).join('')}</div></div>` : ''}
    <div class="block"><h4>Notes</h4><textarea id="deck-notes" class="notes" placeholder="Game plan, matchups, what to try next">${esc(d.notes || '')}</textarea></div>
    <p class="foot">Saved in this browser only. Use Share to send the deck to someone else.</p>`;
  if (keepFocus) { const el = $('#deck-name'); el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
  $('#deck-badge').textContent = `${v.mainCount}/${LIMITS.mainMin}`;
  $('#deck-badge').className = v.ok ? 'good' : '';
}

// ---------------- card pane ----------------
function linkItem(x, kind) {
  const d = deck();
  const n = copiesOf(d, x.card.id) || (d.mainframe === x.card.id ? 1 : 0);
  const labels = [...new Set(x.why.map((r) => r.label))].slice(0, 3).join(', ');
  return `<button class="link" data-act="select" data-id="${x.card.id}" style="${bandStyle(x.card)}"><span class="band"></span><span><b>${esc(titleCase(x.card.name))}</b><small>${esc(x.card.type)}${x.card.subtype ? ' ' + esc(x.card.subtype) : ''}. ${kind === 'works' ? 'Shares' : 'Asks for'}: ${esc(labels)}</small></span><span class="in">${n ? `${n} in deck` : ''}</span></button>`;
}
function linkList(items, key, kind) {
  const show = state.showAll[key] ? items : items.slice(0, 8);
  return `<div class="links">${show.map((x) => linkItem(x, kind)).join('')}</div>${items.length > 8 ? `<button class="btn small more" data-act="showall" data-key="${key}">${state.showAll[key] ? 'Show fewer' : `Show all ${items.length}`}</button>` : ''}`;
}

function renderCard() {
  const c = state.sel != null ? byId.get(state.sel) : null;
  if (!c) { $('#card-pane').innerHTML = '<div class="empty"><strong>No card selected</strong>Select a card to see its full text and which other cards it works with.</div>'; return; }
  const d = deck();
  const n = copiesOf(d, c.id);
  const L = lens(c);
  const w = describeWants(c);
  const wantChips = [...w.factions.map((f) => `<em class="ref" style="--c:${fcol(f)}">${esc(f)}</em>`), ...w.tags.map((t) => `<em class="ref">${esc(t)}</em>`), ...w.subtypes.map((s) => `<em class="ref">${esc(s)}</em>`), ...w.names.map((nm) => `<em class="ref card" data-act="select" data-id="${byName.get(norm(nm)).id}">${esc(nm)}</em>`)];
  const body = c.mainframe
    ? `${c.mainframe.lead ? `<p>${rich(c.mainframe.lead)}</p>` : ''}${c.mainframe.tiers.map((t) => `<p class="cd-tier"><span class="need">${esc(needText(t.needs))}${MODE[t.mode] ? ` (${MODE[t.mode].toLowerCase()})` : ''}:</span> ${rich(t.text)}</p>`).join('')}`
    : c.text.map((t) => `<p>${rich(t)}</p>`).join('') || '<p class="muted">No rules text.</p>';
  const actions = c.type === 'Mainframe'
    ? `<button class="btn ${d.mainframe === c.id ? 'primary' : ''}" data-act="mf" data-id="${c.id}">${d.mainframe === c.id ? 'Your mainframe (remove)' : 'Use as mainframe'}</button><button class="btn" data-act="smf" data-id="${c.id}">${d.sideMainframe === c.id ? 'In sideboard (remove)' : 'Put in sideboard'}</button>`
    : `<div class="stepper"><button data-act="dec" data-id="${c.id}" ${n ? '' : 'disabled'} aria-label="Remove one">−</button><b>${n}</b><button data-act="inc" data-id="${c.id}" ${c.copyLimit > 0 && n >= c.copyLimit ? 'disabled' : ''} aria-label="Add one">+</button></div><span class="muted">in deck, limit ${c.copyLimit > 0 ? c.copyLimit : 'none'}</span>`;
  $('#card-pane').innerHTML = `<div class="cd-head" style="${bandStyle(c)}"><h2>${esc(c.name)}</h2>
    <div class="cd-meta"><span class="pill">${esc(c.type)}</span>${c.subtype ? `<span class="pill">${esc(c.subtype)}</span>` : ''}${c.factions.map((f) => `<span class="fpill" style="--c:${fcol(f)}">${esc(f)}</span>`).join('')}${c.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}${c.iconic ? '<span class="pill iconic">Iconic</span>' : ''}<span class="tag">${esc(c.rarity)}</span>${c.ram != null ? `<span class="cost" title="RAM cost">${c.ram}</span>` : ''}${statBadge(c)}</div></div>
    <div class="cd-text">${body}</div>
    ${c.abilities ? `<div class="block" style="margin-top:12px"><h4>Ability costs</h4><div class="abs big">${c.abilities.map((a) => `<div class="abrow"><span class="abcost">${a.ram != null ? `<b>${a.ram}</b> RAM` : ''}${a.run ? `<span class="runtag"><i aria-hidden="true">↱</i> Run</span>` : ''}</span><span>${esc(titleCase(a.name))}</span></div>`).join('')}</div></div>` : ''}
    <div class="cd-actions">${actions}</div>
    ${wantChips.length ? `<p class="wants">This card looks for: ${wantChips.join(' ')}</p>` : ''}
    <div class="block"><h4>Works with (${L.worksWith.length})</h4>${L.worksWith.length ? linkList(L.worksWith, 'works', 'works') : '<p class="muted">This card does not name anything specific.</p>'}</div>
    <div class="block"><h4>Cards that ask for it (${L.enabledBy.length})</h4>${L.enabledBy.length ? linkList(L.enabledBy, 'enabled', 'enabled') : '<p class="muted">No other card names this one.</p>'}</div>
    <p class="foot">Links come from the brackets and keywords in the rules text. They show what cards mention each other, not whether a combo is good.</p>`;
}

// ---------------- chrome ----------------
function renderTop() {
  $('#deck-select').innerHTML = state.decks.map((d) => `<option value="${d.id}" ${d.id === state.activeId ? 'selected' : ''}>${esc(d.name || 'Untitled')}</option>`).join('');
}
function renderChrome() {
  $('.app').dataset.view = state.view;
  $('.side').dataset.side = state.side;
  document.querySelectorAll('.viewtabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.view === state.view)));
  document.querySelectorAll('.sidetabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.side === state.side)));
}
function renderAll() { renderTop(); renderFilters(); renderGrid(); renderDeck(); renderCard(); renderChrome(); }
function afterDeckChange() { renderGrid(); renderDeck(); renderCard(); renderTop(); }

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2400);
}
async function copy(text, msg) {
  try { await navigator.clipboard.writeText(text); }
  catch {
    const ta = document.createElement('textarea'); ta.value = text; document.body.append(ta); ta.select();
    try { document.execCommand('copy'); } catch { /* ignore */ } ta.remove();
  }
  toast(msg);
}

function select(id) {
  state.sel = id; state.side = 'card'; if (matchMedia('(max-width: 980px)').matches) state.view = 'card';
  state.showAll = { works: false, enabled: false };
  renderGrid(); renderCard(); renderChrome();
  $('#card-pane').scrollTop = 0;
}

// ---------------- dialogs ----------------
function openDialog(html) { const dlg = $('#dlg'); dlg.innerHTML = `<div class="dlg">${html}</div>`; if (!dlg.open) dlg.showModal(); }
function shareDialog() {
  const d = deck();
  openDialog(`<h2>Share “${esc(d.name)}”</h2><p>Your playgroup does not need an account or any AI tool. Pick how you want to send it.</p>
    <div class="sharegrid">
      <button data-act="copy-link"><b>Copy link</b><span>Opens this deck in the app for whoever you send it to.</span></button>
      <button data-act="copy-text"><b>Copy deck list</b><span>Plain text for chat or a doc. Can be imported back.</span></button>
      <button data-act="copy-ai"><b>Copy for AI</b><span>Deck, card text and rules, ready to paste into any AI chat.</span></button>
      <button data-act="download"><b>Download .txt</b><span>Keep a file copy of the deck list.</span></button>
    </div><div class="row"><button class="btn" data-act="close-dlg">Done</button></div>`);
}
function importDialog() {
  openDialog(`<h2>Import a deck</h2><p>Paste a deck list or a share link. Lines look like “3 Admin”. Use “Sideboard:” and “Mainframe: Name” lines for those parts.</p>
    <textarea id="import-text" placeholder="Deck: Hacker rush&#10;Mainframe: Firestarter&#10;4 Admin&#10;4 Coder" spellcheck="false"></textarea>
    <div class="row"><button class="btn" data-act="close-dlg">Cancel</button><button class="btn primary" data-act="do-import">Import as new deck</button></div>`);
  $('#import-text').focus();
}
function addDeck(nd) { state.decks.push(nd); state.activeId = nd.id; save(); state.side = 'deck'; renderAll(); }

// ---------------- events ----------------
function act(el, e) {
  const a = el.dataset.act, id = Number(el.dataset.id);
  const d = deck();
  let keep = null;
  switch (a) {
    case 'chip': {
      const set = state.f[el.dataset.key]; const raw = el.dataset.val;
      const val = el.dataset.key === 'ram' ? Number(raw) : raw;
      set.has(val) ? set.delete(val) : set.add(val);
      renderFilters(); renderGrid(); return;
    }
    case 'toggle': state.f[el.dataset.key] = el.checked; renderGrid(); return;
    case 'reset': state.f = blankFilters(); $('#q').value = ''; renderFilters(); renderGrid(); return;
    case 'select': select(id); return;
    case 'inc': setDeck(changeCount(d, 'main', id, 1)); keep = `[data-act="inc"][data-id="${id}"]`; break;
    case 'dec': setDeck(changeCount(d, 'main', id, -1)); keep = `[data-act="dec"][data-id="${id}"]`; break;
    case 'main-inc': setDeck(changeCount(d, 'main', id, 1)); break;
    case 'main-dec': setDeck(changeCount(d, 'main', id, -1)); break;
    case 'side-inc': setDeck(changeCount(d, 'side', id, 1)); break;
    case 'side-dec': setDeck(changeCount(d, 'side', id, -1)); break;
    case 'move-main': { const one = changeCount(d, 'main', id, -1); setDeck(changeCount(one, 'side', id, 1)); break; }
    case 'move-side': { const one = changeCount(d, 'side', id, -1); setDeck(changeCount(one, 'main', id, 1)); break; }
    case 'mf': setDeck(setMainframe(d, id)); break;
    case 'smf': setDeck(setMainframe(d, id, 'sideMainframe')); break;
    case 'browse-mf': state.f = blankFilters(); state.f.types.add('Mainframe'); state.view = 'browse'; $('#q').value = ''; renderFilters(); renderGrid(); renderChrome(); return;
    case 'showall': state.showAll[el.dataset.key] = !state.showAll[el.dataset.key]; renderCard(); return;
    case 'new-deck': addDeck(emptyDeck('New deck')); $('#deck-name').select(); return;
    case 'dup-deck': addDeck({ ...JSON.parse(JSON.stringify(d)), id: emptyDeck().id, name: `${d.name} copy` }); return;
    case 'del-deck':
      if (!confirm(`Delete “${d.name}”? This cannot be undone.`)) return;
      state.decks = state.decks.filter((x) => x.id !== d.id);
      if (!state.decks.length) state.decks.push(emptyDeck('New deck'));
      state.activeId = state.decks[0].id; save(); renderAll(); return;
    case 'open-share': shareDialog(); return;
    case 'open-import': importDialog(); return;
    case 'close-dlg': $('#dlg').close(); return;
    case 'copy-link': copy(`${location.origin === 'null' ? '' : location.origin}${location.pathname}#d=${encodeShare(d)}`, 'Link copied'); return;
    case 'copy-text': copy(exportText(d), 'Deck list copied'); return;
    case 'copy-ai': copy(aiPrompt(d), 'Copied. Paste it into your AI chat.'); return;
    case 'download': {
      const a2 = document.createElement('a');
      a2.href = URL.createObjectURL(new Blob([exportText(d)], { type: 'text/plain' }));
      a2.download = `${d.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'deck'}.txt`; a2.click(); URL.revokeObjectURL(a2.href); return;
    }
    case 'do-import': {
      const text = $('#import-text').value.trim();
      if (!text) return;
      let nd, unknown = [];
      const m = text.match(/#d=([A-Za-z0-9_-]+)/);
      try {
        if (m) nd = decodeShare(m[1]); else ({ deck: nd, unknown } = parseText(text));
      } catch { toast('That link could not be read'); return; }
      $('#dlg').close(); addDeck(nd);
      toast(unknown.length ? `Imported. Not recognised: ${unknown.slice(0, 4).join(', ')}${unknown.length > 4 ? '…' : ''}` : `Imported “${nd.name}”`);
      return;
    }
    default: return;
  }
  afterDeckChange();
  if (keep && e && e.detail === 0) { const k = document.querySelector(`#grid ${keep}, #card-pane ${keep}`); k && k.focus(); }
}

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (el && !(el.tagName === 'INPUT')) { e.stopPropagation(); act(el, e); return; }
  const tile = e.target.closest('.tile');
  if (tile) select(Number(tile.dataset.id));
  const vt = e.target.closest('.viewtabs button');
  if (vt) { state.view = vt.dataset.view; if (vt.dataset.view !== 'browse') state.side = vt.dataset.view; renderChrome(); window.scrollTo(0, 0); }
  const st = e.target.closest('.sidetabs button');
  if (st) { state.side = st.dataset.side; renderChrome(); }
});
document.addEventListener('change', (e) => { if (e.target.dataset.act === 'toggle') act(e.target, e); });
$('#deck-select').addEventListener('change', (e) => { state.activeId = e.target.value; save(); renderAll(); });
$('#q').addEventListener('input', (e) => { state.f.q = e.target.value.trim(); renderGrid(); renderFilters(); });
$('#sort').addEventListener('change', (e) => { state.sort = e.target.value; renderGrid(); });
document.addEventListener('input', (e) => {
  if (e.target.id === 'deck-name') { setDeck({ ...deck(), name: e.target.value }); renderTop(); }
  if (e.target.id === 'deck-notes') setDeck({ ...deck(), notes: e.target.value });
});
document.addEventListener('keydown', (e) => {
  if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { e.preventDefault(); $('#q').focus(); }
});

function checkHash() {
  const m = location.hash.match(/^#d=([A-Za-z0-9_-]+)$/);
  if (!m) return;
  try { const nd = decodeShare(m[1]); history.replaceState(null, '', location.pathname); addDeck(nd); toast(`Opened “${nd.name}” as a new deck`); }
  catch { toast('That share link could not be read'); }
}

load();
renderAll();
checkHash();
addEventListener('hashchange', checkHash);
