import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright configuration for behavioral E2E + visual regression.
 *
 * Two projects:
 *  - `chromium` runs the behavioral specs in `e2e/*.spec.ts` (everything
 *    except the `visual/` subdirectory).
 *  - `visual` runs the screenshot baseline spec in `e2e/visual/`. Pinned
 *    to 1440×900 with animations disabled and a strict pixel tolerance
 *    so refactors that drift the cognitive-instrument aesthetic toward
 *    Linear/Jira show up as failed diffs.
 *
 * The dev server is auto-started for both projects. Visual baselines
 * live in `e2e/visual/__screenshots__/` (committed to the repo per the
 * goals.md decision); see `e2e/visual/README.md` for the canonical
 * capture machine and the assert-vs-warn promotion plan.
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
  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.01,
      animations: 'disabled',
    },
  },
  projects: [
    {
      name: 'chromium',
      testIgnore: ['**/visual/**'],
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'visual',
      testMatch: ['**/visual/*.spec.ts'],
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 2,
      },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env['CI'],
    timeout: 30_000,
  },
})
