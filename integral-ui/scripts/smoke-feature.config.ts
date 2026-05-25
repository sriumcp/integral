// Vitest config override for the GitHub-issues feature adapter smoke
// test. Points the include glob at scripts/. Run via:
//   ./node_modules/.bin/vitest run --config scripts/smoke-feature.config.ts
// Per CLAUDE.md test discipline: smokes against real data are manual
// and stay out of npm test*.
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
    testTimeout: 60_000,
  },
})
