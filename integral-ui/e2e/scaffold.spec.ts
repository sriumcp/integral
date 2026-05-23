import { expect, test } from '@playwright/test'

/**
 * Map + Detail surfaces — E2E smoke tests.
 *
 * What's covered:
 *  - Landing surface loads, peek matches workspace, enter navigates to Map.
 *  - Map loads with the four root campaigns rendered as TreeCards.
 *  - The schema-validation pipeline reaches the DOM (root kinds render via
 *    KindBadge — every glyph appears).
 *  - "awaiting me" filter narrows to trees the predicate matches.
 *  - Click-to-open navigates to the Detail surface.
 *  - Zoom toggle changes body content (overview collapses children list).
 *  - Clicking a child within Detail drills further.
 *  - Clicking an evidence edge navigates cross-tree.
 *
 * Visual regression (screenshot diff) is intentionally NOT here yet — the
 * v0.1 surface chrome stabilizes on Item 5 of goals.md.
 *
 * Discipline: Map+Detail tests pre-set the once-per-session landing flag so
 * `goto('/')` lands directly on Map. The Landing-flow test runs in its own
 * `test.describe` block where the flag is left untouched.
 */

const SKIP_LANDING_INIT =
  "try { window.sessionStorage.setItem('integral.landing-seen', 'true') } catch {}"

test.describe('Landing flow', () => {
  test('landing loads with glyph, peek, and enter button', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('main[data-surface="landing"]')).toBeVisible()
    await expect(page.getByRole('img', { name: /integral/i })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Integral' })).toBeVisible()
    await expect(
      page.getByText('intent management for humans + agents')
    ).toBeVisible()
    // Fixture: 4 root campaigns; 1 awaiting `sri`.
    await expect(page.getByText(/4 active/)).toBeVisible()
    await expect(page.getByText(/1 awaiting you/)).toBeVisible()
    await expect(page.getByRole('button', { name: /enter/i })).toBeVisible()
  })

  test('clicking enter navigates to Map and AppHeader appears', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: /enter/i }).click()
    // AppHeader is hidden on Landing; visible on Map.
    await expect(page.locator('header[data-surface="map"]')).toBeVisible()
    await expect(page.locator('button[data-kind]')).toHaveCount(6)
  })

  test('clicking the AppHeader logo from Map returns to Landing', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: /enter/i }).click()
    await expect(page.locator('header[data-surface="map"]')).toBeVisible()
    // Logo (glyph + wordmark) is a button — wired to clear the session
    // flag and route back to Landing.
    await page
      .getByRole('button', { name: /integral · back to landing/i })
      .click()
    await expect(page.locator('main[data-surface="landing"]')).toBeVisible()
    await expect(page.getByRole('button', { name: /enter/i })).toBeFocused()
  })
})

