/**
 * Nous parser-pack tests — pure (no FS), all inputs are strings.
 */

import { describe, expect, it } from 'vitest'
import { parseNousCampaign, parseNousIteration } from './nous'
import type { Intent, IntentState, Workspace } from '../../src/schema'

const SCHEMA_VERSION = '0.3.0' as const

const sampleLedger = JSON.stringify({
  iterations: [
    {
      iteration: 0,
      family: 'baseline',
      timestamp: '1970-01-01T00:00:00Z',
      candidate_id: 'baseline',
      h_main_result: null,
      ablation_results: {},
      control_result: null,
      robustness_result: null,
      prediction_accuracy: null,
      principles_extracted: [],
    },
    {
      iteration: 1,
      family: 'absorption-trajectory',
      timestamp: '2026-05-16T03:41:43Z',
      candidate_id: 'iter-1',
      h_main_result: 'PARTIALLY_CONFIRMED',
      robustness_result: 'PARTIALLY_CONFIRMED',
      prediction_accuracy: { arms_correct: 0, arms_total: 3, accuracy_pct: 0.0 },
      principles_extracted: [
        { id: 'RP-1', action: 'INSERT' },
        { id: 'RP-2', action: 'INSERT' },
      ],
    },
    {
      iteration: 2,
      family: 'gamma-cv-sweep',
      timestamp: '2026-05-18T14:22:01Z',
      candidate_id: 'iter-2',
      h_main_result: 'CONFIRMED',
      robustness_result: 'CONFIRMED',
      prediction_accuracy: { arms_correct: 2, arms_total: 3, accuracy_pct: 0.667 },
      principles_extracted: [
        { id: 'RP-3', action: 'INSERT' },
        { id: 'RP-1', action: 'MODIFY' },
      ],
    },
  ],
})

const samplePrinciples = JSON.stringify({
  principles: [
    {
      id: 'RP-1',
      statement: 'For bursty arrivals at sub-capacity loads, the detector produces spurious fast absorption.',
      confidence: 'high',
      regime: 'Gamma CV>=3, rho<0.8',
      evidence: ['e1', 'e2', 'e3'],
      contradicts: ['H1'],
      extraction_iteration: 1,
      mechanism: 'The LT half-window heuristic amplifies burst clustering.',
    },
    {
      id: 'RP-2',
      statement: 'Rule of thumb: K_abs > 100 for high-CV arrival processes.',
      confidence: 'medium',
      regime: 'Any CV',
      evidence: ['e4'],
      contradicts: [],
      extraction_iteration: 1,
      mechanism: 'Smaller K_abs leaves the absorber starved.',
    },
  ],
})

const UNKNOWN_HUMAN = { id: 'unknown-human', kind: 'human' as const, display_name: '(unknown)' }

const CID = 'nous:src:absorption-test'
const II1 = `${CID}:iter-1`
const II2 = `${CID}:iter-2`

function makeCampaignIntent(): Intent {
  return {
    schema_version: SCHEMA_VERSION,
    id: CID,
    kind: 'nous-campaign',
    state_ref: `${CID}-STATE`,
    declaration: {
      title: 'absorption-test',
      summary: 'Investigate absorption behavior under bursty arrivals.',
      success_criterion: '',
    },
    holder: { mode: 'jointly-held', parties: [UNKNOWN_HUMAN] },
    lifetime: { kind: 'campaign', started_at: '2026-05-16T03:41:43Z' },
    decomposition: { children: [II1, II2] },
    provenance: {
      declared_by: UNKNOWN_HUMAN,
      declared_at: '2026-05-16T03:41:43Z',
      motivated_by: [],
      source: 'src',
    },
    extension: {
      kind: 'nous-campaign',
      research_question: 'How does absorption behave under bursty arrivals?',
      open_hypothesis_bundles: [],
      gate_status: { current_gate: 'none' },
    },
    tags: [],
    knowledge_refs: [],
  }
}

