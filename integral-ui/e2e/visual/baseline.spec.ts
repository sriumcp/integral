import { expect, test } from '@playwright/test'

/**
 * Visual regression baselines for v0.1.
 *
 * Discipline:
 *  - 1440×900 viewport, 2× DPR, animations disabled, font-load gated
 *    (every test waits for `document.fonts.ready` before screenshot).
 *  - Tolerance: `maxDiffPixelRatio: 0.01` (configured in `playwright.config.ts`).
 *  - First-run policy (this session): captures baselines via
 *    `npm run test:e2e:visual:update`. Subsequent runs of `npm run
 *    test:e2e:visual` diff against committed snapshots.
 *  - Promotion to assertions: covered by the goals.md "assert vs warn"
 *    decision — assert from this session forward; warn-only first-run
 *    is achieved by capturing baselines via `:update` before normal
 *    diffing kicks in.
 *
 * Snapshots live in `e2e/visual/baseline.spec.ts-snapshots/` (Playwright's
 * default naming convention) and are committed.
 */

const SKIP_LANDING_INIT =
  "try { window.sessionStorage.setItem('integral.landing-seen', 'true') } catch {}"

async function readyForScreenshot(page: import('@playwright/test').Page) {
  await page.evaluate(() => document.fonts.ready)
  // Stabilize any layout settling after fonts swap in.
  await page.waitForTimeout(150)
}

test.describe('visual / landing', () => {
  test('landing surface', async ({ page }) => {
    await page.goto('/?sources=fixture')
    await expect(page.getByRole('button', { name: /enter/i })).toBeVisible()
    await readyForScreenshot(page)
    await expect(page).toHaveScreenshot('landing.png', { fullPage: true })
  })
})

test.describe('visual / map + detail + activity', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(SKIP_LANDING_INIT)
  })

  test('map default', async ({ page }) => {
    await page.goto('/?sources=fixture')
    await expect(page.locator('header[data-surface="map"]')).toBeVisible()
    await readyForScreenshot(page)
    await expect(page).toHaveScreenshot('map-default.png', { fullPage: true })
  })

  test('map with awaiting-me filter active', async ({ page }) => {
    await page.goto('/?sources=fixture')
    await page.getByText(/^awaiting me · /).click()
    await readyForScreenshot(page)
    await expect(page).toHaveScreenshot('map-awaiting-filter.png', { fullPage: true })
  })

  test('workspace activity strip', async ({ page }) => {
    await page.goto('/?sources=fixture')
    // Expand routine bucket so the strip's full content is captured.
    await page.getByRole('button', { name: /routine \d+/ }).click()
    await readyForScreenshot(page)
    const strip = page.locator('aside').first()
    await expect(strip).toHaveScreenshot('activity-strip-expanded.png')
  })
})

