// Home (#/decks) and the mainframe wall (#/mainframes).
import { mainframes } from '../lib/cards.js';
import { FACTIONS } from '../lib/config.js';
import { $, esc, onAct } from '../ui/dom.js';
import { glyph, plusIcon } from '../ui/glyphs.js';
import { fvar, sectionBanner } from '../ui/card.js';
import { deckCard, mainframeTile, mfFactionOrder } from '../ui/parts.js';
import { state, newDeck } from '../store.js';
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
      : `<div class="empty-block"><h3>No decks yet</h3><p>Pick a mainframe below to start one with suggestions, or import a list your playgroup sent you.</p>
          <div class="row"><button class="btn primary" data-act="new-deck">New deck</button><button class="btn" data-act="open-import">Import a list</button></div></div>`;
    root.innerHTML = `
      <section class="hero">
        <div class="hero-in">
          <h1>Build the deck around its mainframe.</h1>
          <p>Pick a mainframe, add the cards its text asks for, check the rules, and send the list to your playgroup.</p>
          <div class="row"><button class="btn primary big" data-act="new-deck">New deck</button><button class="btn big" data-act="open-import">Import a list</button></div>
        </div>
        <div class="hero-trace" aria-label="Browse cards by faction"><span class="line" aria-hidden="true"></span>${heroNodes}</div>
      </section>
      <div class="page">
        ${sectionBanner('Your decks', { count: state.decks.length || null })}
        ${decks}
        ${sectionBanner('Start from a mainframe', { count: mainframes.length, right: `<a class="sec-link" href="${href.mainframes()}">See them all with full text</a>` })}
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
onAct('browse-faction', (el) => { presetFilter({ factions: [el.dataset.f] }); go(href.cards()); });
export { $, esc };
