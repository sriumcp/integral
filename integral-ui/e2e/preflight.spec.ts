import { promises as fs } from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { expect, test } from '@playwright/test'

/**
 * Pre-flight validation — E2E falsification.
 *
 * Stop condition: shaping a campaign with a non-existent `repo_path` must
 * surface a fail indicator inline AND gate the commit button. This spec
 * exercises the round-trip: shape draft → edit field → /api/nous/preflight
 * → indicator + button-state update.
 *
 * No mocks: this hits the real Vite plugin's `/api/nous/preflight`
 * endpoint, which probes the real filesystem on the dev server. We
 * generate the bad path with `Date.now()` so it's collision-proof
 * across reruns, and we use a freshly-created tmpdir for the
 * "restore good path" assertion so the test is portable across dev
 * boxes and CI (no reliance on `/` being writable).
 *
 * v0.2.0 dropped the fixture; the test seed-draft no longer exists in
 * the running app. Each test creates a fresh draft via the Map's
 * `+ new nous campaign` button, then exercises the writeback form.
 */

const SKIP_LANDING_INIT =
  "try { window.sessionStorage.setItem('integral.landing-seen', 'true') } catch {}"

/** Click the Map's `+ new nous campaign` button, fill the required
 *  writeback fields (name + description), and wait for the Shaping
 *  surface to settle into a state where preflight will fire.
 *
 *  The Shaping surface's `preflightSourceId` derives from
 *  `writebackChange`, which the WritebackForm emits only when its
 *  validation passes. On a fresh draft, name + description are empty,
 *  so the form emits null and preflight stays idle. Filling those
 *  fields with placeholder values lets the form emit a valid config
 *  and unblocks preflight on the repo_path / run_id fields the
 *  individual tests care about. */
async function openNewNousDraft(page: import('@playwright/test').Page) {
  await page.goto('/')
  await page.getByRole('button', { name: /new nous campaign/i }).click()
  await expect(page.locator('main[data-surface="shaping"]')).toBeVisible()
  await expect(page.getByRole('textbox', { name: /repo.*path/i })).toBeVisible()
  await page
    .getByRole('textbox', { name: /target system name/i })
    .fill('e2e preflight target')
  await page
    .getByRole('textbox', { name: /target system description/i })
    .fill('e2e preflight description')
}

test.describe('Pre-flight validation', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(SKIP_LANDING_INIT)
    await page.setViewportSize({ width: 1440, height: 900 })
  })

  test('non-existent repo_path → fail indicator + commit button gated', async ({
    page,
  }) => {
    await openNewNousDraft(page)

    const commit = page.getByRole('button', { name: /commit to active/i })

    // Fill repo_path with a definitely-doesn't-exist path. Pre-flight
    // probes the real filesystem and reports `repo-path-exists: fail`.
    const repoPath = page.getByRole('textbox', { name: /repo.*path/i })
    const badPath = `/nonexistent-preflight-target-${Date.now()}`
    await repoPath.fill(badPath)

    // Wait for the indicator to settle on `fail` (debounce + fetch).
    const indicator = page.getByTestId('preflight-repo-path-exists')
    await expect(indicator).toHaveAttribute('data-preflight-status', 'fail', {
      timeout: 5000,
    })

    // Commit gates on the failure (the stop condition).
    await expect(commit).toBeDisabled()
  })

  test('regular file at repo_path → fail (directory-only contract)', async ({
    page,
  }, testInfo) => {
    // `pathExists` must reject files — `/etc/passwd`-style "file at the
    // repo path" must NOT pass pre-flight, because `nous run` requires a
    // directory.
    const tmpFile = path.join(
      os.tmpdir(),
      `integral-preflight-file-${Date.now()}.txt`,
    )
    await fs.writeFile(tmpFile, 'hello', 'utf-8')
    testInfo.attach('tmpFile', { body: tmpFile, contentType: 'text/plain' })

    try {
      await openNewNousDraft(page)

      const repoPath = page.getByRole('textbox', { name: /repo.*path/i })
      await repoPath.fill(tmpFile)

      const indicator = page.getByTestId('preflight-repo-path-exists')
      await expect(indicator).toHaveAttribute('data-preflight-status', 'fail', {
        timeout: 5000,
      })
      const commit = page.getByRole('button', { name: /commit to active/i })
      await expect(commit).toBeDisabled()
    } finally {
      await fs.rm(tmpFile, { force: true })
    }
  })

  test('run_id matching an existing campaign-X.yaml → fail', async ({
    page,
    request,
  }, testInfo) => {
    // Cross-field falsification. Drop a real `campaign-<runId>.yaml`
    // into the configured Nous source path, type that runId into the
    // field, assert pre-flight reports run-id-not-in-use as fail. Then
    // clean up the file.

    const sourcesRes = await request.get('/api/sources')
    if (!sourcesRes.ok()) test.skip(true, 'sources endpoint unreachable')
    const { sources } = (await sourcesRes.json()) as {
      sources: Array<{ id: string; adapter_kind: string; path: string }>
    }
    const nousSource = sources.find((s) => s.adapter_kind === 'nous')
    if (!nousSource) test.skip(true, 'no nous source configured')
    let sourceWritable = false
    try {
      await fs.access(nousSource!.path)
      sourceWritable = true
    } catch {
      sourceWritable = false
    }
    if (!sourceWritable) test.skip(true, `nous source path missing: ${nousSource!.path}`)

    const collisionRunId = `e2e-collision-${Date.now()}`
    const collisionFile = path.join(
      nousSource!.path,
      `campaign-${collisionRunId}.yaml`,
    )
    await fs.writeFile(collisionFile, '# e2e fixture\n', 'utf-8')
    testInfo.attach('collisionFile', {
      body: collisionFile,
      contentType: 'text/plain',
    })

    try {
      await openNewNousDraft(page)
      // Fill repo_path with a definitely-existing dir so the writeback
      // form passes its own validation and emits a config; preflight
      // can then run on the run_id we're about to type. We use the
      // configured nous source path itself, which the test already
      // verified exists.
      await page
        .getByRole('textbox', { name: /repo.*path/i })
        .fill(nousSource!.path)

      const runIdField = page.getByRole('textbox', { name: /run id/i })
      await runIdField.fill(collisionRunId)

      const indicator = page.getByTestId('preflight-run-id-not-in-use')
      await expect(indicator).toHaveAttribute(
        'data-preflight-status',
        'fail',
        { timeout: 5000 },
      )
      const commit = page.getByRole('button', { name: /commit to active/i })
      await expect(commit).toBeDisabled()
    } finally {
      await fs.rm(collisionFile, { force: true })
    }
  })

  test('preflight indicators render next to the relevant fields', async ({
    page,
  }) => {
    await openNewNousDraft(page)

    // Fill repo_path with anything non-empty so preflight has all
    // inputs to render every check (the empty-repo case still surfaces
    // a `fail` indicator, but only after the form's `writebackReady`
    // gate emits a config — see openNewNousDraft).
    await page
      .getByRole('textbox', { name: /repo.*path/i })
      .fill('/nonexistent-preflight-render-test')

    await expect(page.getByTestId('preflight-repo-path-exists')).toBeVisible({
      timeout: 5000,
    })
    await expect(
      page.getByTestId('preflight-writeback-target-writable')
    ).toBeVisible()
    await expect(page.getByTestId('preflight-nous-cli-available')).toBeVisible()
    // run-id-not-in-use is `ok` when the field is empty (auto-derived
    // — see preflight handler), and the indicator returns null on `ok`
    // until the user types a runId. The other three are sufficient
    // coverage of the per-field-indicator wiring contract.
  })
})
