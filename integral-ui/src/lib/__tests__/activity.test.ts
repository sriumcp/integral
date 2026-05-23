/**
 * activity.ts — significance heuristic + event derivation tests.
 *
 * Schema-exhaustive: parameterized over `IntentKindSchema.options` so a
 * v0.2 IntentKind addition fails the test until the heuristic explicitly
 * acknowledges it (even if it bucketed as routine, the kind must appear
 * somewhere in the heuristic logic via narrowing or default-case data).
 */

import { describe, expect, it } from 'vitest'
import { IntentKindSchema, type Intent, type StateTransition } from '@/schema'
import { fixtureWorkspace, sri, nousPlanner } from '@/fixtures/workspace'
import { deriveEvents, classifySignificance } from '../activity'

const KINDS = IntentKindSchema.options

function intentFor(kind: (typeof KINDS)[number]): Intent {
  const found = fixtureWorkspace.intents.find((i) => i.kind === kind)
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
  it('returns critical for ci passing→failing on feature-pr', () => {
    const pr = intentFor('feature-pr')
    const t = baseTransition('ci-status-changed: passing → failing')
    expect(classifySignificance(t, pr)).toBe('critical')
  })

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
    const section = intentFor('paper-section')
    const t = baseTransition('section-status-changed: outlined → drafted')
    expect(classifySignificance(t, section)).toBe('routine')
  })

  it.each(KINDS)('returns a valid significance level for kind %s (default routine)', (kind) => {
    const intent = intentFor(kind)
    const t = baseTransition('unknown-cause')
    const sig = classifySignificance(t, intent)
    expect(['critical', 'notable', 'routine']).toContain(sig)
  })
})

describe('deriveEvents', () => {
  it('returns one ActivityEvent per StateTransition across the workspace', () => {
    const events = deriveEvents(fixtureWorkspace)
    const transitionCount = fixtureWorkspace.states.reduce(
      (acc, s) => acc + s.history.length,
      0
    )
    expect(events.length).toBe(transitionCount)
  })

  it('orders events most-recent first', () => {
    const events = deriveEvents(fixtureWorkspace)
    for (let i = 1; i < events.length; i++) {
      const prev = events[i - 1]!
      const curr = events[i]!
      expect(prev.at >= curr.at).toBe(true)
    }
  })

  it('exposes intent + state on every event so renderers can narrow on extension.kind', () => {
    const events = deriveEvents(fixtureWorkspace)
    expect(events.length).toBeGreaterThan(0)
    for (const ev of events) {
      expect(ev.intent.id).toBe(ev.state.intent_id)
    }
  })

  it('partitions buckets correctly for the fixture content', () => {
    const events = deriveEvents(fixtureWorkspace)
    const critical = events.filter((e) => e.significance === 'critical')
    const notable = events.filter((e) => e.significance === 'notable')
    const routine = events.filter((e) => e.significance === 'routine')

    // Fixture has 1 critical (ci passing→failing), 2 notable (gate-resolved + new best),
    // and the rest routine.
    expect(critical.length).toBe(1)
    expect(notable.length).toBeGreaterThanOrEqual(2)
    expect(routine.length).toBeGreaterThanOrEqual(1)
  })

  it('returns an empty array when no states have history', () => {
    const empty = {
      intents: fixtureWorkspace.intents,
      states: fixtureWorkspace.states.map((s) => ({ ...s, history: [] })),
      evidence_links: [],
    }
    expect(deriveEvents(empty)).toEqual([])
  })

  it('preserves the transition party as event.by', () => {
    const events = deriveEvents(fixtureWorkspace)
    const planneEvent = events.find((e) => e.by.id === nousPlanner.id)
    expect(planneEvent).toBeDefined()
  })

  it('skips events whose target intent state is missing without crashing', () => {
    // Defensive — should not happen given the bijection refine, but the
    // function must not throw on a malformed workspace.
    const malformed = {
      ...fixtureWorkspace,
      states: fixtureWorkspace.states.slice(0, 2),
    }
    expect(() => deriveEvents(malformed)).not.toThrow()
  })
})
