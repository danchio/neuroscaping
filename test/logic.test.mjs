import test from 'node:test';
import assert from 'node:assert/strict';
import { cards, byName, norm, mainframes } from '../src/lib/cards.js';
import { emptyDeck, changeCount, setMainframe, validate, persistentFactionCounts } from '../src/lib/deck.js';
import { lens, tierStatus, rankMainframes, suggest } from '../src/lib/synergy.js';
import { exportText, parseText, encodeShare, decodeShare, aiPrompt } from '../src/lib/share.js';
import { buildCards, parseCsv } from '../scripts/build-data.mjs';

const card = (n) => byName.get(norm(n));

test('data shape', () => {
  assert.equal(cards.length, 255);
  assert.equal(mainframes.length, 20);
  assert.ok(mainframes.every((m) => m.mainframe && m.mainframe.tiers.length >= 2));
  assert.equal(new Set(cards.map((c) => norm(c.name))).size, 255, 'names unique after normalising');
});

test('csv parser handles quotes and BOM', () => {
  assert.deepEqual(parseCsv('﻿a,b\n1,"x, ""y"""\n'), [['a', 'b'], ['1', 'x, "y"']]);
});

test('copy limit is enforced across main and side', () => {
  let d = emptyDeck();
  const admin = card('Admin');
  for (let i = 0; i < 6; i++) d = changeCount(d, 'main', admin.id, 1);
  assert.equal(d.main[admin.id], 4);
  d = changeCount(d, 'side', admin.id, 1);
  assert.equal(d.side[admin.id], undefined);
  d = changeCount(d, 'main', admin.id, -1);
  d = changeCount(d, 'side', admin.id, 1);
  assert.equal(d.side[admin.id], 1);
});

test('nanobot swarm has no copy limit', () => {
  const sw = card('Nanobot Swarm');
  assert.equal(sw.copyLimit, 0);
  let d = emptyDeck();
  for (let i = 0; i < 10; i++) d = changeCount(d, 'main', sw.id, 1);
  assert.equal(d.main[sw.id], 10);
});

test('validation', () => {
  let d = emptyDeck();
  let v = validate(d);
  assert.ok(!v.ok);
  assert.ok(v.issues.some((i) => /mainframe/i.test(i.text)));
  d = setMainframe(d, mainframes[0].id);
  const pool = cards.filter((c) => c.type !== 'Mainframe');
  for (const c of pool.slice(0, 30)) for (let i = 0; i < 2; i++) d = changeCount(d, 'main', c.id, 1);
  v = validate(d);
  assert.ok(v.ok, JSON.stringify(v.issues));
  d = { ...d, main: { ...d.main, [card('Admin').id]: 9 } };
  assert.ok(validate(d).issues.some((i) => /limit/.test(i.text)));
});

test('mainframe tiers', () => {
  const fs = card('Firestarter');
  const s = tierStatus(fs, { Hacker: 3 });
  assert.deepEqual(s.map((x) => x.met), [true, false]);
  const ranked = rankMainframes({ Hacker: 5 });
  assert.equal(ranked[0].met, 2);
});

test('lens finds faction and name links', () => {
  const hex = card('HEX, CODEMANCER');
  const l = lens(hex);
  assert.ok(l.worksWith.some((w) => w.card.factions.includes('Hacker')));
  assert.ok(l.enabledBy.some((w) => w.card.type === 'Mainframe' && w.card.name === 'FIRESTARTER'));
});

test('persistent counting and suggestions', () => {
  let d = emptyDeck();
  d = changeCount(d, 'main', card('Admin').id, 4);
  assert.equal(persistentFactionCounts(d).Hacker, 4);
  d = setMainframe(d, card('Firestarter').id);
  assert.ok(suggest(d).length > 0);
});

test('text export / import round trip', () => {
  let d = emptyDeck('Round trip');
  d = setMainframe(d, card('Firestarter').id);
  d = changeCount(d, 'main', card('Admin').id, 3);
  d = changeCount(d, 'main', card('Coder').id, 2);
  d = changeCount(d, 'side', card('Admin').id, 1);
  d = setMainframe(d, card('Coyote').id, 'sideMainframe');
  const { deck, unknown } = parseText(exportText(d));
  assert.deepEqual(unknown, []);
  for (const k of ['name', 'mainframe', 'sideMainframe', 'main', 'side']) assert.deepEqual(deck[k], d[k], k);
});

test('import reports unknown cards', () => {
  const { unknown } = parseText('2 Admin\n3 Not A Card');
  assert.deepEqual(unknown, ['Not A Card']);
});

test('share link round trip (unicode name)', () => {
  let d = emptyDeck('Dëck ✦');
  d = setMainframe(d, card('Aethernet').id);
  d = changeCount(d, 'main', card('Admin').id, 4);
  const back = decodeShare(encodeShare(d));
  assert.equal(back.name, d.name);
  assert.deepEqual(back.main, d.main);
  assert.equal(back.mainframe, d.mainframe);
});

test('AI prompt mentions deck, tiers and legality', () => {
  let d = emptyDeck('P');
  d = setMainframe(d, card('Firestarter').id);
  d = changeCount(d, 'main', card('Admin').id, 4);
  const p = aiPrompt(d);
  assert.match(p, /Firestarter/);
  assert.match(p, /4x Admin/);
  assert.match(p, /Legality:/);
});

test('ability costs are attached from card images', () => {
  const adm = card('Admin');
  assert.deepEqual(adm.abilities, [{ name: 'UPGRADE', ram: 2, run: true }]);
  const hex = card('HEX, CODEMANCER');
  assert.equal(hex.abilities[0].ram, 2);
  assert.ok(card('Rubber Ducky').abilities[0].name === 'ACTIVATE');
  assert.match(aiPrompt({ ...emptyDeck('x'), main: { [adm.id]: 4 } }), /Upgrade \(cost: run 2 RAM and run this character\)/);
});

// ---- redesign: roles, suggestions, quick add ----
import { sectionOf, suggestForMainframe, suggestForDeck, roleTags } from '../src/lib/roles.js';
import { parseQuick, searchCards } from '../src/lib/search.js';