function makeIterationIntent(iter: number): Intent {
  const id = iter === 1 ? II1 : II2
  return {
    schema_version: SCHEMA_VERSION,
    id,
    kind: 'nous-iteration',
    state_ref: `${id}-STATE`,
    declaration: {
      title: `iter-${iter}`,
      summary: '',
      success_criterion: '',
    },
    holder: { mode: 'jointly-held', parties: [UNKNOWN_HUMAN] },
    lifetime: { kind: 'campaign', started_at: '2026-05-16T03:41:43Z' },
    decomposition: { parent_id: CID, children: [] },
    provenance: {
      declared_by: UNKNOWN_HUMAN,
      declared_at: '2026-05-16T03:41:43Z',
      motivated_by: [{ kind: 'intent', target: CID }],
      source: 'src',
    },
    extension: {
      kind: 'nous-iteration',
      iteration_number: iter,
      hypothesis_bundle: {
        h_main: {
          statement: `Hypothesis ${iter}`,
          prediction: `Prediction ${iter}`,
          conditions: [],
          result: iter === 1 ? 'inconclusive' : 'confirmed',
        },
        h_ablation: [],
      },
      principles_emitted: [],
    },
    tags: [iter === 1 ? 'absorption-trajectory' : 'gamma-cv-sweep'],
    knowledge_refs: [],
  }
}

function makeWorkspace(): Workspace {
  const campaign = makeCampaignIntent()
  const iter1 = makeIterationIntent(1)
  const iter2 = makeIterationIntent(2)
  const states: IntentState[] = [
    { id: campaign.state_ref, intent_id: campaign.id, schema_version: SCHEMA_VERSION,
      status: 'active', last_advanced_at: '2026-05-18T14:22:01Z',
      last_advanced_by: UNKNOWN_HUMAN,
      history: [], external_anchors: [{ kind: 'nous-campaign-dir', uri: 'src/absorption-test', read_only: true }] },
    { id: iter1.state_ref, intent_id: iter1.id, schema_version: SCHEMA_VERSION,
      status: 'satisfied', last_advanced_at: '2026-05-16T03:41:43Z',
      last_advanced_by: UNKNOWN_HUMAN,
      history: [], external_anchors: [] },
    { id: iter2.state_ref, intent_id: iter2.id, schema_version: SCHEMA_VERSION,
      status: 'satisfied', last_advanced_at: '2026-05-18T14:22:01Z',
      last_advanced_by: UNKNOWN_HUMAN,
      history: [], external_anchors: [] },
  ]
  return { intents: [campaign, iter1, iter2], states, evidence_links: [], operations: [] }
}

