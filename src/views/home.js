// Home (#/decks) and the mainframe wall (#/mainframes).
import { mainframes } from '../lib/cards.js';
import { FACTIONS } from '../lib/config.js';
import { $, esc, onAct } from '../ui/dom.js';
import { glyph, plusIcon } from '../ui/glyphs.js';
import { fvar, sectionBanner } from '../ui/card.js';
import { deckCard, mainframeTile, mfFactionOrder } from '../ui/parts.js';
import { state, newDeck, addDeck } from '../store.js';
import { parseText } from '../lib/share.js';
import { toast } from '../ui/dom.js';
import { importDialog, mainframePicker } from '../ui/dialogs.js';
import { go, href } from '../router.js';
import { presetFilter } from './cards.js';

const decksUsing = (id) => state.decks.filter((d) => d.mainframe === id).length;

const heroNodes = FACTIONS.map((f, i) => `<button class="node" style="--c:${fvar(f)};--i:${i}" data-act="browse-faction" data-f="${f}" title="Browse ${f} cards" aria-label="Browse ${f} cards">${glyph(f, 20)}<span>${f}</span></button>`).join('');

export function mountHome(root) {
  const paint = () => {
    const ordered = [...state.decks].sort((a, b) => (b.id === state.activeId) - (a.id === state.activeId));
    const decks = ordered.length
      ? `<div class="deck-grid">${ordered.map((d) => deckCard(d, { active: d.id === state.activeId && ordered.length > 1 })).join('')}
          <button class="deck-new" data-act="new-deck"><span class="mft-edge"><span class="mft-in">${plusIcon}<b>New deck</b><span>Start empty, choose a mainframe next.</span></span></span></button></div>`
      : `<div class="first-run">
          <ol class="steps">
            <li><b>Pick a mainframe</b><span>Your mainframe decides which factions the deck wants and which effects it unlocks.</span></li>
            <li><b>Add the cards it asks for</b><span>Every suggestion says why it fits. Type a name, or “3 admin”, to add fast.</span></li>
            <li><b>Check it, test it, share it</b><span>Legality, synergy map, draw odds and a sample hand, then send the list to your playgroup.</span></li>
          </ol>
          <div class="row"><button class="btn primary" data-act="jump-mf">Pick a mainframe</button><button class="btn" data-act="load-example">Open an example deck</button><button class="btn ghost" data-act="open-import">Import a list</button></div>
        </div>`;
    root.innerHTML = `
      <section class="hero">
        <div class="hero-in">
          <h1>Build the deck around its mainframe.</h1>
          <p>Pick a mainframe, add the cards its text asks for, check the rules, and send the list to your playgroup.</p>
          <div class="row"><button class="btn primary big" data-act="new-deck">New deck</button><button class="btn big" data-act="open-import">Import a list</button></div>
        </div>
        <div class="hero-trace" role="group" aria-label="Browse cards by faction"><span class="trace-cap">Or browse every card by faction</span><span class="line" aria-hidden="true"></span>${heroNodes}</div>
      </section>
      <div class="page">
        ${sectionBanner('Your decks', { count: state.decks.length || null })}
        ${decks}
        ${sectionBanner('Start from a mainframe', { id: 'mf-start', count: mainframes.length, right: `<a class="sec-link" href="${href.mainframes()}">See them all with full text</a>` })}
        <div class="mf-grid">${mainframes.map((m) => mainframeTile(m, { compact: true, decks: decksUsing(m.id) })).join('')}</div>
      </div>`;
  };
  paint();
  return { refresh: paint, destroy() {} };
}

export function mountMainframes(root) {
  const single = mainframes.filter((m) => mfFactionOrder(m).length === 1);
  const dual = mainframes.filter((m) => mfFactionOrder(m).length > 1);
  const paint = () => {
    root.innerHTML = `<div class="page">
      <div class="page-head"><h1>Mainframes</h1><p>Each mainframe unlocks effects as you control more persistent cards of its factions. Pick one to see what it wants.</p></div>
      ${sectionBanner('One faction', { count: single.length })}
      <div class="mf-grid wide">${single.map((m) => mainframeTile(m, { decks: decksUsing(m.id) })).join('')}</div>
      ${sectionBanner('Two factions', { count: dual.length })}
      <p class="sec-note">These count each faction separately, so the deck needs both.</p>
      <div class="mf-grid wide">${dual.map((m) => mainframeTile(m, { decks: decksUsing(m.id) })).join('')}</div>
    </div>`;
  };
  paint();
  return { refresh: paint, destroy() {} };
}

onAct('new-deck', () => { const d = newDeck('New deck'); go(href.deck(d.id)); setTimeout(() => mainframePicker(d.id), 30); });
onAct('open-import', importDialog);
onAct('jump-mf', () => { const t = document.getElementById('mf-start'); if (t) t.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); });
onAct('load-example', async () => {
  try {
    const r = await fetch('decks/example-hacker.txt');
    if (!r.ok) throw new Error('missing');
    const { deck } = parseText(await r.text());
    addDeck(deck); go(href.deck(deck.id));
  } catch { toast('The example deck could not be loaded. Start from a mainframe below instead.'); }
});
onAct('browse-faction', (el) => { presetFilter({ factions: [el.dataset.f] }); go(href.cards()); });
export { $, esc };
