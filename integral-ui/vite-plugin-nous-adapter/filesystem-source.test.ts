/**
 * FilesystemNousSource — integration tests against real temp directories.
 *
 * Two behavioral surfaces under test:
 *
 * 1. Dual-root discovery (#239) — campaigns may live at the legacy
 *    `<root>/.nous/<run>/` location OR at `$NOUS_CAMPAIGN_PARENT/<run>/`,
 *    or both. `listRunIds` unions them, with attribution filtering: an
 *    env-var-located campaign only belongs to this source when its
 *    state.json.repo_path matches the source's root.
 *
 * 2. Empty-env-var strictness — `resolveCampaignParent` mirrors nous's
 *    `_read_env_var` semantics: empty/whitespace is a hard error
 *    (catches `export NOUS_CAMPAIGN_PARENT=$UNSET` typos), unset is
 *    null.
 *
 * Filesystem-isolated in `os.tmpdir()` — never touches the user's
 * actual `~/Documents/Projects/...` trees.
 */

import { promises as fs } from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { FilesystemNousSource, resolveCampaignParent } from './filesystem-source'

let tmpRoot: string

beforeEach(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'integral-fs-source-'))
})

afterEach(async () => {
  await fs.rm(tmpRoot, { recursive: true, force: true })
})

// ─── Helpers ─────────────────────────────────────────────────────────────

async function writeLegacyCampaign(
  root: string,
  runId: string,
  state: object
) {
  const dir = path.join(root, '.nous', runId)
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(path.join(dir, 'state.json'), JSON.stringify(state))
  // YAML at root (matches the convention).
  await fs.writeFile(
    path.join(root, `campaign-${runId}.yaml`),
    `run_id: ${runId}\nresearch_question: legacy test\n`
  )
}

async function writeEnvVarCampaign(
  parent: string,
  runId: string,
  state: object,
  yamlAt?: string
) {
  const dir = path.join(parent, runId)
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(path.join(dir, 'state.json'), JSON.stringify(state))
  if (yamlAt) {
    await fs.mkdir(yamlAt, { recursive: true })
    await fs.writeFile(
      path.join(yamlAt, `campaign-${runId}.yaml`),
      `run_id: ${runId}\nresearch_question: env-var test\n`
    )
  }
}

// ─── resolveCampaignParent ───────────────────────────────────────────────

describe('resolveCampaignParent', () => {
  const ORIGINAL = process.env.NOUS_CAMPAIGN_PARENT

  afterEach(() => {
    if (ORIGINAL === undefined) {
      delete process.env.NOUS_CAMPAIGN_PARENT
    } else {
      process.env.NOUS_CAMPAIGN_PARENT = ORIGINAL
    }
  })

  it('returns null when env var is unset', () => {
    delete process.env.NOUS_CAMPAIGN_PARENT
    expect(resolveCampaignParent()).toBeNull()
  })

  it('returns the resolved path when env var is set to a directory', () => {
    process.env.NOUS_CAMPAIGN_PARENT = tmpRoot
    expect(resolveCampaignParent()).toBe(path.resolve(tmpRoot))
  })

  it('expands ~ to home directory', () => {
    process.env.NOUS_CAMPAIGN_PARENT = '~/some/place'
    const resolved = resolveCampaignParent()
    expect(resolved).toBe(path.join(os.homedir(), 'some/place'))
  })

  // Mirror nous's _read_env_var strictness from #239: empty/whitespace
  // values are typically `export NOUS_CAMPAIGN_PARENT=$UNSET` typos.
  // Silent fallback would mask the user's broken env. Hard-error instead.
  it('throws when env var is set to empty string', () => {
    process.env.NOUS_CAMPAIGN_PARENT = ''
    expect(() => resolveCampaignParent()).toThrow(/empty\/whitespace/)
  })

  it('throws when env var is set to whitespace only', () => {
    process.env.NOUS_CAMPAIGN_PARENT = '   '
    expect(() => resolveCampaignParent()).toThrow(/empty\/whitespace/)
  })
})

// ─── Legacy discovery (back-compat) ──────────────────────────────────────

