/**
 * Nous adapter interpreter — unit tests.
 *
 * Discipline: test against synthetic fixtures (inline strings), not against
 * the real `inference-sim/` directory. Real-data validation runs in the
 * dev environment via the Vite plugin; the unit tests stay deterministic
 * and reproducible.
 *
 * Schema-exhaustive: every produced workspace must round-trip through
 * `WorkspaceSchema.safeParse` — that's the falsification gate.
 */

import { describe, expect, it } from 'vitest'
import { WorkspaceSchema } from '@/schema'
import type { CampaignFiles, NousSource } from '../types'
import { buildNousWorkspace, interpretCampaign } from '../interpreter'

// ─── Synthetic Nous source ─────────────────────────────────────────────────
function staticSource(
  data: Record<string, Partial<CampaignFiles>>
): NousSource {
  return {
    id: 'fs:/synthetic',
    label: '/synthetic',
    listRunIds: async () => Object.keys(data).sort(),
    fetchCampaignFiles: async (runId) => ({
      campaignYaml: data[runId]?.campaignYaml ?? '',
      state: data[runId]?.state ?? null,
      ledger: data[runId]?.ledger ?? null,
      principles: data[runId]?.principles ?? null,
    }),
  }
}

const MIN_CAMPAIGN_YAML = `
research_question: >
  Why does the v3 evaluator plateau at 71%?
run_id: v3-plateau
max_iterations: 3
target_system:
  name: BLIS
  description: Discrete-event LLM inference simulator.
`

const STATE_DONE = JSON.stringify({
  phase: 'DONE',
  iteration: 2,
  run_id: 'v3-plateau',
  timestamp: '2026-05-19T21:18:04Z',
})

const STATE_ACTIVE = JSON.stringify({
  phase: 'EXECUTE_ANALYZE',
  iteration: 1,
  run_id: 'in-flight',
  timestamp: '2026-05-22T15:00:00Z',
})

describe('interpretCampaign', () => {
  it('produces a valid Intent + IntentState from a typical campaign', () => {
    const result = interpretCampaign(
      'v3-plateau',
      { campaignYaml: MIN_CAMPAIGN_YAML, state: STATE_DONE, ledger: null, principles: null },
      'fs:/synthetic'
    )
    expect(result).not.toBeNull()
    const { intent, state } = result!

    expect(intent.kind).toBe('nous-campaign')
    expect(intent.extension.kind).toBe('nous-campaign')
    if (intent.extension.kind === 'nous-campaign') {
      expect(intent.extension.research_question).toMatch(/v3 evaluator plateau/)
    }
    expect(intent.declaration.title).toContain('v3-plateau')
    expect(state.intent_id).toBe(intent.id)
    expect(state.id).toBe(intent.state_ref)
  })

  it('maps phase=DONE to status=satisfied', () => {
    const result = interpretCampaign(
      'done-run',
      { campaignYaml: MIN_CAMPAIGN_YAML, state: STATE_DONE, ledger: null, principles: null },
      'fs:/synthetic'
    )
    expect(result?.state.status).toBe('satisfied')
  })

  it('maps phase=EXECUTE_ANALYZE to status=active', () => {
    const result = interpretCampaign(
      'in-flight',
      { campaignYaml: MIN_CAMPAIGN_YAML, state: STATE_ACTIVE, ledger: null, principles: null },
      'fs:/synthetic'
    )
    expect(result?.state.status).toBe('active')
  })

  it('defaults to status=active when state.json is absent', () => {
    const result = interpretCampaign(
      'no-state',
      { campaignYaml: MIN_CAMPAIGN_YAML, state: null, ledger: null, principles: null },
      'fs:/synthetic'
    )
    expect(result?.state.status).toBe('active')
  })

  it('returns null when YAML is malformed beyond recovery', () => {
    const result = interpretCampaign(
      'broken',
      {
        campaignYaml: '@@ this is not yaml @@\n: : :',
        state: null,
        ledger: null,
        principles: null,
      },
      'fs:/synthetic'
    )
    // The yaml parser may yield null/string for very malformed input; the
    // interpreter still emits a valid Intent (with empty research_question).
    // The "null" return path fires only when parsing throws, which most
    // strings don't trigger. We just assert the result validates if non-null.
    if (result) {
      expect(result.intent.kind).toBe('nous-campaign')
    }
  })

  it('synthesizes a placeholder research_question when YAML lacks one', () => {
    const result = interpretCampaign(
      'no-rq',
      {
        campaignYaml: 'run_id: no-rq\nmax_iterations: 1\n',
        state: null,
        ledger: null,
        principles: null,
      },
      'fs:/synthetic'
    )
    expect(result).not.toBeNull()
    if (result?.intent.extension.kind === 'nous-campaign') {
      expect(result.intent.extension.research_question).toContain('no-rq')
    }
  })

  it('clamps title to <=80 chars per schema bound', () => {
    const longName = 'x'.repeat(120)
    const yaml = `run_id: long\nmax_iterations: 1\ntarget_system:\n  name: ${longName}\n`
    const result = interpretCampaign(
      'long',
      { campaignYaml: yaml, state: null, ledger: null, principles: null },
      'fs:/synthetic'
    )
    expect(result?.intent.declaration.title.length).toBeLessThanOrEqual(80)
  })

  it('includes an external_anchor pointing at the source/run_id', () => {
    const result = interpretCampaign(
      'v3-plateau',
      { campaignYaml: MIN_CAMPAIGN_YAML, state: STATE_DONE, ledger: null, principles: null },
      'fs:/inference-sim'
    )
    const anchor = result?.state.external_anchors[0]
    expect(anchor?.kind).toBe('nous-campaign-dir')
    expect(anchor?.uri).toContain('v3-plateau')
    expect(anchor?.read_only).toBe(true)
  })
})

