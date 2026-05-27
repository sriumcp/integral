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
    await page.goto('/?sources=fixture')
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
    await page.goto('/?sources=fixture')
    await page.getByRole('button', { name: /enter/i }).click()
    // AppHeader is hidden on Landing; visible on Map.
    await expect(page.locator('header[data-surface="map"]')).toBeVisible()
    await expect(page.locator('button[data-kind]')).toHaveCount(6)
  })

  test('clicking the AppHeader logo from Map returns to Landing', async ({ page }) => {
    await page.goto('/?sources=fixture')
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
    await page.goto('/?sources=fixture')

    // 4 active + 2 draft = 6 root cards.
    const cards = page.locator('button[data-kind]')
    await expect(cards).toHaveCount(6)

    // Headline counts active separately from drafts.
    await expect(page.getByText(/4 active/)).toBeVisible()
    await expect(page.getByText(/2 in shaping/)).toBeVisible()
  })

  test('every root kind renders via KindBadge', async ({ page }) => {
    await page.goto('/?sources=fixture')

    // Root kinds = N (nous-campaign), C (coral-optimization),
    //              F (feature-campaign), P (paper-campaign).
    for (const glyph of ['N', 'C', 'F', 'P']) {
      await expect(page.getByText(glyph, { exact: true }).first()).toBeVisible()
    }
  })

  test('awaiting-me chip on the gated Nous campaign', async ({ page }) => {
    await page.goto('/?sources=fixture')

    // The fixture's nous-campaign is gated awaiting `sri`, so exactly one
    // TreeCard carries data-awaiting="true" — the data-* contract is the
    // most stable assertion target.
    const awaitingCards = page.locator('button[data-awaiting="true"]')
    await expect(awaitingCards).toHaveCount(1)
    await expect(awaitingCards.first()).toContainText('awaiting you')
  })

  test('awaiting-me filter narrows to awaiting trees (via + filter chip)', async ({ page }) => {
    await page.goto('/?sources=fixture')

    // Click + filter, then awaiting:me option.
    await page.getByText(/^\+ filter$/).click()
    await page.getByRole('menuitem', { name: 'awaiting:me' }).click()
    // After filtering, only the one awaiting tree remains.
    const cards = page.locator('button[data-kind]')
    await expect(cards).toHaveCount(1)
    // Active chip is visible in the bar.
    await expect(
      page.getByLabel(/filter: awaiting:me/i)
    ).toBeVisible()
  })

  test('clicking a TreeCard navigates to the Detail surface', async ({ page }) => {
    await page.goto('/?sources=fixture')

    // The fixture has 2 coral-optimization cards (1 active + 1 draft).
    // Drafts route to ShapingSurface; non-drafts route to Detail. Be
    // explicit so we test the Detail navigation path.
    await page
      .locator('button[data-kind="coral-optimization"][data-status="active"]')
      .first()
      .click()
    // The Detail surface's own header exposes data-kind for the focused intent.
    await expect(
      page.locator('header[data-kind="coral-optimization"]')
    ).toBeVisible()
    // Back to map.
    await page.getByRole('button', { name: /^← map$/ }).click()
    await expect(page.locator('button[data-kind]')).toHaveCount(6)
  })

  test('zoom toggle changes Detail body — overview collapses children list', async ({ page }) => {
    await page.goto('/?sources=fixture')

    await page.locator('button[data-kind="nous-campaign"]').first().click()
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
    await page.goto('/?sources=fixture')

    await page.locator('button[data-kind="nous-campaign"]').first().click()
    await page.getByRole('button', { name: /open iter-2/ }).click()
    await expect(page.locator('header[data-kind="nous-iteration"]')).toBeVisible()
  })

  test('clicking an evidence edge navigates cross-tree', async ({ page }) => {
    await page.goto('/?sources=fixture')

    await page.locator('button[data-kind="paper-campaign"]').first().click()
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
    await page.goto('/?sources=fixture')

    // Critical fixture event: ci-status-changed: passing → failing on feature-pr.
    const criticalRow = page.locator('button[data-event][data-significance="critical"]')
    await expect(criticalRow).toBeVisible()
    await criticalRow.click()
    await expect(page.locator('header[data-kind="feature-pr"]')).toBeVisible()
  })

  test('clicking a draft TreeCard routes to ShapingSurface (not Detail)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/?sources=fixture')

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
    await page.goto('/?sources=fixture')

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

  test('sources dropdown reflects enabled set from URL', async ({ page }) => {
    await page.goto('/?sources=fixture')
    const picker = page.getByTestId('source-picker')
    await expect(picker).toBeVisible()
    // The trigger summary shows enabled-of-total before any click.
    await expect(picker.getByTestId('sources-summary')).toContainText(
      /sources:\s*1\s*of/i
    )
    // Open the panel before the toggle buttons become visible —
    // <details> collapses its panel by default.
    await picker.getByTestId('sources-summary').click()
    await expect(picker.locator('button[data-source="fixture"]')).toBeVisible()
    await expect(picker.locator('button[data-source="nous"]')).toBeVisible()
    // Fixture is enabled, nous is not (per the URL).
    await expect(
      picker.locator('button[data-source="fixture"][data-enabled="true"]')
    ).toBeVisible()
    await expect(
      picker.locator('button[data-source="nous"][data-enabled="true"]')
    ).toHaveCount(0)
  })

  test('TreeCards expose a "via" source chip', async ({ page }) => {
    await page.goto('/?sources=fixture')
    // Every fixture intent is decorated with provenance.source = 'fixture'
    // by the loader; TreeCards render a small "via fixture" chip.
    const viaChips = page.locator('button[data-kind] >> text=via fixture')
    await expect(viaChips.first()).toBeVisible()
    // At least 6 of them — one per visible TreeCard.
    expect(await viaChips.count()).toBeGreaterThanOrEqual(6)
  })

  test('activity strip can be hidden and shown via the toggle', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/?sources=fixture')

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

  // ─── C1: filter / group / sort on Map ─────────────────────────────────

  test('C1: adding kind filter via + filter narrows the Map', async ({ page }) => {
    await page.goto('/?sources=fixture')
    const initialCount = await page.locator('button[data-kind]').count()

    await page.getByText(/^\+ filter$/).click()
    await page.getByRole('menuitem', { name: 'nous-campaign' }).click()

    // Cards filter to nous-campaign only.
    const filteredCards = page.locator('button[data-kind="nous-campaign"]')
    expect(await filteredCards.count()).toBeGreaterThan(0)
    expect(await page.locator('button[data-kind]').count()).toBeLessThan(
      initialCount
    )
    // Active chip visible.
    await expect(
      page.getByLabel(/filter: kind:nous-campaign/i)
    ).toBeVisible()
    // URL reflects the filter.
    expect(page.url()).toContain('kind=nous-campaign')
  })

  test('C1: URL with ?kind=... loads with filter applied', async ({ page }) => {
    await page.goto('/?sources=fixture&kind=nous-campaign')

    await expect(
      page.getByLabel(/filter: kind:nous-campaign/i)
    ).toBeVisible()
    const cards = page.locator('button[data-kind]')
    expect(await cards.count()).toBeGreaterThan(0)
    for (const card of await cards.all()) {
      expect(await card.getAttribute('data-kind')).toBe('nous-campaign')
    }
  })

  test('C1: removing chip via × widens the Map', async ({ page }) => {
    await page.goto('/?sources=fixture&kind=nous-campaign')

    await page
      .getByRole('button', { name: /remove filter kind:nous-campaign/i })
      .click()

    await expect(
      page.getByLabel(/filter: kind:nous-campaign/i)
    ).not.toBeVisible()
    expect(page.url()).not.toContain('kind=')
  })

  test('C1: group by source renders typographic separators', async ({ page }) => {
    // Add a filter so GroupSortControls becomes visible
    await page.goto('/?sources=fixture&awaiting=me&group=source')

    // Grouped forest container is present
    await expect(page.getByTestId('grouped-forest')).toBeVisible()
    // At least one group section header
    const groupSections = page.locator('section[data-group-key]')
    expect(await groupSections.count()).toBeGreaterThanOrEqual(1)
  })

  test('C1: empty results state renders clear-filter link', async ({ page }) => {
    // Filter that excludes everything: paper-claim is not a root kind
    // surfaced on the Map, so kind=paper-claim → empty.
    await page.goto('/?sources=fixture&kind=paper-claim')

    const empty = page.getByTestId('empty-results')
    await expect(empty).toBeVisible()
    await expect(empty).toContainText(/0 intents match/i)

    // Click "clear filter →" → filter clears, Map widens
    await page.getByRole('button', { name: /clear filter/i }).click()
    await expect(empty).not.toBeVisible()
    expect(page.url()).not.toContain('kind=')
  })

  test('C1: GroupSortControls is hidden when no filters and default group/sort', async ({ page }) => {
    await page.goto('/?sources=fixture')
    await expect(page.getByTestId('group-sort-controls')).not.toBeVisible()
  })

  test('C1: GroupSortControls becomes visible when a filter is added', async ({ page }) => {
    await page.goto('/?sources=fixture')
    await expect(page.getByTestId('group-sort-controls')).not.toBeVisible()

    await page.getByText(/^\+ filter$/).click()
    await page.getByRole('menuitem', { name: 'awaiting:me' }).click()

    await expect(page.getByTestId('group-sort-controls')).toBeVisible()
  })
})
