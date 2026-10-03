# Deck Lab: design plan

## Concept

Deck Lab is the rig you build a deck on. The game's own vocabulary is the interface: black circuit-trace surfaces, faction-coloured frames with a cut corner, ability names printed as chevron banners with a boxed RAM cost, and a mainframe that charges up as you add faction cards. It is not a skin of the official site. The app has its own shape: **Home** (your decks plus a wall of the 20 mainframes), **Mainframe pages** (EDHREC-like: what this mainframe wants, grouped by role), **Deck page** (Moxfield-like: dense list, live stats, preview pane), and a secondary **Cards** browser with a detail drawer.

Atmosphere is spent in three places only: the home hero (trace lines and a one-time boot), mainframe headers (faction glow), and the mainframe meter (segmented gauge that fills once). Everything else is flat, quiet and legible.

## Palette

Faction colours are the only saturated colours in the UI. Blue and red are reserved for mainframe and bioframe damage. Legal / not legal is carried by shape and text (solid badge versus hazard-striped badge), never by green and red.

| Token | Hex | Use |
|---|---|---|
| substrate | `#06090E` | page background |
| chassis | `#0D131A` | panels, top bar |
| plate | `#151E29` | raised surfaces, inputs, hover |
| trace | `#243342` | hairlines, circuit lines |
| trace-hi | `#3A4E62` | stronger borders, focus-adjacent |
| signal | `#E6EDF3` | primary text |
| dim | `#93A4B4` | secondary text (7:1 on chassis) |
| faint | `#5F7284` | decoration and disabled only |
| mainframe | `#5B7CFF` | mainframe damage (semantic) |
| bioframe | `#FF4560` | bioframe damage (semantic) |

Factions (on dark): Hacker `#19E3B1`, Cybernetic `#35C8FF`, Corpo `#FFC83A`, Dustrunner `#C98A4B`, Mystic `#A874FF`, Thrasher `#FF5A36`, Nanobot `#A6E22E`, Wonderland `#FF5FB8`, Null `#9AA7B4`. Text on a faction fill is always `#05080C`.

## Type

- **Display**: Saira Condensed 600/700. Squared, industrial, condensed. Card names, page titles, banner labels, big numerals. Sentence case except ability names, which are printed in capitals on the real cards.
- **Body**: Hanken Grotesk 400/500/600. Rules text, controls, lists. Tabular figures for counts.
- No monospace anywhere. No tracked-out capital eyebrows.
- Scale: 12 / 13.5 (UI) / 15 (rules text) / 20 (card name) / 30 (page title) / 56 (home hero, mainframe name on its page).

## Signature element

The **notched frame with chevron banner**. Frames have the top-left and bottom-right corners cut at 45 degrees, a 1px edge in the faction colour (a gradient between both colours for dual-faction cards), and a plate fill. Abilities and section titles use the banner: a boxed RAM badge on the left, the name, and a three-chevron point on the right. It appears on cards, mainframe tiers, and section headings, so the whole product reads as one object.

## Layouts

### Home
```
 [mark Deck Lab]  Decks  Mainframes  Cards      [ search cards  / ]   [deck chip]
 ┌ hero: circuit traces, boots in once ────────────────────────────────────┐
 │  Build the deck.                      [ New deck ]  [ Import a list ]    │
 │  Pick a mainframe, add the cards it wants, share the list.               │
 └──────────────────────────────────────────────────────────────────────────┘
 Your decks ▸▸▸
 ┌deck────────┐ ┌deck────────┐ ┌ + New deck ┐
 │ Name       │ │            │ │            │
 │ Mainframe  │ │            │ │            │
 │ faction bar│ │            │ │            │
 │ 52 cards  Legal │         │ │            │
 └────────────┘ └────────────┘ └────────────┘
 Start from a mainframe ▸▸▸
 [notched tile x 20: glyph(s), name, lead-in, tier thresholds]
```
Left aligned throughout.

### Mainframe page
```
 ┌ header band (faction glow + traces) ───────────────────────────────┐
 │ [glyph]  FIRESTARTER                       [ Start a deck ]         │
 │ lead-in sentence                                                    │
 │ tier banners:  [2 Hacker] ▸▸▸ effect     [4 Hacker] ▸▸▸ effect      │
 │ wants: Hacker  (23 persistent cards in the set)                     │
 └─────────────────────────────────────────────────────────────────────┘
 note: suggestions come from card text, not play statistics.
 Top characters ▸▸▸           (8 of 31, show all)
 [compact card rows or small frames: name, cost, why "works with ...", + add]
 Draw and search ▸▸▸ ... RAM and ramp ... Removal and damage ... Finishers ... Gear ... Tricks ... Engines
```

