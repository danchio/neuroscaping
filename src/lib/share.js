import { byId, byName, norm, titleCase } from './cards.js';
import { emptyDeck, validate, deckStats } from './deck.js';
import { persistentFactionCounts } from './deck.js';
import { tierStatus } from './synergy.js';
import { RULES_BRIEF } from './config.js';

const section = (zone) =>
  Object.entries(zone)
    .map(([id, n]) => ({ c: byId.get(Number(id)), n }))
    .filter((x) => x.c)
    .sort((a, b) => a.c.type.localeCompare(b.c.type) || (a.c.ram ?? 0) - (b.c.ram ?? 0) || a.c.name.localeCompare(b.c.name));

// ---- Plain text (what you paste into chat, a doc, or an issue) ----
export function exportText(deck) {
  const mf = deck.mainframe && byId.get(deck.mainframe);
  const smf = deck.sideMainframe && byId.get(deck.sideMainframe);
  const lines = [`Deck: ${deck.name}`, `Mainframe: ${mf ? titleCase(mf.name) : ''}`];
  for (const { c, n } of section(deck.main)) lines.push(`${n} ${titleCase(c.name)}`);
  const side = section(deck.side);
  if (side.length || smf) {
    lines.push('', 'Sideboard:');
    if (smf) lines.push(`Mainframe: ${titleCase(smf.name)}`);
    for (const { c, n } of side) lines.push(`${n} ${titleCase(c.name)}`);
  }
  return lines.join('\n') + '\n';
}

export function parseText(text) {
  const deck = emptyDeck('Imported deck');
  const unknown = [];
  let zone = 'main';
  for (let raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || line.startsWith('//')) continue;
    let m;
    if ((m = line.match(/^deck\s*:\s*(.+)$/i))) { deck.name = m[1].trim(); continue; }
    if (/^side(board)?\s*:?\s*$/i.test(line)) { zone = 'side'; continue; }
    if (/^(main|cyberdeck)\s*:?\s*$/i.test(line)) { zone = 'main'; continue; }
    if ((m = line.match(/^mainframe\s*:\s*(.*)$/i))) {
      const name = m[1].trim();
      if (!name) continue;
      const c = byName.get(norm(name));
      if (c && c.type === 'Mainframe') deck[zone === 'side' ? 'sideMainframe' : 'mainframe'] = c.id;
      else unknown.push(name);
      continue;
    }
    m = line.match(/^(\d+)\s*x?\s+(.+)$/i) || [null, '1', line];
    const n = Number(m[1]);
    const c = byName.get(norm(m[2]));
    if (!c) { unknown.push(m[2]); continue; }
    if (c.type === 'Mainframe') {
      if (!deck.mainframe) deck.mainframe = c.id; else deck.sideMainframe = c.id;
      continue;
    }
    deck[zone][c.id] = (deck[zone][c.id] || 0) + n;
  }
  return { deck, unknown };
}

// ---- Share links ----
const b64 = {
  enc: (s) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
  dec: (s) => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/')))),
};

export function encodeShare(deck) {
  const pack = (z) => Object.entries(z).map(([id, n]) => [Number(id), n]);
  return b64.enc(JSON.stringify({ v: 1, n: deck.name, m: deck.mainframe, sm: deck.sideMainframe, c: pack(deck.main), s: pack(deck.side), t: deck.notes || undefined }));
}

export function decodeShare(str) {
  const o = JSON.parse(b64.dec(str));
  const deck = emptyDeck(o.n || 'Shared deck');
  deck.mainframe = o.m ?? null;
  deck.sideMainframe = o.sm ?? null;
  deck.notes = o.t || '';
  for (const [id, n] of o.c || []) if (byId.has(id)) deck.main[id] = n;
  for (const [id, n] of o.s || []) if (byId.has(id)) deck.side[id] = n;
  return deck;
}

// ---- "Copy for AI" ----
export function aiPrompt(deck) {
  const v = validate(deck);
  const counts = persistentFactionCounts(deck);
  const mf = deck.mainframe && byId.get(deck.mainframe);
  const stats = deckStats(deck);
  const cardLine = ({ c, n }) => {
    const stat = c.type === 'Character' ? ` ${c.atk}/${c.def}` : '';
    const cost = c.ram != null ? ` (${c.ram} RAM)` : '';
    const fac = [...c.factions, ...c.tags].join('/');
    const abil = c.abilities ? ` Abilities: ${c.abilities.map((a) => `${titleCase(a.name)} (cost ${[a.ram != null ? a.ram + ' RAM' : '', a.run ? 'run' : ''].filter(Boolean).join(' + ') || 'free'})`).join('; ')}.` : '';
    return `- ${n}x ${titleCase(c.name)} [${c.type}${c.subtype ? ' ' + c.subtype : ''}${fac ? ', ' + fac : ''}]${cost}${stat}: ${c.text.join(' | ')}${abil}`;
  };
  const out = [
    'I am building a deck for the card game Neuroscape (Genesis set). Please help me improve it: find synergies, gaps, and weak cards, and suggest specific swaps from the Genesis set.',
    '',
    RULES_BRIEF,
    '',
    `Deck: ${deck.name}`,
  ];
  if (mf) {
    out.push(`Mainframe: ${titleCase(mf.name)} [${mf.factions.join('/')}]`);
    if (mf.mainframe.lead) out.push(`  Lead-in: ${mf.mainframe.lead}`);
    for (const s of tierStatus(mf, counts)) out.push(`  Needs ${s.progress.map((p) => `${p.need} ${p.faction}`).join(' + ')} (${s.tier.mode}): ${s.tier.text}  -> deck has ${s.progress.map((p) => `${p.have} ${p.faction}`).join(', ')}`);
  } else out.push('Mainframe: (not chosen yet)');
  out.push('', `Cyberdeck (${v.mainCount} cards):`, ...section(deck.main).map(cardLine));
  const side = section(deck.side);
  if (side.length) out.push('', `Sideboard (${v.sideCount}):`, ...side.map(cardLine));
  out.push('', `Persistent faction cards in deck: ${Object.entries(counts).map(([f, n]) => `${f} ${n}`).join(', ') || 'none'}`);
  out.push(`RAM curve (cost: copies): ${Object.entries(stats.curve).map(([k, n]) => `${k}${k == 8 ? '+' : ''}: ${n}`).join(', ') || 'n/a'}; average ${stats.avgRam.toFixed(1)}`);
  out.push(`Legality: ${v.ok ? 'legal' : v.issues.map((i) => i.text).join(' ')}`);
  if (deck.notes) out.push('', `My notes: ${deck.notes}`);
  out.push('', 'What I want help with: ');
  return out.join('\n');
}
