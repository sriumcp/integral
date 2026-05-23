/**
 * Nous adapter — ledger.json parsing + iteration interpretation.
 *
 * Phase 2: read `.nous/<run>/ledger.json` and produce `nous-iteration`
 * child intents wired into the parent campaign's `decomposition.children`.
 *
 * Discipline: synthetic JSON only. Real-data validation runs in dev via
 * the Vite plugin. Schema-exhaustive over `HypothesisResultSchema.options`
 * so a v0.2 enum addition fails the suite until the lossy mapping table
 * is updated and recorded in `gaps.md`.
 */

import { describe, expect, it } from 'vitest'
import {
  HypothesisResultSchema,
  IntentSchema,
  IntentStateSchema,
  type HypothesisResult,
} from '@/schema'
import {
  interpretIteration,
  mapHmainResultToHypothesisResult,
  parseLedger,
  type LedgerEntry,
} from '../ledger'

// ─── parseLedger ───────────────────────────────────────────────────────────
describe('parseLedger', () => {
  it('returns the iterations array from a well-formed ledger', () => {
    const json = JSON.stringify({
      iterations: [
        { iteration: 0, family: 'baseline', timestamp: '1970-01-01T00:00:00Z' },
        { iteration: 1, family: 'pilot', timestamp: '2026-05-19T20:40:02Z' },
      ],
    })
    const entries = parseLedger(json)
    expect(entries.length).toBe(2)
    expect(entries[0]?.iteration).toBe(0)
    expect(entries[1]?.family).toBe('pilot')
  })

  it('returns [] when the JSON is malformed', () => {
    expect(parseLedger('@@ not json @@')).toEqual([])
  })

  it('returns [] when the parsed value is not an object', () => {
    expect(parseLedger('null')).toEqual([])
    expect(parseLedger('"a string"')).toEqual([])
    expect(parseLedger('42')).toEqual([])
  })

  it('returns [] when there is no iterations array', () => {
    expect(parseLedger(JSON.stringify({ runs: [] }))).toEqual([])
    expect(parseLedger(JSON.stringify({ iterations: 'oops' }))).toEqual([])
  })

  it('skips ledger entries that are not objects', () => {
    const json = JSON.stringify({
      iterations: [
        { iteration: 0, family: 'baseline' },
        null,
        'not an entry',
        { iteration: 1, family: 'pilot' },
      ],
    })
    const entries = parseLedger(json)
    expect(entries.length).toBe(2)
    expect(entries.map((e) => e.iteration)).toEqual([0, 1])
  })

  it('coerces principles_extracted to an array of {id, action} objects', () => {
    const json = JSON.stringify({
      iterations: [
        {
          iteration: 1,
          family: 'pilot',
          principles_extracted: [
            { id: 'RP-1', action: 'INSERT' },
            { id: 'RP-2', action: 'UPDATE' },
            'malformed',
            { id: 'RP-3' /* missing action */ },
          ],
        },
      ],
    })
    const entries = parseLedger(json)
    // Malformed entries (non-object, missing fields) are dropped — not crashed.
    expect(entries[0]?.principles_extracted?.length).toBe(2)
    expect(entries[0]?.principles_extracted?.[0]).toEqual({
      id: 'RP-1',
      action: 'INSERT',
    })
  })
})

