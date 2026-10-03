// Card rendering: the notched frame, ability banners, rich rules text.
import { byName, norm, titleCase, FACTIONS, TAGS } from '../lib/cards.js';
import { esc } from './dom.js';
import { glyph, runIcon, chevrons } from './glyphs.js';
import { href } from '../router.js';
import { costLabel, costPhrase } from '../lib/abilities.js';

export const fvar = (f) => `var(--f-${f.toLowerCase()})`;
export const edgeStyle = (c) => {
  const [a, b] = c.factions;
  return `--a:${a ? fvar(a) : 'var(--trace-hi)'};--b:${b ? fvar(b) : a ? fvar(a) : 'var(--trace-hi)'}`;
};
export const factionsStyle = (fs) => `--a:${fs[0] ? fvar(fs[0]) : 'var(--trace-hi)'};--b:${fs[1] ? fvar(fs[1]) : fs[0] ? fvar(fs[0]) : 'var(--trace-hi)'}`;

const diamond = '<svg class="dmg" viewBox="0 0 10 10" width="9" height="9" aria-hidden="true"><path d="M5 0l5 5-5 5-5-5z" fill="currentColor"/></svg>';
const disc = '<svg class="dmg" viewBox="0 0 10 10" width="9" height="9" aria-hidden="true"><circle cx="5" cy="5" r="5" fill="currentColor"/></svg>';

function refHtml(x, linkCards) {
  const t = x.trim();
  if (t === 'Mainframe') return `<span class="ref mfd">${diamond}Mainframe</span>`;
  if (t === 'Bioframe') return `<span class="ref bfd">${disc}Bioframe</span>`;
  if (FACTIONS.includes(t)) return `<span class="ref fac" style="--c:${fvar(t)}">${glyph(t, 12)}${esc(t)}</span>`;
  if (TAGS.includes(t)) return `<span class="ref tagref">${esc(t)}</span>`;
  const c = byName.get(norm(t));
  if (c) return linkCards ? `<a class="ref cardref" href="${href.card(c.id)}">${esc(t)}</a>` : `<span class="ref cardref">${esc(t)}</span>`;
  return esc(`[${x}]`);
}

/** Rules text with [Brackets] turned into faction chips, damage markers and card links. Reminder text in (parentheses) is quieter. */
export function rich(raw, linkCards = true) {
  let out = '', last = 0, depth = 0;
  for (const m of raw.matchAll(/\[([^\[\]]+)\]|[()]/g)) {
    out += esc(raw.slice(last, m.index));
    last = m.index + m[0].length;
    if (m[1] != null) out += refHtml(m[1], linkCards);
    else if (m[0] === '(') { out += '<span class="reminder">('; depth++; }
    else if (depth > 0) { out += ')</span>'; depth--; }
    else out += ')';
  }
  out += esc(raw.slice(last));
  return out + '</span>'.repeat(depth);
}

export const needText = (needs) => Object.entries(needs).map(([f, n]) => `${n} ${f}`).join(' + ');
export const MODE = { base: '', instead: 'replaces the tier before', adds: 'adds to the tier before', or: 'or the tier before' };


/** The chevron banner: [RAM box] NAME >>> */
export function banner(a, { text = false } = {}) {
  const b = `<span class="banner" title="${esc(titleCase(a.name))}: ${esc(costPhrase(a))}"><span class="b-cost"><b>${a.ram != null ? a.ram : 0}</b>${a.run ? runIcon : ''}</span><span class="b-name">${esc(a.name)}${chevrons}</span></span>`;
  return text ? `<span class="ab">${b}<span class="ab-cost">${esc(costLabel(a))}</span></span>` : b;
}

export const statPlate = (c) => {
  if (c.type !== 'Character') return '';
  const kind = c.frame === 'Bioframe' ? 'bf' : c.frame === 'Mainframe' ? 'mf' : 'none';
  const label = c.frame ? `${c.frame} attack` : 'No attack frame';
  return `<span class="stat ${kind}" role="img" aria-label="${c.atk} attack, ${c.def} defense, ${esc(label)}" title="${esc(label)}">${kind === 'mf' ? diamond : kind === 'bf' ? disc : ''}<b>${c.atk}</b><i>/</i><b>${c.def}</b></span>`;
};

export const costBox = (c) => (c.ram != null ? `<span class="cost" title="RAM cost ${c.ram}"><span class="sr">RAM </span>${c.ram}</span>` : '<span class="cost none" title="No RAM cost">&ndash;</span>');
export const glyphRow = (c, size = 15) => `<span class="glyphs">${c.factions.map((f) => `<span style="color:${fvar(f)}" title="${esc(f)}">${glyph(f, size)}</span>`).join('')}</span>`;

export function typeLine(c) {
  const bits = [esc(c.type) + (c.subtype ? ` ${esc(c.subtype)}` : ''), ...c.factions.map((f) => `<span class="ft" style="--c:${fvar(f)}">${esc(f)}</span>`), ...c.tags.map((t) => `<span class="tg">${esc(t)}</span>`)];
  if (c.iconic) bits.push('<span class="iconic">Iconic</span>');
  return bits.join(' ');
}

export function rulesHtml(c, { linkCards = true } = {}) {
  if (c.mainframe) {
    const lead = c.mainframe.lead ? `<p class="lead">${rich(c.mainframe.lead, linkCards)}</p>` : '';
    const tiers = c.mainframe.tiers.map((t) => `<p class="tierline"><b>${esc(needText(t.needs))}</b> ${rich(t.text, linkCards)}</p>`).join('');
    return lead + tiers;
  }
  return c.text.map((t) => `<p>${rich(t, linkCards)}</p>`).join('');
}

/**
 * The card frame. mode: 'full' (preview, drawer), 'tile' (browser grid; clamps text).
 * `foot` is extra html placed under the frame in tile mode.
 */
export function cardFrame(c, { mode = 'tile', foot = '', cls = '', link = true } = {}) {
  const head = `<header class="cf-head">${costBox(c)}<h3 class="cf-name">${link && mode === 'tile' ? `<a href="${href.card(c.id)}" class="cf-link">${esc(c.name)}</a>` : esc(c.name)}</h3>${glyphRow(c)}</header>`;
  const abs = c.abilities ? `<div class="cf-abs">${c.abilities.map((a) => banner(a, { text: mode === 'full' })).join('')}</div>` : '';
  const meta = `<footer class="cf-foot"><span class="rar">${esc(c.rarity)}${c.copyLimit ? `, max ${c.copyLimit}` : ', no limit'}</span>${statPlate(c)}</footer>`;
  return `<article class="cf ${mode} ${cls}" style="${edgeStyle(c)}" data-id="${c.id}"><div class="cf-edge"><div class="cf-in">
    ${head}<p class="cf-type">${typeLine(c)}</p><div class="cf-rules">${rulesHtml(c, { linkCards: mode === 'full' })}</div>${abs}${meta}${foot}
  </div></div></article>`;
}

/** Section heading as a chevron banner. */
export const sectionBanner = (title, { count, id = '', right = '' } = {}) =>
  `<div class="sec-head"${id ? ` id="${id}"` : ''}><h2 class="sec-banner"><span>${esc(title)}</span>${chevrons}</h2>${count != null ? `<span class="sec-count">${count}</span>` : ''}<span class="sec-rule"></span>${right}</div>`;
