// Check a deck text file: node scripts/check-deck.mjs decks/my-deck.txt
import { readFileSync } from 'node:fs';
import { parseText } from '../src/lib/share.js';
import { validate, persistentFactionCounts, deckStats } from '../src/lib/deck.js';
import { byId } from '../src/lib/cards.js';
import { tierStatus } from '../src/lib/synergy.js';

const file = process.argv[2];
if (!file) { console.error('Usage: node scripts/check-deck.mjs decks/<file>.txt'); process.exit(1); }
const { deck, unknown } = parseText(readFileSync(file, 'utf8'));
const v = validate(deck);
const counts = persistentFactionCounts(deck);
console.log(`${deck.name}: ${v.mainCount} cyberdeck, ${v.sideCount} sideboard`);
if (unknown.length) console.log('Not recognised:', unknown.join(', '));
console.log(v.ok ? 'Legal' : v.issues.map((i) => `- ${i.text}`).join('\n'));
console.log('Persistent faction cards:', JSON.stringify(counts));
const mf = deck.mainframe && byId.get(deck.mainframe);
if (mf) for (const s of tierStatus(mf, counts)) console.log(`${s.met ? '[x]' : '[ ]'} ${s.progress.map((p) => `${p.need} ${p.faction} (have ${p.have})`).join(' + ')}: ${s.tier.text}`);
console.log('Avg RAM cost:', deckStats(deck).avgRam.toFixed(2));
