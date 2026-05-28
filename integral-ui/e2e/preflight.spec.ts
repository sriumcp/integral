import { expect, test } from '@playwright/test'

/**
 * Pre-flight validation — E2E falsification.
 *
 * The v0.1.5 Nous stop condition (per `roadmap.md § Falsification per
 * adapter`): shaping a campaign with a non-existent `repo_path` must
 * surface a fail indicator inline AND gate the commit button. This
 * spec exercises the round-trip: shape draft → edit field → /api/nous/
 * preflight → indicator + button-state update.
 *
 * No mocks: this hits the real Vite plugin's `/api/nous/preflight`
 * endpoint, which probes the real filesystem. We use `/nonexistent`
 * as a path that's guaranteed not to exist on the dev box.
 */

const SKIP_LANDING_INIT =
  "try { window.sessionStorage.setItem('integral.landing-seen', 'true') } catch {}"

test.describe('Pre-flight validation', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(SKIP_LANDING_INIT)
    await page.setViewportSize({ width: 1440, height: 900 })
  })

  test('non-existent repo_path → fail indicator + commit button disabled', async ({
    page,
  }) => {
    await page.goto('/?sources=fixture')

    // Open the fully-resolved Nous draft (its TreeCard is on the Map).
    await page
      .locator('button[data-kind="nous-campaign"][data-status="draft"]')
      .click()
    await expect(page.locator('main[data-surface="shaping"]')).toBeVisible()

    const commit = page.getByRole('button', { name: /commit to active/i })

    // Replace the (good) repo_path with one that definitely doesn't
    // exist. Pre-flight will probe the real filesystem on the dev
    // server and report `repo-path-exists: fail`.
    const repoPath = page.getByRole('textbox', { name: /repo.*path/i })
    await repoPath.fill('/nonexistent-preflight-target-' + Date.now())

    // Wait for the indicator to settle on `fail` (debounce + fetch).
    const indicator = page.getByTestId('preflight-repo-path-exists')
    await expect(indicator).toHaveAttribute('data-preflight-status', 'fail', {
      timeout: 5000,
    })

    // Commit gates on the failure.
    await expect(commit).toBeDisabled()

    // Restoring a real path → preflight settles back to ok → commit re-enables.
    // The fixture's default path (`~/Documents/Projects/inference-sim`) is
    // expanded by the server on a per-source basis, so we use the cwd
    // (always exists) as a generic real-path target instead.
    await repoPath.fill('/')
    await expect(indicator).toHaveAttribute('data-preflight-status', 'ok', {
      timeout: 5000,
    })
    await expect(commit).toBeEnabled()
  })

  test('preflight indicators render next to the relevant fields', async ({
    page,
  }) => {
    await page.goto('/?sources=fixture')

    await page
      .locator('button[data-kind="nous-campaign"][data-status="draft"]')
      .click()
    await expect(page.locator('main[data-surface="shaping"]')).toBeVisible()

    // After the initial settle, all four indicators should appear.
    await expect(page.getByTestId('preflight-repo-path-exists')).toBeVisible({
      timeout: 5000,
    })
    await expect(page.getByTestId('preflight-run-id-not-in-use')).toBeVisible()
    await expect(
      page.getByTestId('preflight-writeback-target-writable')
    ).toBeVisible()
    await expect(page.getByTestId('preflight-nous-cli-available')).toBeVisible()
  })
})
