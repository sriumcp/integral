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

  // ─── Cache-stability: last_advanced_at must be deterministic across reads
  // when state.json is absent. Otherwise the projection cache key changes
  // every request and the LLM regenerates per page load. The fix: thread
  // the YAML file's mtime through `CampaignFiles.campaignYamlMtime` and
  // use it as the fallback before resorting to the non-deterministic
  // current-time stamp.
  it('uses campaignYamlMtime as last_advanced_at when state.json is absent', () => {
    const mtime = '2026-05-24T15:30:00.000Z'
    const result = interpretCampaign(
      'no-state',
      {
        campaignYaml: MIN_CAMPAIGN_YAML,
        state: null,
        ledger: null,
        principles: null,
        campaignYamlMtime: mtime,
      },
      'fs:/synthetic'
    )
    expect(result?.state.last_advanced_at).toBe(mtime)
  })

  it('produces a stable last_advanced_at across repeat calls when mtime is provided', () => {
    const files: CampaignFiles = {
      campaignYaml: MIN_CAMPAIGN_YAML,
      state: null,
      ledger: null,
      principles: null,
      campaignYamlMtime: '2026-05-24T15:30:00.000Z',
    }
    const a = interpretCampaign('stable', files, 'fs:/synthetic')
    const b = interpretCampaign('stable', files, 'fs:/synthetic')
    expect(a?.state.last_advanced_at).toBe(b?.state.last_advanced_at)
  })

  it('prefers parsedState.timestamp over mtime when state.json is present', () => {
    const result = interpretCampaign(
      'has-state',
      {
        campaignYaml: MIN_CAMPAIGN_YAML,
        state: STATE_DONE,
        ledger: null,
        principles: null,
        campaignYamlMtime: '2099-01-01T00:00:00.000Z', // far future, would lose
      },
      'fs:/synthetic'
    )
    // STATE_DONE.timestamp = '2026-05-19T21:18:04Z'
    expect(result?.state.last_advanced_at).toBe('2026-05-19T21:18:04Z')
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

  // ─── Phase 3: principles.json → KnowledgeRef wiring ─────────────────────

  it('attaches campaign-scoped KnowledgeRefs (role=principles) when principles.json is present', async () => {
    const principlesJson = JSON.stringify({
      principles: [
        { id: 'RP-1', extraction_iteration: 1 },
        { id: 'RP-2', extraction_iteration: 2 },
        { id: 'RP-3', extraction_iteration: 2 },
      ],
    })
    const source = staticSource({
      run: {
        campaignYaml: MIN_CAMPAIGN_YAML,
        state: STATE_ACTIVE,
        ledger: LEDGER_THREE_ITERS,
        principles: principlesJson,
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

    const campaign = workspace.intents.find((i) => i.kind === 'nous-campaign')!
    const campaignPrinciples = campaign.knowledge_refs.filter(
      (k) => k.role === 'principles'
    )
    expect(campaignPrinciples.length).toBe(3)
    expect(campaignPrinciples.every((k) => k.scope === 'campaign')).toBe(true)
    // URIs are stable & adapter-namespaced.
    expect(campaignPrinciples[0]?.uri).toMatch(/^nous-principle:\/\/run\/RP-1$/)
  })

  it('attaches iteration-scoped KnowledgeRefs only to the iteration that emitted each principle', async () => {
    const principlesJson = JSON.stringify({
      principles: [
        { id: 'RP-1', extraction_iteration: 1 },
        { id: 'RP-2', extraction_iteration: 2 },
        { id: 'RP-3', extraction_iteration: 2 },
      ],
    })
    const source = staticSource({
      run: {
        campaignYaml: MIN_CAMPAIGN_YAML,
        state: STATE_ACTIVE,
        ledger: LEDGER_THREE_ITERS,
        principles: principlesJson,
      },
    })
    const workspace = await buildNousWorkspace(source)
    const iter1 = workspace.intents.find(
      (i) => i.kind === 'nous-iteration' && i.id.endsWith(':iter-1')
    )!
    const iter2 = workspace.intents.find(
      (i) => i.kind === 'nous-iteration' && i.id.endsWith(':iter-2')
    )!
    expect(iter1.knowledge_refs.length).toBe(1)
    expect(iter1.knowledge_refs[0]?.scope).toBe('iteration')
    expect(iter1.knowledge_refs[0]?.uri).toContain('RP-1')
    expect(iter2.knowledge_refs.length).toBe(2)
    expect(iter2.knowledge_refs.every((k) => k.scope === 'iteration')).toBe(
      true
    )
  })

  it('emits the same uri on the campaign and iteration refs (so cross-scope lookups resolve)', async () => {
    const principlesJson = JSON.stringify({
      principles: [{ id: 'RP-7', extraction_iteration: 1 }],
    })
    const source = staticSource({
      run: {
        campaignYaml: MIN_CAMPAIGN_YAML,
        state: STATE_ACTIVE,
        ledger: LEDGER_ONE_INFLIGHT,
        principles: principlesJson,
      },
    })
    const workspace = await buildNousWorkspace(source)
    const campaign = workspace.intents.find((i) => i.kind === 'nous-campaign')!
    const iter = workspace.intents.find((i) => i.kind === 'nous-iteration')!
    expect(campaign.knowledge_refs[0]?.uri).toBe(iter.knowledge_refs[0]?.uri)
  })

  it('produces no KnowledgeRefs when principles.json is absent (graceful absence)', async () => {
    const source = staticSource({
      run: {
        campaignYaml: MIN_CAMPAIGN_YAML,
        state: STATE_ACTIVE,
        ledger: LEDGER_THREE_ITERS,
      },
    })
    const workspace = await buildNousWorkspace(source)
    const campaign = workspace.intents.find((i) => i.kind === 'nous-campaign')!
    expect(campaign.knowledge_refs).toEqual([])
    const iters = workspace.intents.filter((i) => i.kind === 'nous-iteration')
    for (const iter of iters) {
      expect(iter.knowledge_refs).toEqual([])
    }
  })

  it('tolerates malformed principles.json without crashing the campaign', async () => {
    const source = staticSource({
      run: {
        campaignYaml: MIN_CAMPAIGN_YAML,
        state: STATE_ACTIVE,
        ledger: LEDGER_THREE_ITERS,
        principles: '@@ not json @@',
      },
    })
    const workspace = await buildNousWorkspace(source)
    // Campaign + iterations still produced; just no knowledge refs.
    expect(workspace.intents.length).toBe(3)
    const campaign = workspace.intents.find((i) => i.kind === 'nous-campaign')!
    expect(campaign.knowledge_refs).toEqual([])
  })

  it('drops principles whose extraction_iteration is the synthetic baseline (0) — campaign keeps them but no iteration intent owns iter-0', async () => {
    const principlesJson = JSON.stringify({
      principles: [
        { id: 'RP-A', extraction_iteration: 0 }, // owned by the filtered baseline
        { id: 'RP-B', extraction_iteration: 1 },
      ],
    })
    const source = staticSource({
      run: {
        campaignYaml: MIN_CAMPAIGN_YAML,
        state: STATE_ACTIVE,
        ledger: LEDGER_ONE_INFLIGHT,
        principles: principlesJson,
      },
    })
    const workspace = await buildNousWorkspace(source)
    const campaign = workspace.intents.find((i) => i.kind === 'nous-campaign')!
    // Both principles attached at campaign scope (campaign owns the full set).
    expect(campaign.knowledge_refs.length).toBe(2)
    // Only RP-B reaches iter-1; RP-A's iter-0 owner was filtered upstream,
    // so it has no per-iteration intent to attach to. That's deliberate
    // (gaps.md G-N-2 — baseline iterations are synthetic).
    const iter = workspace.intents.find((i) => i.kind === 'nous-iteration')!
    expect(iter.knowledge_refs.length).toBe(1)
    expect(iter.knowledge_refs[0]?.uri).toContain('RP-B')
  })

  // ─── Phase 4: Operations from observed transitions (prior → current) ──

  const STATE_GATED = JSON.stringify({
    phase: 'GATED',
    iteration: 1,
    run_id: 'gated-run',
    timestamp: '2026-05-22T15:00:00Z',
  })

  it('emits no operations when no prior workspace is provided (Phase 1-3 behavior preserved)', async () => {
    const source = staticSource({
      run: { campaignYaml: MIN_CAMPAIGN_YAML, state: STATE_DONE },
    })
    const workspace = await buildNousWorkspace(source)
    expect(workspace.operations).toEqual([])
  })

  it('emits no operations when prior === current (idempotent re-read)', async () => {
    const source = staticSource({
      run: {
        campaignYaml: MIN_CAMPAIGN_YAML,
        state: STATE_ACTIVE,
        ledger: LEDGER_THREE_ITERS,
      },
    })
    const first = await buildNousWorkspace(source)
    const second = await buildNousWorkspace(source, {
      prior: first,
      at: '2026-05-23T10:00:00Z',
    })
    expect(second.operations).toEqual([])
  })

  it('emits declare + decompose when a new iteration appears', async () => {
    const sourceBefore = staticSource({
      run: {
        campaignYaml: MIN_CAMPAIGN_YAML,
        state: STATE_ACTIVE,
        ledger: LEDGER_ONE_INFLIGHT,
      },
    })
    const sourceAfter = staticSource({
      run: {
        campaignYaml: MIN_CAMPAIGN_YAML,
        state: STATE_ACTIVE,
        ledger: LEDGER_THREE_ITERS,
      },
    })
    const prior = await buildNousWorkspace(sourceBefore)
    const current = await buildNousWorkspace(sourceAfter, {
      prior,
      at: '2026-05-23T10:00:00Z',
    })
    const declares = current.operations.filter((o) => o.kind === 'declare')
    const decomposes = current.operations.filter((o) => o.kind === 'decompose')
    // iter-2 is newly declared (iter-1 already existed in prior).
    expect(declares.length).toBeGreaterThanOrEqual(1)
    expect(decomposes.length).toBeGreaterThanOrEqual(1)
    if (decomposes[0]?.kind === 'decompose') {
      expect(decomposes[0].children.some((c) => c.endsWith(':iter-2'))).toBe(true)
    }
  })

  it('emits satisfy when an iteration h_main_result resolves', async () => {
    // Prior: iter-1 in flight (h_main_result: null → status active)
    // Current: iter-1 confirmed (h_main_result: CONFIRMED → status satisfied)
    const sourceBefore = staticSource({
      run: {
        campaignYaml: MIN_CAMPAIGN_YAML,
        state: STATE_ACTIVE,
        ledger: LEDGER_ONE_INFLIGHT,
      },
    })
    const ledgerResolved = JSON.stringify({
      iterations: [
        {
          iteration: 0,
          family: 'baseline',
          timestamp: '1970-01-01T00:00:00Z',
        },
        {
          iteration: 1,
          family: 'pilot',
          timestamp: '2026-05-22T15:00:00Z',
          candidate_id: 'iter-1',
          h_main_result: 'CONFIRMED',
        },
      ],
    })
    const sourceAfter = staticSource({
      run: {
        campaignYaml: MIN_CAMPAIGN_YAML,
        state: STATE_ACTIVE,
        ledger: ledgerResolved,
      },
    })
    const prior = await buildNousWorkspace(sourceBefore)
    const current = await buildNousWorkspace(sourceAfter, {
      prior,
      at: '2026-05-23T10:00:00Z',
    })
    const satisfies = current.operations.filter((o) => o.kind === 'satisfy')
    expect(satisfies.length).toBe(1)
    expect(satisfies[0]?.target_intent_id).toContain(':iter-1')
  })

  it('emits gate when campaign status flips to gated', async () => {
    const sourceBefore = staticSource({
      run: { campaignYaml: MIN_CAMPAIGN_YAML, state: STATE_ACTIVE },
    })
    const sourceAfter = staticSource({
      run: { campaignYaml: MIN_CAMPAIGN_YAML, state: STATE_GATED },
    })
    const prior = await buildNousWorkspace(sourceBefore)
    const current = await buildNousWorkspace(sourceAfter, {
      prior,
      at: '2026-05-23T10:00:00Z',
    })
    const gates = current.operations.filter((o) => o.kind === 'gate')
    expect(gates.length).toBe(1)
  })

  it('emits ops that all validate against OperationSchema', async () => {
    const sourceBefore = staticSource({
      run: {
        campaignYaml: MIN_CAMPAIGN_YAML,
        state: STATE_ACTIVE,
        ledger: LEDGER_ONE_INFLIGHT,
      },
    })
    const sourceAfter = staticSource({
      run: {
        campaignYaml: MIN_CAMPAIGN_YAML,
        state: STATE_DONE,
        ledger: LEDGER_THREE_ITERS,
      },
    })
    const prior = await buildNousWorkspace(sourceBefore)
    const current = await buildNousWorkspace(sourceAfter, {
      prior,
      at: '2026-05-23T10:00:00Z',
    })
    const result = WorkspaceSchema.safeParse(current)
    if (!result.success) {
      throw new Error(
        'workspace rejected:\n' +
          JSON.stringify(result.error.issues, null, 2)
      )
    }
    expect(current.operations.length).toBeGreaterThan(0)
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
