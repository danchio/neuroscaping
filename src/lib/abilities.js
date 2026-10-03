// How ability costs are worded. One place, so the cards, tooltips and the AI prompt all say the same thing.
// Rules: an activated ability costs running the character (rotating it), running an amount of RAM, or both.
// "Run 2 RAM" and "run this character" are two separate costs; there is no upgrade mechanic (UPGRADE is just a name).

/** Cost pieces in plain words, e.g. ['run 2 RAM', 'run this character']. Empty when the ability is free. */
export function costParts(a) {
  const out = [];
  if (a.ram != null && a.ram > 0) out.push(`run ${a.ram} RAM`);
  if (a.run) out.push('run this character');
  return out;
}

/** "run 2 RAM and run this character", "run 2 RAM", "run this character" or "no cost". */
export const costPhrase = (a) => costParts(a).join(' and ') || 'no cost';

/** Same, with a capital first letter, for labels. */
export const costLabel = (a) => { const s = costPhrase(a); return s[0].toUpperCase() + s.slice(1); };
