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
  assert.throws(() => parseBackup('{"decks":[]}'), /Deck Lab backup/);
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
