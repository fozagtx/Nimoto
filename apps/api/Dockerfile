FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/
RUN pnpm install --frozen-lockfile --filter @nimoto/api...

FROM deps AS runtime
COPY tsconfig.base.json ./
COPY packages packages
COPY apps/api apps/api
ENV NODE_ENV=production
EXPOSE 8787
# Workspace packages are published as TypeScript sources and executed with tsx.
CMD ["pnpm", "--filter", "@nimoto/api", "start"]
