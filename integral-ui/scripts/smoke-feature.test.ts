// Feature adapter smoke test against real github.com/sriumcp/integral data.
//
// Lives outside src so vitest's canonical glob doesn't pick it up.
// Run explicitly:
//   ./node_modules/.bin/vitest run --config scripts/smoke-feature.config.ts
//
// Requires:
//   - gh CLI installed and authed (gh auth status)
//   - github.com/sriumcp/integral seeded with issues #1..#5 per
//     the prereq sequence
//
// Per CLAUDE.md test discipline: smokes against real data are manual
// and stay out of npm test*.

import { describe, expect, it } from 'vitest'
import { buildFeatureWorkspace } from '../src/adapters/feature'
import { GhCliIssuesSource } from '../vite-plugin-nous-adapter/gh-cli-source'
import { WorkspaceSchema } from '../src/schema'

const REPO_COORD = 'sriumcp/integral'

describe('feature adapter smoke — sriumcp/integral real data', () => {
  it('discovers issues and produces a schema-valid workspace', async () => {
    const source = new GhCliIssuesSource(REPO_COORD)
    const issues = await source.listAllIssues()
    // eslint-disable-next-line no-console
    console.log(`[smoke] issues fetched: ${issues.length}`)
    for (const i of issues) {
      const t = i.subIssuesSummary?.total ?? 0
      // eslint-disable-next-line no-console
      console.log(
        `  #${i.number} [${i.state}/${i.stateReason ?? '—'}] ${i.title} (sub_issues=${t})`
      )
    }
    expect(issues.length).toBeGreaterThanOrEqual(5)

    const ws = await buildFeatureWorkspace(source)
    const intents = ws.intents.filter((i) => i.kind === 'feature-campaign')
    expect(intents.length).toBe(issues.length)

    // Print the tree
    // eslint-disable-next-line no-console
    console.log(`[smoke] workspace: ${intents.length} feature-campaign intents`)
    for (const i of intents) {
      const st = ws.states.find((s) => s.intent_id === i.id)!
      // eslint-disable-next-line no-console
      console.log(
        `  ${i.id} [${st.status}] children=[${i.decomposition.children.length}] ${i.declaration.title}`
      )
    }

    const result = WorkspaceSchema.safeParse(ws)
    if (!result.success) {
      // eslint-disable-next-line no-console
      console.error('[smoke] schema issues:', result.error.issues)
    }
    expect(result.success).toBe(true)
  })

  it('tracking issue #1 has 3 sub-issues wired as decomposition.children', async () => {
    const source = new GhCliIssuesSource(REPO_COORD)
    const ws = await buildFeatureWorkspace(source)
    const tracker = ws.intents.find((i) => i.id.endsWith(':1'))
    expect(tracker).toBeTruthy()
    expect(tracker!.lifetime.kind).toBe('campaign')
    expect(tracker!.decomposition.children.length).toBe(3)
    // The three children should be issues #2, #3, #4 (per seed)
    const childNumbers = tracker!.decomposition.children
      .map((id) => Number(id.split(':').pop()))
      .sort((a, b) => a - b)
    expect(childNumbers).toEqual([2, 3, 4])
  })

  it('issue #2 (closed/COMPLETED) maps to status: satisfied', async () => {
    const source = new GhCliIssuesSource(REPO_COORD)
    const ws = await buildFeatureWorkspace(source)
    const b1 = ws.intents.find((i) => i.id.endsWith(':2'))!
    const st = ws.states.find((s) => s.intent_id === b1.id)!
    expect(st.status).toBe('satisfied')
  })

  it('issue #5 is a top-level leaf (not in any decomposition.children)', async () => {
    const source = new GhCliIssuesSource(REPO_COORD)
    const ws = await buildFeatureWorkspace(source)
    const leaf = ws.intents.find((i) => i.id.endsWith(':5'))!
    expect(leaf.lifetime.kind).toBe('discrete')
    expect(leaf.decomposition.children).toEqual([])
    const allChildren = ws.intents.flatMap((i) => i.decomposition.children)
    expect(allChildren).not.toContain(leaf.id)
  })

  it('merges cleanly with Nous + Coral via mergeWorkspaces', async () => {
    const { mergeWorkspaces } = await import('../src/lib/sources')
    const { buildNousWorkspace } = await import('../src/adapters/nous')
    const { FilesystemNousSource } = await import(
      '../vite-plugin-nous-adapter/filesystem-source'
    )
    const { buildCoralWorkspace } = await import('../src/adapters/coral')
    const { FilesystemCoralSource } = await import(
      '../vite-plugin-nous-adapter/coral-filesystem-source'
    )
    const os = await import('node:os')
    const path = await import('node:path')

    const featureWs = await buildFeatureWorkspace(new GhCliIssuesSource(REPO_COORD))
    const nousWs = await buildNousWorkspace(
      new FilesystemNousSource(
        path.join(os.homedir(), 'Documents/Projects/inference-sim')
      )
    )
    const coralWs = await buildCoralWorkspace(
      new FilesystemCoralSource(
        path.join(os.homedir(), 'Documents/learning/coral/pi-mc')
      )
    )

    const merged = mergeWorkspaces([featureWs, nousWs, coralWs])
    // eslint-disable-next-line no-console
    console.log(
      `[smoke] merged: ${merged.intents.length} intents (${featureWs.intents.length} feature + ${nousWs.intents.length} nous + ${coralWs.intents.length} coral)`
    )
    expect(merged.intents.length).toBe(
      featureWs.intents.length + nousWs.intents.length + coralWs.intents.length
    )
    expect(WorkspaceSchema.safeParse(merged).success).toBe(true)
  })
})