describe('FilesystemNousSource — legacy <root>/.nous/<run>/ discovery', () => {
  it('finds campaigns under <root>/.nous/ when no campaign_parent given', async () => {
    await writeLegacyCampaign(tmpRoot, 'legacy-one', {
      last_entered_phase: 'DONE',
      iteration: 2,
      run_id: 'legacy-one',
    })
    await writeLegacyCampaign(tmpRoot, 'legacy-two', {
      last_entered_phase: 'DESIGN',
      iteration: 0,
      run_id: 'legacy-two',
    })
    const source = new FilesystemNousSource(tmpRoot)
    expect(await source.listRunIds()).toEqual(['legacy-one', 'legacy-two'])
  })

  it('reads state/ledger/principles from <root>/.nous/<run>/ for legacy campaigns', async () => {
    await writeLegacyCampaign(tmpRoot, 'legacy', {
      last_entered_phase: 'EXECUTE_ANALYZE',
      run_id: 'legacy',
    })
    const ledgerPath = path.join(tmpRoot, '.nous', 'legacy', 'ledger.json')
    await fs.writeFile(ledgerPath, '[]')
    const source = new FilesystemNousSource(tmpRoot)
    await source.listRunIds()
    const files = await source.fetchCampaignFiles('legacy')
    expect(files.state).toContain('EXECUTE_ANALYZE')
    expect(files.ledger).toBe('[]')
  })

  it('discovers yaml-only campaigns (just shaped, no runtime dir yet)', async () => {
    // Newly-shaped campaign before nous has run it: campaign-*.yaml
    // exists at root, no state.json anywhere.
    await fs.writeFile(
      path.join(tmpRoot, 'campaign-just-shaped.yaml'),
      'run_id: just-shaped\n'
    )
    const source = new FilesystemNousSource(tmpRoot)
    expect(await source.listRunIds()).toEqual(['just-shaped'])
    const files = await source.fetchCampaignFiles('just-shaped')
    expect(files.campaignYaml).toContain('just-shaped')
    expect(files.state).toBeNull()
  })
})

// ─── Env-var discovery (#239) ────────────────────────────────────────────

describe('FilesystemNousSource — env-var $NOUS_CAMPAIGN_PARENT/<run>/ discovery', () => {
  it('finds campaigns at campaignParent whose repo_path matches the source root', async () => {
    const parent = path.join(tmpRoot, 'campaigns')
    await fs.mkdir(parent, { recursive: true })

    const repoRoot = path.join(tmpRoot, 'my-repo')
    await fs.mkdir(repoRoot, { recursive: true })
    await fs.writeFile(
      path.join(repoRoot, 'campaign-mine.yaml'),
      'run_id: mine\n'
    )

    await writeEnvVarCampaign(parent, 'mine', {
      last_entered_phase: 'DONE',
      run_id: 'mine',
      work_dir: path.join(parent, 'mine'),
      repo_path: repoRoot,
    })

    const source = new FilesystemNousSource(repoRoot, {
      campaignParent: parent,
    })
    expect(await source.listRunIds()).toEqual(['mine'])
  })

  // Multi-source attribution: when two repos coexist under one
  // NOUS_CAMPAIGN_PARENT, each source must see ONLY its own campaigns.
  // Without this filter, every Integral source duplicates every
  // campaign under each source-id, producing dupe IntentIds and a
  // lying provenance chip.
  it('drops campaigns whose repo_path matches a different source', async () => {
    const parent = path.join(tmpRoot, 'campaigns')
    await fs.mkdir(parent, { recursive: true })

    const myRepo = path.join(tmpRoot, 'my-repo')
    const otherRepo = path.join(tmpRoot, 'other-repo')
    await fs.mkdir(myRepo, { recursive: true })
    await fs.mkdir(otherRepo, { recursive: true })

    await writeEnvVarCampaign(parent, 'mine', {
      last_entered_phase: 'DONE',
      repo_path: myRepo,
    })
    await writeEnvVarCampaign(parent, 'theirs', {
      last_entered_phase: 'DONE',
      repo_path: otherRepo,
    })

    const source = new FilesystemNousSource(myRepo, {
      campaignParent: parent,
    })
    expect(await source.listRunIds()).toEqual(['mine'])
  })

  // Pre-#239 state.json files lack repo_path. Without it we can't
  // attribute the campaign to any specific source — silently drop
  // rather than mis-attribute. (User can migrate by re-running nous,
  // which writes the field, or by manually editing state.json.)
  it('drops env-var campaigns whose state.json has no repo_path field', async () => {
    const parent = path.join(tmpRoot, 'campaigns')
    await fs.mkdir(parent, { recursive: true })
    const repoRoot = path.join(tmpRoot, 'my-repo')
    await fs.mkdir(repoRoot, { recursive: true })

    await writeEnvVarCampaign(parent, 'pre-239', {
      last_entered_phase: 'DONE',
      iteration: 1,
      // intentionally no repo_path
    })

    const source = new FilesystemNousSource(repoRoot, {
      campaignParent: parent,
    })
    expect(await source.listRunIds()).toEqual([])
  })

  it('reads runtime artifacts from <campaignParent>/<run>/ for env-var-discovered campaigns', async () => {
    const parent = path.join(tmpRoot, 'campaigns')
    await fs.mkdir(parent, { recursive: true })
    const repoRoot = path.join(tmpRoot, 'my-repo')
    await fs.mkdir(repoRoot, { recursive: true })
    await fs.writeFile(
      path.join(repoRoot, 'campaign-r.yaml'),
      'run_id: r\n'
    )

    await writeEnvVarCampaign(parent, 'r', {
      last_entered_phase: 'EXECUTE_ANALYZE',
      run_id: 'r',
      repo_path: repoRoot,
    })
    await fs.writeFile(
      path.join(parent, 'r', 'ledger.json'),
      '[{"iteration":1}]'
    )
    await fs.writeFile(
      path.join(parent, 'r', 'principles.json'),
      '[]'
    )

    const source = new FilesystemNousSource(repoRoot, {
      campaignParent: parent,
    })
    await source.listRunIds()
    const files = await source.fetchCampaignFiles('r')
    expect(files.state).toContain('EXECUTE_ANALYZE')
    expect(files.ledger).toBe('[{"iteration":1}]')
    expect(files.principles).toBe('[]')
    expect(files.campaignYaml).toContain('run_id: r')
  })

  it('handles missing campaignParent directory gracefully (env var set, no campaigns yet)', async () => {
    const repoRoot = path.join(tmpRoot, 'my-repo')
    await fs.mkdir(repoRoot, { recursive: true })
    const source = new FilesystemNousSource(repoRoot, {
      campaignParent: path.join(tmpRoot, 'nonexistent-parent'),
    })
    // No throw, no spurious entries.
    expect(await source.listRunIds()).toEqual([])
  })
})

