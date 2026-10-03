// Playtest (#/deck/<id>/playtest): draw odds for a group of cards, and a sample hand to draw, mulligan and play forward.
import { byId, titleCase } from '../lib/cards.js';
import { total } from '../lib/deck.js';
import { GROUP_KINDS, groupOptions, groupSize, oddsByTurn, newGame, mulligan, drawTurn, turnDraws, OPENING_HAND } from '../lib/odds.js';
import { $, $$, esc, onAct } from '../ui/dom.js';
import { plusIcon, minusIcon } from '../ui/glyphs.js';
import { cardFrame, sectionBanner } from '../ui/card.js';
import { effective } from '../tagstore.js';
import { getDeck } from '../store.js';
import { href } from '../router.js';
import { reg } from './registry.js';

const pt = { deckId: null, kind: 'card', value: null, k: 1, first: true, game: null, marked: new Set(), took: null, sig: '' };
const pct = (p) => (p >= 0.995 && p < 1 ? '99%' : p > 0 && p < 0.005 ? '<1%' : `${Math.round(p * 100)}%`);
const sigOf = (d) => JSON.stringify(d.main);

function oddsHtml(d) {
  const N = total(d.main);
  const eff = effective();
  const opts = groupOptions(d, eff);
  if (!(opts[pt.kind] || []).some((o) => o.value === pt.value)) {
    const list = opts[pt.kind] || [];
    pt.value = (pt.kind === 'card' ? [...list].sort((a, b) => b.count - a.count)[0] : list[0])?.value ?? null;
  }
  const kinds = GROUP_KINDS.filter((k) => opts[k.id].length);
  if (!kinds.some((k) => k.id === pt.kind)) { pt.kind = kinds[0].id; pt.value = opts[pt.kind][0].value; }
  const K = groupSize(d, { kind: pt.kind, value: pt.value }, eff);
  const k = Math.max(1, Math.min(pt.k, 8));
  const rows = oddsByTurn({ N, K, k, first: pt.first, turns: 8 });
  const cur = opts[pt.kind].find((o) => o.value === pt.value);
  const what = pt.kind === 'card' ? `${K === 1 ? 'the 1 copy' : `all ${K} copies`} of ${titleCase(cur.label)}` : `the ${K} ${pt.kind === 'tag' ? `“${cur.label}” tagged` : pt.kind === 'ram' ? cur.label : cur.label} ${K === 1 ? 'card' : 'cards'}`;
  const open = rows[0];
  return `${sectionBanner('Draw odds')}
    <div class="o-ctl">
      <label class="o-f"><span>Look for</span><select id="o-kind">${kinds.map((x) => `<option value="${x.id}"${x.id === pt.kind ? ' selected' : ''}>${x.label}</option>`).join('')}</select></label>
      <label class="o-f grow"><span class="sr">Which one</span><select id="o-val">${opts[pt.kind].map((o) => `<option value="${esc(o.value)}"${o.value === pt.value ? ' selected' : ''}>${esc(pt.kind === 'card' ? titleCase(o.label) : o.label)} (${o.count} in deck)</option>`).join('')}</select></label>
      <div class="o-f"><span id="o-k-l">At least</span><span class="stp" role="group" aria-labelledby="o-k-l"><button data-act="o-k" data-val="-1" aria-label="Fewer copies" ${k <= 1 ? 'disabled' : ''}>${minusIcon}</button><b aria-live="polite">${k}</b><button data-act="o-k" data-val="1" aria-label="More copies" ${k >= Math.min(8, K) ? 'disabled' : ''}>${plusIcon}</button></span></div>
      <div class="seg-ctl" role="group" aria-label="Turn order">${[[true, 'Going first'], [false, 'Going second']].map(([v, l]) => `<button data-act="o-first" data-val="${v}" aria-pressed="${pt.first === v}">${l}</button>`).join('')}</div>
    </div>
    <div class="o-out"><p class="o-big"><b>${pct(open.p)}</b><span>to hold at least ${k} in your opening ${OPENING_HAND}</span></p>
      <p class="o-sum">${esc(what.charAt(0).toUpperCase() + what.slice(1))} in a cyberdeck of ${N}. ${K < k ? `You run only ${K}, so this cannot happen.` : ''}</p></div>
    <div class="odds" role="img" aria-label="Chance of at least ${k} by turn: ${rows.map((r) => `${r.turn === 0 ? 'opening hand' : 'turn ' + r.turn} ${pct(r.p)}`).join(', ')}">${rows.map((r) => `<div class="oc${r.turn === 0 ? ' open' : ''}" title="${r.seen} cards seen"><span class="oc-bar"><i style="height:${Math.max(r.p * 100, r.p > 0 ? 1.5 : 0)}%"><em class="oc-p">${pct(r.p)}</em></i></span><span class="oc-l">${r.turn === 0 ? 'Open' : 'T' + r.turn}</span><span class="oc-s">${r.seen}</span></div>`).join('')}</div>
    <p class="note">Cards seen is the small number under each turn. Assumes every draw comes from your cyberdeck (the best case: in the real game you can take cards from the separate RAM deck instead), the opening hand is 5, each turn draws 2 (the player going first draws 1 on turn 1), and no mulligan.</p>`;
}

