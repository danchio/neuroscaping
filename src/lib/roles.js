// Role classification and suggestion building. Pure logic, no DOM.
// Roles come from rules-text patterns. They are a rough guide, not a verdict on card quality.
import { cards, byId, titleCase } from './cards.js';
import { reasons, score, isPersistent, tierStatus } from './synergy.js';
import { persistentFactionCounts } from './deck.js';

const plain = (c) => (c.mainframe ? [c.mainframe.lead, ...c.mainframe.tiers.map((t) => t.text)] : c.text).join(' ');
const strip = (s) => s.replace(/\([^)]*\)/g, ' '); // reminder text in brackets of parentheses is noise

const TESTS = {
  draw: /\bdraw (\d+|X|a|that many)\b|\bINDEX\b|search your cyberdeck|into your hand|put .* from your (recycle bin|cache) into your hand/i,
  ram: /install (\d+|X|that many)? ?RAM|RAM (comes|come) into play|refresh(ed)? (all )?(of )?(your )?RAM|destroy .* RAM you control|into your RAM bank/i,
  // Clears the opponent's board: destroys characters, programs, gear and the like, or damages characters.
  removal: /\bdestroy (target|all|each|up to|attacking|blocking)[^.]*\b(characters?|programs?|gear|cyberware|weapons?|tether|environments?|datashard|trojan)\b|\bdamage to (?:(?:another|all|each|every|any|up to \d+|target|other|\d+)\s+)+characters?\b/i,
  // Hits a mainframe or bioframe directly.
  damage: /\bdeals? (\d+|X|that much|double)[^.]*damage to (any target|target player|target opponent|each opponent|each player|all players|them|him|her|this player|that player|the defending player|that character's controller)/i,
  // Makes the opponent's turn worse without clearing anything: discard, can't block, RAM and recycle bin attacks.
  disruption: /\bdiscard\b|\bcounter target\b|can't (block|attack)|\bdestroy (target|all|each)[^.]*\bRAM\b|\bpurge (target|all|each)[^.]*recycle bins?/i,
  protect: /\bprevent\b|immune|\bARMOR\b|\bCLOAKED\b|\bMIRAGE\b/i,
};

export const roleTags = (c) => {
  const t = strip(plain(c));
  const out = new Set();
  for (const [k, re] of Object.entries(TESTS)) if (re.test(t)) out.add(k);
  if (c.type === 'Character' && ((c.ram ?? 0) >= 5 || (c.atk ?? 0) >= 5 || /OVERRUN|damage to target player|double/i.test(t))) out.add('finisher');
  return out;
};

/** The sections of a mainframe page, in display order. `claim` runs in priority order for de-duplication. */
export const SECTIONS = [
  { id: 'characters', title: 'Top characters', hint: 'Bodies that count toward faction synergy and fit the plan.' },
  { id: 'draw', title: 'Draw and search', hint: 'Cards that find more cards.' },
  { id: 'ram', title: 'RAM and ramp', hint: 'Cards that install or refresh RAM.' },
  { id: 'removal', title: 'Removal', hint: 'Destroys or damages characters, programs and gear.' },
  { id: 'damage', title: 'Direct damage', hint: 'Hits the mainframe or bioframe without needing an attack to connect.' },
  { id: 'disruption', title: 'Disruption', hint: 'Discard, cards that stop blocking or attacking, and attacks on RAM or recycle bins.' },
  { id: 'finisher', title: 'Finishers', hint: 'Expensive or explosive cards that end games.' },
  { id: 'gear', title: 'Gear', hint: 'Cyberware, weapons and tethers.' },
  { id: 'tricks', title: 'Tricks', hint: 'Swift programs and one-shot scripts, drugs and tarot.' },
  { id: 'engines', title: 'Engines', hint: 'Protocols, environments and datashards that stay in play.' },
];

const CLAIM_ORDER = ['draw', 'ram', 'finisher', 'removal', 'damage', 'disruption', 'gear', 'engines', 'tricks', 'characters'];

export function sectionOf(c) {
  if (c.type === 'Mainframe') return null;
  const r = roleTags(c);
  const t = strip(plain(c));
  for (const id of CLAIM_ORDER) {
    switch (id) {
      case 'draw': if (r.has('draw')) return id; break;
      case 'ram': if (r.has('ram')) return id; break;
      case 'finisher': if (r.has('finisher')) return id; break;
      case 'removal': case 'damage': case 'disruption': if (r.has(id)) return id; break;
      case 'gear': if (c.type === 'Gear') return id; break;
      case 'engines': if (c.type === 'Program' && isPersistent(c)) return id; break;
      case 'tricks': if (c.type === 'Program') return id; break;
      case 'characters': if (c.type === 'Character') return id; break;
    }
  }
  return t ? 'tricks' : 'characters';
}

export const SECTION_LABEL = Object.fromEntries(SECTIONS.map((s) => [s.id, s.title]));

/** Readable "works with" lines between an anchor card and a candidate, both directions. */
export function worksWith(anchor, c) {
  const labels = [];
  for (const r of reasons(anchor, c)) labels.push(r.kind === 'name' ? 'asked for by name' : r.label);
  for (const r of reasons(c, anchor)) if (!labels.includes(r.label)) labels.push(r.kind === 'name' ? 'names it' : r.label);
  return labels;
}

const pushWhy = (why, text) => { if (!why.includes(text)) why.push(text); };

/** Ranked suggestions for one mainframe, grouped into sections. */
export function suggestForMainframe(mf, { tagBoost } = {}) {
  const mfFactions = new Set(Object.keys(Object.assign({}, ...mf.mainframe.tiers.map((t) => t.needs))));
  const out = [];
  for (const c of cards) {
    if (c.type === 'Mainframe') continue;
    const link = [...reasons(mf, c), ...reasons(c, mf)];
    const inFaction = c.factions.some((f) => mfFactions.has(f));
    const counts = inFaction && isPersistent(c);
    let s = score(link);
    if (inFaction) s += 2;
    if (counts) s += 1.5;
    const tb = tagBoost && tagBoost.get(c.id);
    if (tb) s += tb.score;
    if (s <= 0) continue;
    const why = [];
    if (tb) pushWhy(why, `Shares your tag ${tb.names.join(', ')} with cards in your deck`);
    if (counts) pushWhy(why, `Counts toward ${c.factions.filter((f) => mfFactions.has(f)).join(' and ')} synergy`);
    else if (inFaction) pushWhy(why, `${c.factions.filter((f) => mfFactions.has(f)).join(' and ')} card, leaves play so it adds no synergy`);
    const ww = worksWith(mf, c).filter((l) => !mfFactions.has(l));
    if (ww.length) pushWhy(why, `Works with ${titleCase(mf.name)} (${ww.join(', ')})`);
    out.push({ card: c, score: s, why, section: sectionOf(c) });
  }
  out.sort((a, b) => b.score - a.score || a.card.id - b.card.id);
  const groups = SECTIONS.map((sec) => ({ ...sec, items: out.filter((x) => x.section === sec.id) }));
  return { groups: groups.filter((g) => g.items.length), total: out.length, factions: [...mfFactions] };
}

/** Suggestions for a deck: card-text synergy with what is already in it, plus tier progress. */
export function suggestForDeck(deck, limit = 24, { tagBoost } = {}) {
  const mf = deck.mainframe && byId.get(deck.mainframe);
  const inDeck = Object.keys(deck.main).map(Number).map((id) => byId.get(id)).filter(Boolean);
  if (!mf && !inDeck.length) return [];
  const anchors = mf ? [mf, ...inDeck] : inDeck;
  const counts = persistentFactionCounts(deck);
  const need = {}; // faction -> { have, need } for the next unmet tier
  if (mf) {
    const next = tierStatus(mf, counts).find((t) => !t.met);
    if (next) for (const p of next.progress) if (p.have < p.need) need[p.faction] = p;
  }
  const out = [];
  for (const c of cards) {
    if (c.type === 'Mainframe') continue;
    if (c.copyLimit > 0 && ((deck.main[c.id] || 0) + (deck.side[c.id] || 0)) >= c.copyLimit) continue;
    let s = 0;
    const partners = [];
    for (const a of anchors) {
      const v = score(reasons(a, c)) + score(reasons(c, a));
      if (v) { s += a === mf ? v * 1.5 : v; if (a !== mf && !partners.includes(a)) partners.push(a); }
    }
    const why = [];
    if (isPersistent(c)) {
      const f = c.factions.find((x) => need[x]);
      if (f) { s += 2; pushWhy(why, `Counts toward ${f} synergy (${need[f].have} of ${need[f].need} for the next tier)`); }
    }
    const names = [];
    if (mf && score(reasons(mf, c)) + score(reasons(c, mf)) > 0) names.push(titleCase(mf.name));
    names.push(...partners.sort((a, b) => (deck.main[b.id] || 0) - (deck.main[a.id] || 0)).map((a) => titleCase(a.name)));
    if (names.length) pushWhy(why, `Works with ${names.slice(0, 3).join('; ')}${names.length > 3 ? ` and ${names.length - 3} more` : ''}`);
    const tb = tagBoost && tagBoost.get(c.id);
    if (tb) { s += tb.score; pushWhy(why, `Shares your tag ${tb.names.join(', ')} with cards in this deck`); }
    if (s > 0) out.push({ card: c, score: s, why, section: sectionOf(c) });
  }
  return out.sort((a, b) => b.score - a.score || a.card.id - b.card.id).slice(0, limit);
}