test('quick-add syntax', () => {
  assert.deepEqual(parseQuick('3 admin'), { qty: 3, query: 'admin' });
  assert.deepEqual(parseQuick('2x Coder'), { qty: 2, query: 'Coder' });
  assert.deepEqual(parseQuick('admin'), { qty: 1, query: 'admin' });
});

test('name search ranks exact and prefix first, tolerates typos in order', () => {
  assert.equal(searchCards('admin')[0].name, 'ADMIN');
  assert.ok(searchCards('cod').slice(0, 3).some((c) => c.name === 'CODER'));
  assert.ok(searchCards('codr').some((c) => c.name === 'CODER'));
  assert.deepEqual(searchCards(''), []);
});

test('every non-mainframe card lands in exactly one section; mainframes in none', () => {
  for (const c of cards) {
    if (c.type === 'Mainframe') assert.equal(sectionOf(c), null);
    else assert.ok(sectionOf(c), c.name);
  }
  assert.ok(roleTags(card('Coder')).has('draw'));
});

test('mainframe suggestions are grouped, ranked and explain why', () => {
  const mf = mainframes.find((m) => m.name === 'FIRESTARTER');
  const s = suggestForMainframe(mf);
  assert.ok(s.groups.length >= 4);
  const ids = s.groups.flatMap((g) => g.items.map((i) => i.card.id));
  assert.equal(new Set(ids).size, ids.length, 'a card appears once');
  assert.ok(s.groups.every((g) => g.items.every((i) => i.why.length > 0)));
  assert.ok(ids.includes(card('Admin').id));
});

test('deck suggestions skip maxed cards and credit tier progress', () => {
  const mf = mainframes.find((m) => m.name === 'FIRESTARTER');
  let d = setMainframe(emptyDeck(), mf.id);
  for (let i = 0; i < 4; i++) d = changeCount(d, 'main', card('Admin').id, 1);
  const s = suggestForDeck(d, 50);
  assert.ok(!s.some((x) => x.card.name === 'ADMIN'), 'maxed card is not suggested');
  assert.ok(s.length > 5 && s.every((x) => x.why.length));
  assert.deepEqual(suggestForDeck(emptyDeck()), []);
});

import { costPhrase, costLabel } from '../src/lib/abilities.js';
import { RULES_BRIEF } from '../src/lib/config.js';

test('ability cost wording', () => {
  assert.equal(costPhrase({ ram: 2, run: true }), 'run 2 RAM and run this character');
  assert.equal(costPhrase({ ram: 2, run: false }), 'run 2 RAM');
  assert.equal(costPhrase({ ram: null, run: true }), 'run this character');
  assert.equal(costPhrase({ ram: null, run: false }), 'no cost');
  assert.equal(costLabel({ ram: 1, run: false }), 'Run 1 RAM');
  assert.match(aiPrompt({ ...emptyDeck('x'), main: { [card('Coder').id]: 4 } }), /Data Scrape \(cost: run 2 RAM\)/);
  assert.doesNotMatch(aiPrompt({ ...emptyDeck('x'), main: { [card('Admin').id]: 1 } }), /2 RAM \+ run/);
});

test('AI rules brief carries the verified rules', () => {
  assert.match(RULES_BRIEF, /RAM deck: a separate deck of exactly 25 RAM cards/);
  assert.match(RULES_BRIEF, /Iconic cards: only one can be controlled at a time/);
  assert.match(RULES_BRIEF, /up to 4/);
  assert.match(RULES_BRIEF, /no upgrade mechanic/i);
  assert.match(RULES_BRIEF, /Opening hand is 5/);
  assert.match(RULES_BRIEF, /INITIALIZE/);
  assert.match(aiPrompt(emptyDeck('x')), /RAM deck/);
});

// ---- synergy graph ----
import { deckGraph, viewGraph, partnersOf, layoutGraph, STRENGTHS, strengthMin, nodeRadius } from '../src/lib/graph.js';

const bigDeck = () => {
  let d = setMainframe(emptyDeck('Big'), card('Firestarter').id);
  const pool = cards.filter((c) => c.type !== 'Mainframe' && (c.factions.includes('Hacker') || c.factions.includes('Mystic')));
  for (const c of pool.slice(0, 50)) d = changeCount(d, 'main', c.id, 1 + (c.id % 3));
  return d;
};

test('graph: edges are symmetric pairs with positive weight, and filter by strength', () => {
  const g = deckGraph(bigDeck());
  assert.equal(g.nodes.length, 50);
  assert.ok(g.edges.length > 50);
  assert.ok(g.edges.every((e) => e.a < e.b && e.weight > 0));
  const all = viewGraph(g, strengthMin('all'));
  const strong = viewGraph(g, strengthMin('strong'));
  const named = viewGraph(g, strengthMin('named'));
  assert.ok(all.edges.length > strong.edges.length && strong.edges.length >= named.edges.length);
  assert.ok(strong.edges.length < 150, 'strong view stays readable for 50 cards');
  assert.deepEqual(STRENGTHS.map((s) => s.min), [3, 2, 1]);
});

test('graph: ranking, loose cards and partners agree', () => {
  const g = deckGraph(bigDeck());
  const v = viewGraph(g, 2);
  const w = (n) => v.deg.get(n.id).weight;
  for (let i = 1; i < v.rank.length; i++) assert.ok(w(v.rank[i - 1]) >= w(v.rank[i]));
  for (const o of v.orphans) assert.equal(v.deg.get(o.id).count, 0);
  const top = v.rank[0];
  const partners = partnersOf(g, top.id, 2);
  assert.equal(partners.length, v.deg.get(top.id).count);
  assert.ok(partners.every((p) => p.why.length > 0 && p.weight >= 2));
});

test('graph: a card with no links to the others is loose', () => {
  const pool = cards.filter((c) => c.type !== 'Mainframe');
  let pair = null;
  outer: for (const a of pool) for (const b of pool) if (a.id < b.id && !deckGraph({ main: { [a.id]: 1, [b.id]: 1 } }).edges.length) { pair = [a, b]; break outer; }
  assert.ok(pair, 'the set has unlinked pairs');
  const g = deckGraph({ main: { [pair[0].id]: 1, [pair[1].id]: 1 } });
  const v = viewGraph(g, 1);
  assert.equal(v.orphans.length, 2);
  assert.deepEqual(viewGraph(deckGraph(emptyDeck()), 1).rank, []);
});