function handHtml(d) {
  const g = pt.game;
  const draws = g ? Math.min(pt.took ?? 2, turnDraws(g)) : 0;
  const stale = g && pt.sig !== sigOf(d);
  const controls = `<div class="h-ctl">
      <button class="btn primary" data-act="pt-new"${total(d.main) < OPENING_HAND ? ' disabled' : ''}>${g ? 'Draw a new hand' : 'Draw a sample hand'}</button>
      ${g && g.turn === 0 ? `<button class="btn" data-act="pt-mull"${pt.marked.size ? '' : ' disabled'}>${pt.marked.size ? `Mulligan ${pt.marked.size} ${pt.marked.size === 1 ? 'card' : 'cards'}` : 'Mulligan'}</button>` : ''}
      ${g ? `<button class="btn" data-act="pt-next"${g.library.length ? '' : ' disabled'}>Start turn ${g.turn + 1}${draws ? ` and draw ${draws}` : ''}</button>` : ''}
    </div>
    ${g ? `<div class="h-took"><span id="h-took-l">Of this turn’s ${turnDraws(g)} ${turnDraws(g) === 1 ? 'card' : 'cards'}, take from the cyberdeck</span><div class="seg-ctl" role="group" aria-labelledby="h-took-l">${Array.from({ length: turnDraws(g) + 1 }, (_, i) => `<button data-act="pt-took" data-val="${i}" aria-pressed="${i === draws}">${i}</button>`).join('')}</div></div>` : ''}`;
  if (!g) return `${sectionBanner('Sample hand')}${total(d.main) < OPENING_HAND ? '<p class="dim">Add at least 5 cards to the cyberdeck to draw a hand.</p>' : ''}${controls}
    <p class="note">Shuffles your cyberdeck and deals 5. Mulligan by choosing cards to send to the bottom; you redraw as many.</p>${ramNote}`;
  const status = g.turn === 0
    ? `Opening hand. ${g.library.length} cards left in the cyberdeck. ${g.marked ? '' : ''}Select cards to send back, or keep them and start turn 1.`
    : `Turn ${g.turn}. ${g.hand.length} cards in hand, ${g.library.length} left in the cyberdeck.`;
  const cardsHtml = g.hand.map((x) => {
    const c = byId.get(x.id);
    const on = pt.marked.has(x.uid);
    const fresh = g.fresh.includes(x.uid);
    const foot = `<div class="h-foot">${fresh ? '<span class="h-new">New</span>' : '<span></span>'}${g.turn === 0 ? `<button class="btn small" data-act="pt-mark" data-id="${x.uid}" aria-pressed="${on}" aria-label="${on ? 'Keep' : 'Send back'} ${esc(titleCase(c.name))}">${on ? 'Sending back' : 'Send back'}</button>` : ''}</div>`;
    return `<div class="cell${on ? ' marked' : ''}">${cardFrame(c, { mode: 'tile', cls: 'mini', foot })}</div>`;
  }).join('');
  return `${sectionBanner('Sample hand', { count: g.hand.length })}${controls}
    <p class="h-status" role="status">${esc(status)}${stale ? ' <b>The deck has changed since this hand was drawn.</b> Draw a new hand to include the change.' : ''}</p>
    <div class="hand">${cardsHtml}</div>${ramNote}`;
}
const ramNote = '<p class="note">The 25-card RAM deck is a separate deck and is not modelled here. Cards you install from it are not drawn from your cyberdeck.</p>';