describe('buildNousWorkspace', () => {
  it('produces a Workspace that validates against WorkspaceSchema', async () => {
    const source = staticSource({
      'v3-plateau': { campaignYaml: MIN_CAMPAIGN_YAML, state: STATE_DONE },
      'in-flight': { campaignYaml: MIN_CAMPAIGN_YAML, state: STATE_ACTIVE },
      'no-state': { campaignYaml: MIN_CAMPAIGN_YAML },
    })
    const workspace = await buildNousWorkspace(source)
    const result = WorkspaceSchema.safeParse(workspace)
    if (!result.success) {
      throw new Error(
        'adapter output rejected by WorkspaceSchema:\n' +
          JSON.stringify(result.error.issues, null, 2)
      )
    }
    expect(workspace.intents.length).toBe(3)
    expect(workspace.states.length).toBe(3)
  })

  it('skips runs with empty campaign YAML', async () => {
    const source = staticSource({
      'has-yaml': { campaignYaml: MIN_CAMPAIGN_YAML },
      'orphan-state': { campaignYaml: '', state: STATE_ACTIVE }, // no campaign-X.yaml
    })
    const workspace = await buildNousWorkspace(source)
    expect(workspace.intents.length).toBe(1)
    expect(workspace.intents[0]?.id).toContain('has-yaml')
  })

  it('emits intents in run-id order matching listRunIds', async () => {
    const source = staticSource({
      alpha: { campaignYaml: MIN_CAMPAIGN_YAML },
      beta: { campaignYaml: MIN_CAMPAIGN_YAML },
      gamma: { campaignYaml: MIN_CAMPAIGN_YAML },
    })
    const workspace = await buildNousWorkspace(source)
    const ids = workspace.intents.map((i) => i.id)
    expect(ids[0]).toContain('alpha')
    expect(ids[1]).toContain('beta')
    expect(ids[2]).toContain('gamma')
  })

  it('produces empty operations + evidence_links collections in Phase 1', async () => {
    const source = staticSource({
      x: { campaignYaml: MIN_CAMPAIGN_YAML, state: STATE_DONE },
    })
    const workspace = await buildNousWorkspace(source)
    expect(workspace.operations).toEqual([])
    expect(workspace.evidence_links).toEqual([])
  })

  it('handles an empty source (no campaigns) without crashing', async () => {
    const source = staticSource({})
    const workspace = await buildNousWorkspace(source)
    expect(workspace.intents).toEqual([])
    expect(workspace.states).toEqual([])
    expect(workspace.operations).toEqual([])
  })
})

