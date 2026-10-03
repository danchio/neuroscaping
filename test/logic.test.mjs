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