export function mountPlaytest(root, deckId) {
  if (pt.deckId !== deckId) Object.assign(pt, { deckId, kind: 'card', value: null, k: 1, game: null, marked: new Set(), took: null });
  const paint = () => {
    const d = getDeck(deckId);
    if (!d) return;
    if (!total(d.main)) {
      root.innerHTML = `<div class="empty-block"><h3>Add cards to playtest</h3><p>Draw odds and sample hands need cards in the cyberdeck.</p><a class="btn primary" href="${href.deck(deckId)}">Add cards</a></div>`;
      return;
    }
    root.innerHTML = `<div class="ptest"><section class="pt-sec" id="pt-odds" aria-label="Draw odds">${oddsHtml(d)}</section><section class="pt-sec" id="pt-hand" aria-label="Sample hand">${handHtml(d)}</section></div>`;
  };
  const repaintOdds = () => {
    const d = getDeck(deckId); const id = document.activeElement && document.activeElement.id; const act = document.activeElement && document.activeElement.dataset;
    $('#pt-odds', root).innerHTML = oddsHtml(d);
    const again = id ? document.getElementById(id) : act && act.act ? $(`[data-act="${act.act}"][data-val="${act.val}"]`, root) : null;
    again && !again.disabled && again.focus();
  };
  const repaintHand = () => {
    const d = getDeck(deckId); const a = document.activeElement;
    const sel = a && a.dataset && a.dataset.act ? `[data-act="${a.dataset.act}"]${a.dataset.id != null ? `[data-id="${a.dataset.id}"]` : ''}${a.dataset.val != null ? `[data-val="${a.dataset.val}"]` : ''}` : '';
    $('#pt-hand', root).innerHTML = handHtml(d);
    const again = sel ? $(sel, root) : null;
    again && !again.disabled && again.focus({ preventScroll: true });
  };
  root.addEventListener('change', (e) => {
    if (e.target.id === 'o-kind') { pt.kind = e.target.value; pt.value = null; pt.k = 1; repaintOdds(); }
    else if (e.target.id === 'o-val') { pt.value = e.target.value; pt.k = 1; repaintOdds(); }
  });
  reg.pt = {
    odds: repaintOdds, hand: repaintHand,
    newHand: () => { pt.game = newGame(getDeck(deckId), { first: pt.first }); pt.sig = sigOf(getDeck(deckId)); pt.marked = new Set(); repaintHand(); },
  };
  paint();
  return {
    // Deck edits repaint the odds but keep the hand you drew.
    refresh() { const d = getDeck(deckId); if (!d) return; if (!total(d.main) || !$('#pt-odds', root)) { paint(); return; } repaintOdds(); repaintHand(); },
    destroy() { reg.pt = null; },
  };
}

onAct('o-k', (el) => { pt.k = Math.max(1, pt.k + Number(el.dataset.val)); reg.pt && reg.pt.odds(); });
onAct('o-first', (el) => { pt.first = el.dataset.val === 'true'; if (pt.game && pt.game.turn === 0) pt.game = { ...pt.game, first: pt.first }; if (reg.pt) { reg.pt.odds(); reg.pt.hand(); } });
onAct('pt-new', () => reg.pt && reg.pt.newHand());
onAct('pt-mark', (el) => { const id = Number(el.dataset.id); pt.marked.has(id) ? pt.marked.delete(id) : pt.marked.add(id); reg.pt && reg.pt.hand(); });
onAct('pt-mull', () => { if (!pt.game) return; pt.game = mulligan(pt.game, [...pt.marked]); pt.marked = new Set(); reg.pt && reg.pt.hand(); });
onAct('pt-next', () => { if (!pt.game) return; pt.game = drawTurn(pt.game, Math.min(pt.took ?? 2, turnDraws(pt.game))); pt.marked = new Set(); reg.pt && reg.pt.hand(); });
onAct('pt-took', (el) => { pt.took = Number(el.dataset.val); reg.pt && reg.pt.hand(); });
