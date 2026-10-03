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
- Cyberdeck: 50-255 cards, plus exactly 1 mainframe. Sideboard: up to 12 non-mainframe cards plus 1 extra mainframe.
- Copy limit is per card (usually 4) across cyberdeck and sideboard combined. Iconic cards: only one can be controlled at a time.
- Mainframe health 20 (blue attack), bioframe health 20 (red attack).
- Faction synergy = number of persistent cards with that faction icon you control. Mainframes unlock effect tiers at faction synergy thresholds.
- RAM is installed each turn (2 per turn after the first turn; the first player gets 1). Opening hand is 5 cards.`;