### Deck page
```
 [Name (editable)]  [mainframe chip: change]  [Legal / hazard badge]     [Import][Export][Share][Copy for AI][...]
 issue line (only when illegal)
 ┌ stats strip ──────────────────────────────────────────────────────────────┐
 │ Mainframe meter (segmented, tiers)   │ RAM curve        │ Faction mix      │
 └───────────────────────────────────────────────────────────────────────────┘
 [ type to add: "3 admin" + Enter ....................................... ]
 ┌ list (grouped by type, sortable) ─────────────┐ ┌ right rail (sticky) ───────┐
 │ Characters 31                                 │ │ preview frame (hover/pin)  │
 │ [-1+] [2] ADMIN        ⌬ 1/1                  │ │ Suggested for this deck    │
 │ ...                                           │ │ rows with + ...            │
 │ Sideboard 3/12 · notes                        │ │                            │
 └───────────────────────────────────────────────┘ └────────────────────────────┘
```
Below 1000px the rail stacks under the list and tapping a row opens the detail drawer instead of the preview.

### Cards
Filter rail on the left (collapsible on phones), a grid of card frames on the right. Click opens a right-hand drawer (a `dialog`) with full text, ability banners, add controls, and the synergy lens.

## Principles
1. One object, repeated: notched frame + banner.
2. Colour means something: faction = identity, blue/red = damage, everything else is neutral.
3. Dense where you work (deck list), atmospheric where you arrive (home, mainframe header).
4. Every suggestion says why.

## Review against the brief and what changed

Draft 1 had glowing faction borders on every tile, a green "legal" and red "illegal" pill, a monospace font for stats, and uppercase labels above each section. That is the generic neon-on-black kit. Revisions:
- Glow only on hover/selected frames and the mainframe header. Resting frames are a 1px edge.
- Legal / not legal is a solid versus hazard-striped badge. Red stays reserved for bioframe damage.
- Mono dropped. Numbers use Saira Condensed or tabular body figures.
- Section labels became chevron banners in sentence case (the banner is the signature, not an eyebrow).
- Mainframe meter is a segmented gauge (console-like) rather than a smooth progress bar.

Motion: the segmented meter fills once on load of a deck or mainframe page, and the home hero traces draw once. Both are disabled by `prefers-reduced-motion`, as are scanlines.

## Added in the second pass

New components, all built from the same frame and banner:
- **Deck tabs** (Cards / Synergy / Playtest): a quiet underline row, one active tab, shared deck header above.
- **Synergy map**: one disc per faction, nodes sized by RAM cost and coloured by faction, edges only for links at or above the chosen strength (Strong by default, so a 50-card deck stays readable). The biggest cluster is the hub; others ring around it. Labels sit in a separate layer and are greedily decluttered; the selected card's label is always shown. Loose cards are a list beside the map, not a red alarm. Phones default to the list because a 390px map is too small to read.
- **Tag chips**: a 3px colour stripe on a neutral chip. Tag colours are six muted hexes, deliberately not saturated, so faction colour stays the only loud colour and blue/red stay reserved for damage.
- **Odds chart**: nine bars (opening hand plus eight turns), the big opening percentage on the left, cards seen under each bar. Bars use the signal colour only.
- **Mini cards** for the sample hand: the same notched frame at tile size, with a Send back toggle in the footer.
- **Phone deck strip**: legality, minimum count and the tier meter sit in one compact block before anything else; stats collapse into disclosure rows; list rows have 44px tap targets and the name opens the drawer.
- **First-run Home**: three numbered steps (a real sequence, so numbering is justified) and one primary action.

Assumptions shown in the UI rather than hidden: odds assume all draws come from the cyberdeck and the RAM deck is not modelled; synergy weights are heuristic; role labels come from regexes on rules text.

## Card images pass

Request: use the real card images instead of card text, easier on the eyes.

- **Images are the content, the app is the frame around them.** Real cards have rounded corners, so images are never put in the notched frame. The established language stays around them: a thin faction-coloured ring (gradient for dual faction) on hover and focus, the notched `x N` badge, chevron section banners, the dark chassis. The notched frame is kept for the text-card fallback only.
- **No layout shift.** Every image sits in a 5:7 box that exists before the picture arrives. While loading it is an empty card outline in the card's faction colour; a slow sweep starts only if loading takes more than a third of a second.
- **Cards browser**: image grid (about 6 columns on a laptop, 2 on a phone). A count badge hangs off the top-right corner so it covers as little art as possible. The stepper floats over the bottom of the image on hover/focus; on touch and phones it is a bar under the image. Images / List toggle; List is a compact row with the rules text on one line.
- **Drawer**: large image first (tap to enlarge to a lightbox that fits the window), then controls, ability costs, tags, synergy lens. Rules text is a collapsed "Card text".
- **Deck page**: the dense list stays the editing default. The preview pane shows the image. A Visual toggle shows the deck as image tiles grouped like the list, with the mainframe first.
- **Mainframe page**: the mainframe image sits in the header beside its name; the tier meter and tier text stay in the right panel. Suggestions are image tiles with one short reason underneath and an Add button.
- **Home**: mainframe tiles use the top ~45% of the card as artwork, slightly over-scaled so the rounded corners are cropped away. Falls back to the faction glyphs.
- **Sample hand**: real images, larger; "Send back" dims the card.
- **Synergy map**: a small image follows the dot you point at; the side panel shows the selected card.
- **Failure chain**: publisher bucket, then fan CDN, then the text card (same footprint, so nothing moves). Offline or blocked still gives a complete app.
- **Performance**: `loading=lazy`, no eager 255 images, in-place updates of counts so steppers do not rebuild pictures, `keepImages` to carry loaded images across repaints.