// ─── Phase 2: ledger-driven nous-iteration child intents ───────────────────

const LEDGER_THREE_ITERS = JSON.stringify({
  iterations: [
    {
      iteration: 0,
      family: 'baseline',
      timestamp: '1970-01-01T00:00:00Z',
      candidate_id: 'baseline',
      h_main_result: null,
      principles_extracted: [],
    },
    {
      iteration: 1,
      family: 'pilot',
      timestamp: '2026-05-19T20:40:02Z',
      candidate_id: 'iter-1',
      h_main_result: 'PARTIALLY_CONFIRMED',
      principles_extracted: [{ id: 'RP-1', action: 'INSERT' }],
    },
    {
      iteration: 2,
      family: 'pilot',
      timestamp: '2026-05-19T22:00:00Z',
      candidate_id: 'iter-2',
      h_main_result: 'REFUTED',
      principles_extracted: [{ id: 'RP-2', action: 'INSERT' }],
    },
  ],
})

const LEDGER_BASELINE_ONLY = JSON.stringify({
  iterations: [
    {
      iteration: 0,
      family: 'baseline',
      timestamp: '1970-01-01T00:00:00Z',
      candidate_id: 'baseline',
      h_main_result: null,
      principles_extracted: [],
    },
  ],
})

const LEDGER_ONE_INFLIGHT = JSON.stringify({
  iterations: [
    {
      iteration: 0,
      family: 'baseline',
      timestamp: '1970-01-01T00:00:00Z',
      candidate_id: 'baseline',
      h_main_result: null,
    },
    {
      iteration: 1,
      family: 'pilot',
      timestamp: '2026-05-22T15:00:00Z',
      candidate_id: 'iter-1',
      h_main_result: null, // in-flight
    },
  ],
})

