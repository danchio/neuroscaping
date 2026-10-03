# Neuroscape Deck Lab

An unofficial, fan-made deck builder for the Neuroscape TCG (Genesis set). Browse every card, see which cards work together, build decks with legality checks, and share them with your playgroup. It runs in the browser: no accounts, no install, no AI needed.

## Use it
Once GitHub Pages is on, the site is at `https://<your-user>.github.io/<repo>/`.

- **Browse and filter** by type, faction, RAM cost, subtype, tag and rarity, or search the rules text.
- **Synergy lens**: select a card to see what it looks for and which cards ask for it.
- **Deck builder**: add cards with +/-, pick a mainframe, watch its synergy tiers fill, check legality and the RAM curve.
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
- Faction synergy counts persistent cards in your cyberdeck (Characters, Gear, Protocol / Environment / Datashard programs). That is an assumption; change it in `src/lib/config.js`.
- Synergy links come from brackets and keywords in rules text. They show which cards mention each other, not whether a combo is good.
- Card data was read from the official gallery and a fan database and may contain mistakes. Please open an issue.
- Not affiliated with Neuroscape, LLC. Card names and text belong to their owners.
