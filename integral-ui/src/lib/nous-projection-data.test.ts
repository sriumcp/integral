/**
 * nous-projection-data — unit tests for pure derivations from
 * (campaign, workspace) to atom-input shapes.
 *
 * Each helper is a pure projection over `decomposition.children` —
 * filters to nous-iteration extension kind, sorts by iteration_number,
 * and projects the atom-input shape. Tests cover happy path, missing
 * children, wrong-kind children, ordering invariants, and label
 * generation.
 */

import { describe, expect, it, vi } from 'vitest'
import type { Intent, Workspace } from '@/schema'
import { sri } from '@/test/seed-workspace'
import {
  nousHMainTimeline,
  nousHypothesisGrid,
  nousPrinciplesTempo,
} from './nous-projection-data'

function makeCampaign(childIds: string[]): Intent {
  return {
    id: 'CAMP',
    schema_version: '0.2.0',
    kind: 'nous-campaign',
    declaration: { title: 'campaign', summary: '', success_criterion: '' },
    holder: { mode: 'human-held', parties: [sri] },
    lifetime: { kind: 'campaign', started_at: '2026-01-01T00:00:00Z' },
    decomposition: { children: childIds },
    provenance: {
      declared_by: sri,
      declared_at: '2026-01-01T00:00:00Z',
      motivated_by: [],
    },
    knowledge_refs: [],
    tags: [],
    state_ref: 'CAMP-STATE',
    extension: {
      kind: 'nous-campaign',
      research_question: 'q',
      open_hypothesis_bundles: [],
      gate_status: {},
    },
  } as unknown as Intent
}

function makeIteration(opts: {
  id: string
  iterationNumber: number
  principlesEmitted?: number
  hMain?: 'pending' | 'confirmed' | 'refuted' | 'inconclusive'
  hAblation?: ReadonlyArray<'pending' | 'confirmed' | 'refuted' | 'inconclusive'>
}): Intent {
  const principles_emitted = opts.principlesEmitted
    ? Array.from({ length: opts.principlesEmitted }, (_, i) => ({
        kind: 'observation' as const,
        observation: `principle-${i}`,
      }))
    : []
  return {
    id: opts.id,
    schema_version: '0.2.0',
    kind: 'nous-iteration',
    declaration: {
      title: `iter-${opts.iterationNumber}`,
      summary: '',
      success_criterion: '',
    },
    holder: { mode: 'human-held', parties: [sri] },
    lifetime: { kind: 'discrete', started_at: '2026-01-01T00:00:00Z' },
    decomposition: { children: [] },
    provenance: {
      declared_by: sri,
      declared_at: '2026-01-01T00:00:00Z',
      motivated_by: [],
    },
    knowledge_refs: [],
    tags: [],
    state_ref: opts.id + '-STATE',
    extension: {
      kind: 'nous-iteration',
      iteration_number: opts.iterationNumber,
      hypothesis_bundle: {
        h_main: {
          statement: 'main',
          prediction: 'p',
          conditions: [],
          ...(opts.hMain ? { result: opts.hMain } : {}),
        },
        h_ablation: (opts.hAblation ?? []).map((r, i) => ({
          statement: `ab-${i}`,
          prediction: 'p',
          conditions: [],
          result: r,
        })),
      },
      principles_emitted,
    },
  } as unknown as Intent
}

function makeWorkspace(intents: Intent[]): Workspace {
  return {
    schema_version: '0.2.0',
    intents,
    states: [],
    evidence_links: [],
    operations: [],
  } as unknown as Workspace
}

