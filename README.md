# Neuroscaping

An unofficial, fan-made deck builder for the Neuroscape TCG (Genesis set). Browse every card, see which cards work together, build decks with legality checks, and share them with your playgroup. It runs in the browser: no accounts, no install, no AI needed.

## Use it
Once GitHub Pages is on, the site is at `https://<your-user>.github.io/<repo>/`.

- **Home**: your saved decks and the 20 mainframes. Start a deck from a mainframe or import a list.
- **Mainframe pages**: what each mainframe wants, with suggestions grouped by role (characters, draw, RAM, removal, direct damage, disruption, finishers, gear, tricks, engines). Each says why it fits. Suggestions come from card text, not play statistics.
- **Deck page**: dense list grouped by type, RAM or faction, quantity steppers, mainframe tier meter, RAM curve, faction mix, legality, sideboard, notes, and a type-to-add box (try "3 admin" then Enter; Shift+Enter adds to the sideboard). A suggestions panel offers one-click adds.
- **Synergy tab** (deck page): a map of how the cards in the deck connect, grouped by faction. Pick Named only, Strong or All links; select a card to see its partners and why; loose cards are listed with cards that would fit better. List view is the default on phones.
- **Playtest tab**: draw odds (chance of at least N cards of a kind by each turn, going first or second) and a sample hand with mulligan and next-turn draws. Odds assume every draw comes from the cyberdeck; the separate 25-card RAM deck is not modelled.
- **Cards page links**: filters are kept in the address, so a filtered view can be bookmarked or shared.
- **Compact by design**: a small type and spacing scale (see `docs/design.md`) keeps desktop dense (28 to 32px controls, 13px text); on touch and phones primary controls grow to 44px.
- **First visit**: Home explains three steps and offers an example deck.
- **Ability costs** read like the rulebook: "Run 2 RAM and run this character" means two separate costs (run 2 RAM, and rotate the character).
- **Card images**: wherever a card is shown, the app shows the real card art. The cards page is an image grid (Images / List toggle, +/- on hover, always visible on phones). The card drawer shows the card large (click to enlarge, Esc closes) with the rules text in a collapsed "Card text" section. The deck page keeps the dense list and has a Visual view (image grid by type). Suggestions, the sample hand and the synergy map use images too. If images cannot load (offline, blocked), every card falls back to a text card, so nothing is lost.
- **Cards**: a stack of compact dropdowns on the left (Type, Faction, RAM cost, Subtype, Tag, Rarity, and Your tags once you have some). Type, Faction, Subtype, Tag, Rarity and Your tags are multi-select lists with checkboxes, a summary on the closed field ("Any", "Hacker", "Hacker +2"), a badge when active, and card counts that follow your other filters. RAM cost is a single field with Min and Max, like a price range: "2+", "≤3", "1–3". Active filters also show as removable chips above the grid, with Clear all. On phones the filters open from a Filters button as a bottom sheet. Keyboard: Enter, Space or the Down arrow opens a field; arrows move, Space or Enter toggles, Esc closes and returns focus. The address keeps every filter (`#/cards?fac=Hacker,Mystic&ram=1-3`; `ram=2-` is 2 or more, `ram=-3` is 3 or fewer; the older `ram=1,2,3` form still opens as a range). You can also search rules text.
- **Your tags**: make your own tags ("ramp", "burst", "draw engine") from any card's details, filter the Cards page by them, show them on deck rows, group a deck by them, and let suggestions prefer cards that share a tag with your deck. Tags stay in your browser. **My data** (top right) manages tags and downloads or imports one backup file with all decks and tags; importing merges and never overwrites. To share tags with the playgroup, commit them to `data/my_tags.json` (same shape; ask your Claude to fill it in). Your own edits layer on top of that file.
- **Share**: copy a link, a plain-text list, or "Copy for AI" (deck + card text + rules, to paste into any AI chat). Anyone can import a list back.
- Decks are saved in your browser (localStorage). Use Share or Download to keep a copy elsewhere.

## Turn on GitHub Pages (one time)
Repo **Settings → Pages → Build and deployment → Source: GitHub Actions**. Every push to `main` then redeploys.

## Run locally
```
node scripts/serve.mjs     # then open http://localhost:5173
npm test                   # logic tests (Node 20+)
```

## Update card data
Edit `data/genesis.csv`, `data/mainframes.json` or `data/abilities_raw.txt`, then `node scripts/build-data.mjs` and commit `src/data/cards.js`.

## Card images (hotlinked)
Images are **not stored in this repo**. They are loaded from Neuroscape's own storage (`storage.googleapis.com/spicerack_media/cards/neuroscape/GEN-<id>.webp`) with a fan CDN as backup (`static.playset.pro/neuroscape/cards/en/GEN-<id>.webp`), the way fan tools commonly do. `<id>` is the card's `id` in the data. Card images and names belong to Neuroscape, LLC; the footer says so. If a source goes away, edit `src/lib/cardimg.js`. Screenshots in `docs/screenshots/` that end in `-placeholder` use generated stand-in images, not real art.

## Notes
- Design notes are in `docs/design.md`.
- Faction synergy counts persistent cards in your cyberdeck (Characters, Gear, Protocol / Environment / Datashard programs). That is an assumption; change it in `src/lib/config.js`.
- Synergy links come from brackets and keywords in rules text. They show which cards mention each other, not whether a combo is good.
- Card data was read from the official gallery and a fan database and may contain mistakes. Please open an issue.
- Not affiliated with Neuroscape, LLC. Card images, names and text belong to Neuroscape, LLC.