test.describe('visual / detail by intent kind', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(SKIP_LANDING_INIT)
  })

  // Each kind needs a navigation path from the Map. Drilling order matches
  // fixture decomposition so the breadcrumb depth is consistent.

  test('detail nous-campaign at structure zoom', async ({ page }) => {
    await page.goto('/?sources=fixture')
    await page.getByRole('button', { name: /nous-campaign/ }).first().click()
    await expect(page.locator('header[data-kind="nous-campaign"]')).toBeVisible()
    await readyForScreenshot(page)
    await expect(page).toHaveScreenshot('detail-nous-campaign.png', { fullPage: true })
  })

  test('detail nous-iteration at structure zoom', async ({ page }) => {
    await page.goto('/?sources=fixture')
    await page.getByRole('button', { name: /nous-campaign/ }).first().click()
    await page.getByRole('button', { name: /open iter-2/ }).click()
    await expect(page.locator('header[data-kind="nous-iteration"]')).toBeVisible()
    await readyForScreenshot(page)
    await expect(page).toHaveScreenshot('detail-nous-iteration.png', { fullPage: true })
  })

  test('detail nous-iteration at detail zoom', async ({ page }) => {
    await page.goto('/?sources=fixture')
    await page.getByRole('button', { name: /nous-campaign/ }).first().click()
    await page.getByRole('button', { name: /open iter-2/ }).click()
    await page
      .getByRole('group', { name: 'zoom level' })
      .getByRole('button', { name: 'detail' })
      .click()
    await readyForScreenshot(page)
    await expect(page).toHaveScreenshot('detail-nous-iteration-zoom-detail.png', { fullPage: true })
  })

  test('detail coral-optimization at structure zoom', async ({ page }) => {
    await page.goto('/?sources=fixture')
    await page.getByRole('button', { name: /coral-optimization/ }).first().click()
    await expect(page.locator('header[data-kind="coral-optimization"]')).toBeVisible()
    await readyForScreenshot(page)
    await expect(page).toHaveScreenshot('detail-coral-optimization.png', { fullPage: true })
  })

  test('detail coral-attempt at structure zoom', async ({ page }) => {
    await page.goto('/?sources=fixture')
    await page.getByRole('button', { name: /coral-optimization/ }).first().click()
    await page.getByRole('button', { name: /open attempt-042/ }).click()
    await expect(page.locator('header[data-kind="coral-attempt"]')).toBeVisible()
    await readyForScreenshot(page)
    await expect(page).toHaveScreenshot('detail-coral-attempt.png', { fullPage: true })
  })

  test('detail feature-campaign at structure zoom', async ({ page }) => {
    await page.goto('/?sources=fixture')
    await page.getByRole('button', { name: /feature-campaign/ }).first().click()
    await expect(page.locator('header[data-kind="feature-campaign"]')).toBeVisible()
    await readyForScreenshot(page)
    await expect(page).toHaveScreenshot('detail-feature-campaign.png', { fullPage: true })
  })

  test('detail feature-pr at structure zoom', async ({ page }) => {
    await page.goto('/?sources=fixture')
    await page.getByRole('button', { name: /feature-campaign/ }).first().click()
    await page.getByRole('button', { name: /open Add intent-state projection cache/ }).click()
    await expect(page.locator('header[data-kind="feature-pr"]')).toBeVisible()
    await readyForScreenshot(page)
    await expect(page).toHaveScreenshot('detail-feature-pr.png', { fullPage: true })
  })

  test('detail paper-campaign at structure zoom', async ({ page }) => {
    await page.goto('/?sources=fixture')
    await page.getByRole('button', { name: /paper-campaign/ }).first().click()
    await expect(page.locator('header[data-kind="paper-campaign"]')).toBeVisible()
    await readyForScreenshot(page)
    await expect(page).toHaveScreenshot('detail-paper-campaign.png', { fullPage: true })
  })

  test('detail paper-section at structure zoom', async ({ page }) => {
    await page.goto('/?sources=fixture')
    await page.getByRole('button', { name: /paper-campaign/ }).first().click()
    await page.getByRole('button', { name: /open §4 · Results/ }).click()
    await expect(page.locator('header[data-kind="paper-section"]')).toBeVisible()
    await readyForScreenshot(page)
    await expect(page).toHaveScreenshot('detail-paper-section.png', { fullPage: true })
  })

  test('detail paper-claim at structure zoom', async ({ page }) => {
    await page.goto('/?sources=fixture')
    await page.getByRole('button', { name: /paper-campaign/ }).first().click()
    await page.getByRole('button', { name: /open §4 · Results/ }).click()
    await page.getByRole('button', { name: /open Claim 19/ }).click()
    await expect(page.locator('header[data-kind="paper-claim"]')).toBeVisible()
    await readyForScreenshot(page)
    await expect(page).toHaveScreenshot('detail-paper-claim.png', { fullPage: true })
  })
})

test.describe('visual / shaping', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(SKIP_LANDING_INIT)
  })

  test('shaping surface — fully resolved Nous draft', async ({ page }) => {
    await page.goto('/?sources=fixture')
    // Scope to TreeCards (data-kind/data-status) — operation rows in the
    // workspace activity strip also expose buttons with overlapping text.
    await page
      .locator('button[data-kind="nous-campaign"][data-status="draft"]')
      .click()
    await expect(page.locator('main[data-surface="shaping"]')).toBeVisible()
    await readyForScreenshot(page)
    await expect(page).toHaveScreenshot('shaping-nous-draft.png', { fullPage: true })
  })
})