test.describe('Map + Detail (post-landing)', () => {
  test.beforeEach(async ({ page }) => {
    // Session flag pre-set so each test starts on Map, not Landing.
    await page.addInitScript(SKIP_LANDING_INIT)
  })

  test('map loads with active and draft campaigns', async ({ page }) => {
    await page.goto('/')

    // 4 active + 2 draft = 6 root cards.
    const cards = page.locator('button[data-kind]')
    await expect(cards).toHaveCount(6)

    // Headline counts active separately from drafts.
    await expect(page.getByText(/4 active/)).toBeVisible()
    await expect(page.getByText(/2 in shaping/)).toBeVisible()
  })

  test('every root kind renders via KindBadge', async ({ page }) => {
    await page.goto('/')

    // Root kinds = N (nous-campaign), C (coral-optimization),
    //              F (feature-campaign), P (paper-campaign).
    for (const glyph of ['N', 'C', 'F', 'P']) {
      await expect(page.getByText(glyph, { exact: true }).first()).toBeVisible()
    }
  })

  test('awaiting-me chip on the gated Nous campaign', async ({ page }) => {
    await page.goto('/')

    // The fixture's nous-campaign is gated awaiting `sri`, so exactly one
    // TreeCard carries data-awaiting="true" — the data-* contract is the
    // most stable assertion target.
    const awaitingCards = page.locator('button[data-awaiting="true"]')
    await expect(awaitingCards).toHaveCount(1)
    await expect(awaitingCards.first()).toContainText('awaiting you')
  })

  test('awaiting-me filter narrows to awaiting trees', async ({ page }) => {
    await page.goto('/')

    await page.getByText(/^awaiting me · /).click()
    // After filtering, only the one awaiting tree remains.
    const cards = page.locator('button[data-kind]')
    await expect(cards).toHaveCount(1)
  })

  test('clicking a TreeCard navigates to the Detail surface', async ({ page }) => {
    await page.goto('/')

    await page.getByRole('button', { name: /coral-optimization/ }).first().click()
    // The Detail surface's own header exposes data-kind for the focused intent.
    await expect(
      page.locator('header[data-kind="coral-optimization"]')
    ).toBeVisible()
    // Back to map.
    await page.getByRole('button', { name: /^← map$/ }).click()
    await expect(page.locator('button[data-kind]')).toHaveCount(6)
  })

  test('zoom toggle changes Detail body — overview collapses children list', async ({ page }) => {
    await page.goto('/')

    await page.getByRole('button', { name: /nous-campaign/ }).first().click()
    await expect(page.locator('header[data-kind="nous-campaign"]')).toBeVisible()

    await expect(page.getByText(/iter-2 · reward-curvature probe/)).toBeVisible()

    // Scope to the zoom toggle group; the AppHeader breadcrumb also exposes
    // a "detail" button for view navigation, which would collide otherwise.
    const zoom = page.getByRole('group', { name: 'zoom level' })

    await zoom.getByRole('button', { name: 'overview' }).click()
    await expect(page.getByText(/iter-2 · reward-curvature probe/)).toBeHidden()
    await expect(page.getByText(/1 child/i)).toBeVisible()

    await zoom.getByRole('button', { name: 'detail' }).click()
    await expect(page.getByText(/iter-2 · reward-curvature probe/)).toBeVisible()
  })

  test('clicking a child within Detail drills further', async ({ page }) => {
    await page.goto('/')

    await page.getByRole('button', { name: /nous-campaign/ }).first().click()
    await page.getByRole('button', { name: /open iter-2/ }).click()
    await expect(page.locator('header[data-kind="nous-iteration"]')).toBeVisible()
  })

  test('clicking an evidence edge navigates cross-tree', async ({ page }) => {
    await page.goto('/')

    await page.getByRole('button', { name: /paper-campaign/ }).first().click()
    await page.getByRole('button', { name: /open §4 · Results/ }).click()
    await page.getByRole('button', { name: /open Claim 19/ }).click()
    await expect(page.locator('header[data-kind="paper-claim"]')).toBeVisible()

    // The strong-derived-from edge resolves to the Nous iteration.
    await page.locator('button[data-edge][data-resolvable="true"]').first().click()
    await expect(page.locator('header[data-kind="nous-iteration"]')).toBeVisible()
  })

  test('workspace activity strip renders critical event and click navigates', async ({ page }) => {
    // Strip is visible at >=1280px; the test viewport defaults to 1280x720.
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/')

    // Critical fixture event: ci-status-changed: passing → failing on feature-pr.
    const criticalRow = page.locator('button[data-event][data-significance="critical"]')
    await expect(criticalRow).toBeVisible()
    await criticalRow.click()
    await expect(page.locator('header[data-kind="feature-pr"]')).toBeVisible()
  })

  test('clicking a draft TreeCard routes to ShapingSurface (not Detail)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/')

    // The fully-resolved Nous draft has its own TreeCard on the Map.
    // Scope to TreeCard buttons (data-kind) — the new activity-strip
    // operation rows also expose buttons with overlapping text.
    await page.locator('button[data-kind="nous-campaign"][data-status="draft"]').click()
    await expect(page.locator('main[data-surface="shaping"]')).toBeVisible()
    // Both panes render.
    await expect(page.getByRole('heading', { name: /shaping dialog/i })).toBeVisible()
    await expect(page.getByRole('heading', { name: /intent draft/i })).toBeVisible()
    // Commit is enabled because all fields resolved.
    await expect(page.getByRole('button', { name: /commit to active/i })).toBeEnabled()

    // Partial Coral draft — commit should be disabled and pending chips visible.
    await page.getByRole('button', { name: /^← map$/ }).click()
    await page.locator('button[data-kind="coral-optimization"][data-status="draft"]').click()
    await expect(page.getByRole('button', { name: /commit to active/i })).toBeDisabled()
    await expect(page.getByText(/⚠ pending/).first()).toBeVisible()
  })

  test('activity strip remains visible on Detail and routine bucket toggles', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/')

    // Open any tree to reach Detail; the strip is still rendered alongside.
    await page.locator('button[data-kind="coral-optimization"][data-status="active"]').click()
    await expect(page.locator('header[data-kind="coral-optimization"]')).toBeVisible()
    await expect(
      page.getByRole('heading', { name: /activity/i }).first()
    ).toBeVisible()

    // On Detail, the strip auto-scopes to "this intent" — toggle to "all"
    // so the routine bucket includes events from other trees.
    await page.getByRole('button', { name: /scope/i }).click()
    await expect(page.getByText(/section-status-changed/)).toBeHidden()
    await page.getByRole('button', { name: /routine \d+/ }).click()
    await expect(page.getByText(/section-status-changed/)).toBeVisible()
  })

  test('activity strip can be hidden and shown via the toggle', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/')

    // Default: strip is visible, hide toggle is in the header.
    await expect(
      page.getByRole('heading', { name: /activity/i }).first()
    ).toBeVisible()
    await page.getByRole('button', { name: /hide activity/i }).click()

    // Strip collapses to a rail; only the show-activity toggle remains.
    await expect(page.getByRole('complementary', { name: /collapsed/i })).toBeVisible()
    await expect(
      page.getByRole('heading', { name: /activity/i })
    ).not.toBeVisible()
    await page.getByRole('button', { name: /show activity/i }).click()

    // Strip expands again.
    await expect(
      page.getByRole('heading', { name: /activity/i }).first()
    ).toBeVisible()
  })
})