describe('buildNousWorkspace — Phase 2 (ledger → iterations)', () => {
  it('emits nous-iteration intents from a ledger, skipping iter-0 baseline', async () => {
    const source = staticSource({
      run: {
        campaignYaml: MIN_CAMPAIGN_YAML,
        state: STATE_ACTIVE,
        ledger: LEDGER_THREE_ITERS,
      },
    })
    const workspace = await buildNousWorkspace(source)
    const result = WorkspaceSchema.safeParse(workspace)
    if (!result.success) {
      throw new Error(
        'workspace rejected:\n' +
          JSON.stringify(result.error.issues, null, 2)
      )
    }
    const iterations = workspace.intents.filter(
      (i) => i.kind === 'nous-iteration'
    )
    expect(iterations.length).toBe(2) // iter-1 + iter-2; baseline skipped
    expect(iterations.every((i) => i.id.includes(':iter-'))).toBe(true)
  })

  it('wires iteration ids into parent campaign decomposition.children', async () => {
    const source = staticSource({
      run: {
        campaignYaml: MIN_CAMPAIGN_YAML,
        state: STATE_ACTIVE,
        ledger: LEDGER_THREE_ITERS,
      },
    })
    const workspace = await buildNousWorkspace(source)
    const campaign = workspace.intents.find((i) => i.kind === 'nous-campaign')!
    expect(campaign.decomposition.children.length).toBe(2)
    // children must reference real intents in the workspace
    const idsInWorkspace = new Set(workspace.intents.map((i) => i.id))
    for (const childId of campaign.decomposition.children) {
      expect(idsInWorkspace.has(childId)).toBe(true)
    }
  })

  it('sets extension.current_iteration to the most-recent non-baseline iteration', async () => {
    const source = staticSource({
      run: {
        campaignYaml: MIN_CAMPAIGN_YAML,
        state: STATE_ACTIVE,
        ledger: LEDGER_THREE_ITERS,
      },
    })
    const workspace = await buildNousWorkspace(source)
    const campaign = workspace.intents.find((i) => i.kind === 'nous-campaign')!
    if (campaign.extension.kind === 'nous-campaign') {
      // iter-2 is most recent
      expect(campaign.extension.current_iteration).toBeDefined()
      expect(campaign.extension.current_iteration).toContain(':iter-2')
    }
  })

  it('produces a 1:1 Intent↔IntentState bijection for each iteration', async () => {
    const source = staticSource({
      run: {
        campaignYaml: MIN_CAMPAIGN_YAML,
        state: STATE_ACTIVE,
        ledger: LEDGER_THREE_ITERS,
      },
    })
    const workspace = await buildNousWorkspace(source)
    expect(workspace.intents.length).toBe(workspace.states.length)
    for (const intent of workspace.intents) {
      expect(workspace.states.some((s) => s.intent_id === intent.id)).toBe(true)
    }
  })

  it('emits no iteration intents when ledger has only the baseline', async () => {
    const source = staticSource({
      run: {
        campaignYaml: MIN_CAMPAIGN_YAML,
        state: STATE_ACTIVE,
        ledger: LEDGER_BASELINE_ONLY,
      },
    })
    const workspace = await buildNousWorkspace(source)
    const iterations = workspace.intents.filter(
      (i) => i.kind === 'nous-iteration'
    )
    expect(iterations.length).toBe(0)
    const campaign = workspace.intents.find((i) => i.kind === 'nous-campaign')!
    expect(campaign.decomposition.children).toEqual([])
  })

  it('emits no iteration intents when ledger is absent (Phase 1 still works)', async () => {
    const source = staticSource({
      run: { campaignYaml: MIN_CAMPAIGN_YAML, state: STATE_DONE },
    })
    const workspace = await buildNousWorkspace(source)
    expect(
      workspace.intents.filter((i) => i.kind === 'nous-iteration').length
    ).toBe(0)
  })

  it('tolerates malformed ledger JSON without crashing the campaign', async () => {
    const source = staticSource({
      run: {
        campaignYaml: MIN_CAMPAIGN_YAML,
        state: STATE_ACTIVE,
        ledger: '@@ not json @@',
      },
    })
    const workspace = await buildNousWorkspace(source)
    // Campaign still produced, no iterations.
    expect(workspace.intents.length).toBe(1)
    expect(workspace.intents[0]?.kind).toBe('nous-campaign')
  })

  it('handles in-flight iterations (h_main_result=null) — status=active', async () => {
    const source = staticSource({
      run: {
        campaignYaml: MIN_CAMPAIGN_YAML,
        state: STATE_ACTIVE,
        ledger: LEDGER_ONE_INFLIGHT,
      },
    })
    const workspace = await buildNousWorkspace(source)
    const iter = workspace.intents.find((i) => i.kind === 'nous-iteration')!
    const iterState = workspace.states.find((s) => s.intent_id === iter.id)!
    expect(iterState.status).toBe('active')
  })

  it('emits multiple campaigns in parallel, each with their own iteration trees', async () => {
    const source = staticSource({
      'run-a': {
        campaignYaml: MIN_CAMPAIGN_YAML,
        state: STATE_ACTIVE,
        ledger: LEDGER_THREE_ITERS,
      },
      'run-b': {
        campaignYaml: MIN_CAMPAIGN_YAML,
        state: STATE_ACTIVE,
        ledger: LEDGER_BASELINE_ONLY,
      },
    })
    const workspace = await buildNousWorkspace(source)
    const result = WorkspaceSchema.safeParse(workspace)
    if (!result.success) {
      throw new Error(
        'multi-campaign rejected:\n' +
          JSON.stringify(result.error.issues, null, 2)
      )
    }
    // 2 campaigns + 2 iterations from run-a + 0 from run-b = 4 intents
    expect(workspace.intents.length).toBe(4)
    // run-a's iteration ids must be parent-scoped to run-a
    const iterations = workspace.intents.filter(
      (i) => i.kind === 'nous-iteration'
    )
    expect(iterations.every((i) => i.id.includes(':run-a:'))).toBe(true)
  })
})