describe('parseNousCampaign', () => {
  it('emits an iterations dataset with the rows from ledger.json', () => {
    const ws = makeWorkspace()
    const evidence = parseNousCampaign({
      intent: ws.intents[0]!, state: ws.states[0]!, workspace: ws,
      files: { ledger: sampleLedger, principles: samplePrinciples, state: null },
    })
    const ledger = evidence.datasets.find((d) => d.name === 'iterations')!
    expect(ledger).toBeDefined()
    expect(ledger.rows).toHaveLength(3)
    expect(ledger.rows[1]!.h_main_result).toBe('PARTIALLY_CONFIRMED')
    expect(ledger.rows[2]!.accuracy_pct).toBe(0.667)
  })

  it('derives n_principles_inserted/modified/deleted from principles_extracted action counts', () => {
    const ws = makeWorkspace()
    const evidence = parseNousCampaign({
      intent: ws.intents[0]!, state: ws.states[0]!, workspace: ws,
      files: { ledger: sampleLedger, principles: null, state: null },
    })
    const ledger = evidence.datasets.find((d) => d.name === 'iterations')!
    expect(ledger.rows[1]!.n_principles_inserted).toBe(2)
    expect(ledger.rows[1]!.n_principles_modified).toBe(0)
    expect(ledger.rows[2]!.n_principles_inserted).toBe(1)
    expect(ledger.rows[2]!.n_principles_modified).toBe(1)
  })

  it('surfaces principles dataset + first principles statements as excerpts', () => {
    const ws = makeWorkspace()
    const evidence = parseNousCampaign({
      intent: ws.intents[0]!, state: ws.states[0]!, workspace: ws,
      files: { ledger: sampleLedger, principles: samplePrinciples, state: null },
    })
    const ds = evidence.datasets.find((d) => d.name === 'principles')!
    expect(ds.rows).toHaveLength(2)
    expect(ds.rows[0]!.id).toBe('RP-1')
    expect(ds.rows[0]!.n_evidence).toBe(3)
    expect(ds.rows[0]!.n_contradicts).toBe(1)
    const stmt = evidence.excerpts.find((e) => e.id === 'principle:RP-1:statement')
    expect(stmt?.text).toContain('bursty arrivals')
    const mech = evidence.excerpts.find((e) => e.id === 'principle:RP-1:mechanism')
    expect(mech?.text).toContain('LT half-window')
  })

  it('surfaces research question as the rq excerpt', () => {
    const ws = makeWorkspace()
    const evidence = parseNousCampaign({
      intent: ws.intents[0]!, state: ws.states[0]!, workspace: ws,
      files: { ledger: null, principles: null, state: null },
    })
    const rq = evidence.excerpts.find((e) => e.id === 'rq')
    expect(rq?.text).toContain('absorption')
  })

  it('falls back to workspace-derived iterations dataset when ledger.json missing', () => {
    const ws = makeWorkspace()
    const evidence = parseNousCampaign({
      intent: ws.intents[0]!, state: ws.states[0]!, workspace: ws,
      files: { ledger: null, principles: null, state: null },
    })
    const ledger = evidence.datasets.find((d) => d.name === 'iterations')!
    expect(ledger.rows).toHaveLength(2) // 2 sibling iterations
    expect(ledger.rows[0]!.iter).toBe(1)
    expect(ledger.rows[0]!.h_main_result).toBe('inconclusive')
  })

  it('tolerates malformed ledger.json (returns workspace-derived fallback)', () => {
    const ws = makeWorkspace()
    const evidence = parseNousCampaign({
      intent: ws.intents[0]!, state: ws.states[0]!, workspace: ws,
      files: { ledger: '{not json', principles: null, state: null },
    })
    const ledger = evidence.datasets.find((d) => d.name === 'iterations')
    expect(ledger).toBeDefined()
    expect(ledger!.rows).toHaveLength(2)
  })

  it('produces a stable fingerprint that changes only when files change', () => {
    const ws = makeWorkspace()
    const a = parseNousCampaign({
      intent: ws.intents[0]!, state: ws.states[0]!, workspace: ws,
      files: { ledger: sampleLedger, principles: null, state: null },
    })
    const b = parseNousCampaign({
      intent: ws.intents[0]!, state: ws.states[0]!, workspace: ws,
      files: { ledger: sampleLedger, principles: null, state: null },
    })
    expect(a.fingerprint).toBe(b.fingerprint)
    const c = parseNousCampaign({
      intent: ws.intents[0]!, state: ws.states[0]!, workspace: ws,
      files: { ledger: sampleLedger + ' ', principles: null, state: null },
    })
    expect(a.fingerprint).not.toBe(c.fingerprint)
  })

})

describe('parseNousIteration', () => {
  it('emits iterations + siblings datasets and h_main excerpts', () => {
    const ws = makeWorkspace()
    const iter1 = ws.intents[1]!
    const evidence = parseNousIteration({
      intent: iter1, state: ws.states[1]!, workspace: ws,
      files: { ledger: sampleLedger, principles: samplePrinciples, state: null },
    })
    const iters = evidence.datasets.find((d) => d.name === 'iterations')
    const sibs = evidence.datasets.find((d) => d.name === 'siblings')
    expect(iters?.rows).toHaveLength(3)
    expect(sibs?.rows).toHaveLength(1)
    expect(sibs?.rows[0]!.iter).toBe(2)
    expect(evidence.excerpts.find((e) => e.id === 'h_main:statement')?.text)
      .toBe('Hypothesis 1')
    expect(evidence.excerpts.find((e) => e.id === 'h_main:result')?.text)
      .toBe('inconclusive')
  })
})
