import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
  },
  resolve: {
    alias: {
      // DO runtime only exists in workerd; stub for node-based tests.
      'cloudflare:workers': fileURLToPath(new URL('./tests/cloudflare-workers-stub.ts', import.meta.url)),
    },
  },
});
