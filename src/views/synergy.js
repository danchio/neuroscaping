// Deck synergy map (#/deck/<id>/synergy): clustered node graph, ranking, loose cards. Hand-written SVG.
import { byId, titleCase } from '../lib/cards.js';
import { deckGraph, viewGraph, partnersOf, layoutGraph, mainframeLinks, STRENGTHS, strengthMin } from '../lib/graph.js';
import { suggestForDeck, SECTION_LABEL } from '../lib/roles.js';
import { $, $$, esc, onAct, toast, keepFocus } from '../ui/dom.js';
import { glyph, plusIcon, minusIcon } from '../ui/glyphs.js';
import { costBox, fvar, glyphRow, sectionBanner, edgeStyle } from '../ui/card.js';
import { cardImageHtml, keepImages } from '../ui/cardimg.js';
import { getDeck, change } from '../store.js';
import { href } from '../router.js';
import { reg } from './registry.js';

const ui = { strength: 'strong', mode: matchMedia('(max-width: 720px)').matches ? 'list' : 'graph', sel: null };
const nm = (c) => titleCase(c.name);

const cardEdge = (c) => (c.factions[0] ? fvar(c.factions[0]) : 'var(--trace-hi)');

function svgHtml(graph, v, lay) {
  const topN = new Set(v.rank.slice(0, 10).filter((n) => v.deg.get(n.id).count > 0).map((n) => n.id));
  const primary = (id) => byId.get(id).factions[0] || '';
  const edges = v.edges.map((e) => {
    const A = lay.pos.get(e.a), B = lay.pos.get(e.b);
    const same = primary(e.a) && primary(e.a) === primary(e.b);
    const w = e.weight >= 3 ? 2.2 : e.weight >= 2 ? 1.5 : 1;
    const o = e.weight >= 3 ? 0.9 : e.weight >= 2 ? 0.55 : 0.28;
    return `<line class="se" data-a="${e.a}" data-b="${e.b}" x1="${A.x.toFixed(1)}" y1="${A.y.toFixed(1)}" x2="${B.x.toFixed(1)}" y2="${B.y.toFixed(1)}" stroke="${same ? fvar(primary(e.a)) : 'var(--dim)'}" stroke-width="${w}" stroke-opacity="${o}"/>`;
  }).join('');
  const discs = lay.clusters.map((c) => `<g class="scl"><circle cx="${c.cx.toFixed(1)}" cy="${c.cy.toFixed(1)}" r="${c.r.toFixed(1)}" fill="${c.faction === 'None' ? 'var(--dim)' : fvar(c.faction)}" fill-opacity=".05" stroke="${c.faction === 'None' ? 'var(--trace-hi)' : fvar(c.faction)}" stroke-opacity=".35" stroke-dasharray="3 5"/>
    <g class="scl-t" transform="translate(${(c.cx - 8 - c.faction.length * 3.4).toFixed(1)} ${(c.cy - c.r - 20).toFixed(1)})" style="color:${c.faction === 'None' ? 'var(--dim)' : fvar(c.faction)}">${c.faction === 'None' ? '' : glyph(c.faction, 15)}<text x="${c.faction === 'None' ? 0 : 20}" y="12">${esc(c.faction === 'None' ? 'No faction' : c.faction)} ${c.list.length}</text></g></g>`).join('');
  const nodes = graph.nodes.map((n) => {
    const p = lay.pos.get(n.id), c = n.card;
    const [a, b] = c.factions;
    const loose = v.deg.get(n.id).count === 0;
    return `<g class="sn${topN.has(n.id) ? ' top' : ''}${loose ? ' loose' : ''}" data-n="${n.id}" data-w="${v.deg.get(n.id).weight}" tabindex="0" role="button" transform="translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})" aria-label="${esc(nm(c))}, ${n.n} ${n.n === 1 ? 'copy' : 'copies'}, ${v.deg.get(n.id).count} partners">
      <circle r="${p.r}" fill="${a ? fvar(a) : 'var(--trace-hi)'}" stroke="${b ? fvar(b) : 'var(--substrate)'}" stroke-width="${b ? 3.4 : 1.5}"/>
      ${n.n > 1 ? `<text class="cp" y="4" text-anchor="middle">${n.n}</text>` : ''}
      </g>`;
  }).join('');
  const labels = graph.nodes.map((n) => { const p = lay.pos.get(n.id); return `<text class="lbl" data-for="${n.id}" x="${p.x.toFixed(1)}" y="${(p.y - p.r - 5).toFixed(1)}" text-anchor="middle">${esc(nm(n.card))}</text>`; }).join('');
  return `<svg id="syn-svg" class="syn-svg" viewBox="${lay.viewBox.join(' ')}" role="group" aria-label="Synergy map. Each dot is a card, grouped by faction. Select a card to see its partners.">${discs}<g class="sedges">${edges}</g><g class="snodes">${nodes}</g><g class="slabels">${labels}</g></svg>
    <p class="syn-key"><span><i class="k-dot"></i>Dot size is copies</span><span><i class="k-ring"></i>Outer ring is a second faction</span><span><i class="k-loose"></i>Dashed dot has no partners</span><span><i class="k-line"></i>Thicker line is a stronger link</span></p>`;
}

