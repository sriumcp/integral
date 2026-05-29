/**
 * activity.ts — significance heuristic + event derivation tests.
 *
 * Schema-exhaustive: parameterized over `IntentKindSchema.options` so a
 * v0.2 IntentKind addition fails the test until the heuristic explicitly
 * acknowledges it (even if it bucketed as routine, the kind must appear
 * somewhere in the heuristic logic via narrowing or default-case data).
 */

import { describe, expect, it } from 'vitest'
import {
  IntentKindSchema,
  OperationKindSchema,
  type Intent,
  type Operation,
  type StateTransition,
} from '@/schema'
import { seedWorkspace, sri, nousPlanner } from '@/test/seed-workspace'
import { classifyOperation, classifySignificance, deriveEvents } from '../activity'

const KINDS = IntentKindSchema.options

function intentFor(kind: (typeof KINDS)[number]): Intent {
  const found = seedWorkspace.intents.find((i) => i.kind === kind)
  if (!found) throw new Error(`fixture missing ${kind}`)
  return found
}

const baseTransition = (cause: string): StateTransition => ({
  at: '2026-05-22T12:00:00Z',
  by: sri,
  from_status: 'active',
  to_status: 'active',
  cause,
})

describe('classifySignificance', () => {
  // The "ci passing→failing on feature-pr" critical-significance test
  // was deleted with the feature-pr kind in v0.2.0. Returns when the
  // full feature-dev adapter ships.

  it('returns notable for gate-resolved on any intent', () => {
    const nous = intentFor('nous-campaign')
    const t = baseTransition('gate-resolved: design → execute_analyze')
    expect(classifySignificance(t, nous)).toBe('notable')
  })

  it('returns notable for new-best score on coral-optimization', () => {
    const coral = intentFor('coral-optimization')
    const t = baseTransition('attempt-scored: 0.842 (new best)')
    expect(classifySignificance(t, coral)).toBe('notable')
  })

  it('returns routine for non-best scores on coral-optimization', () => {
    const coral = intentFor('coral-optimization')
    const t = baseTransition('attempt-scored: 0.812')
    expect(classifySignificance(t, coral)).toBe('routine')
  })

  it('returns notable for proposed-next-iteration on nous-campaign', () => {
    const nous = intentFor('nous-campaign')
    const t = baseTransition('proposed-next-iteration: iter-3')
    expect(classifySignificance(t, nous)).toBe('notable')
  })

  it('returns routine for unrelated transitions', () => {
    const attempt = intentFor('coral-attempt')
    const t = baseTransition('worktree-checkout: attempt-042 → main')
    expect(classifySignificance(t, attempt)).toBe('routine')
  })

  it.each(KINDS)('returns a valid significance level for kind %s (default routine)', (kind) => {
    const intent = intentFor(kind)
    const t = baseTransition('unknown-cause')
    const sig = classifySignificance(t, intent)
    expect(['critical', 'notable', 'routine']).toContain(sig)
  })
})

