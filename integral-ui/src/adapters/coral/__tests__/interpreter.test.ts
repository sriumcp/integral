/**
 * Coral adapter interpreter — unit tests.
 *
 * Discipline: synthetic CoralSource fixtures (in-memory, no fs). Real-data
 * smoke is the dev-server end-to-end test. Every produced workspace must
 * round-trip through `WorkspaceSchema.safeParse` — the falsification gate.
 */

import { describe, expect, it } from 'vitest'
import { WorkspaceSchema } from '@/schema'
import type { CoralSource, ParsedAttempt, RunFiles } from '../types'
import { buildCoralWorkspace } from '../interpreter'
import {
  PI_MC_ATTEMPT_GAMING,
  PI_MC_RUN_FILES,
  PI_MC_RUN_ID,
} from './fixtures/pi-mc'

// ─── Synthetic CoralSource ────────────────────────────────────────────────
function staticSource(
  data: Record<string, Partial<RunFiles>>,
  id = 'fs:/synthetic-coral'
): CoralSource {
  return {
    id,
    label: id.replace(/^fs:/, ''),
    listRunIds: async () => Object.keys(data).sort(),
    fetchRunFiles: async (runId) => {
      const d = data[runId] ?? {}
      const out: RunFiles = {
        taskYaml: d.taskYaml ?? '',
        attempts: d.attempts ?? [],
        notes: d.notes ?? [],
        roles: d.roles ?? new Map(),
      }
      if (d.runDirMtime) out.runDirMtime = d.runDirMtime
      return out
    },
  }
}

const MIN_TASK_YAML = `
task:
  name: pi-mc
  description: |
    Optimize seed/solution.py.
grader:
  direction: maximize
agents:
  count: 2
`

function attempt(overrides: Partial<ParsedAttempt> = {}): ParsedAttempt {
  const base: ParsedAttempt = {
    commit_hash: 'aaaaaaaa00000000000000000000000000000000',
    parent_hash: '0000000000000000000000000000000000000000',
    agent_id: 'agent-1',
    title: 'baseline attempt',
    score: 100,
    status: 'improved',
    timestamp: '2026-05-24T23:50:00Z',
    feedback: '',
    shared_state_hash: 'deadbeef',
    metadata: { budget_class: 'real' },
  }
  return { ...base, ...overrides }
}

describe('buildCoralWorkspace — empty / degenerate', () => {
  it('returns an empty workspace for a source with zero runs', async () => {
    const ws = await buildCoralWorkspace(staticSource({}))
    expect(ws.intents).toEqual([])
    expect(ws.states).toEqual([])
    expect(ws.evidence_links).toEqual([])
    expect(ws.operations).toEqual([])
    expect(WorkspaceSchema.safeParse(ws).success).toBe(true)
  })

  it('skips a run with empty taskYaml', async () => {
    const ws = await buildCoralWorkspace(
      staticSource({ 'pi-mc/2026-05-24_194843': { taskYaml: '' } })
    )
    expect(ws.intents).toEqual([])
    expect(WorkspaceSchema.safeParse(ws).success).toBe(true)
  })

  it('emits campaign with zero attempts → decomposition.children is empty', async () => {
    const ws = await buildCoralWorkspace(
      staticSource({
        'pi-mc/2026-05-24_194843': {
          taskYaml: MIN_TASK_YAML,
          attempts: [],
        },
      })
    )
    expect(ws.intents).toHaveLength(1)
    expect(ws.intents[0]!.kind).toBe('coral-optimization')
    expect(ws.intents[0]!.decomposition.children).toEqual([])
    expect(WorkspaceSchema.safeParse(ws).success).toBe(true)
  })

  it('skips a run with malformed task.yaml (parse error)', async () => {
    const ws = await buildCoralWorkspace(
      staticSource({
        'pi-mc/2026-05-24_194843': {
          taskYaml: '{[ this is :: not valid yaml ::',
          attempts: [attempt()],
        },
      })
    )
    expect(ws.intents).toEqual([])
    expect(WorkspaceSchema.safeParse(ws).success).toBe(true)
  })
})

