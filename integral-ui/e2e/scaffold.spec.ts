import { expect, test } from '@playwright/test'

/**
 * Substrate smoke — chrome and core flows that don't depend on a
 * specific data shape.
 *
 * v0.2.0 deleted the fixture, so the tests that asserted specific
 * fixture-only intent IDs / titles / counts went with it. What
 * remains here exercises the substrate against whatever adapter data
 * the configured `integral.config.json` provides — any working dev
 * environment with at least one Nous campaign should pass.
 *
 * Coverage that depended on deterministic fixture data (cross-tree
 * paper-claim → nous-iteration evidence edges, awaiting-me filtering
 * with known counts, etc.) returns when the v0.3+ adapters reintroduce
 * paper-* and feature-pr kinds.
 */

const SKIP_LANDING_INIT =
  "try { window.sessionStorage.setItem('integral.landing-seen', 'true') } catch {}"

test.describe('Landing', () => {
  test('loads with glyph, peek, and enter button', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('main[data-surface="landing"]')).toBeVisible()
    await expect(page.locator('svg[aria-label*="Integral"]').first()).toBeVisible()
    await expect(page.getByRole('button', { name: /enter/i })).toBeVisible()
  })

  test('clicking enter navigates to Map and AppHeader appears', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: /enter/i }).click()
    await expect(page.locator('header[data-surface="map"]')).toBeVisible()
  })
})

test.describe('Map (post-landing)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(SKIP_LANDING_INIT)
    await page.setViewportSize({ width: 1440, height: 900 })
  })

  test('AppHeader renders schema-version chip and refresh affordance', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('header[data-surface="map"]')).toBeVisible()
    await expect(page.getByText(/schema v0\.2\.0/)).toBeVisible()
  })

  test('clicking the AppHeader logo returns to Landing', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('header[data-surface="map"]')).toBeVisible()
    await page.getByRole('button', { name: /Integral.*back to landing/i }).click()
    await expect(page.locator('main[data-surface="landing"]')).toBeVisible()
  })

  test('+ new nous campaign creates a draft and navigates to Shaping', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: /new nous campaign/i }).click()
    await expect(page.locator('main[data-surface="shaping"]')).toBeVisible()
    // The new draft has a writeback form with a repo_path field.
    await expect(page.getByRole('textbox', { name: /repo.*path/i })).toBeVisible()
  })

  test('back from Shaping returns to Map', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: /new nous campaign/i }).click()
    await expect(page.locator('main[data-surface="shaping"]')).toBeVisible()
    await page.getByRole('button', { name: /^← map$/ }).click()
    await expect(page.locator('header[data-surface="map"]')).toBeVisible()
  })

  test('any TreeCard click navigates to a Detail or Shaping surface', async ({ page }) => {
    await page.goto('/')
    // Wait for at least one card to render. If no adapter data is
    // available in this dev env, skip — no card to click.
    const cards = page.locator('button[data-kind]')
    const count = await cards.count()
    if (count === 0) test.skip(true, 'no adapter data available — nothing to click')
    await cards.first().click()
    // Either Detail (active card) or Shaping (draft card).
    const surfaceRoot = page.locator(
      'main[data-surface="detail"], main[data-surface="shaping"]'
    )
    await expect(surfaceRoot.first()).toBeVisible()
  })
})
