// Things you may want to tweak as the game (or your understanding of it) changes.

export const FACTIONS = ['Hacker', 'Cybernetic', 'Corpo', 'Dustrunner', 'Mystic', 'Thrasher', 'Nanobot', 'Wonderland', 'Null'];

// Words printed as character tags (not factions). Confirmed as tags in the Genesis set.
export const TAGS = ['A.I.', 'Animal', 'Anarchist', 'Mech', 'Raver', 'Robot', 'Gambler', 'Politician'];

// Card subtypes that rules text can refer to ("when you play a tarot ...").
export const SUBTYPES = ['Tarot', 'Tether', 'Drug', 'Trojan', 'Virus', 'Script', 'Protocol', 'Environment', 'Cyberware', 'Weapon', 'Datashard'];

// Which cards stay in play and so count toward faction synergy.
// ASSUMPTION: Characters and Gear stay; so do Programs of these subtypes. Edit if the rules say otherwise.
export const PERSISTENT_TYPES = ['Character', 'Gear'];
export const PERSISTENT_SUBTYPES = ['Protocol', 'Environment', 'Datashard'];

export const LIMITS = {
  mainMin: 50,
  mainMax: 255,
  sideMax: 12, // non-mainframe cards; plus one extra mainframe
};

export const RULES_BRIEF = `Neuroscape rules in brief:
- Cyberdeck: 50-255 cards, none of them RAM cards or mainframes. Plus exactly 1 mainframe.
- RAM deck: a separate deck of exactly 25 RAM cards. It is not part of the cyberdeck.
- Sideboard: up to 12 non-RAM cards plus 1 extra mainframe.
- Copy limit is per card (usually 4) across cyberdeck and sideboard combined. Iconic cards: only one can be controlled at a time, and a deck can hold up to 4 of them.
- Mainframe health 20 (blue attack), bioframe health 20 (red attack).
- Faction synergy = number of persistent, face-up cards with that faction icon you control. Mainframes and face-down cards (trojans) do not count. Mainframes unlock effect tiers at faction synergy thresholds.
- Opening hand is 5 cards. Mulligan: choose cards, return them to the bottom of the deck, then redraw.
- Each turn you INITIALIZE: draw or install 2 cards in any combination from the cyberdeck and/or the RAM deck (the player going first takes only 1 on their first turn). RAM comes from the RAM deck, not from your hand.
- Activated-ability costs are running the character (rotating it), running an amount of RAM, or both. "Run 2 RAM" and "run this character" are separate costs. There is no upgrade mechanic: UPGRADE is only the name of some abilities.`;