describe('buildCoralWorkspace — single-attempt mapping', () => {
  function singleAttemptWorkspace(att: ParsedAttempt) {
    return buildCoralWorkspace(
      staticSource({
        'pi-mc/2026-05-24_194843': {
          taskYaml: MIN_TASK_YAML,
          attempts: [att],
        },
      })
    )
  }

  it('produces 1 campaign + 1 attempt for a single eval', async () => {
    const ws = await singleAttemptWorkspace(attempt())
    expect(ws.intents).toHaveLength(2)
    expect(ws.states).toHaveLength(2)
    expect(ws.intents.find((i) => i.kind === 'coral-optimization')).toBeTruthy()
    expect(ws.intents.find((i) => i.kind === 'coral-attempt')).toBeTruthy()
    expect(WorkspaceSchema.safeParse(ws).success).toBe(true)
  })

  it('attempt id format is <campaign>:attempt:<sha8>', async () => {
    const ws = await singleAttemptWorkspace(
      attempt({ commit_hash: 'abcdef0123456789aaaaaaaaaaaaaaaaaaaaaaaa' })
    )
    const att = ws.intents.find((i) => i.kind === 'coral-attempt')!
    expect(att.id).toMatch(
      /^coral:fs-synthetic-coral:pi-mc:2026-05-24_194843:attempt:abcdef01$/
    )
  })

  it('attempt.score flows to extension.score', async () => {
    const ws = await singleAttemptWorkspace(attempt({ score: 1e12 }))
    const att = ws.intents.find((i) => i.kind === 'coral-attempt')!
    if (att.extension.kind !== 'coral-attempt') throw new Error('wrong kind')
    expect(att.extension.score).toBe(1e12)
  })

  it('attempt.status="improved" maps to state.status=satisfied', async () => {
    const ws = await singleAttemptWorkspace(attempt({ status: 'improved' }))
    const attIntent = ws.intents.find((i) => i.kind === 'coral-attempt')!
    const attState = ws.states.find((s) => s.intent_id === attIntent.id)!
    expect(attState.status).toBe('satisfied')
  })

  it('attempt.status="unknown" maps to state.status=active (default)', async () => {
    const ws = await singleAttemptWorkspace(attempt({ status: 'wat' }))
    const attIntent = ws.intents.find((i) => i.kind === 'coral-attempt')!
    const attState = ws.states.find((s) => s.intent_id === attIntent.id)!
    expect(attState.status).toBe('active')
  })

  it('metadata.budget_class surfaces as a tag', async () => {
    const ws = await singleAttemptWorkspace(
      attempt({ metadata: { budget_class: 'real' } })
    )
    const att = ws.intents.find((i) => i.kind === 'coral-attempt')!
    expect(att.tags ?? []).toContain('budget-class:real')
  })

  it('attempt without metadata.budget_class produces empty tags', async () => {
    // Build directly without metadata; exactOptionalPropertyTypes
    // disallows `metadata: undefined` overrides via spread.
    const noMeta: ParsedAttempt = {
      commit_hash: 'aaaaaaaa00000000000000000000000000000000',
      parent_hash: '0000000000000000000000000000000000000000',
      agent_id: 'agent-1',
      title: 'no-metadata',
      score: 100,
      status: 'improved',
      timestamp: '2026-05-24T23:50:00Z',
    }
    const ws = await singleAttemptWorkspace(noMeta)
    const att = ws.intents.find((i) => i.kind === 'coral-attempt')!
    expect(att.tags ?? []).toEqual([])
  })

  it('attempt holder is agent-held with the agent_id as the only party', async () => {
    const ws = await singleAttemptWorkspace(attempt({ agent_id: 'agent-2' }))
    const att = ws.intents.find((i) => i.kind === 'coral-attempt')!
    expect(att.holder.mode).toBe('agent-held')
    expect(att.holder.parties).toHaveLength(1)
    expect(att.holder.parties[0]!.kind).toBe('agent')
    expect(att.holder.parties[0]!.display_name).toBe('agent-2')
  })

  it('campaign decomposition.children includes the single attempt id', async () => {
    const ws = await singleAttemptWorkspace(attempt())
    const camp = ws.intents.find((i) => i.kind === 'coral-optimization')!
    const att = ws.intents.find((i) => i.kind === 'coral-attempt')!
    expect(camp.decomposition.children).toEqual([att.id])
  })
})