const whyChips = (why) => why.slice(0, 4).map((w) => `<span class="why-chip">${esc(w)}</span>`).join('');

function rankRow(n, v, max) {
  const d = v.deg.get(n.id);
  return `<li><button class="rk${ui.sel === n.id ? ' on' : ''}" data-act="syn-pick" data-id="${n.id}" style="--a:${cardEdge(n.card)}"><span class="rk-top">${costBox(n.card)}<span class="rn">${esc(nm(n.card))}</span>${n.n > 1 ? `<span class="rk-n">x${n.n}</span>` : ''}</span>
    <span class="rk-bar" aria-hidden="true"><i style="width:${max ? (d.weight / max) * 100 : 0}%"></i></span><span class="rk-c">${d.count} ${d.count === 1 ? 'partner' : 'partners'}</span></button></li>`;
}

function sidePanel(deck, graph, v, min) {
  if (ui.sel && graph.nodes.some((n) => n.id === ui.sel)) {
    const n = graph.nodes.find((x) => x.id === ui.sel);
    const ps = partnersOf(graph, n.id, min);
    const mf = mainframeLinks(deck, n.id);
    return `<div class="sp-head"><button class="linkbtn" data-act="syn-clear">All cards</button></div>
      <div class="sp-id"><button class="zoom sp-img" data-act="zoom" data-id="${n.id}" style="${edgeStyle(n.card)}" aria-label="Enlarge ${esc(nm(n.card))}">${cardImageHtml(n.card, { size: 'tile' })}</button>
      <div class="sp-id-t"><h3 class="sp-name" style="--a:${cardEdge(n.card)}">${costBox(n.card)}<span>${esc(nm(n.card))}</span>${glyphRow(n.card, 15)}</h3>
      <p class="sp-meta">${n.n} in the cyberdeck. <a href="${href.card(n.id)}">Full card</a></p></div></div>
      ${mf.length ? `<p class="sp-mf">Your mainframe cares about this card: ${esc(mf.join(', '))}.</p>` : ''}
      ${ps.length ? `<ul class="partners">${ps.map((p) => `<li><button class="pt" data-act="syn-pick" data-id="${p.card.id}" style="--a:${cardEdge(p.card)}"><span class="pt-top">${costBox(p.card)}<span class="rn">${esc(nm(p.card))}</span>${p.n > 1 ? `<span class="rk-n">x${p.n}</span>` : ''}</span><span class="pt-why">${whyChips(p.why)}</span></button></li>`).join('')}</ul>`
        : `<p class="dim pad">No partners at this strength. Try “All links”, or swap it for a card that fits.</p>`}`;
  }
  const max = Math.max(1, ...v.rank.map((n) => v.deg.get(n.id).weight));
  const top = v.rank.filter((n) => v.deg.get(n.id).count > 0).slice(0, 8);
  return `<h3 class="plain">Most connected</h3>
    ${top.length ? `<ol class="ranks">${top.map((n) => rankRow(n, v, max)).join('')}</ol>` : '<p class="dim">No links at this strength.</p>'}
    <p class="note">Select a card in the map, or here, to see its partners and why they fit.</p>`;
}

