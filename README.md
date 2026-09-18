# Nimoto — Daily Brain Sprint

A Nimiq Pay Mini App built around one honest loop: **five questions, one ranked run a day, real NIM for the
top ranks.** No wagering, no randomness, no casino mechanics — prizes are fixed per rank and published before
you play.

```
connect wallet → today's challenge → 5 server-controlled questions → score + rank → streak → invite
```

## Stack

| Layer    | Choice                                                    |
| -------- | --------------------------------------------------------- |
| Web      | React 18, TypeScript, Vite, Tailwind CSS                  |
| API      | Node 22, Hono, Zod                                        |
| Data     | PostgreSQL 16, Drizzle ORM + migrations                   |
| Wallet   | `@nimiq/mini-app-sdk`, signature verification via `@nimiq/core` |
| Tests    | Vitest (unit, API integration, web component/flow tests)  |

```
apps/api        Hono API, game engine, settlement, admin CLI
apps/web        React Mini App
packages/shared Scoring, prizes, dates, referral + API contracts
packages/db     Drizzle schema, migrations, question seed bank
```

## Quick start

```bash
nvm use                      # Node 22
pnpm install
cp .env.example .env         # then edit DATABASE_URL and ADMIN_API_TOKEN

docker run -d --name nimoto-pg -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:16
createdb nimoto              # or: docker exec nimoto-pg createdb -U postgres nimoto

pnpm db:migrate
pnpm db:seed                 # 116-question bank
pnpm dev                     # API on :8787, web on :5173
```

Outside Nimiq Pay there is no wallet provider. For local UI work:

```bash
VITE_USE_MOCK_NIMIQ=true pnpm dev:web
```

The mock signs with a deterministic throwaway key, so the API still verifies real signatures — there is no
server-side auth bypass. A **DEV WALLET** banner is shown whenever it is active, and the mock is stripped from
production builds.

## Scoring

- 1000 points per correct answer.
- Up to 500 bonus points, decaying linearly over the first 15 seconds of each question.
- Wrong answers score zero. Maximum run: 7500.
- Ties break on total score, then total duration, then completion time, then attempt id — fully deterministic.
- Answers faster than 350 ms are flagged for review.

Questions are delivered one at a time, timings come from the server clock, and the correct option is never
sent to the browser before an answer is submitted.

## Prizes and settlement

Default ladder per day: 30 / 15 / 10 NIM for ranks 1–3 and 5 NIM for ranks 4–10 (90 NIM pool). Sponsors can
top up a day's pool by sending NIM from their own wallet; the treasury is never exposed as a generic send
endpoint.

```bash
pnpm settle -- 2026-01-31 --dry-run   # preview allocation
pnpm settle -- 2026-01-31             # idempotent: records payouts once
pnpm payouts:run -- --limit 25        # retryable payout worker
```

Settlement refuses to run twice, validates every recipient, and enforces both a per-payout and a daily cap.
Without `TREASURY_PRIVATE_KEY` the API runs in "no payout" mode: allocations are recorded, nothing is sent.

## Testing

```bash
pnpm lint
pnpm typecheck
pnpm test        # shared unit + API integration + web flow tests
pnpm build
```

API integration tests need an empty database:

```bash
createdb nimoto_test
TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/nimoto_test pnpm --filter @nimoto/api test
```

## Security notes

See [SECURITY.md](./SECURITY.md). In short: wallet challenge–response with single-use nonces, HTTP-only
session cookies (bearer tokens inside the Mini App webview), server-authoritative scoring, rate limits, and
an admin surface that is entirely separate from wallet sessions.

## License

[MIT](./LICENSE)