// ─── Mixed legacy + env-var ──────────────────────────────────────────────

describe('FilesystemNousSource — mixed legacy + env-var', () => {
  it('unions runs from both locations into a single sorted list', async () => {
    const parent = path.join(tmpRoot, 'campaigns')
    await fs.mkdir(parent, { recursive: true })
    const repoRoot = path.join(tmpRoot, 'my-repo')
    await fs.mkdir(repoRoot, { recursive: true })

    await writeLegacyCampaign(repoRoot, 'old-run', {
      phase: 'DONE',
      run_id: 'old-run',
    })
    await writeEnvVarCampaign(parent, 'new-run', {
      last_entered_phase: 'DONE',
      run_id: 'new-run',
      repo_path: repoRoot,
    })

    const source = new FilesystemNousSource(repoRoot, {
      campaignParent: parent,
    })
    expect(await source.listRunIds()).toEqual(['new-run', 'old-run'])
  })

  // When the same runId exists at both locations (e.g., a campaign
  // started under legacy then migrated to env-var), the env-var
  // location is the canonical source of truth — that's where nous
  // writes its current state. Reading the legacy copy would silently
  // show stale data.
  it('prefers env-var location when same runId exists at both', async () => {
    const parent = path.join(tmpRoot, 'campaigns')
    await fs.mkdir(parent, { recursive: true })
    const repoRoot = path.join(tmpRoot, 'my-repo')
    await fs.mkdir(repoRoot, { recursive: true })

    // Legacy version says still active.
    await writeLegacyCampaign(repoRoot, 'shared', {
      phase: 'EXECUTE_ANALYZE',
      run_id: 'shared',
    })
    // Env-var version says done — newer.
    await writeEnvVarCampaign(parent, 'shared', {
      last_entered_phase: 'DONE',
      run_id: 'shared',
      repo_path: repoRoot,
    })

    const source = new FilesystemNousSource(repoRoot, {
      campaignParent: parent,
    })
    await source.listRunIds()
    const files = await source.fetchCampaignFiles('shared')
    expect(files.state).toContain('DONE')
    expect(files.state).not.toContain('EXECUTE_ANALYZE')
  })
})

// ─── workDir field on CampaignFiles ──────────────────────────────────────

describe('FilesystemNousSource — workDir surfaced on CampaignFiles', () => {
  it('reports the legacy workDir for a legacy-discovered campaign', async () => {
    await writeLegacyCampaign(tmpRoot, 'legacy', { phase: 'DONE' })
    const source = new FilesystemNousSource(tmpRoot)
    await source.listRunIds()
    const files = await source.fetchCampaignFiles('legacy')
    expect(files.workDir).toBe(
      path.resolve(tmpRoot, '.nous', 'legacy')
    )
  })

  it('reports the env-var workDir for an env-var-discovered campaign', async () => {
    const parent = path.join(tmpRoot, 'campaigns')
    await fs.mkdir(parent, { recursive: true })
    const repoRoot = path.join(tmpRoot, 'my-repo')
    await fs.mkdir(repoRoot, { recursive: true })
    await fs.writeFile(
      path.join(repoRoot, 'campaign-r.yaml'),
      'run_id: r\n'
    )
    await writeEnvVarCampaign(parent, 'r', {
      last_entered_phase: 'DONE',
      repo_path: repoRoot,
    })

    const source = new FilesystemNousSource(repoRoot, {
      campaignParent: parent,
    })
    await source.listRunIds()
    const files = await source.fetchCampaignFiles('r')
    expect(files.workDir).toBe(path.resolve(parent, 'r'))
  })
})
