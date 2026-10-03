// Mainframe page (#/mainframe/<id>): what this mainframe wants, grouped by role. EDHREC-like.
import { byId, titleCase } from '../lib/cards.js';
import { persistentFactionCounts, copiesOf, total } from '../lib/deck.js';
import { suggestForMainframe } from '../lib/roles.js';
import { $, esc, onAct, toast, plural, keepFocus } from '../ui/dom.js';
import { glyph, plusIcon, chevrons } from '../ui/glyphs.js';
import { rich, fvar, factionsStyle, edgeStyle, sectionBanner } from '../ui/card.js';
import { cardImageHtml, keepImages } from '../ui/cardimg.js';
import { stepper } from '../ui/tiles.js';
import { meterHtml, mfFactionOrder } from '../ui/parts.js';
import { persistentCount } from './helpers.js';
import { state, activeDeck, getDeck, newDeck, change, activate } from '../store.js';
import { go, href } from '../router.js';
import { reg } from './registry.js';
import { effective } from '../tagstore.js';
import { deckTagBoost } from '../lib/tags.js';
import { getPref, setPref } from '../store.js';

const PER = 8;
const open = new Set(); // sections shown in full, kept across visits
let current = null;

export function targetDeck(mfId) {
  const a = activeDeck();
  if (a && a.mainframe === mfId) return a;
  const same = state.decks.filter((d) => d.mainframe === mfId).pop();
  return same || null;
}

