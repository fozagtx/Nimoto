# Contributing

## Setup

```bash
nvm use && pnpm install
cp .env.example .env
docker run -d --name nimoto-pg -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:16
pnpm db:migrate && pnpm db:seed
pnpm dev
```

## Before you push

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

## Conventions

- Business rules that both the API and the web app rely on live in `packages/shared`. Never duplicate scoring,
  prize or date logic in a screen.
- The web app talks to a wallet through `apps/web/src/lib/nimiq.ts` and nowhere else.
- Never trust the client for score, timing, correctness, rank or streak.
- Schema changes go through Drizzle: edit `packages/db/src/schema.ts`, then `pnpm db:generate` and commit the
  generated migration.
- New questions belong in the seed bank with a category, a difficulty and exactly one correct option.
- Do not add chance-based mechanics, wagering or random payouts.
