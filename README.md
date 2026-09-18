<p align="center">
  <img src="./public/mascots/glasses-directions.webp" width="160" alt="The Nimoto mascot">
</p>

<h1 align="center">Nimoto</h1>

<p align="center"><b>Learn something every day. Get paid in NIM for being sharp.</b></p>

Nimoto is a daily learning game that lives inside [Nimiq Pay](https://nimiq.com). Every day at 00:00 UTC a
new five-question run goes live. You get one ranked shot at it. Answer fast and right, climb the day's
leaderboard, and the top ten are paid real NIM — straight to the wallet you played with.

No account. No password. No token to buy. Your Nimiq wallet *is* your profile.

## How a day on Nimoto goes

1. **Open Nimoto** in Nimiq Pay, or in any browser and connect your Nimiq wallet.
2. **Play today's ranked run** — five questions, one at a time, 15 seconds of speed bonus each.
3. **See where you landed** — score, rank, Top X%, and how much NIM that rank pays.
4. **Share your card** — a result card with your wallet, your NIM earned and your rank, ready for X.
5. **Come back tomorrow** to keep your streak alive. Miss a day and it resets.

Not ready to compete? **Practice runs** are unlimited, use different questions, and never touch your rank or
streak. Learn first, then play for real.

## What you can win

| Rank today | Prize  |
| ---------- | ------ |
| 1st        | 30 NIM |
| 2nd        | 15 NIM |
| 3rd        | 10 NIM |
| 4th – 10th | 5 NIM  |

That is a 90 NIM pool every single day, fixed and published before anyone plays. Sponsors can grow the pool
by sending NIM to the public prize-pool wallet. Winners are paid by hand after the day closes — we contact
you at the wallet address you played with, so keep that wallet.

## How scoring works

- **1,000 points** for every correct answer.
- **Up to 500 bonus points** for speed, fading to zero over the first 15 seconds of a question.
- Wrong answers score zero. A perfect run is 7,500.
- Ties are broken by total time, so being right *and* quick is what wins.

Everything that matters is decided on the server: the questions you see, the clock, whether you were right,
your score and your rank. Reloading the page doesn't reset the timer and the correct answer is never sent to
your device before you answer. It is a fair game for everyone, on any phone.

## Streaks and invites

Every day you finish a ranked run extends your streak. Your streak shows on your profile and on your share
card — it's the thing people compete over once the leaderboard settles.

Every player has an invite link (`…/?ref=YOURCODE`). Share it, and when a friend connects their wallet and
finishes their first ranked run, the referral counts for you.

## For builders

Nimoto is one small TypeScript package: a Hono API and a React app that share the same scoring code so the
browser and the server can never disagree.

```
src/web      React 18 + Vite + Tailwind Mini App
src/server   Hono API, game engine, settlement, admin CLI
src/shared   Scoring, prize ladder, UTC day logic, API contracts
src/db       Drizzle schema and the question bank
```

### Run it locally

```bash
nvm use                      # Node 22
pnpm install
cp .env.example .env         # set DATABASE_URL and ADMIN_API_TOKEN

docker run -d --name nimoto-pg -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:16
createdb nimoto
pnpm db:migrate && pnpm db:seed
pnpm dev                     # API :8787, web :5173
```

Wallet sign-in is real in every build: the Mini App SDK inside Nimiq Pay, Nimiq Hub Connect everywhere else
(`VITE_NIMIQ_HUB_URL` — `https://hub.nimiq-testnet.com` for testnet). The server issues a one-time nonce, the
wallet signs it, the API verifies the signature.

### Check it

```bash
pnpm lint && pnpm typecheck && pnpm build
createdb nimoto_test
TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/nimoto_test pnpm test
```

### Deploy it

[`render.yaml`](./render.yaml) is a Render Blueprint: the API, the static web app, a 23:50 UTC cron that
pre-creates tomorrow's challenge and a 00:10 UTC cron that settles the day just closed. The database is Neon —
paste the **pooled** connection string as `DATABASE_URL` on `nimoto-api` (the crons pull it from there) and
keep `DATABASE_SSL=true`. Every deploy runs `pnpm db:migrate && pnpm db:seed` before the API starts, so the
question bank is loaded on the first deploy and topped up whenever new questions are added (seeding is
idempotent: existing prompts are left alone).

### Pay the winners

The server holds no private key and signs nothing. Settlement only records who is owed what:

```bash
pnpm settle -- 2026-01-31           # idempotent
pnpm winners -- --date 2026-01-31   # who to pay; add --csv to export
```

Send each prize from the prize-pool wallet in the ordinary Nimiq Wallet, then mark it paid:

```bash
curl -X POST -H "authorization: Bearer $ADMIN_API_TOKEN" \
  -H 'content-type: application/json' -d '{"transactionHash":"..."}' \
  https://<api>/api/admin/payouts/<payoutId>/paid
```

`PRIZE_POOL_ADDRESS` is a plain public NQ address; testnet NIM comes from
`curl -X POST -d "address=NQ..." https://faucet.pos.nimiq-testnet.com/tapit`.

### Share cards and the mascot

Result cards are 1200×675 PNGs drawn on a canvas and shared through the native share sheet, a download, or a
prefilled X post. `VITE_SOCIAL_HANDLE` sets the handle those posts tag (default `@nimoto`).

The mascot is the "glasses" character from [page-mascot](https://koboyo.com/page-mascot); her two sprite
sheets live in `public/mascots`. She follows the cursor and blinks when you poke her.

## Security

See [SECURITY.md](./SECURITY.md): single-use wallet nonces, HTTP-only session cookies, server-authoritative
scoring, rate limits, and an admin token that is separate from player sessions.

## License

[MIT](./LICENSE)
