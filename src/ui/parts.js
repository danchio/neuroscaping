// Shared UI parts: mainframe meter, faction mix, legality badge, mainframe tiles, deck cards.
import { byId, titleCase, FACTIONS } from '../lib/cards.js';
import { validate, deckStats, persistentFactionCounts, total } from '../lib/deck.js';
import { tierStatus } from '../lib/synergy.js';
import { LIMITS } from '../lib/config.js';
import { esc, plural } from './dom.js';
import { glyph, chevrons, checkIcon } from './glyphs.js';
import { fvar, factionsStyle, rich, needText, MODE } from './card.js';
import { href } from '../router.js';

export const mfFactionOrder = (mf) => {
  const order = [];
  for (const t of mf.mainframe.tiers) for (const f of Object.keys(t.needs)) if (!order.includes(f)) order.push(f);
  return order;
};

/** Segmented gauge per faction, then the tier list as banners. `counts` = persistent cards per faction. */
export function meterHtml(mf, counts, { boot = false, showTiers = true } = {}) {
  const tiers = tierStatus(mf, counts);
  const rows = mfFactionOrder(mf).map((f) => {
    const needs = mf.mainframe.tiers.map((t) => t.needs[f]).filter(Boolean);
    const have = counts[f] || 0;
    const scale = Math.max(Math.max(...needs) + 3, 6);
    const lit = Math.min(have, scale);
    const segs = Array.from({ length: scale }, (_, i) => `<i class="seg${i < lit ? ' on' : ''}${needs.includes(i + 1) ? ' tier' : ''}" style="--i:${i}"></i>`).join('');
    const labels = needs.map((n) => `<span class="tl" style="grid-column:${n}">${n}</span>`).join('');
    return `<div class="gauge" style="--c:${fvar(f)};--n:${scale}">
      <span class="g-lab">${glyph(f, 15)}${esc(f)}</span>
      <div class="g-track" role="img" aria-label="${have} persistent ${esc(f)} cards. Tiers unlock at ${needs.join(' and ')}.">${segs}</div>
      <b class="g-num">${have}</b>
      <div class="g-ticks">${labels}</div></div>`;
  }).join('');
  const list = showTiers ? `<ul class="tier-list">${tiers.map((s) => `<li class="tier${s.met ? ' met' : ''}">
      <span class="banner t-need"><span class="b-cost">${s.met ? checkIcon : '<b>&nbsp;</b>'}</span><span class="b-name">${esc(needText(s.tier.needs))}${chevrons}</span></span>
      <span class="t-text">${rich(s.tier.text, false)}${MODE[s.tier.mode] ? ` <span class="t-mode">(${MODE[s.tier.mode]})</span>` : ''}</span></li>`).join('')}</ul>` : '';
  return `<div class="meter${boot ? ' boot' : ''}">${rows}</div>${list}`;
}

/** Proportional bar of faction counts. */
export function mixBar(counts, neutral = 0) {
  const parts = FACTIONS.filter((f) => counts[f]).map((f) => ({ f, n: counts[f] }));
  const sum = parts.reduce((s, p) => s + p.n, 0) + neutral;
  if (!sum) return '<div class="mix empty" aria-hidden="true"></div>';
  const segs = parts.map((p) => `<i style="flex:${p.n};background:${fvar(p.f)}" title="${esc(p.f)}: ${p.n}"></i>`).join('') + (neutral ? `<i style="flex:${neutral};background:var(--trace-hi)" title="No faction: ${neutral}"></i>` : '');
  return `<div class="mix" aria-hidden="true">${segs}</div>`;
}

export function legalBadge(deck) {
  const v = validate(deck);
  return v.ok
    ? `<span class="legal ok">${checkIcon}Legal</span>`
    : `<span class="legal bad" title="${esc(v.issues.map((i) => i.text).join(' '))}">${plural(v.issues.length, 'issue')}</span>`;
}

const mfTiersChips = (mf) => {
  const tiers = mf.mainframe.tiers;
  const f = mfFactionOrder(mf);
  if (f.length === 1) return `<span class="thr">${tiers.map((t) => Object.values(t.needs)[0]).join(' / ')} ${esc(f[0])}</span>`;
  return `<span class="thr">${tiers.map((t) => Object.values(t.needs)[0]).join(' / ')} each ${f.map(esc).join(' + ')}</span>`;
};

/** A mainframe as an entry tile. */
export function mainframeTile(mf, { compact = false, decks = 0 } = {}) {
  const fs = mfFactionOrder(mf);
  return `<a class="mft${compact ? ' compact' : ''}" href="${href.mainframe(mf.id)}" style="${factionsStyle(fs)}"><span class="mft-edge"><span class="mft-in">
    <span class="mft-glyphs">${fs.map((f) => `<span style="color:${fvar(f)}">${glyph(f, compact ? 22 : 28)}</span>`).join('')}</span>
    <span class="mft-name">${esc(titleCase(mf.name))}</span>
    ${compact ? '' : `<span class="mft-lead">${mf.mainframe.lead ? rich(mf.mainframe.lead, false) + ' ' : ''}${rich(mf.mainframe.tiers[0].text, false)}</span>`}
    <span class="mft-foot">${mfTiersChips(mf)}${decks ? `<span class="mft-decks">${plural(decks, 'deck')}</span>` : ''}</span>
  </span></span></a>`;
}

export function deckCard(d, { active = false } = {}) {
  const mf = d.mainframe && byId.get(d.mainframe);
  const fs = mf ? mfFactionOrder(mf) : [];
  const st = deckStats(d);
  const mainCount = total(d.main);
  const withFaction = Object.entries(d.main).reduce((s, [id, n]) => s + (byId.get(Number(id))?.factions.length ? n : 0), 0);
  return `<a class="deck-card" href="${href.deck(d.id)}" style="${factionsStyle(fs)}"><span class="mft-edge"><span class="mft-in">
    <span class="dc-title"><span class="dc-name">${esc(d.name || 'Untitled deck')}</span>${active ? '<span class="dc-active">Last opened</span>' : ''}</span>
    <span class="dc-mf">${mf ? `${fs.map((f) => `<span style="color:${fvar(f)}">${glyph(f, 15)}</span>`).join('')}${esc(titleCase(mf.name))}` : '<span class="dim">No mainframe yet</span>'}</span>
    ${mixBar(st.factions, Math.max(0, mainCount - withFaction))}
    <span class="dc-foot"><span class="dc-count"><b>${mainCount}</b> of ${LIMITS.mainMin}+ cards${total(d.side) ? `, ${total(d.side)} in sideboard` : ''}</span>${legalBadge(d)}</span>
  </span></span></a>`;
}

export { persistentFactionCounts };
