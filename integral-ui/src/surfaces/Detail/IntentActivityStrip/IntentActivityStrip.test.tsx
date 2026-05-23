/**
 * IntentActivityStrip — behavioral tests.
 *
 * v0.1 has no first-class activity model — this strip surfaces what the
 * schema *does* track per-intent: state.history transitions plus a synthetic
 * "last advanced" marker derived from state. Tests verify the placeholder
 * renders sensibly when history is empty (the fixture's case).
 */

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { Intent, IntentState, Party } from '@/schema'
import { fixtureWorkspace } from '@/fixtures/workspace'
import { IntentActivityStrip } from './IntentActivityStrip'

function pairFor(kind: string): { intent: Intent; state: IntentState } {
  const intent = fixtureWorkspace.intents.find((i) => i.kind === kind)
  const state = fixtureWorkspace.states.find((s) => s.intent_id === intent?.id)
  if (!intent || !state) throw new Error(`fixture missing pair for ${kind}`)
  return { intent, state }
}

describe('IntentActivityStrip', () => {
  it('renders an "activity" header', () => {
    const { intent, state } = pairFor('nous-campaign')
    render(<IntentActivityStrip intent={intent} state={state} />)
    expect(screen.getByRole('heading', { name: /activity/i })).toBeInTheDocument()
  })

  it('shows the synthetic "last advanced" marker derived from state', () => {
    // Use coral-attempt — its fixture state has empty history, so the only
    // event in the strip is the synthetic last-advanced marker.
    const { intent, state } = pairFor('coral-attempt')
    render(<IntentActivityStrip intent={intent} state={state} />)
    expect(screen.getByText(/last advanced/i)).toBeInTheDocument()
    // The advancing party should appear.
    expect(screen.getByText(state.last_advanced_by.display_name)).toBeInTheDocument()
  })

  it('renders state.history events when present', () => {
    const { intent, state: baseState } = pairFor('nous-campaign')
    const sri: Party = { id: 'sri', kind: 'human', display_name: 'sri' }
    const stateWithHistory: IntentState = {
      ...baseState,
      history: [
        {
          at: '2026-05-22T14:00:00Z',
          by: sri,
          from_status: 'active',
          to_status: 'gated',
          cause: 'gate-resolved',
        },
      ],
    }
    render(<IntentActivityStrip intent={intent} state={stateWithHistory} />)
    expect(screen.getByText(/gate-resolved/)).toBeInTheDocument()
  })

  it('exposes data-event on each event row', () => {
    const { intent, state } = pairFor('nous-campaign')
    const { container } = render(<IntentActivityStrip intent={intent} state={state} />)
    const events = container.querySelectorAll('[data-event]')
    expect(events.length).toBeGreaterThan(0)
  })

  it('flags the v0.1-placeholder nature explicitly', () => {
    const { intent, state } = pairFor('nous-campaign')
    render(<IntentActivityStrip intent={intent} state={state} />)
    // Per CLAUDE.md, the activity model is v0.2; surfaces should not pretend
    // otherwise. We assert the placeholder copy is present so we don't drift
    // toward implying false richness.
    expect(screen.getByText(/v0\.1/)).toBeInTheDocument()
  })
})