describe('buildCoralWorkspace — DAG resolution', () => {
  function workspaceWithAttempts(...atts: ParsedAttempt[]) {
    return buildCoralWorkspace(
      staticSource({
        'pi-mc/2026-05-24_194843': {
          taskYaml: MIN_TASK_YAML,
          attempts: atts,
        },
      })
    )
  }

  function findById<T extends { id: string }>(ws: { intents: T[] }, id: string): T {
    return ws.intents.find((i) => i.id === id)!
  }

  it('A → B chain: B is a child of A; campaign sees only A', async () => {
    const A = attempt({
      commit_hash: 'AAAAAAAA00000000000000000000000000000000',
      parent_hash: 'seed00000000000000000000000000000000seed',
    })
    const B = attempt({
      commit_hash: 'BBBBBBBB00000000000000000000000000000000',
      parent_hash: 'AAAAAAAA00000000000000000000000000000000',
    })
    const ws = await workspaceWithAttempts(A, B)
    const camp = ws.intents.find((i) => i.kind === 'coral-optimization')!
    const aIntent = ws.intents.find(
      (i) => i.kind === 'coral-attempt' && i.id.endsWith(':AAAAAAAA'.toLowerCase())
    )!
    const bIntent = ws.intents.find(
      (i) => i.kind === 'coral-attempt' && i.id.endsWith(':BBBBBBBB'.toLowerCase())
    )!
    expect(camp.decomposition.children).toEqual([aIntent.id])
    expect(aIntent.decomposition.children).toEqual([bIntent.id])
    expect(bIntent.decomposition.children).toEqual([])
    if (bIntent.extension.kind !== 'coral-attempt') throw new Error('kind')
    if (aIntent.extension.kind !== 'coral-attempt') throw new Error('kind')
    expect(bIntent.extension.parent_attempts).toEqual([aIntent.id])
    expect(aIntent.extension.parent_attempts).toEqual([])
    expect(WorkspaceSchema.safeParse(ws).success).toBe(true)
  })

  it('A → B → C chain: campaign sees only A; chain is wired', async () => {
    const A = attempt({
      commit_hash: 'AAAAAAAA00000000000000000000000000000000',
      parent_hash: 'seed00000000000000000000000000000000seed',
    })
    const B = attempt({
      commit_hash: 'BBBBBBBB00000000000000000000000000000000',
      parent_hash: 'AAAAAAAA00000000000000000000000000000000',
    })
    const C = attempt({
      commit_hash: 'CCCCCCCC00000000000000000000000000000000',
      parent_hash: 'BBBBBBBB00000000000000000000000000000000',
    })
    const ws = await workspaceWithAttempts(A, B, C)
    const camp = ws.intents.find((i) => i.kind === 'coral-optimization')!
    const aId = ws.intents.find(
      (i) => i.kind === 'coral-attempt' && i.id.endsWith(':aaaaaaaa')
    )!.id
    const bId = ws.intents.find(
      (i) => i.kind === 'coral-attempt' && i.id.endsWith(':bbbbbbbb')
    )!.id
    const cId = ws.intents.find(
      (i) => i.kind === 'coral-attempt' && i.id.endsWith(':cccccccc')
    )!.id
    expect(camp.decomposition.children).toEqual([aId])
    expect(findById(ws, aId).decomposition.children).toEqual([bId])
    expect(findById(ws, bId).decomposition.children).toEqual([cId])
    expect(findById(ws, cId).decomposition.children).toEqual([])
  })

  it('Y-shaped (A → B, A → C): A has two children; campaign sees only A', async () => {
    const A = attempt({
      commit_hash: 'AAAAAAAA00000000000000000000000000000000',
      parent_hash: 'seed00000000000000000000000000000000seed',
    })
    const B = attempt({
      commit_hash: 'BBBBBBBB00000000000000000000000000000000',
      parent_hash: 'AAAAAAAA00000000000000000000000000000000',
    })
    const C = attempt({
      commit_hash: 'CCCCCCCC00000000000000000000000000000000',
      parent_hash: 'AAAAAAAA00000000000000000000000000000000',
    })
    const ws = await workspaceWithAttempts(A, B, C)
    const camp = ws.intents.find((i) => i.kind === 'coral-optimization')!
    const aIntent = ws.intents.find(
      (i) => i.kind === 'coral-attempt' && i.id.endsWith(':aaaaaaaa')
    )!
    expect(camp.decomposition.children).toEqual([aIntent.id])
    expect(aIntent.decomposition.children).toHaveLength(2)
    expect(WorkspaceSchema.safeParse(ws).success).toBe(true)
  })

  it('two independent root attempts: both directly under the campaign', async () => {
    const A = attempt({
      commit_hash: 'AAAAAAAA00000000000000000000000000000000',
      parent_hash: 'seed00000000000000000000000000000000seed',
    })
    const B = attempt({
      commit_hash: 'BBBBBBBB00000000000000000000000000000000',
      parent_hash: 'OTHERSEED0000000000000000000000000000000',
    })
    const ws = await workspaceWithAttempts(A, B)
    const camp = ws.intents.find((i) => i.kind === 'coral-optimization')!
    expect(camp.decomposition.children).toHaveLength(2)
    for (const id of camp.decomposition.children) {
      const att = findById(ws, id)
      if (att.extension.kind !== 'coral-attempt') throw new Error('kind')
      expect(att.extension.parent_attempts).toEqual([])
    }
  })

  it('attempt with parent_hash unresolved: treated as root', async () => {
    const A = attempt({
      commit_hash: 'AAAAAAAA00000000000000000000000000000000',
      parent_hash: 'somerandompathnotinanyattempt00000000000',
    })
    const ws = await workspaceWithAttempts(A)
    const camp = ws.intents.find((i) => i.kind === 'coral-optimization')!
    const att = ws.intents.find((i) => i.kind === 'coral-attempt')!
    expect(camp.decomposition.children).toEqual([att.id])
    if (att.extension.kind !== 'coral-attempt') throw new Error('kind')
    expect(att.extension.parent_attempts).toEqual([])
  })
})

