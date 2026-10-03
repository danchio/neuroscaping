# Neuroscape Deck Lab

An unofficial, fan-made deck builder for the Neuroscape TCG (Genesis set). Browse every card, see which cards work together, build decks with legality checks, and share them with your playgroup. It runs in the browser: no accounts, no install, no AI needed.

## Use it
Once GitHub Pages is on, the site is at `https://<your-user>.github.io/<repo>/`.

- **Home**: your saved decks and the 20 mainframes. Start a deck from a mainframe or import a list.
- **Mainframe pages**: what each mainframe wants, with suggestions grouped by role (characters, draw, RAM, removal, finishers, gear, tricks, engines). Each says why it fits. Suggestions come from card text, not play statistics.
- **Deck page**: dense list grouped by type, RAM or faction, quantity steppers, mainframe tier meter, RAM curve, faction mix, legality, sideboard, notes, and a type-to-add box (try "3 admin" then Enter; Shift+Enter adds to the sideboard). A suggestions panel offers one-click adds.
- **Ability costs** read like the rulebook: "Run 2 RAM and run this character" means two separate costs (run 2 RAM, and rotate the character).
- **Cards**: filter by type, faction, RAM cost, subtype, tag and rarity or search rules text. Open a card to see what it works with and what asks for it.
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

## Notes
- Design notes are in `docs/design.md`.
- Faction synergy counts persistent cards in your cyberdeck (Characters, Gear, Protocol / Environment / Datashard programs). That is an assumption; change it in `src/lib/config.js`.
- Synergy links come from brackets and keywords in rules text. They show which cards mention each other, not whether a combo is good.
- Card data was read from the official gallery and a fan database and may contain mistakes. Please open an issue.
- Not affiliated with Neuroscape, LLC. Card names and text belong to their owners.
