/** Vitest config override for the Coral smoke test — points the include
 *  glob at `scripts/` since the canonical config (vite.config.ts) only
 *  picks up `src/**`. Run via:
 *    ./node_modules/.bin/vitest run --config scripts/smoke-coral.config.ts
 *  Per CLAUDE.md § Test discipline — smokes are manual and stay out of
 *  `npm test*`. */
import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '../src'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['scripts/**/*.test.ts'],
    css: false,
  },
})
