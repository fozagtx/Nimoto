import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    include: ['test/server/**/*.test.ts', 'test/shared/**/*.test.ts'],
    // Integration tests share one Postgres database and truncate between cases,
    // so files must not run concurrently.
    fileParallelism: false,
    hookTimeout: 30_000,
    testTimeout: 30_000,
  },
});