test('graph layout: deterministic, nothing overlaps, clusters by primary faction', () => {
  const g = deckGraph(bigDeck());
  const v = viewGraph(g, 2);
  const a = layoutGraph(g, v.deg), b = layoutGraph(g, v.deg);
  assert.deepEqual([...a.pos.entries()], [...b.pos.entries()]);
  const ps = [...a.pos.values()];
  for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) assert.ok(Math.hypot(ps[i].x - ps[j].x, ps[i].y - ps[j].y) >= ps[i].r + ps[j].r, `nodes ${i} and ${j} overlap`);
  assert.equal(a.clusters.map((c) => c.faction).sort().join(), [...new Set(g.nodes.map((n) => n.card.factions[0] || 'None'))].sort().join());
  const [x, y, w, h] = a.viewBox;
  for (const p of ps) assert.ok(p.x - p.r >= x && p.x + p.r <= x + w && p.y - p.r >= y && p.y + p.r <= y + h);
  assert.ok(nodeRadius(4) > nodeRadius(1));
});

// ---- custom tags and backups ----
import { TAG_COLORS, emptyTags, normalizeTags, addTag, editTag, removeTag, setCardTag, mergeLayers, tagsOf, usage, deckTagBoost, groupByTag, hasAnyTag, deckTagCounts } from '../src/lib/tags.js';
import { buildBackup, parseBackup, mergeBackup } from '../src/lib/backup.js';

test('tags: add, dedupe by name, rename, recolour, remove', () => {
  let d = emptyTags();
  let r = addTag(d, '  Draw   engine ', TAG_COLORS[0].hex); d = r.data;
  assert.deepEqual(d.tags, [{ id: 'draw-engine', name: 'Draw engine', color: TAG_COLORS[0].hex }]);
  assert.equal(addTag(d, 'draw ENGINE').tag.id, 'draw-engine');
  assert.equal(addTag(d, 'draw ENGINE').data, d, 'no duplicate created');
  assert.equal(addTag(d, '   ').tag, null);
  d = addTag(d, 'ramp').data;
  d = editTag(d, 'ramp', { name: 'Ramp up', color: 'not-a-colour' });
  assert.deepEqual(d.tags[1], { id: 'ramp', name: 'Ramp up' });
  d = setCardTag(d, card('Admin').id, 'ramp', true);
  d = setCardTag(d, card('Admin').id, 'ramp', true);
  assert.deepEqual(d.cards[card('Admin').id], ['ramp']);
  d = removeTag(d, 'ramp');
  assert.deepEqual(d.cards, {});
  assert.equal(addTag(addTag(emptyTags(), 'a b').data, 'a-b').tag.id, 'a-b-2', 'ids stay unique when names differ but slug the same');
});

test('tags: normalize drops junk, unknown cards and unknown tag ids', () => {
  const n = normalizeTags({ tags: [{ id: 'x', name: 'X' }, { name: '' }, { id: 'x', name: 'Dupe' }, 7], cards: { [card('Admin').id]: ['x', 'ghost'], 99999: ['x'], [card('Coder').id]: 'x' } });
  assert.deepEqual(n.tags, [{ id: 'x', name: 'X' }]);
  assert.deepEqual(n.cards, { [card('Admin').id]: ['x'] });
  assert.deepEqual(normalizeTags({ tags: [], cards: { [card('Admin').id]: ['from-repo', 'Bad Id!'] } }, { lenient: true }).cards, { [card('Admin').id]: ['from-repo'] }, 'lenient keeps ids defined elsewhere');
  assert.deepEqual(normalizeTags({ cards: { [card('Admin').id]: [] } }, { lenient: true }).cards, { [card('Admin').id]: [] }, 'an empty local list survives (it hides repo tags)');
  assert.deepEqual(normalizeTags(null), emptyTags());
  assert.deepEqual(normalizeTags('nope'), emptyTags());
});

test('tags: local edits layer on top of the repo file', () => {
  const A = card('Admin').id, C = card('Coder').id;
  const repo = normalizeTags({ tags: [{ id: 'ramp', name: 'Ramp' }, { id: 'draw', name: 'Draw' }], cards: { [A]: ['ramp'], [C]: ['draw'] } });
  const local = normalizeTags({ tags: [{ id: 'burst', name: 'Burst' }, { id: 'ramp', name: 'Ramp (mine)' }], cards: { [A]: ['burst'] } });
  const eff = mergeLayers(repo, local);
  assert.deepEqual(eff.tags.map((t) => [t.id, t.name, t.source]), [['ramp', 'Ramp (mine)', 'repo'], ['draw', 'Draw', 'repo'], ['burst', 'Burst', 'local']]);
  assert.deepEqual(eff.cards[A], ['burst'], 'local list replaces repo list for an edited card');
  assert.deepEqual(eff.cards[C], ['draw'], 'untouched card keeps the repo list');
  assert.deepEqual(tagsOf(eff, A).map((t) => t.id), ['burst']);
  const cleared = mergeLayers(repo, { tags: [], cards: { [A]: [] } });
  assert.equal(cleared.cards[A], undefined, 'an empty local list clears the repo tags');
  assert.equal(usage(eff).get('burst'), 1);
});