describe('nousPrinciplesTempo', () => {
  it('returns empty when campaign has no children', () => {
    const camp = makeCampaign([])
    const ws = makeWorkspace([camp])
    expect(nousPrinciplesTempo(camp, ws)).toEqual([])
  })

  it('returns one row per iteration child, in iteration_number order', () => {
    const i1 = makeIteration({
      id: 'I1',
      iterationNumber: 2,
      principlesEmitted: 1,
    })
    const i2 = makeIteration({
      id: 'I2',
      iterationNumber: 1,
      principlesEmitted: 0,
    })
    const i3 = makeIteration({
      id: 'I3',
      iterationNumber: 3,
      principlesEmitted: 2,
    })
    // Children listed out-of-order to verify sort by iteration_number.
    const camp = makeCampaign(['I3', 'I1', 'I2'])
    const ws = makeWorkspace([camp, i1, i2, i3])
    expect(nousPrinciplesTempo(camp, ws)).toEqual([
      { iterationNumber: 1, principlesEmitted: 0 },
      { iterationNumber: 2, principlesEmitted: 1 },
      { iterationNumber: 3, principlesEmitted: 2 },
    ])
  })

  it('treats missing principles_emitted as 0', () => {
    const i1 = makeIteration({ id: 'I1', iterationNumber: 1 }) // no principles
    const camp = makeCampaign(['I1'])
    const ws = makeWorkspace([camp, i1])
    expect(nousPrinciplesTempo(camp, ws)).toEqual([
      { iterationNumber: 1, principlesEmitted: 0 },
    ])
  })

  it('drops children that are missing from the workspace (silent)', () => {
    // A child id that doesn't resolve in the workspace — partial-load
    // case, not an adapter bug. Schema validation upstream is the
    // canonical gate; the helper is defensive only.
    const i1 = makeIteration({
      id: 'I1',
      iterationNumber: 1,
      principlesEmitted: 1,
    })
    const camp = makeCampaign(['I1', 'MISSING'])
    const ws = makeWorkspace([camp, i1])
    expect(nousPrinciplesTempo(camp, ws)).toEqual([
      { iterationNumber: 1, principlesEmitted: 1 },
    ])
  })

  it('drops children whose extension.kind is not nous-iteration (with warn)', () => {
    // A child resolves to a wrong-kind extension — schema invariant
    // violation in practice; the helper drops it and warns.
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const i1 = makeIteration({
      id: 'I1',
      iterationNumber: 1,
      principlesEmitted: 1,
    })
    // Synthesize a wrong-kind child: a nous-iteration child id that
    // resolves to an intent with a non-iteration extension.
    const stranger = {
      ...makeIteration({ id: 'STRANGER', iterationNumber: 99 }),
      extension: { kind: 'coral-attempt' as const },
    } as unknown as Intent
    const camp = makeCampaign(['I1', 'STRANGER'])
    const ws = makeWorkspace([camp, i1, stranger])
    expect(nousPrinciplesTempo(camp, ws)).toEqual([
      { iterationNumber: 1, principlesEmitted: 1 },
    ])
    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(warnSpy.mock.calls[0]?.[0]).toMatch(/coral-attempt/)
    warnSpy.mockRestore()
  })
})