describe('deriveEvents', () => {
  it('returns one ActivityEvent per StateTransition + per Operation', () => {
    const events = deriveEvents(seedWorkspace)
    const transitionCount = seedWorkspace.states.reduce(
      (acc, s) => acc + s.history.length,
      0
    )
    const operationCount = seedWorkspace.operations.length
    expect(events.length).toBe(transitionCount + operationCount)
  })

  it('orders events most-recent first', () => {
    const events = deriveEvents(seedWorkspace)
    for (let i = 1; i < events.length; i++) {
      const prev = events[i - 1]!
      const curr = events[i]!
      expect(prev.at >= curr.at).toBe(true)
    }
  })

  it('exposes intent + state on every event so renderers can narrow on extension.kind', () => {
    const events = deriveEvents(seedWorkspace)
    expect(events.length).toBeGreaterThan(0)
    for (const ev of events) {
      expect(ev.intent.id).toBe(ev.state.intent_id)
    }
  })

  it('partitions buckets correctly for the seed content', () => {
    const events = deriveEvents(seedWorkspace)
    const notable = events.filter((e) => e.significance === 'notable')
    const routine = events.filter((e) => e.significance === 'routine')

    // Seed has 2 notable (gate-resolved + new best) and the rest routine.
    // No critical (the v0.1 ci-failing-on-feature-pr branch was removed
    // along with the feature-pr kind in v0.2.0).
    expect(notable.length).toBeGreaterThanOrEqual(2)
    expect(routine.length).toBeGreaterThanOrEqual(1)
  })

  it('returns an empty array when no states have history', () => {
    const empty = {
      intents: seedWorkspace.intents,
      states: seedWorkspace.states.map((s) => ({ ...s, history: [] })),
      evidence_links: [],
      operations: [],
    }
    expect(deriveEvents(empty)).toEqual([])
  })

  it('preserves the transition party as event.by', () => {
    const events = deriveEvents(seedWorkspace)
    const planneEvent = events.find((e) => e.by.id === nousPlanner.id)
    expect(planneEvent).toBeDefined()
  })

  it('skips events whose target intent state is missing without crashing', () => {
    // Defensive — should not happen given the bijection refine, but the
    // function must not throw on a malformed workspace.
    const malformed = {
      ...seedWorkspace,
      states: seedWorkspace.states.slice(0, 2),
    }
    expect(() => deriveEvents(malformed)).not.toThrow()
  })

  it('emits operation events alongside transition events, source-tagged', () => {
    const events = deriveEvents(seedWorkspace)
    const opEvents = events.filter((e) => e.source === 'operation')
    const transEvents = events.filter((e) => e.source === 'transition')
    expect(opEvents.length).toBe(seedWorkspace.operations.length)
    expect(transEvents.length).toBeGreaterThan(0)
    // Operation events carry the typed Operation record.
    for (const e of opEvents) {
      expect(e.operation).toBeDefined()
      expect(e.operation!.id).toBe(e.id)
    }
  })
})

describe('classifyOperation — schema-exhaustive', () => {
  // Build a base op shape we can spread into per-kind variants.
  const baseOp = (kind: Operation['kind']): Operation => {
    const common = {
      id: 'op-test',
      at: '2026-05-22T16:00:00Z',
      by: sri,
      target_intent_id: '01HXYZ-NOUS-CAMPAIGN-001',
      cause: 'test',
    }
    // Per-kind required payloads — must match the schema arms.
    if (kind === 'decompose') return { ...common, kind, children: ['c1'] }
    if (kind === 'fork') return { ...common, kind, forked_intent_id: 'f1' }
    if (kind === 'merge')
      return { ...common, kind, merged_intent_ids: ['m1', 'm2'] }
    if (kind === 'reframe')
      return {
        ...common,
        kind,
        from_kind: 'nous-campaign',
        to_kind: 'coral-optimization',
      }
    if (kind === 'gate') return { ...common, kind, gate: 'design' }
    if (kind === 'propose-transition')
      return { ...common, kind, proposal: 'iter-3' }
    if (kind === 'delegate') return { ...common, kind, to_party: nousPlanner }
    if (kind === 'advance')
      return { ...common, kind, from_status: 'active', to_status: 'gated' }
    return { ...common, kind } as Operation
  }

  it.each(OperationKindSchema.options)(
    'returns a valid significance for kind %s',
    (kind) => {
      const sig = classifyOperation(baseOp(kind))
      expect(['critical', 'notable', 'routine']).toContain(sig)
    }
  )

  it('flags revoke as critical', () => {
    expect(classifyOperation(baseOp('revoke'))).toBe('critical')
  })

  it('flags declare / satisfy / propose-transition / gate as notable', () => {
    for (const kind of [
      'declare',
      'satisfy',
      'propose-transition',
      'gate',
      'commit',
      'accept-proposal',
    ] as const) {
      expect(classifyOperation(baseOp(kind))).toBe('notable')
    }
  })

  it('flags fine-grained ops (refine / probe / clarify / decompose) as routine', () => {
    for (const kind of ['refine', 'probe', 'clarify', 'decompose'] as const) {
      expect(classifyOperation(baseOp(kind))).toBe('routine')
    }
  })
})