function listHtml(graph, v, min) {
  const max = Math.max(1, ...v.rank.map((n) => v.deg.get(n.id).weight));
  return `<ul class="syn-list">${v.rank.map((n) => {
    const d = v.deg.get(n.id);
    const ps = partnersOf(graph, n.id, min).slice(0, 4);
    return `<li class="sl" style="--a:${cardEdge(n.card)}"><div class="sl-top"><a class="rname" href="${href.card(n.id)}">${costBox(n.card)}<span class="rn">${esc(nm(n.card))}</span></a>${n.n > 1 ? `<span class="rk-n">x${n.n}</span>` : ''}${glyphRow(n.card, 14)}<span class="sl-c">${d.count} ${d.count === 1 ? 'partner' : 'partners'}</span></div>
      <span class="rk-bar" aria-hidden="true"><i style="width:${(d.weight / max) * 100}%"></i></span>
      <p class="sl-p">${ps.length ? ps.map((p) => `<span class="pt-mini"><b>${esc(nm(p.card))}</b> ${esc(p.why[0] || '')}</span>`).join('') : '<span class="dim">No partners at this strength.</span>'}</p></li>`;
  }).join('')}</ul>`;
}

function looseHtml(deck, graph, v) {
  if (!v.orphans.length) return `<p class="dim">Every card has at least one partner at this strength.</p>`;
  const have = new Set(graph.nodes.map((n) => n.id));
  const better = suggestForDeck(deck, 60).filter((s) => !have.has(s.card.id)).slice(0, 6);
  return `<ul class="loose">${v.orphans.map((n) => `<li class="lc" style="--a:${cardEdge(n.card)}"><a class="rname" href="${href.card(n.id)}">${costBox(n.card)}<span class="rn">${esc(nm(n.card))}</span></a><span class="rk-n">x${n.n}</span><button class="lc-x" data-act="syn-less" data-id="${n.id}" aria-label="Remove one ${esc(nm(n.card))}" title="Remove one">${minusIcon}</button></li>`).join('')}</ul>
    ${better.length ? `<h3 class="plain strip-h">Cards that fit this deck better</h3><ul class="better">${better.map((s) => `<li class="bt" style="--a:${cardEdge(s.card)}"><a class="rname" href="${href.card(s.card.id)}">${costBox(s.card)}<span class="rn">${esc(nm(s.card))}</span></a>${glyphRow(s.card, 13)}<span class="bt-why">${esc(SECTION_LABEL[s.section] || '')}. ${esc(s.why[0] || '')}</span><button class="add" data-act="syn-more" data-id="${s.card.id}" aria-label="Add ${esc(nm(s.card))}">${plusIcon}</button></li>`).join('')}</ul>` : ''}`;
}

