import { promises as fs } from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
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
 * endpoint, which probes the real filesystem on the dev server. We
 * generate the bad path with `Date.now()` so it's collision-proof
 * across reruns, and we use a freshly-created tmpdir for the
 * "restore good path" assertion so the test is portable across dev
 * boxes and CI (no reliance on `/` being writable).
 */

const SKIP_LANDING_INIT =
  "try { window.sessionStorage.setItem('integral.landing-seen', 'true') } catch {}"

test.describe('Pre-flight validation', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(SKIP_LANDING_INIT)
    await page.setViewportSize({ width: 1440, height: 900 })
  })

  test('non-existent repo_path → fail indicator + commit button gated', async ({
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
    const badPath = `/nonexistent-preflight-target-${Date.now()}`
    await repoPath.fill(badPath)

    // Wait for the indicator to settle on `fail` (debounce + fetch).
    const indicator = page.getByTestId('preflight-repo-path-exists')
    await expect(indicator).toHaveAttribute('data-preflight-status', 'fail', {
      timeout: 5000,
    })

    // Commit gates on the failure (the v0.1.5 stop condition).
    await expect(commit).toBeDisabled()
  })

  test('regular file at repo_path → fail (directory-only contract)', async ({
    page,
  }, testInfo) => {
    // PR review code-reviewer #2: `pathExists` must reject files —
    // `/etc/passwd`-style "file at the repo path" must NOT pass
    // pre-flight, because `nous run` requires a directory.
    const tmpFile = path.join(
      os.tmpdir(),
      `integral-preflight-file-${Date.now()}.txt`,
    )
    await fs.writeFile(tmpFile, 'hello', 'utf-8')
    testInfo.attach('tmpFile', { body: tmpFile, contentType: 'text/plain' })

    try {
      await page.goto('/?sources=fixture')
      await page
        .locator('button[data-kind="nous-campaign"][data-status="draft"]')
        .click()
      await expect(page.locator('main[data-surface="shaping"]')).toBeVisible()

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
    // PR review pr-test #4: cross-field falsification. Drop a real
    // `campaign-<runId>.yaml` into the configured Nous source path,
    // type that runId into the field, assert pre-flight reports
    // run-id-not-in-use as fail. Then clean up the file.

    // Discover the configured Nous source's path via the API. If
    // none is configured (or the path doesn't exist on disk), skip.
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
      await page.goto('/?sources=fixture')
      await page
        .locator('button[data-kind="nous-campaign"][data-status="draft"]')
        .click()
      await expect(page.locator('main[data-surface="shaping"]')).toBeVisible()

      const runIdField = page.getByRole('textbox', {
        name: /run id/i,
      })
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