test('tags: deck boost, grouping and filtering', () => {
  const A = card('Admin').id, C = card('Coder').id, S = card('Script Kiddie').id;
  let eff = normalizeTags({ tags: [{ id: 'ramp', name: 'Ramp' }, { id: 'draw', name: 'Draw' }], cards: { [A]: ['ramp'], [S]: ['ramp', 'draw'], [C]: ['draw'] } });
  const deck = { main: { [A]: 3 }, side: {} };
  assert.equal(deckTagCounts(deck, eff).get('ramp'), 3);
  const boost = deckTagBoost(deck, eff);
  assert.ok(boost.has(S) && boost.has(A) && !boost.has(C), 'only cards sharing a tag with the deck');
  assert.deepEqual(boost.get(S).names, ['Ramp']);
  const entries = [A, C, card('Rubber Ducky').id].map((id) => ({ c: cards.find((x) => x.id === id), n: 1 }));
  const g = groupByTag(entries, eff);
  assert.deepEqual(g.map((x) => x.key), ['ramp', 'draw', 'untagged']);
  assert.ok(hasAnyTag(eff, A, new Set(['ramp'])) && !hasAnyTag(eff, A, new Set(['draw'])) && hasAnyTag(eff, A, new Set()));
});

test('tags boost deck suggestions and say why', () => {
  const eff = normalizeTags({ tags: [{ id: 'ramp', name: 'Ramp' }], cards: { [card('Admin').id]: ['ramp'], [card('Rubber Ducky').id]: ['ramp'] } });
  let d = setMainframe(emptyDeck(), card('Firestarter').id);
  d = changeCount(d, 'main', card('Admin').id, 2);
  const plainS = suggestForDeck(d, 200);
  const boosted = suggestForDeck(d, 200, { tagBoost: deckTagBoost(d, eff) });
  const rd = card('Rubber Ducky').id;
  const rank = (list) => list.findIndex((s) => s.card.id === rd);
  assert.ok(rank(boosted) >= 0 && (rank(plainS) < 0 || rank(boosted) < rank(plainS)));
  assert.ok(boosted.find((s) => s.card.id === rd).why.some((w) => /tag/i.test(w)));
});

test('backup: round trip, never overwrites, merges tags by name', () => {
  const A = card('Admin').id;
  let deck = setMainframe(emptyDeck('One'), card('Firestarter').id);
  deck = changeCount(deck, 'main', A, 3);
  const tags = normalizeTags({ tags: [{ id: 'ramp', name: 'Ramp' }], cards: { [A]: ['ramp'] } });
  const file = JSON.stringify(buildBackup([deck], tags, new Date('2026-01-01T00:00:00Z')));
  const inc = parseBackup(file);
  assert.deepEqual(inc.decks[0], deck);
  assert.deepEqual(inc.tags, tags);
  // into an empty browser
  let m = mergeBackup({ decks: [], tags: emptyTags() }, inc);
  assert.deepEqual(m.summary, { decksAdded: 1, decksSame: 0, decksRenamed: 0, tagsAdded: 1, cardTagsAdded: 1 });
  // same file again: nothing changes
  m = mergeBackup({ decks: m.decks, tags: m.tags }, inc);
  assert.deepEqual(m.summary, { decksAdded: 0, decksSame: 1, decksRenamed: 0, tagsAdded: 0, cardTagsAdded: 0 });
  // same id but edited locally: the local deck is kept, the incoming one comes in under a new name
  const edited = { ...m.decks[0], name: 'One (edited)' };
  m = mergeBackup({ decks: [edited], tags: m.tags }, inc);
  assert.equal(m.decks.length, 2);
  assert.equal(m.decks[0].name, 'One (edited)');
  assert.match(m.decks[1].name, /\(imported\)$/);
  assert.notEqual(m.decks[1].id, deck.id);
  // tag with a different id but the same name maps onto the existing tag
  const other = normalizeTags({ tags: [{ id: 'my-ramp', name: 'ramp' }], cards: { [card('Coder').id]: ['my-ramp'] } });
  const m2 = mergeBackup({ decks: [], tags }, { decks: [], tags: other });
  assert.equal(m2.tags.tags.length, 1);
  assert.deepEqual(m2.tags.cards[card('Coder').id], ['ramp']);
  assert.deepEqual(m2.tags.cards[A], ['ramp'], 'existing card tags untouched');
});

test('backup: rejects files that are not ours', () => {
  assert.throws(() => parseBackup('{oops'), /valid JSON/);
  assert.throws(() => parseBackup('{"decks":[]}'), /Neuroscaping backup/);
  const ok = parseBackup(JSON.stringify({ app: 'neuroscape-deck-lab', decks: [{ id: 'z', name: 'Z', main: { 99999: 2, [card('Admin').id]: 2 }, side: {} }, { nope: 1 }] }));
  assert.equal(ok.decks.length, 1);
  assert.deepEqual(ok.decks[0].main, { [card('Admin').id]: 2 });
});

test('Copy for AI includes your tags when given', () => {
  const A = card('Admin').id;
  const eff = normalizeTags({ tags: [{ id: 'ramp', name: 'Ramp' }], cards: { [A]: ['ramp'] } });
  const d = changeCount(emptyDeck('T'), 'main', A, 2);
  assert.match(aiPrompt(d, eff), /My tags: Ramp\./);
  assert.doesNotMatch(aiPrompt(d), /My tags/);
});

// ---- draw odds and sample hands ----
import { hypergeomPmf, atLeast, cardsSeen, oddsByTurn, matchGroup, groupSize, groupOptions, shuffle, buildLibrary, newGame, mulligan, drawTurn, turnDraws } from '../src/lib/odds.js';

// independent exact check with BigInt binomials
const C = (n, k) => { if (k < 0 || k > n) return 0n; let r = 1n; for (let i = 1n; i <= BigInt(k); i++) r = (r * (BigInt(n) - BigInt(k) + i)) / i; return r; };
const exactAtLeast = (N, K, n, k) => { let num = 0n; for (let i = k; i <= Math.min(K, n); i++) num += C(K, i) * C(N - K, n - i); return Number(num * 1000000n / C(N, n)) / 1e6; };
const seeded = (seed = 1) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

test('odds: hypergeometric matches exact counting', () => {
  for (const [N, K, n, k] of [[50, 4, 5, 1], [50, 4, 5, 2], [60, 12, 8, 2], [255, 4, 20, 1], [40, 1, 7, 1], [50, 25, 5, 3]]) {
    assert.ok(Math.abs(atLeast(N, K, n, k) - exactAtLeast(N, K, n, k)) < 2e-6, `${N},${K},${n},${k}`);
  }
  assert.ok(Math.abs(atLeast(50, 4, 5, 1) - (1 - 1370754 / 2118760)) < 1e-9, 'classic: 4 copies in 50, opening 5');
  let sum = 0; for (let k = 0; k <= 5; k++) sum += hypergeomPmf(50, 4, 5, k);
  assert.ok(Math.abs(sum - 1) < 1e-12);
});

