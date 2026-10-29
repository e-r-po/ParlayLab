# ParlayLab PWA

A mobile-first, installable sports odds analytics app for iPhone/iPad and Windows. No Apple Developer account required.

## Features
- Live NFL, NBA, MLB, NHL, NCAAF and NCAAB game odds via The Odds API.
- DraftKings, FanDuel and BetMGM bookmaker filters (when returned by provider).
- Event player props via provider event-odds endpoint (requires market access and available lines).
- Custom parlay slip, American odds conversions, implied probability, potential gross returns.
- Automatic two- and three-leg combinations of moneyline picks from **different events**; minimum combined odds filtering.
- Manual anytime-touchdown Poisson scenario estimator, with user-supplied assumptions.
- PWA manifest and offline app-shell caching; live odds require internet.

## Deploy (Windows, no Mac)
1. Create a free GitHub repository and upload the contents of this folder (not its parent).
2. Create an account at https://vercel.com and import the GitHub repository as a new project. Framework preset: **Other**; root directory: repository root. No build command is needed.
3. Obtain an API key from https://the-odds-api.com/ (pricing and market access depend on the provider plan).
4. In Vercel Project Settings → Environment Variables, add `ODDS_API_KEY` with the key as its value. **Never** put it in `app.js` or commit it to GitHub.
5. Deploy (or redeploy after adding the variable). Open the HTTPS Vercel URL, choose a league and tap **Load live game odds**.
6. iPhone: open in Safari → Share → **Add to Home Screen**. Windows: open in Edge/Chrome → app install menu.

## Local development
Install Node 18+ and Vercel CLI (`npm install -g vercel`). Run `vercel dev`, with `ODDS_API_KEY` in a local `.env` file (not committed). The static UI can be previewed with any local web server but `/api/odds` requires the serverless runtime.

## Important limitations
- **Not** a wagering platform. No sportsbook login, bet placement or payout guarantees.
- The displayed implied probability is a mathematical conversion of offered odds and includes bookmaker margin. It is **not** a calibrated win-probability forecast. Multiplying odds assumes independent legs and is invalid for correlated same-game legs.
- Automated combos only use game moneylines and different events, not a verified value-bet algorithm. Multiple bookmakers may appear in one theoretical combo; such a combo is not necessarily placeable at one sportsbook.
- The touchdown scenario model is **manual**, not fed by player season stats, defensive matchup or injury feeds. The Poisson assumption is a simplification and can be poorly calibrated.
- Odds data and available player prop markets depend on subscription tier, region, bookmaker, game timing, and provider coverage. Quotas apply; repeated requests consume API credits.
- Live odds are never cached offline; offline availability is limited to the app shell.
- Legal age and jurisdiction restrictions apply. Use responsibly.

## Project layout
`index.html`, `styles.css`, `app.js`, `math.js` — UI and math; `api/odds.js` — secure server-side API proxy; `manifest.webmanifest`, `sw.js`, `icons/` — PWA assets.
