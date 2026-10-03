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
  assert.match(aiPrompt({ ...emptyDeck('x'), main: { [adm.id]: 4 } }), /Upgrade \(cost 2 RAM \+ run\)/);
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