test('odds: edge cases', () => {
  assert.equal(atLeast(50, 0, 5, 1), 0, 'no copies');
  assert.equal(atLeast(50, 4, 5, 0), 1, 'at least zero');
  assert.equal(atLeast(50, 4, 5, 6), 0, 'cannot draw more than you see');
  assert.equal(atLeast(50, 4, 3, 4), 0);
  assert.equal(atLeast(10, 4, 10, 4), 1, 'seeing the whole deck');
  assert.ok(Math.abs(atLeast(50, 49, 5, 4) - 1) < 1e-9, 'only one non-hit exists, so 5 cards hold at least 4 hits');
  assert.equal(hypergeomPmf(50, 4, 5, 9), 0);
  assert.equal(atLeast(50, 60, 5, 1), 0, 'invalid K');
});

test('odds: cards seen by turn follow the draw rules', () => {
  assert.deepEqual([0, 1, 2, 3].map((t) => cardsSeen(t, true)), [5, 6, 8, 10], 'going first draws 1 on turn 1');
  assert.deepEqual([0, 1, 2, 3].map((t) => cardsSeen(t, false)), [5, 7, 9, 11]);
  assert.equal(cardsSeen(40, true, 50), 50, 'capped at the deck');
  const rows = oddsByTurn({ N: 50, K: 4, k: 1, first: true, turns: 8 });
  assert.equal(rows.length, 9);
  assert.ok(rows.every((r, i) => i === 0 || r.p >= rows[i - 1].p), 'odds never fall as you draw');
  assert.equal(rows[0].seen, 5);
  assert.ok(oddsByTurn({ N: 50, K: 4, k: 1, first: false })[1].p > rows[1].p, 'going second sees more cards');
  assert.ok(oddsByTurn({ N: 50, K: 4, k: 2 })[0].p < oddsByTurn({ N: 50, K: 4, k: 1 })[0].p);
});

test('odds: groups by card, faction, type, tag and RAM cost', () => {
  const A = card('Admin'), Co = card('Coder');
  const eff = normalizeTags({ tags: [{ id: 'ramp', name: 'Ramp' }], cards: { [A.id]: ['ramp'] } });
  const d = changeCount(changeCount(emptyDeck(), 'main', A.id, 3), 'main', Co.id, 2);
  assert.equal(groupSize(d, { kind: 'card', value: A.id }, eff), 3);
  assert.equal(groupSize(d, { kind: 'faction', value: 'Hacker' }, eff), 5);
  assert.equal(groupSize(d, { kind: 'type', value: 'Character' }, eff), 5);
  assert.equal(groupSize(d, { kind: 'tag', value: 'ramp' }, eff), 3);
  assert.equal(groupSize(d, { kind: 'ram', value: 1 }, eff), 5);
  assert.equal(groupSize(d, { kind: 'ram', value: 8 }, eff), 0);
  assert.ok(matchGroup(cards.find((c) => c.ram >= 8) || A, { kind: 'ram', value: 8 }) === (cards.some((c) => c.ram >= 8)));
  const o = groupOptions(d, eff);
  assert.deepEqual(o.card.map((x) => x.label), ['ADMIN', 'CODER']);
  assert.deepEqual(o.tag.map((x) => x.label), ['Ramp']);
  assert.ok(o.faction.length === 1 && o.faction[0].count === 5 && o.ram.length === 1);
});

test('sample hands: shuffle is a permutation, deterministic with a seed', () => {
  const d = changeCount(changeCount(emptyDeck(), 'main', card('Admin').id, 4), 'main', card('Coder').id, 4);
  const lib = buildLibrary(d);
  assert.equal(lib.length, 8);
  assert.equal(new Set(lib.map((c) => c.uid)).size, 8);
  const a = shuffle(lib, seeded(7)), b = shuffle(lib, seeded(7));
  assert.deepEqual(a, b);
  assert.deepEqual([...a].sort((x, y) => x.uid - y.uid), lib);
});

test('sample hands: opening hand, mulligan to the bottom, turn draws', () => {
  let d = emptyDeck();
  for (const c of cards.filter((x) => x.type !== 'Mainframe').slice(0, 30)) d = changeCount(d, 'main', c.id, 2);
  const g0 = newGame(d, { first: true, rng: seeded(3) });
  assert.equal(g0.hand.length, 5);
  assert.equal(g0.library.length, 55);
  const all = (g) => [...g.hand, ...g.library].map((c) => c.uid).sort((x, y) => x - y);
  // mulligan two cards
  const send = [g0.hand[0].uid, g0.hand[1].uid];
  const next = g0.library.slice(0, 2).map((c) => c.uid);
  const g1 = mulligan(g0, send);
  assert.equal(g1.hand.length, 5);
  assert.deepEqual(g1.hand.slice(3).map((c) => c.uid), next, 'redraws from the top');
  assert.deepEqual(g1.library.slice(-2).map((c) => c.uid), send, 'sent cards sit on the bottom');
  assert.deepEqual(all(g1), all(g0), 'no card is lost or duplicated');
  assert.equal(mulligan(g0, []), g0);
  // going first: 1 card on turn 1, then 2
  assert.equal(turnDraws(g0), 1);
  const t1 = drawTurn(g0);
  assert.equal(t1.hand.length, 6); assert.equal(t1.turn, 1);
  const t2 = drawTurn(t1);
  assert.equal(t2.hand.length, 8);
  assert.equal(mulligan(t1, [t1.hand[0].uid]), t1, 'no mulligan after turn 1 starts');
  const second = newGame(d, { first: false, rng: seeded(3) });
  assert.equal(drawTurn(second).hand.length, 7, 'going second takes 2 on turn 1');
  assert.equal(drawTurn(second, 0).hand.length, 5, 'taking both installs from the RAM deck draws none');
  // running the library dry never breaks
  let g = newGame({ ...emptyDeck(), main: { [card('Admin').id]: 6 } }, { rng: seeded(1) });
  for (let i = 0; i < 5; i++) g = drawTurn(g);
  assert.equal(g.hand.length, 6); assert.equal(g.library.length, 0);
});

