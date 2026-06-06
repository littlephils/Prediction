# 🎲 Party Prediction Market

A real-time, mobile-first prediction market for parties. Guests bet **fake money**
on words the host will say or custom yes/no party predictions. Odds shift live as
money piles in — early bettors lock the best multipliers. The host runs the show
from a secret admin panel.

- **Guest view:** `/`
- **Host console:** `/admin?key=YOUR_SECRET_KEY`

## How it works

1. A guest opens the app, picks a name, and gets **$100** of play money (stored in
   their browser, no password).
2. The host opens either word markets like _"Will the host say **literally**?"_
   or custom prediction markets like _"Will someone start a dance circle?"_ with
   a starting multiplier (e.g. 3.0×).
3. Guests bet any amount up to their balance. Each bet **locks in the odds at that
   exact moment**. You can bet on the same market as many times as you like.
4. As the pool grows, the multiplier compresses toward a 1.1× floor — so the later
   you bet, the less you win.
5. The host resolves each market:
   - **Said it / Yes ✅** → everyone who bet is paid `stake × locked odds`.
   - **Never said / No ❌** → bettors lose their stake.
   - **Void ↩** → all stakes refunded.

Everything updates by polling every ~2.5s — no WebSockets.

### Odds curve

```
currentOdds = max(1.1, startingOdds / (1 + k × totalMoneyBet))
```

`k` (default `0.005`) controls how fast odds fall. Bigger `k` = faster compression.
Example with `startingOdds = 3.0`, `k = 0.005`:

| Pool | Odds |
|------|------|
| $0   | 3.00× |
| $50  | 2.40× |
| $100 | 2.00× |
| $400 | 1.20× |

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000 for guests and
http://localhost:3000/admin?key=partytime for the host.

No database needed for local dev — the app uses an **in-memory store** automatically
when no KV credentials are present. Data lives as long as `npm run dev` is running
(it resets on restart). This is only for local testing; production needs real KV
(see below), because each serverless function is stateless.

## Configuration

Copy `.env.local.example` to `.env.local` and adjust:

| Variable | Default | Purpose |
|----------|---------|---------|
| `ADMIN_KEY` | `partytime` | Secret in `/admin?key=…` |
| `ODDS_K` | `0.005` | Odds compression rate |
| `KV_REST_API_URL` | _(unset)_ | Enables Vercel KV when present |
| `KV_REST_API_TOKEN` | _(unset)_ | Vercel KV auth token |

## Deploy to Vercel

1. Push this repo to GitHub and import it into Vercel.
2. Add storage: **Vercel dashboard → Storage → Marketplace → Upstash for Redis**
   (this is how "Vercel KV" is provisioned now). Connect it to the project — Vercel
   injects `KV_REST_API_URL` and `KV_REST_API_TOKEN` automatically.
3. Set `ADMIN_KEY` (and optionally `ODDS_K`) in the project's Environment Variables.
4. Deploy. The app detects `KV_REST_API_URL` and switches from the in-memory store
   to persistent Redis, so balances, bets, and markets survive across requests.

> ⚠️ Pick a non-default `ADMIN_KEY` for a real party — admin access is by URL
> obscurity only, exactly as specified. Anyone with the key can resolve markets.

## Data model (Redis)

| Key | Type | Holds |
|-----|------|-------|
| `users` | set | all usernames (lowercased ids) |
| `user:{id}` | hash | `name`, `balance`, `createdAt` |
| `user:{id}:bets` | list | each bet `{ marketId, word, amount, lockedOdds, placedAt }` |
| `markets` | set | all market ids |
| `market:{id}` | hash | `kind`, `word`, `icon`, `startingOdds`, `totalPool`, `betCount`, `history`, `status`, `winner`, `createdAt` |
| `market:{id}:bets` | list | per-market `{ userId, name, amount, lockedOdds, placedAt }` for payouts and admin feed |

Balance changes and pool growth use atomic `HINCRBYFLOAT`, and bets reserve the
stake before committing (rolling back on a losing race), so concurrent bets stay
consistent. `currentOdds` is always derived from `startingOdds` + `totalPool`.

## Project structure

```
app/
  page.tsx              Guest UI (join, markets, betting, my bets, leaderboard)
  admin/page.tsx        Host console (create / resolve / void / reset)
  api/
    session/            POST  create-or-load a user
    markets/            GET   list markets with live odds
    bet/                POST  place a bet (locks odds)
    me/                 GET   balance + settled bets for a user
    leaderboard/        GET   top balances
    admin/markets/      GET/POST  list / create (key-guarded)
    admin/bets/         GET  all wager rows (key-guarded)
    admin/users/        GET  user balances + bet counts (key-guarded)
    admin/config/       GET  runtime config (key-guarded)
    admin/resolve/      POST  resolve spoken | never | void (key-guarded)
    admin/reset/        POST  wipe everything (key-guarded)
lib/
  store.ts              Domain logic (users, markets, bets, payouts)
  kv.ts                 Redis-like interface: Vercel KV or in-memory fallback
  odds.ts               Odds compression formula
  auth.ts               Admin key check
  format.ts             Money / odds formatting
  types.ts              Shared types
```

## Out of scope

Real money, real auth, WebSockets, chat, and post-party analytics — by design.