describe('nousHypothesisGrid', () => {
  it('returns empty when campaign has no iteration children', () => {
    const camp = makeCampaign([])
    const ws = makeWorkspace([camp])
    expect(nousHypothesisGrid(camp, ws)).toEqual([])
  })

  it('emits one HypothesisGridIteration per child, sorted by iteration_number', () => {
    const i1 = makeIteration({
      id: 'I1',
      iterationNumber: 1,
      hMain: 'pending',
    })
    const i2 = makeIteration({
      id: 'I2',
      iterationNumber: 2,
      hMain: 'confirmed',
      hAblation: ['refuted'],
    })
    const camp = makeCampaign(['I2', 'I1'])
    const ws = makeWorkspace([camp, i1, i2])
    const result = nousHypothesisGrid(camp, ws)
    expect(result.map((i) => i.iterationNumber)).toEqual([1, 2])
  })

  it('labels hypotheses with h_main / h_ablation[i] / etc. for stable row identity', () => {
    const i1 = makeIteration({
      id: 'I1',
      iterationNumber: 1,
      hMain: 'confirmed',
      hAblation: ['pending', 'refuted'],
    })
    const camp = makeCampaign(['I1'])
    const ws = makeWorkspace([camp, i1])
    const grid = nousHypothesisGrid(camp, ws)
    expect(grid).toHaveLength(1)
    const labels = grid[0]!.hypotheses.map((h) => h.label)
    expect(labels).toEqual(['h_main', 'h_ablation[0]', 'h_ablation[1]'])
  })

  it('preserves result field per hypothesis', () => {
    const i1 = makeIteration({
      id: 'I1',
      iterationNumber: 1,
      hMain: 'confirmed',
      hAblation: ['refuted'],
    })
    const camp = makeCampaign(['I1'])
    const ws = makeWorkspace([camp, i1])
    const grid = nousHypothesisGrid(camp, ws)
    const hMain = grid[0]!.hypotheses.find((h) => h.label === 'h_main')
    const hAb0 = grid[0]!.hypotheses.find((h) => h.label === 'h_ablation[0]')
    expect(hMain?.result).toBe('confirmed')
    expect(hAb0?.result).toBe('refuted')
  })

  it('omits result field when the underlying hypothesis has no result', () => {
    // h_main without a result still produces a row entry but no result.
    const i1 = makeIteration({ id: 'I1', iterationNumber: 1 }) // no hMain set
    const camp = makeCampaign(['I1'])
    const ws = makeWorkspace([camp, i1])
    const grid = nousHypothesisGrid(camp, ws)
    const hMain = grid[0]!.hypotheses.find((h) => h.label === 'h_main')
    expect(hMain?.result).toBeUndefined()
  })
})

describe('nousHMainTimeline', () => {
  it('returns empty when campaign has no iteration children', () => {
    const camp = makeCampaign([])
    const ws = makeWorkspace([camp])
    expect(nousHMainTimeline(camp, ws)).toEqual([])
  })

  it('emits one HMainTimelineDatum per child, sorted by iteration_number', () => {
    const i1 = makeIteration({
      id: 'I1',
      iterationNumber: 1,
      hMain: 'confirmed',
    })
    const i2 = makeIteration({
      id: 'I2',
      iterationNumber: 2,
      hMain: 'refuted',
    })
    const camp = makeCampaign(['I2', 'I1'])
    const ws = makeWorkspace([camp, i1, i2])
    expect(nousHMainTimeline(camp, ws)).toEqual([
      { iterationNumber: 1, result: 'confirmed' },
      { iterationNumber: 2, result: 'refuted' },
    ])
  })

  it('emits a datum without `result` when h_main has no result (synthetic baseline)', () => {
    // The Nous adapter builds an iter-0 baseline-style intent that may
    // not carry an h_main result. The atom interprets undefined as
    // "iteration ran but wasn't probed" — keeps the iteration number
    // visible without claiming a status.
    const i0 = makeIteration({ id: 'I0', iterationNumber: 0 })
    const i1 = makeIteration({
      id: 'I1',
      iterationNumber: 1,
      hMain: 'confirmed',
    })
    const camp = makeCampaign(['I0', 'I1'])
    const ws = makeWorkspace([camp, i0, i1])
    const timeline = nousHMainTimeline(camp, ws)
    expect(timeline).toHaveLength(2)
    expect(timeline[0]).toEqual({ iterationNumber: 0 })
    expect(timeline[1]).toEqual({ iterationNumber: 1, result: 'confirmed' })
  })

  it('preserves all four result kinds (pending / confirmed / refuted / inconclusive)', () => {
    const iters = [
      makeIteration({ id: 'I1', iterationNumber: 1, hMain: 'pending' }),
      makeIteration({ id: 'I2', iterationNumber: 2, hMain: 'confirmed' }),
      makeIteration({ id: 'I3', iterationNumber: 3, hMain: 'refuted' }),
      makeIteration({ id: 'I4', iterationNumber: 4, hMain: 'inconclusive' }),
    ]
    const camp = makeCampaign(['I1', 'I2', 'I3', 'I4'])
    const ws = makeWorkspace([camp, ...iters])
    const timeline = nousHMainTimeline(camp, ws)
    expect(timeline.map((t) => t.result)).toEqual([
      'pending',
      'confirmed',
      'refuted',
      'inconclusive',
    ])
  })
})