test('roles: removal is not over-broad; discard and can\'t-block are disruption', () => {
  const sec = (n) => sectionOf(card(n));
  for (const n of ['Delete', 'Terminate', 'Solar Flare', 'Static Blast', 'Fatal Error 75', 'Death Metal', 'Short Circuit']) assert.equal(sec(n), 'removal', n);
  for (const n of ['Overload Mk. I', 'Power Spike', 'Memory Leak', 'System Error', 'The Pulse']) assert.equal(sec(n), 'damage', n);
  for (const n of ['Phishing', 'Lug Nut', 'EMP Grenade', 'Garbage Day', 'The High Priestess']) assert.equal(sec(n), 'disruption', n);
  assert.equal(sec('Download More RAM'), 'ram');
  assert.notEqual(sec('Sneakerhead'), 'removal', 'preventing damage is not removal');
  assert.notEqual(sec('Justice'), 'removal');
  const removal = cards.filter((c) => sectionOf(c) === 'removal');
  assert.ok(removal.length > 20 && removal.length < 45, `removal has ${removal.length} cards`);
  assert.ok(removal.every((c) => !/\bdiscard\b|can't block/i.test(c.text.join(' ')) || /destroy/i.test(c.text.join(' '))), 'no pure discard or can\'t-block card in removal');
});

test('mainframe suggestions split removal, damage and disruption', () => {
  const s = suggestForMainframe(mainframes.find((m) => m.name === 'FIRESTARTER'));
  const titles = s.groups.map((g) => g.title);
  for (const t of ['Removal', 'Direct damage', 'Disruption']) assert.ok(titles.includes(t), t);
  assert.ok(!titles.includes('Removal and damage'));
});

// ---- filters in the URL ----
import { blankFilters, encodeFilters, decodeFilters, decodeRange, encodeRange, normalizeRange, rangeSummary, inRamRange, multiSummary, toggleIn, matchesFilters, facetCounts, ramCounts, activeChips, hasAnyFilter, activeGroupCount } from '../src/lib/filters.js';
import { RARITIES } from '../src/lib/cards.js';
import { split, parse, href } from '../src/router.js';

test('filters: round trip through a query string', () => {
  const F = blankFilters();
  F.q = 'draw 2'; F.types.add('Character'); F.factions.add('Hacker'); F.factions.add('Mystic'); F.ram = { min: 1, max: 3 };
  F.subtypes.add('Script'); F.tags.add('Robot'); F.mytags.add('draw-engine'); F.rarity.add(RARITIES[0]); F.iconic = true; F.hasAbility = true; F.inDeck = true;
  const qs = encodeFilters(F, 'name');
  assert.match(qs, /fac=Hacker,Mystic/);
  assert.ok(!qs.includes('inDeck') && !/deck/.test(qs), 'your deck is not part of a shared link');
  const { F: back, sort } = decodeFilters(qs, RARITIES);
  assert.equal(sort, 'name');
  for (const k of ['types', 'factions', 'subtypes', 'tags', 'mytags', 'rarity']) assert.deepEqual([...back[k]].sort(), [...F[k]].sort(), k);
  assert.deepEqual(back.ram, { min: 1, max: 3 }); assert.match(qs, /ram=1-3/);
  assert.equal(back.q, 'draw 2'); assert.ok(back.iconic && back.hasAbility && !back.inDeck);
  assert.equal(encodeFilters(blankFilters()), '');
  assert.equal(encodeFilters(blankFilters(), 'id'), '');
});

test('filters: unknown or hostile values are dropped', () => {
  const { F, sort } = decodeFilters('fac=Hacker,Nope&type=Mainframe,<script>&ram=1,99,x&sort=weird&my=ok-tag,Bad Tag!&tag=Robot,Zzz', RARITIES);
  assert.deepEqual([...F.factions], ['Hacker']);
  assert.deepEqual([...F.types], ['Mainframe']);
  assert.deepEqual(F.ram, { min: 1, max: 1 }, 'out-of-range and junk numbers are ignored');
  assert.deepEqual([...F.mytags], ['ok-tag']);
  assert.deepEqual([...F.tags], ['Robot']);
  assert.equal(sort, 'id');
  assert.equal(decodeFilters('').F.q, '');
});

test('filters: RAM range parsing, old list form, normalising', () => {
  assert.deepEqual(decodeRange('1-3'), { min: 1, max: 3 });
  assert.deepEqual(decodeRange('2-'), { min: 2, max: null });
  assert.deepEqual(decodeRange('-3'), { min: null, max: 3 });
  assert.deepEqual(decodeRange('3-1'), { min: 1, max: 3 }, 'reversed pair is swapped');
  assert.deepEqual(decodeRange('0-9'), { min: 0, max: null }, 'a max of 8 or more is no max');
  assert.deepEqual(decodeRange('1,2,5'), { min: 1, max: 5 }, 'old list form: lowest to highest');
  assert.deepEqual(decodeRange('4'), { min: 4, max: 4 });
  for (const bad of ['', '-', 'abc', '1-x', '--', '99', null, undefined]) assert.deepEqual(decodeRange(bad), { min: null, max: null }, String(bad));
  assert.equal(encodeRange({ min: 1, max: 3 }), '1-3');
  assert.equal(encodeRange({ min: 2, max: null }), '2-');
  assert.equal(encodeRange({ min: null, max: 3 }), '-3');
  assert.equal(encodeRange({ min: null, max: null }), '');
  assert.equal(encodeRange({ min: 3, max: 1 }), '1-3');
  assert.deepEqual(normalizeRange({ min: '2', max: '' }), { min: 2, max: null });
  assert.deepEqual(normalizeRange({ min: -4, max: 2 }), { min: 0, max: 2 });
  for (const r of [{ min: 1, max: 3 }, { min: 2, max: null }, { min: null, max: 3 }, { min: 4, max: 4 }]) assert.deepEqual(decodeRange(encodeRange(r)), r);
  assert.deepEqual([rangeSummary({}), rangeSummary({ min: 2, max: null }), rangeSummary({ min: null, max: 3 }), rangeSummary({ min: 1, max: 3 }), rangeSummary({ min: 3, max: 3 }), rangeSummary({ min: 8, max: null })], ['Any', '2+', '\u22643', '1\u20133', '3', '8+']);
  const { F } = decodeFilters('ram=2-&fac=Hacker', RARITIES);
  assert.deepEqual(F.ram, { min: 2, max: null });
  assert.equal(encodeFilters(F), 'fac=Hacker&ram=2-');
});

test('filters: RAM range keeps mainframes out only when a range is set', () => {
  const mf = cards.find((c) => c.type === 'Mainframe'); const costed = cards.filter((c) => c.ram != null);
  assert.ok(inRamRange(mf, { min: null, max: null }));
  assert.ok(!inRamRange(mf, { min: 0, max: null }));
  assert.ok(!inRamRange(mf, { min: null, max: 7 }));
  const F = blankFilters(); F.ram = { min: 1, max: 3 };
  const hit = costed.filter((c) => matchesFilters(c, F));
  assert.ok(hit.length && hit.every((c) => c.ram >= 1 && c.ram <= 3));
  assert.equal(hit.length, costed.filter((c) => c.ram >= 1 && c.ram <= 3).length);
  F.ram = { min: 5, max: null };
  assert.ok(cards.filter((c) => matchesFilters(c, F)).every((c) => c.ram >= 5));
  assert.equal(cards.filter((c) => matchesFilters(c, blankFilters())).length, cards.length);
});

test('filters: multi-select logic (OR inside a group, AND between groups)', () => {
  const F = blankFilters();
  F.factions.add('Hacker'); F.factions.add('Mystic');
  const fm = cards.filter((c) => matchesFilters(c, F));
  assert.ok(fm.every((c) => c.factions.includes('Hacker') || c.factions.includes('Mystic')));
  assert.equal(fm.length, cards.filter((c) => c.factions.some((f) => f === 'Hacker' || f === 'Mystic')).length);
  F.types.add('Character'); F.types.add('Gear');
  const both = cards.filter((c) => matchesFilters(c, F));
  assert.ok(both.length < fm.length && both.every((c) => c.type === 'Character' || c.type === 'Gear'));
  // your tags come through ctx
  const G = blankFilters(); G.mytags.add('t1');
  assert.equal(cards.filter((c) => matchesFilters(c, G, { cardTags: (id) => (id === cards[3].id ? ['t1', 't2'] : []) })).length, 1);
  assert.equal(cards.filter((c) => matchesFilters(c, G)).length, 0);
  // text search and in-deck
  const Q = blankFilters(); Q.q = cards[0].name.split(' ')[0];
  assert.ok(cards.filter((c) => matchesFilters(c, Q)).some((c) => c.id === cards[0].id));
  const D = blankFilters(); D.inDeck = true;
  assert.equal(cards.filter((c) => matchesFilters(c, D, { inDeck: (c) => c.id === 7 })).length, 1);
  assert.equal(multiSummary(new Set(), ['A', 'B']), 'Any');
  assert.equal(multiSummary(new Set(['B']), ['A', 'B']), 'B');
  assert.equal(multiSummary(new Set(['B', 'A', 'C']), ['A', 'B', 'C']), 'A +2');
  const s = new Set(); toggleIn(s, 'x'); assert.ok(s.has('x')); toggleIn(s, 'x'); assert.ok(!s.has('x'));
});

test('filters: option counts follow the other filters, not their own group', () => {
  const F = blankFilters();
  const all = facetCounts(cards, F, {}, 'factions');
  assert.equal(all.get('Hacker'), cards.filter((c) => c.factions.includes('Hacker')).length);
  F.types.add('Gear');
  const gear = facetCounts(cards, F, {}, 'factions');
  assert.equal(gear.get('Hacker') || 0, cards.filter((c) => c.type === 'Gear' && c.factions.includes('Hacker')).length);
  F.factions.add('Mystic'); // own group is ignored, so other factions still show how many they would add
  const still = facetCounts(cards, F, {}, 'factions');
  assert.equal(still.get('Hacker') || 0, gear.get('Hacker') || 0);
  const types = facetCounts(cards, F, {}, 'types'); // types are counted under the faction filter
  assert.equal(types.get('Character') || 0, cards.filter((c) => c.type === 'Character' && c.factions.includes('Mystic')).length);
  const ram = ramCounts(cards, blankFilters(), {});
  assert.equal([...ram.values()].reduce((a, b) => a + b, 0), cards.filter((c) => c.ram != null).length);
  assert.ok(!ram.has(undefined) && [...ram.keys()].every((k) => k >= 0 && k <= 8));
});

test('filters: removable chips and counters', () => {
  const F = blankFilters();
  assert.deepEqual(activeChips(F), []); assert.ok(!hasAnyFilter(F)); assert.equal(activeGroupCount(F), 0);
  F.factions.add('Hacker'); F.factions.add('Corpo'); F.ram = { min: null, max: 3 }; F.iconic = true;
  const chips = activeChips(F, (k, v) => `${k}:${v}`);
  assert.deepEqual(chips.map((c) => c.label), ['factions:Hacker', 'factions:Corpo', 'RAM \u22643', 'Iconic only']);
  assert.ok(hasAnyFilter(F)); assert.equal(activeGroupCount(F), 3);
});

test('router: query strings and deck tabs', () => {
  assert.deepEqual(parse('#/cards?fac=Hacker'), { name: 'cards' });
  assert.equal(split('#/cards?fac=Hacker&q=a%20b').query.get('q'), 'a b');
  assert.equal(split('#/cards').path, 'cards');
  assert.deepEqual(parse('#/deck/abc'), { name: 'deck', id: 'abc', tab: 'cards' });
  assert.deepEqual(parse('#/deck/abc/synergy'), { name: 'deck', id: 'abc', tab: 'synergy' });
  assert.deepEqual(parse('#/deck/abc/playtest'), { name: 'deck', id: 'abc', tab: 'playtest' });
  assert.deepEqual(parse('#/deck/abc/bogus'), { name: 'deck', id: 'abc', tab: 'cards' });
  assert.equal(href.deck('x'), '#/deck/x'); assert.equal(href.deck('x', 'playtest'), '#/deck/x/playtest');
  assert.equal(href.cards('fac=Hacker'), '#/cards?fac=Hacker');
  assert.deepEqual(parse('#/card/12'), { name: 'card', id: 12 });
});

// ---- card images ----
import { cardImageUrl, cardAlt, rulesPlain, IMAGE_SOURCES, nextSource, firstSource, markPrimaryFailed, resetPrimaryFailed } from '../src/lib/cardimg.js';

test('image urls: primary and fallback by card id', () => {
  const c = card('Admin');
  assert.equal(cardImageUrl(c, 'primary'), `https://storage.googleapis.com/spicerack_media/cards/neuroscape/GEN-${c.id}.webp`);
  assert.equal(cardImageUrl(c, 'fallback'), `https://static.playset.pro/neuroscape/cards/en/GEN-${c.id}.webp`);
  assert.equal(cardImageUrl(c), cardImageUrl(c, 0), 'primary is the default and index 0');
  assert.equal(cardImageUrl(256), 'https://storage.googleapis.com/spicerack_media/cards/neuroscape/GEN-256.webp');
});

test('image urls: every card in the dataset has one, 255 (Basic RAM) and junk do not', () => {
  assert.ok(cards.every((c) => /\/GEN-\d+\.webp$/.test(cardImageUrl(c, 'primary')) && cardImageUrl(c, 'fallback')));
  assert.ok(!cards.some((c) => c.id === 255));
  for (const bad of [255, 0, -1, 257, 1.5, NaN, null, undefined, '12']) assert.equal(cardImageUrl(bad), '', String(bad));
  assert.equal(cardImageUrl(1, 'nope'), '');
});

test('image sources fall back in order, then to the text card', () => {
  assert.equal(IMAGE_SOURCES.length, 2);
  assert.equal(nextSource(0), 1);
  assert.equal(nextSource(1), 'text');
  resetPrimaryFailed();
  assert.equal(firstSource(), 0);
  markPrimaryFailed();
  assert.equal(firstSource(), 1, 'after a primary failure the session starts at the fallback');
  resetPrimaryFailed();
});

test('alt text carries name, type, factions and the full rules text', () => {
  const c = card('Hex, Codemancer');
  const alt = cardAlt(c);
  assert.match(alt, /^HEX, CODEMANCER\. Character, Hacker\. RAM cost 4\./);
  for (const line of c.text) assert.ok(alt.includes(line.replace(/[\[\]]/g, '')), line);
  assert.ok(!/[\[\]]/.test(alt), 'brackets are removed');
  assert.match(alt, /DDOS ATTACK: run 2 RAM\./);
});

test('alt text for a mainframe reads the lead-in and every tier', () => {
  const m = mainframes[0];
  const alt = cardAlt(m);
  assert.ok(alt.startsWith(`${m.name}. Mainframe`));
  assert.equal(rulesPlain(m).length, m.mainframe.tiers.length + (m.mainframe.lead ? 1 : 0));
  for (const t of m.mainframe.tiers) assert.ok(alt.includes(Object.values(t.needs)[0] + ' ' + Object.keys(t.needs)[0]));
  assert.ok(cards.every((c) => cardAlt(c).length > c.name.length + 10));
});

import { newLife, adjust as lifeAdjust, rename as lifeRename, setPlayers as lifeSetPlayers, resetLife, normalizeLife, atZero, START as LIFE_START, CAP as LIFE_CAP } from '../src/lib/life.js';

test('life counter: start, adjust, clamp', () => {
  const s = newLife(2);
  assert.deepEqual(s.players.map((p) => [p.mf, p.bf]), [[20, 20], [20, 20]]);
  const a = lifeAdjust(s, 0, 'mf', -3);
  assert.equal(a.players[0].mf, 17);
  assert.equal(a.players[0].bf, 20);
  assert.equal(s.players[0].mf, 20, 'does not mutate');
  assert.equal(lifeAdjust(s, 1, 'bf', -99).players[1].bf, 0);
  assert.equal(lifeAdjust(s, 1, 'bf', 5000).players[1].bf, LIFE_CAP);
  assert.equal(lifeAdjust(s, 5, 'mf', 1), s);
  assert.equal(lifeAdjust(s, 0, 'nope', 1), s);
  assert.deepEqual(atZero(lifeAdjust(s, 0, 'bf', -20).players[0]), ['bf']);
});
test('life counter: players, names, reset', () => {
  let s = lifeAdjust(newLife(2), 0, 'mf', -5);
  s = lifeSetPlayers(s, 4);
  assert.equal(s.players.length, 4);
  assert.equal(s.players[0].mf, 15, 'keeps existing players');
  assert.equal(s.players[3].name, 'Player 4');
  assert.equal(lifeSetPlayers(s, 9).players.length, 4);
  assert.equal(lifeSetPlayers(s, 1).players.length, 2);
  assert.equal(lifeRename(s, 1, '  Dan  ').players[1].name, 'Dan');
  assert.equal(lifeRename(s, 1, '   ').players[1].name, 'Player 2');
  const r = resetLife(lifeRename(s, 0, 'Ann'));
  assert.equal(r.players[0].mf, LIFE_START);
  assert.equal(r.players[0].name, 'Ann');
});
test('life counter: broken saved data becomes a fresh game', () => {
  for (const bad of [null, undefined, 'x', {}, { players: [] }, { players: 3 }]) assert.equal(normalizeLife(bad).players.length, 2);
  const n = normalizeLife({ flip: false, players: [{ name: 'A', mf: 7, bf: 'x' }, { mf: -4 }, null] });
  assert.equal(n.flip, false);
  assert.deepEqual(n.players.map((p) => [p.name, p.mf, p.bf]), [['A', 7, 20], ['Player 2', 0, 20], ['Player 3', 20, 20]]);
});