describe('buildCoralWorkspace — task.yaml + multi-run', () => {
  it('two runs of the same task produce two independent campaigns', async () => {
    const ws = await buildCoralWorkspace(
      staticSource({
        'pi-mc/2026-05-24_194843': {
          taskYaml: MIN_TASK_YAML,
          attempts: [attempt({ commit_hash: 'aa00000000000000000000000000000000000000' })],
        },
        'pi-mc/2026-05-25_080000': {
          taskYaml: MIN_TASK_YAML,
          attempts: [attempt({ commit_hash: 'bb00000000000000000000000000000000000000' })],
        },
      })
    )
    const campaigns = ws.intents.filter((i) => i.kind === 'coral-optimization')
    expect(campaigns).toHaveLength(2)
    expect(new Set(campaigns.map((c) => c.id)).size).toBe(2)
    // No cross-run children edges
    for (const c of campaigns) {
      for (const childId of c.decomposition.children) {
        // Each root attempt id must contain the campaign's timestamp slice
        const tsSlice = c.id.split(':').pop()!
        expect(childId).toContain(tsSlice)
      }
    }
    expect(WorkspaceSchema.safeParse(ws).success).toBe(true)
  })

  it('lifetime.started_at parses YYYY-MM-DD_HHMMSS dir name to RFC3339', async () => {
    const ws = await buildCoralWorkspace(
      staticSource({
        'pi-mc/2026-05-24_194843': {
          taskYaml: MIN_TASK_YAML,
          attempts: [],
        },
      })
    )
    const camp = ws.intents.find((i) => i.kind === 'coral-optimization')!
    expect(camp.lifetime.started_at).toBe('2026-05-24T19:48:43Z')
  })

  it('task.yaml.task.description flows to declaration.summary', async () => {
    const ws = await buildCoralWorkspace(
      staticSource({
        'pi-mc/2026-05-24_194843': {
          taskYaml: `
task:
  name: pi-mc
  description: |
    A specific description that should land in the summary.
grader: { direction: maximize }
agents: { count: 2 }
`,
          attempts: [],
        },
      })
    )
    const camp = ws.intents.find((i) => i.kind === 'coral-optimization')!
    expect(camp.declaration.summary).toContain('A specific description')
  })

  it('campaign title contains the task name and timestamp', async () => {
    const ws = await buildCoralWorkspace(
      staticSource({
        'pi-mc/2026-05-24_194843': { taskYaml: MIN_TASK_YAML, attempts: [] },
      })
    )
    const camp = ws.intents.find((i) => i.kind === 'coral-optimization')!
    expect(camp.declaration.title).toContain('pi-mc')
    expect(camp.declaration.title).toContain('2026-05-24_194843')
  })

  it('agents.count flows to extension.population_size; default is 1', async () => {
    const wsWithCount = await buildCoralWorkspace(
      staticSource({
        'pi-mc/2026-05-24_194843': { taskYaml: MIN_TASK_YAML, attempts: [] },
      })
    )
    const c1 = wsWithCount.intents.find((i) => i.kind === 'coral-optimization')!
    if (c1.extension.kind !== 'coral-optimization') throw new Error('kind')
    expect(c1.extension.population_size).toBe(2)

    const wsNoCount = await buildCoralWorkspace(
      staticSource({
        'pi-mc/2026-05-24_194843': {
          taskYaml: 'task: { name: pi-mc, description: x }',
          attempts: [],
        },
      })
    )
    const c2 = wsNoCount.intents.find((i) => i.kind === 'coral-optimization')!
    if (c2.extension.kind !== 'coral-optimization') throw new Error('kind')
    expect(c2.extension.population_size).toBe(1)
  })

  it('grader.direction surfaces as a tag (maximize/minimize)', async () => {
    const wsMax = await buildCoralWorkspace(
      staticSource({
        'pi-mc/2026-05-24_194843': { taskYaml: MIN_TASK_YAML, attempts: [] },
      })
    )
    const cMax = wsMax.intents.find((i) => i.kind === 'coral-optimization')!
    expect(cMax.tags ?? []).toContain('direction:maximize')

    const wsMin = await buildCoralWorkspace(
      staticSource({
        'pi-mc/2026-05-24_194843': {
          taskYaml: `
task: { name: pi-mc, description: x }
grader: { direction: minimize }
agents: { count: 1 }
`,
          attempts: [],
        },
      })
    )
    const cMin = wsMin.intents.find((i) => i.kind === 'coral-optimization')!
    expect(cMin.tags ?? []).toContain('direction:minimize')
  })

  it('best_score_so_far is max for maximize direction', async () => {
    const ws = await buildCoralWorkspace(
      staticSource({
        'pi-mc/2026-05-24_194843': {
          taskYaml: MIN_TASK_YAML,
          attempts: [
            attempt({ commit_hash: 'aa00000000000000000000000000000000000000', score: 100 }),
            attempt({ commit_hash: 'bb00000000000000000000000000000000000000', score: 200, parent_hash: 'aa00000000000000000000000000000000000000' }),
            attempt({ commit_hash: 'cc00000000000000000000000000000000000000', score: 50, parent_hash: 'bb00000000000000000000000000000000000000' }),
          ],
        },
      })
    )
    const camp = ws.intents.find((i) => i.kind === 'coral-optimization')!
    if (camp.extension.kind !== 'coral-optimization') throw new Error('kind')
    expect(camp.extension.best_score_so_far).toBe(200)
  })

  it('best_score_so_far is min for minimize direction', async () => {
    const ws = await buildCoralWorkspace(
      staticSource({
        'pi-mc/2026-05-24_194843': {
          taskYaml: `
task: { name: pi-mc, description: x }
grader: { direction: minimize }
agents: { count: 1 }
`,
          attempts: [
            attempt({ commit_hash: 'aa00000000000000000000000000000000000000', score: 100 }),
            attempt({ commit_hash: 'bb00000000000000000000000000000000000000', score: 50, parent_hash: 'aa00000000000000000000000000000000000000' }),
          ],
        },
      })
    )
    const camp = ws.intents.find((i) => i.kind === 'coral-optimization')!
    if (camp.extension.kind !== 'coral-optimization') throw new Error('kind')
    expect(camp.extension.best_score_so_far).toBe(50)
  })

  it('best_score_so_far is undefined for zero attempts', async () => {
    const ws = await buildCoralWorkspace(
      staticSource({
        'pi-mc/2026-05-24_194843': { taskYaml: MIN_TASK_YAML, attempts: [] },
      })
    )
    const camp = ws.intents.find((i) => i.kind === 'coral-optimization')!
    if (camp.extension.kind !== 'coral-optimization') throw new Error('kind')
    expect(camp.extension.best_score_so_far).toBeUndefined()
  })

  it('notes/*.md surface as campaign-scope KnowledgeRefs', async () => {
    const ws = await buildCoralWorkspace(
      staticSource({
        'pi-mc/2026-05-24_194843': {
          taskYaml: MIN_TASK_YAML,
          attempts: [],
          notes: ['index.md', 'experiments/eval-1-math-pi-optimal.md'],
        },
      })
    )
    const camp = ws.intents.find((i) => i.kind === 'coral-optimization')!
    expect(camp.knowledge_refs).toHaveLength(2)
    for (const ref of camp.knowledge_refs) {
      expect(ref.scope).toBe('campaign')
      expect(ref.role).toBe('principles')
      expect(ref.uri).toMatch(/^coral-note:\/\//)
    }
  })
})

describe('buildCoralWorkspace — pi-mc fixture round-trip', () => {
  it('real pi-mc data validates against WorkspaceSchema', async () => {
    const ws = await buildCoralWorkspace(
      staticSource({ [PI_MC_RUN_ID]: PI_MC_RUN_FILES }, 'fs:/coral/pi-mc')
    )

    // 1 campaign + 2 attempts
    expect(ws.intents).toHaveLength(3)
    expect(ws.states).toHaveLength(3)

    // The spec-gaming attempt's title is 90 chars; must be clamped to
    // ≤80 by the adapter (or DeclarationSchema rejects the workspace).
    const gamingAttempt = ws.intents.find(
      (i) => i.id.endsWith(':a06c06c4')
    )
    expect(gamingAttempt).toBeTruthy()
    expect(gamingAttempt!.declaration.title.length).toBeLessThanOrEqual(80)

    // Score survives (1e12 specifically — the grader cap value).
    if (gamingAttempt!.extension.kind !== 'coral-attempt') throw new Error('kind')
    expect(gamingAttempt!.extension.score).toBe(1e12)

    // The full workspace round-trips through the schema.
    const result = WorkspaceSchema.safeParse(ws)
    if (!result.success) {
      // Surface the validation error if it ever fires.
      // eslint-disable-next-line no-console
      console.error(result.error.issues)
    }
    expect(result.success).toBe(true)
  })

  it('campaign carries direction:maximize tag from task.yaml', async () => {
    const ws = await buildCoralWorkspace(
      staticSource({ [PI_MC_RUN_ID]: PI_MC_RUN_FILES }, 'fs:/coral/pi-mc')
    )
    const camp = ws.intents.find((i) => i.kind === 'coral-optimization')!
    expect(camp.tags ?? []).toContain('direction:maximize')
  })

  it('campaign best_score_so_far is the max attempt score (1e12)', async () => {
    const ws = await buildCoralWorkspace(
      staticSource({ [PI_MC_RUN_ID]: PI_MC_RUN_FILES }, 'fs:/coral/pi-mc')
    )
    const camp = ws.intents.find((i) => i.kind === 'coral-optimization')!
    if (camp.extension.kind !== 'coral-optimization') throw new Error('kind')
    expect(camp.extension.best_score_so_far).toBe(1e12)
  })

  // The pi-mc fixture's two attempts have different parent_hashes, neither
  // of which resolves to another attempt JSON (they point at the seed/
  // synthetic root commits). So both are roots under the campaign.
  it('both pi-mc attempts are root attempts (parent_hash unresolved)', async () => {
    const ws = await buildCoralWorkspace(
      staticSource({ [PI_MC_RUN_ID]: PI_MC_RUN_FILES }, 'fs:/coral/pi-mc')
    )
    const camp = ws.intents.find((i) => i.kind === 'coral-optimization')!
    expect(camp.decomposition.children).toHaveLength(2)
    void PI_MC_ATTEMPT_GAMING
  })
})
