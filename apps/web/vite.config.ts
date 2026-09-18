import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import nimiq from '@nimiq/core/vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  // The mock wallet signs with @nimiq/core (WASM). Real builds never need it,
  // so the dependency is stubbed out unless the mock is explicitly enabled.
  const useMock = env.VITE_USE_MOCK_NIMIQ === 'true' && mode !== 'production';

  return {
    plugins: [react(), ...(useMock ? nimiq() : [])],
    resolve: {
      alias: useMock
        ? {}
        : { '@nimiq/core': fileURLToPath(new URL('./src/lib/nimiq-core-absent.ts', import.meta.url)) },
    },
    server: {
      port: 5173,
      host: true,
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./test/setup.ts'],
    },
  };
});
