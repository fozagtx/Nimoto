import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    include: ['test/web/**/*.test.tsx'],
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./test/web/setup.ts'],
  },
});
