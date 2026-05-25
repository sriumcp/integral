/**
 * v0.1.5 chrome capture — full-page screenshots of the live chrome
 * with all 3 adapters (Nous + Coral + GitHub-issues) loaded.
 *
 * Goal: ground the v0.1.5 polish brainstorm in evidence rather than
 * speculation. NOT a regression test — output is for human inspection.
 *
 * Lives outside e2e/visual/ so it doesn't interfere with the
 * regression baselines. Outputs to e2e/captures/output/<name>.png.
 *
 * Run with:
 *   ./node_modules/.bin/playwright test e2e/captures/ --project=chromium
 *
 * Requires:
 *   - integral.config.json with all 3 adapters configured
 *   - gh CLI authed
 *   - dev server reachable at localhost:5173 (playwright auto-starts)
 */
import { expect, test, type Page } from '@playwright/test'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const OUT_DIR = path.join(HERE, 'output')

const SKIP_LANDING_INIT =
  "try { window.sessionStorage.setItem('integral.landing-seen', 'true') } catch {}"

const ALL_SOURCES = '?sources=fixture,nous,coral-pi-mc,github-integral'

async function readyForScreenshot(page: Page) {
  await page.evaluate(() => document.fonts.ready)
  // Wait a beat for layout to settle after async data loads.
  await page.waitForTimeout(800)
}

async function snap(page: Page, name: string) {
  await page.screenshot({
    path: path.join(OUT_DIR, `${name}.png`),
    fullPage: true,
    animations: 'disabled',
  })
}

test.use({ viewport: { width: 1440, height: 900 } })

test.describe('v0.1.5 capture — all 3 adapters loaded', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(SKIP_LANDING_INIT)
  })

  test('01-landing', async ({ page }) => {
    await page.context().clearCookies()
    // Force landing visible by bypassing the skip-init for this one.
    await page.goto(`/${ALL_SOURCES}`)
    // If sessionStorage was already set by addInitScript, landing is
    // skipped. Force-show by clearing.
    await page.evaluate(() => sessionStorage.removeItem('integral.landing-seen'))
    await page.goto(`/${ALL_SOURCES}`)
    await readyForScreenshot(page)
    await snap(page, '01-landing')
  })

  test('02-map-all-sources', async ({ page }) => {
    await page.goto(`/${ALL_SOURCES}`)
    await page.waitForSelector('header[data-surface="map"]', { state: 'visible' })
    // Wait for adapter data — listing card count > some threshold.
    await page.waitForFunction(
      () => document.querySelectorAll('button[data-kind]').length >= 5,
      { timeout: 15_000 }
    )
    await readyForScreenshot(page)
    await snap(page, '02-map-all-sources')
  })

  test('03-map-fixture-only', async ({ page }) => {
    await page.goto('/?sources=fixture')
    await page.waitForSelector('header[data-surface="map"]', { state: 'visible' })
    await readyForScreenshot(page)
    await snap(page, '03-map-fixture-only')
  })

  test('04-source-picker-detail', async ({ page }) => {
    // Tight crop on the topRow chip cluster
    await page.goto(`/${ALL_SOURCES}`)
    await page.waitForSelector('header[data-surface="map"]', { state: 'visible' })
    await readyForScreenshot(page)
    const picker = page.getByTestId('source-picker').first()
    if (await picker.count() === 0) {
      // Fall back to top region
      await page.screenshot({
        path: path.join(OUT_DIR, '04-source-picker-detail.png'),
        clip: { x: 0, y: 0, width: 1440, height: 200 },
      })
    } else {
      await picker.screenshot({
        path: path.join(OUT_DIR, '04-source-picker-detail.png'),
      })
    }
  })

  test('05-detail-nous-campaign', async ({ page }) => {
    await page.goto(`/${ALL_SOURCES}`)
    await page.waitForSelector('header[data-surface="map"]', { state: 'visible' })
    // Click first nous-campaign TreeCard
    const card = page
      .locator('button[data-kind="nous-campaign"]')
      .first()
    await card.waitFor({ state: 'visible', timeout: 15_000 })
    await card.click()
    await page.waitForSelector('header[data-surface="detail"]', { state: 'visible' })
    await readyForScreenshot(page)
    await snap(page, '05-detail-nous-campaign')
  })

  test('06-detail-coral-optimization', async ({ page }) => {
    await page.goto(`/${ALL_SOURCES}`)
    await page.waitForSelector('header[data-surface="map"]', { state: 'visible' })
    const card = page
      .locator('button[data-kind="coral-optimization"]')
      .first()
    await card.waitFor({ state: 'visible', timeout: 15_000 })
    await card.click()
    await page.waitForSelector('header[data-surface="detail"]', { state: 'visible' })
    await readyForScreenshot(page)
    await snap(page, '06-detail-coral-optimization')
  })

  test('07-detail-coral-attempt', async ({ page }) => {
    await page.goto(`/${ALL_SOURCES}`)
    await page.waitForSelector('header[data-surface="map"]', { state: 'visible' })
    // Drill: click coral-optimization first, then a coral-attempt child
    const camp = page
      .locator('button[data-kind="coral-optimization"]')
      .first()
    await camp.waitFor({ state: 'visible', timeout: 15_000 })
    await camp.click()
    await page.waitForSelector('header[data-surface="detail"]', { state: 'visible' })
    // Click first coral-attempt child link/row
    const attempt = page.locator('[data-kind="coral-attempt"]').first()
    if ((await attempt.count()) > 0) {
      await attempt.click()
      await readyForScreenshot(page)
    }
    await snap(page, '07-detail-coral-attempt')
  })

  test('08-detail-feature-tracker', async ({ page }) => {
    await page.goto(`/${ALL_SOURCES}`)
    await page.waitForSelector('header[data-surface="map"]', { state: 'visible' })
    // Find a feature-campaign TreeCard with children (the tracking issue #1)
    await page.waitForFunction(
      () =>
        document.querySelectorAll(
          'button[data-kind="feature-campaign"]'
        ).length >= 1,
      { timeout: 20_000 }
    )
    const tracker = page
      .locator('button[data-kind="feature-campaign"]')
      .first()
    await tracker.click()
    await page.waitForSelector('header[data-surface="detail"]', { state: 'visible' })
    await readyForScreenshot(page)
    await snap(page, '08-detail-feature-tracker')
  })

  test('09-detail-feature-leaf', async ({ page }) => {
    // Issue #5 is a top-level leaf feature-campaign. Click by
    // aria-label which embeds the title.
    await page.goto(`/${ALL_SOURCES}`)
    await page.waitForSelector('header[data-surface="map"]', { state: 'visible' })
    await page.waitForFunction(
      () => document.querySelectorAll('button[data-kind="feature-campaign"]').length >= 2,
      { timeout: 20_000 }
    )
    const leaf = page.getByRole('button', { name: /Visual baseline regen tracker/i })
    await leaf.first().click()
    await page.waitForSelector('header[data-surface="detail"]', { state: 'visible' })
    await readyForScreenshot(page)
    await snap(page, '09-detail-feature-leaf')
  })

  test('10-map-with-source-toggled-off', async ({ page }) => {
    // Show only github source
    await page.goto('/?sources=github-integral')
    await page.waitForSelector('header[data-surface="map"]', { state: 'visible' })
    await page.waitForFunction(
      () =>
        document.querySelectorAll(
          'button[data-kind="feature-campaign"]'
        ).length >= 2,
      { timeout: 20_000 }
    )
    await readyForScreenshot(page)
    await snap(page, '10-map-github-only')
  })
})
