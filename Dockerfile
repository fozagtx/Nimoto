FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM deps AS runtime
COPY tsconfig.json ./
COPY migrations migrations
COPY src src
ENV NODE_ENV=production
EXPOSE 8787
# The server runs from TypeScript sources through tsx.
CMD ["pnpm", "start"]
