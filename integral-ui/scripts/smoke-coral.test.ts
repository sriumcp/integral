// Coral adapter smoke test against real pi-mc data.
//
// Lives outside src so vitest's canonical glob doesn't pick it up.
// Run explicitly:
//   ./node_modules/.bin/vitest run --config scripts/smoke-coral.config.ts
//
// Per CLAUDE.md test discipline: smokes against real data are manual
// and stay out of npm test*.

import * as os from 'node:os'
import * as path from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildCoralWorkspace } from '../src/adapters/coral'
import { FilesystemCoralSource } from '../vite-plugin-nous-adapter/coral-filesystem-source'
import { WorkspaceSchema } from '../src/schema'

const PI_MC_ROOT = path.join(
  os.homedir(),
  'Documents/learning/coral/pi-mc'
)

describe('coral smoke — pi-mc real data', () => {
  it('discovers runs and produces a schema-valid workspace', async () => {
    const source = new FilesystemCoralSource(PI_MC_ROOT)
    const runIds = await source.listRunIds()
    expect(runIds.length).toBeGreaterThan(0)
    // eslint-disable-next-line no-console
    console.log(`[smoke] runs:`, runIds)

    const ws = await buildCoralWorkspace(source)
    const campaigns = ws.intents.filter((i) => i.kind === 'coral-optimization')
    const attempts = ws.intents.filter((i) => i.kind === 'coral-attempt')
    // eslint-disable-next-line no-console
    console.log(
      `[smoke] ${campaigns.length} campaigns, ${attempts.length} attempts`
    )
    for (const c of campaigns) {
      // eslint-disable-next-line no-console
      console.log(`  ${c.id}`)
      // eslint-disable-next-line no-console
      console.log(`    title=${c.declaration.title}`)
      // eslint-disable-next-line no-console
      console.log(`    tags=${(c.tags ?? []).join(',') || '(none)'}`)
      if (c.extension.kind === 'coral-optimization') {
        // eslint-disable-next-line no-console
        console.log(
          `    pop=${c.extension.population_size} algo=${c.extension.search_algorithm} best=${c.extension.best_score_so_far}`
        )
      }
      // eslint-disable-next-line no-console
      console.log(
        `    children=[${c.decomposition.children.length}] knowledge_refs=[${c.knowledge_refs.length}]`
      )
      for (const childId of c.decomposition.children) {
        const child = ws.intents.find((i) => i.id === childId)
        if (child && child.extension.kind === 'coral-attempt') {
          const st = ws.states.find((s) => s.intent_id === child.id)
          // eslint-disable-next-line no-console
          console.log(
            `      • ${child.id} score=${child.extension.score} status=${st?.status} parents=[${child.extension.parent_attempts.length}]`
          )
        }
      }
    }

    expect(campaigns.length).toBeGreaterThan(0)
    expect(attempts.length).toBeGreaterThan(0)

    const result = WorkspaceSchema.safeParse(ws)
    if (!result.success) {
      // eslint-disable-next-line no-console
      console.error('[smoke] schema issues:', result.error.issues)
    }
    expect(result.success).toBe(true)
  })

  it('spec-gaming attempt (a06c06c4) is present with score=1e12 and clamped title', async () => {
    const source = new FilesystemCoralSource(PI_MC_ROOT)
    const ws = await buildCoralWorkspace(source)
    const gaming = ws.intents.find((i) => i.id.endsWith(':a06c06c4'))
    expect(gaming).toBeTruthy()
    expect(gaming!.declaration.title.length).toBeLessThanOrEqual(80)
    if (gaming!.extension.kind === 'coral-attempt') {
      expect(gaming!.extension.score).toBe(1e12)
    }
    const st = ws.states.find((s) => s.intent_id === gaming!.id)!
    expect(st.status).toBe('satisfied')
  })

  it('merges cleanly with a Nous source via mergeWorkspaces', async () => {
    const { mergeWorkspaces } = await import('../src/lib/sources')
    const { buildNousWorkspace } = await import('../src/adapters/nous')
    const { FilesystemNousSource } = await import(
      '../vite-plugin-nous-adapter/filesystem-source'
    )

    const coralSource = new FilesystemCoralSource(PI_MC_ROOT)
    const coralWs = await buildCoralWorkspace(coralSource)

    const nousRoot = path.join(os.homedir(), 'Documents/Projects/inference-sim')
    const nousSource = new FilesystemNousSource(nousRoot)
    const nousWs = await buildNousWorkspace(nousSource)

    const merged = mergeWorkspaces([coralWs, nousWs])
    // eslint-disable-next-line no-console
    console.log(
      `[smoke] merged: ${merged.intents.length} intents, ${merged.states.length} states (${coralWs.intents.length} coral + ${nousWs.intents.length} nous)`
    )
    expect(merged.intents.length).toBe(
      coralWs.intents.length + nousWs.intents.length
    )
    const result = WorkspaceSchema.safeParse(merged)
    expect(result.success).toBe(true)
  }, 30000)
})