// ─── mapHmainResultToHypothesisResult ──────────────────────────────────────
describe('mapHmainResultToHypothesisResult', () => {
  it('maps CONFIRMED → confirmed', () => {
    expect(mapHmainResultToHypothesisResult('CONFIRMED')).toBe('confirmed')
  })

  it('maps REFUTED → refuted', () => {
    expect(mapHmainResultToHypothesisResult('REFUTED')).toBe('refuted')
  })

  it('maps INCONCLUSIVE → inconclusive', () => {
    expect(mapHmainResultToHypothesisResult('INCONCLUSIVE')).toBe('inconclusive')
  })

  it('maps PARTIALLY_CONFIRMED → inconclusive (lossy per gaps.md G-N-1)', () => {
    expect(mapHmainResultToHypothesisResult('PARTIALLY_CONFIRMED')).toBe(
      'inconclusive'
    )
  })

  it('maps null → pending (iteration in flight)', () => {
    expect(mapHmainResultToHypothesisResult(null)).toBe('pending')
  })

  it('maps unknown strings → pending', () => {
    expect(mapHmainResultToHypothesisResult('GIBBERISH')).toBe('pending')
    expect(mapHmainResultToHypothesisResult('')).toBe('pending')
  })

  it.each(HypothesisResultSchema.options)(
    'every schema HypothesisResult option is producible by the mapper (%s)',
    (option) => {
      // Schema-exhaustive falsification: every value in the schema enum must
      // be reachable from at least one Nous h_main_result string. If a v0.2
      // schema bump adds an option, this loop fails until we extend the map.
      const reachable: HypothesisResult[] = [
        mapHmainResultToHypothesisResult('CONFIRMED'),
        mapHmainResultToHypothesisResult('REFUTED'),
        mapHmainResultToHypothesisResult('INCONCLUSIVE'),
        mapHmainResultToHypothesisResult('PARTIALLY_CONFIRMED'),
        mapHmainResultToHypothesisResult(null),
      ]
      expect(reachable).toContain(option)
    }
  )
})

// ─── interpretIteration ────────────────────────────────────────────────────
const FULL_ENTRY: LedgerEntry = {
  iteration: 1,
  family: 'policy-class-best-of-field',
  timestamp: '2026-05-19T20:40:02.233931+00:00',
  candidate_id: 'iter-1',
  h_main_result: 'PARTIALLY_CONFIRMED',
  control_result: 'PARTIALLY_CONFIRMED',
  robustness_result: 'PARTIALLY_CONFIRMED',
  ablation_results: { 'ablation-0': 'CONFIRMED' },
  prediction_accuracy: { arms_correct: 0, arms_total: 3, accuracy_pct: 0.0 },
  principles_extracted: [
    { id: 'RP-4', action: 'INSERT' },
    { id: 'RP-5', action: 'UPDATE' },
  ],
  frontier_update: null,
}