export function mountSynergy(root, deckId) {
  let cache = { key: '', graph: null };
  const graphFor = (d) => {
    const key = JSON.stringify(d.main);
    if (cache.key !== key) cache = { key, graph: deckGraph(d) };
    return cache.graph;
  };

  function paint() {
    const d = getDeck(deckId);
    if (!d) return;
    const graph = graphFor(d);
    if (graph.nodes.length < 2) {
      root.innerHTML = `<div class="empty-block"><h3>Add a few cards to see how they connect</h3><p>The synergy map links cards that name each other, or that mention each other’s faction or tags. It needs at least two cards in the cyberdeck.</p><a class="btn primary" href="${href.deck(deckId)}">Add cards</a></div>`;
      return;
    }
    const min = strengthMin(ui.strength);
    const v = viewGraph(graph, min);
    if (ui.sel && !graph.nodes.some((n) => n.id === ui.sel)) ui.sel = null;
    const st = STRENGTHS.find((s) => s.id === ui.strength);
    const lay = ui.mode === 'graph' ? layoutGraph(graph, v.deg) : null;
    root.innerHTML = `<section class="syn" aria-label="Synergy map">
      <div class="syn-bar">
        <div class="seg-ctl" role="group" aria-label="Link strength">${STRENGTHS.map((s) => `<button data-act="syn-strength" data-id="${s.id}" aria-pressed="${s.id === ui.strength}">${s.label}</button>`).join('')}</div>
        <div class="seg-ctl" role="group" aria-label="View">${[['graph', 'Map'], ['list', 'List']].map(([m, l]) => `<button data-act="syn-mode" data-id="${m}" aria-pressed="${m === ui.mode}">${l}</button>`).join('')}</div>
        <p class="syn-sum"><b>${v.edges.length}</b> links among <b>${graph.nodes.length}</b> cards. ${esc(st.hint)}</p>
      </div>
      ${ui.mode === 'graph'
        ? `<div class="syn-grid"><div class="syn-stage" id="syn-stage"><div id="syn-tip" class="syn-tip" hidden></div>${svgHtml(graph, v, lay)}</div><aside class="syn-side" id="syn-side" aria-live="polite">${sidePanel(d, graph, v, min)}</aside></div>`
        : listHtml(graph, v, min)}
      <div class="syn-loose">${sectionBanner('Loose cards', { count: v.orphans.length })}${looseHtml(d, graph, v)}
        <p class="note">Links come from names, factions, tags and subtypes in rules text. A loose card can still be a fine card; it just does not mention, or get mentioned by, the rest of this deck.</p></div>
    </section>`;
    applyFocus(ui.sel);
  }

  const adj = () => {
    const d = getDeck(deckId); const min = strengthMin(ui.strength);
    const m = new Map();
    for (const e of graphFor(d).edges) if (e.weight >= min) { (m.get(e.a) || m.set(e.a, new Set()).get(e.a)).add(e.b); (m.get(e.b) || m.set(e.b, new Set()).get(e.b)).add(e.a); }
    return m;
  };
  // Show labels greedily, most important first, skipping any that would sit on top of one already shown.
  function declutter(svg, order, forceFirst = false) {
    const kept = [];
    const nodes = $$('.sn', svg).map((g) => { const [x, y] = g.getAttribute('transform').match(/-?[\d.]+/g).map(Number); return { id: Number(g.dataset.n), x, y, r: Number(g.querySelector('circle').getAttribute('r')) + 2 }; });
    $$('.lbl', svg).forEach((t) => t.classList.remove('lab'));
    for (const [i, g] of order.entries()) {
      const id = Number(g.dataset.n);
      const t = $(`.lbl[data-for="${id}"]`, svg);
      t.classList.add('lab');
      const b = t.getBBox();
      const r = { x0: b.x - 3, x1: b.x + b.width + 3, y0: b.y - 1, y1: b.y + b.height + 1 };
      const hitsNode = nodes.some((n) => n.id !== id && n.x > r.x0 - n.r && n.x < r.x1 + n.r && n.y > r.y0 - n.r && n.y < r.y1 + n.r);
      if ((hitsNode && !(forceFirst && i === 0)) || (i > 0 && kept.some((k) => r.x0 < k.x1 && r.x1 > k.x0 && r.y0 < k.y1 && r.y1 > k.y0))) t.classList.remove('lab'); else kept.push(r);
    }
  }
  function applyFocus(id) {
    const svg = $('#syn-svg', root);
    if (!svg) return;
    const byWeight = (a, b) => Number(b.dataset.w) - Number(a.dataset.w);
    if (!id) {
      svg.classList.remove('focus'); $$('.hot, .me', svg).forEach((el) => el.classList.remove('hot', 'me'));
      declutter(svg, $$('.sn.top', svg).sort(byWeight).slice(0, 8));
      return;
    }
    const partners = adj().get(id) || new Set();
    svg.classList.add('focus');
    $$('.sn', svg).forEach((g) => { const n = Number(g.dataset.n); g.classList.toggle('hot', n === id || partners.has(n)); g.classList.toggle('me', n === id); });
    $$('.se', svg).forEach((l) => l.classList.toggle('hot', Number(l.dataset.a) === id || Number(l.dataset.b) === id));
    const hot = $$('.sn.hot', svg).sort((a, b) => (Number(b.dataset.n) === id) - (Number(a.dataset.n) === id) || byWeight(a, b));
    declutter(svg, hot, true);
  }
  // A small picture of the card follows the dot you point at, so you do not need the label to know which card it is.
  function showTip(g) {
    const tip = $('#syn-tip', root), stage = $('#syn-stage', root);
    if (!tip || !stage) return;
    const c = byId.get(Number(g.dataset.n));
    if (tip.dataset.n !== String(c.id)) { tip.dataset.n = String(c.id); tip.innerHTML = cardImageHtml(c, { size: 'tile', alt: 'short' }); }
    tip.hidden = false;
    const s = stage.getBoundingClientRect(), r = g.getBoundingClientRect();
    const w = tip.offsetWidth, h = tip.offsetHeight;
    let x = r.right - s.left + 10;
    if (x + w > s.width - 6) x = r.left - s.left - w - 10;
    const y = Math.max(6, Math.min(s.height - h - 6, r.top - s.top + r.height / 2 - h / 2));
    tip.style.transform = `translate(${Math.max(6, x)}px, ${y}px)`;
  }
  const hideTip = () => { const tip = $('#syn-tip', root); if (tip) tip.hidden = true; };
  root.addEventListener('mouseover', (e) => { const g = e.target.closest('.sn'); if (g) { applyFocus(Number(g.dataset.n)); showTip(g); } });
  root.addEventListener('mouseout', (e) => { if (e.target.closest('.sn')) { applyFocus(ui.sel); hideTip(); } });
  root.addEventListener('focusin', (e) => { const g = e.target.closest('.sn'); if (g) { applyFocus(Number(g.dataset.n)); showTip(g); } });
  root.addEventListener('focusout', (e) => { if (e.target.closest('.sn')) { applyFocus(ui.sel); hideTip(); } });
  root.addEventListener('click', (e) => { const g = e.target.closest('.sn'); if (g) select(Number(g.dataset.n)); });
  root.addEventListener('keydown', (e) => { const g = e.target.closest('.sn'); if (g && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); select(Number(g.dataset.n)); } if (e.key === 'Escape' && ui.sel) { ui.sel = null; paint(); } });

  function select(id) {
    ui.sel = ui.sel === id ? null : id;
    const d = getDeck(deckId), graph = graphFor(d), min = strengthMin(ui.strength);
    const side = $('#syn-side', root);
    if (side) side.innerHTML = sidePanel(d, graph, viewGraph(graph, min), min);
    applyFocus(ui.sel);
    $$('.sn', root).forEach((g) => g.removeAttribute('aria-pressed'));
    if (ui.sel) { const g = $(`.sn[data-n="${ui.sel}"]`, root); g && g.setAttribute('aria-pressed', 'true'); }
  }
  reg.syn = { select, repaint: () => keepFocus(() => keepImages(root, paint)) };
  paint();
  return { refresh: () => keepFocus(() => keepImages(root, paint)), destroy() { reg.syn = null; } };
}

onAct('syn-strength', (el) => { ui.strength = el.dataset.id; reg.syn && reg.syn.repaint(); });
onAct('syn-mode', (el) => { ui.mode = el.dataset.id; reg.syn && reg.syn.repaint(); });
onAct('syn-pick', (el) => reg.syn && reg.syn.select(Number(el.dataset.id)));
onAct('syn-clear', () => { ui.sel = null; reg.syn && reg.syn.repaint(); });
onAct('syn-less', (el) => { const d = byId.get(Number(el.dataset.id)); const dk = reg.view && getDeckId(); if (dk) { change(dk, 'main', d.id, -1); toast(`Removed one ${nm(d)}`); } });
onAct('syn-more', (el) => { const dk = getDeckId(); const c = byId.get(Number(el.dataset.id)); if (dk) { const r = change(dk, 'main', c.id, 1); toast(r.message || `Added ${nm(c)}`); } });
const getDeckId = () => { const m = location.hash.match(/^#\/deck\/([^/?]+)/); return m ? m[1] : null; };
