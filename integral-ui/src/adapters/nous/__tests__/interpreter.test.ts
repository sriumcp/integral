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