describe('interpretIteration', () => {
  const PARENT_ID = 'nous:fs-/synthetic:best-of-field'

  it('produces a valid Intent + IntentState', () => {
    const result = interpretIteration({
      runId: 'best-of-field',
      parentIntentId: PARENT_ID,
      entry: FULL_ENTRY,
      sourceId: 'fs:/synthetic',
    })
    const parsedIntent = IntentSchema.safeParse(result.intent)
    const parsedState = IntentStateSchema.safeParse(result.state)
    if (!parsedIntent.success) {
      throw new Error(
        'iteration intent rejected:\n' +
          JSON.stringify(parsedIntent.error.issues, null, 2)
      )
    }
    if (!parsedState.success) {
      throw new Error(
        'iteration state rejected:\n' +
          JSON.stringify(parsedState.error.issues, null, 2)
      )
    }
    expect(result.intent.kind).toBe('nous-iteration')
    if (result.intent.extension.kind === 'nous-iteration') {
      expect(result.intent.extension.iteration_number).toBe(1)
      expect(result.intent.extension.hypothesis_bundle.h_main.result).toBe(
        'inconclusive'
      )
    }
  })

  it('embeds the family in declaration.title', () => {
    const result = interpretIteration({
      runId: 'best-of-field',
      parentIntentId: PARENT_ID,
      entry: FULL_ENTRY,
      sourceId: 'fs:/synthetic',
    })
    expect(result.intent.declaration.title).toContain('iter-1')
    expect(result.intent.declaration.title).toContain(
      'policy-class-best-of-field'
    )
  })

  it('places family on tags', () => {
    const result = interpretIteration({
      runId: 'best-of-field',
      parentIntentId: PARENT_ID,
      entry: FULL_ENTRY,
      sourceId: 'fs:/synthetic',
    })
    expect(result.intent.tags).toContain('policy-class-best-of-field')
  })

  it('decorates provenance.source = nous', () => {
    const result = interpretIteration({
      runId: 'best-of-field',
      parentIntentId: PARENT_ID,
      entry: FULL_ENTRY,
      sourceId: 'fs:/synthetic',
    })
    expect(result.intent.provenance.source).toBe('nous')
  })

  it('emits principles_emitted as references when principles_extracted is non-empty', () => {
    const result = interpretIteration({
      runId: 'best-of-field',
      parentIntentId: PARENT_ID,
      entry: FULL_ENTRY,
      sourceId: 'fs:/synthetic',
    })
    if (result.intent.extension.kind === 'nous-iteration') {
      const refs = result.intent.extension.principles_emitted ?? []
      expect(refs.length).toBe(2)
      expect(refs[0]?.target).toBe('RP-4')
      expect(refs[0]?.kind).toBe('observation')
    }
  })

  it('omits principles_emitted when there are no principles', () => {
    const entry: LedgerEntry = {
      ...FULL_ENTRY,
      principles_extracted: [],
    }
    const result = interpretIteration({
      runId: 'best-of-field',
      parentIntentId: PARENT_ID,
      entry,
      sourceId: 'fs:/synthetic',
    })
    if (result.intent.extension.kind === 'nous-iteration') {
      // Either undefined or [] is acceptable — interface allows both.
      const refs = result.intent.extension.principles_emitted
      expect(refs === undefined || refs.length === 0).toBe(true)
    }
  })

  it('maps CONFIRMED h_main → IntentState.status=satisfied', () => {
    const entry: LedgerEntry = { ...FULL_ENTRY, h_main_result: 'CONFIRMED' }
    const result = interpretIteration({
      runId: 'best-of-field',
      parentIntentId: PARENT_ID,
      entry,
      sourceId: 'fs:/synthetic',
    })
    expect(result.state.status).toBe('satisfied')
  })

  it('maps REFUTED h_main → IntentState.status=satisfied (the iteration finished, just refuted)', () => {
    const entry: LedgerEntry = { ...FULL_ENTRY, h_main_result: 'REFUTED' }
    const result = interpretIteration({
      runId: 'best-of-field',
      parentIntentId: PARENT_ID,
      entry,
      sourceId: 'fs:/synthetic',
    })
    // Iterations don't fail in the abandoned/revoked sense — refutation is
    // a finished outcome. status=satisfied keeps the parent campaign's
    // active/awaiting cycle independent of any single iter's truth value.
    expect(result.state.status).toBe('satisfied')
  })

  it('maps null h_main → IntentState.status=active (in flight)', () => {
    const entry: LedgerEntry = { ...FULL_ENTRY, h_main_result: null }
    const result = interpretIteration({
      runId: 'best-of-field',
      parentIntentId: PARENT_ID,
      entry,
      sourceId: 'fs:/synthetic',
    })
    expect(result.state.status).toBe('active')
  })

  it('uses entry.timestamp for declared_at + last_advanced_at', () => {
    const result = interpretIteration({
      runId: 'best-of-field',
      parentIntentId: PARENT_ID,
      entry: FULL_ENTRY,
      sourceId: 'fs:/synthetic',
    })
    expect(result.intent.provenance.declared_at).toBe(FULL_ENTRY.timestamp)
    expect(result.state.last_advanced_at).toBe(FULL_ENTRY.timestamp)
  })

  it('emits a deterministic, parent-scoped intent id', () => {
    const result = interpretIteration({
      runId: 'best-of-field',
      parentIntentId: PARENT_ID,
      entry: FULL_ENTRY,
      sourceId: 'fs:/synthetic',
    })
    // Iter ids must be stable across runs of the same ledger so that
    // parent.decomposition.children references stay valid.
    expect(result.intent.id).toBe(`${PARENT_ID}:iter-1`)
  })

  it('synthesizes a minimal h_main hypothesis (statement + prediction non-empty)', () => {
    const result = interpretIteration({
      runId: 'best-of-field',
      parentIntentId: PARENT_ID,
      entry: FULL_ENTRY,
      sourceId: 'fs:/synthetic',
    })
    if (result.intent.extension.kind === 'nous-iteration') {
      const h = result.intent.extension.hypothesis_bundle.h_main
      expect(h.statement.length).toBeGreaterThan(0)
      expect(h.prediction.length).toBeGreaterThan(0)
    }
  })
})
