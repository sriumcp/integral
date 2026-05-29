import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright configuration for behavioral E2E.
 *
 * v0.2.0 dropped the visual regression project alongside the runtime
 * fixture — every visual baseline depended on `?sources=fixture` for
 * deterministic data. Visual coverage returns when a deterministic
 * data-seeding mechanism (or a paper / feature-pr adapter) ships.
 *
 * The dev server is auto-started for the chromium project.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env['CI'],
    timeout: 30_000,
  },
})