export function mountMainframe(root, id) {
  const mf = byId.get(id);
  if (!mf || mf.type !== 'Mainframe') { root.innerHTML = '<div class="page"><div class="empty-block"><h3>Mainframe not found</h3><p>Pick one from the list.</p><a class="btn" href="#/mainframes">All mainframes</a></div></div>'; return { refresh() {}, destroy() {} }; }
  current = mf;
  let sugg = suggestForMainframe(mf);
  const fs = mfFactionOrder(mf);
  const pool = persistentCount(fs);
  let booted = false;

  /** Suggestion tile: the card image, one short reason underneath, then add and how many you have. */
  const tile = (it, deck) => {
    const c = it.card;
    const n = deck ? copiesOf(deck, c.id) : 0;
    const nm = esc(titleCase(c.name));
    return `<article class="stile" data-id="${c.id}" style="${edgeStyle(c)}">
      <div class="itile">
        <a class="itile-open" href="${href.card(c.id)}" aria-label="${nm}, open details">${cardImageHtml(c, { size: 'tile' })}</a>
        ${n ? `<span class="qb" title="${n} in the deck"><span class="sr">${n} in deck: </span>&times;${n}</span>` : ''}
      </div>
      <p class="why-line" title="${esc(it.why.join(' '))}">${esc(it.why[0] || '')}</p>
      <div class="s-act">${n ? `<span class="sg-have">${n} in deck</span>` : '<span></span>'}<button class="btn small primary" data-act="sugg-add" data-id="${c.id}" aria-label="Add ${nm}">${plusIcon}Add</button></div>
    </article>`;
  };

  const paint = () => {
    const deck = targetDeck(mf.id);
    const eff = effective();
    const canPrefer = !!deck && eff.tags.length > 0;
    const prefer = canPrefer && getPref('preferTags', false);
    sugg = suggestForMainframe(mf, prefer ? { tagBoost: deckTagBoost(deck, eff) } : {});
    const counts = deck ? persistentFactionCounts(deck) : {};
    const deckBar = deck
      ? `<p class="deckline">Adding to <a href="${href.deck(deck.id)}">${esc(deck.name)}</a> (${plural(total(deck.main), 'card')}). <a href="${href.deck(deck.id)}">Open deck</a></p>`
      : `<p class="deckline">No deck uses ${esc(titleCase(mf.name))} yet. Adding a card starts one.</p>`;
    root.innerHTML = `
      <header class="mf-hero" style="${factionsStyle(fs)}">
        <div class="mf-hero-in">
          <div class="mf-id">
          <button class="zoom mf-img" data-act="zoom" data-id="${mf.id}" aria-label="Enlarge ${esc(titleCase(mf.name))}">${cardImageHtml(mf, { size: 'full', eager: true })}</button>
          <div class="mf-id-t">
          <p class="crumbs"><a href="${href.mainframes()}">Mainframes</a></p>
          <h1><span class="mf-glyphs">${fs.map((f) => `<span style="color:${fvar(f)}">${glyph(f, 40)}</span>`).join('')}</span>${esc(titleCase(mf.name))}</h1>
          ${mf.mainframe.lead ? `<p class="mf-lead">${rich(mf.mainframe.lead, false)}</p>` : ''}
          </div>
          <div class="row mf-actions"><button class="btn primary big" data-act="start-deck" data-id="${mf.id}">${deck ? 'Start another deck' : `Start a ${esc(titleCase(mf.name))} deck`}</button>${deck ? `<a class="btn big" href="${href.deck(deck.id)}">Open ${esc(deck.name)}</a>` : ''}</div>
          </div>
        </div>
        <div class="mf-hero-meter">
          <h2 class="plain">${deck ? 'Tiers in your deck' : 'Synergy tiers'}</h2>
          ${meterHtml(mf, counts, { boot: !booted })}
          <p class="note">${deck ? 'Counts persistent cards in the cyberdeck.' : `Persistent ${fs.join(' and ')} cards in the set: ${pool}. Characters, gear, protocols, environments and datashards count.`}</p>
        </div>
      </header>
      <div class="page">
        <p class="honest"><b>How suggestions work.</b> They come from card text: cards of this mainframe's factions, and cards that name each other. They are not play statistics, so treat them as a starting list and use your own judgement.</p>
        ${deckBar}
        ${canPrefer ? `<label class="sugg-tags"><input type="checkbox" id="m-tags"${prefer ? ' checked' : ''}> Prefer cards that share a tag with ${esc(deck.name)}</label>` : ''}
        <nav class="jump" aria-label="Sections">${sugg.groups.map((g) => `<button class="chip" data-act="jump" data-id="s-${g.id}">${esc(g.title)} <span class="n">${g.items.length}</span></button>`).join('')}</nav>
        ${sugg.groups.map((g) => {
          const all = open.has(g.id);
          const items = all ? g.items : g.items.slice(0, PER);
          return `<section aria-labelledby="h-${g.id}">
            ${sectionBanner(g.title, { id: `s-${g.id}`, count: g.items.length })}
            <p class="sec-note">${esc(g.hint)}</p>
            <div class="grid igrid sugg">${items.map((it) => tile(it, deck)).join('')}</div>
            ${g.items.length > PER ? `<button class="btn more" data-act="sec-more" data-id="${g.id}">${all ? `Show the top ${PER}` : `Show all ${g.items.length}`}</button>` : ''}
          </section>`;
        }).join('')}
      </div>`;
    booted = true;
  };
  root.addEventListener('change', (e) => { if (e.target.id === 'm-tags') { setPref('preferTags', e.target.checked); keepFocus(paint); } });
  paint();
  return { refresh: () => keepFocus(() => keepImages(root, paint)), destroy() { current = null; } };
}

onAct('sec-more', (el) => { const id = el.dataset.id; open.has(id) ? open.delete(id) : open.add(id); reg.view && reg.view.refresh(); });
onAct('jump', (el) => { const t = document.getElementById(el.dataset.id); if (t) t.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); });
onAct('start-deck', (el) => {
  const mf = byId.get(Number(el.dataset.id));
  const d = newDeck(`${titleCase(mf.name)} deck`, mf.id);
  go(href.deck(d.id));
});
onAct('sugg-add', (el) => {
  if (!current) return;
  let d = targetDeck(current.id);
  let started = false;
  if (!d) { d = newDeck(`${titleCase(current.name)} deck`, current.id); started = true; }
  else activate(d.id);
  const c = byId.get(Number(el.dataset.id));
  const r = change(d.id, 'main', c.id, 1);
  toast(r.message || (started ? `Started “${d.name}” and added ${titleCase(c.name)}` : `Added ${titleCase(c.name)} to ${d.name}`));
});
export { getDeck };
