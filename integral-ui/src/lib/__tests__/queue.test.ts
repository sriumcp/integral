/**
 * isAwaitingMe — tests pin the predicate to the closed decisions in
 * CLAUDE.md § Resolved surface decisions. If the predicate evolves (v0.2
 * adds branch (b) for proposals), these tests will need updating; that's
 * intentional — the contract changes are auditable.
 */

import { describe, expect, it } from 'vitest'
import type { Intent, IntentState, Party } from '@/schema'
import { fixtureWorkspace } from '@/fixtures/workspace'
import { isAwaitingMe } from '../queue'

const me: Party = { id: 'sri', kind: 'human', display_name: 'sri' }
const someoneElse: Party = {
  id: 'other-human',
  kind: 'human',
  display_name: 'other',
}

function intentByKind(kind: Intent['kind']): Intent {
  const found = fixtureWorkspace.intents.find((i) => i.kind === kind)
  if (!found) throw new Error(`no fixture intent of kind ${kind}`)
  return found
}

function stateFor(intentId: string): IntentState {
  const found = fixtureWorkspace.states.find((s) => s.intent_id === intentId)
  if (!found) throw new Error(`no fixture state for intent ${intentId}`)
  return found
}

describe('isAwaitingMe — Nous campaign gated awaiting me', () => {
  it('returns true when the gate awaits me', () => {
    const intent = intentByKind('nous-campaign')
    const state = stateFor(intent.id)
    expect(isAwaitingMe(intent, state, me)).toBe(true)
  })

  it('returns false when the gate awaits someone else', () => {
    const intent = intentByKind('nous-campaign')
    const state = stateFor(intent.id)
    expect(isAwaitingMe(intent, state, someoneElse)).toBe(false)
  })
})

describe('isAwaitingMe — feature-pr branch', () => {
  it('returns true when I authored a feature-PR with failing CI', () => {
    const intent = intentByKind('feature-pr')
    const state = stateFor(intent.id)
    // Fixture's feature-pr is authored by `sri` and has ci_status=failing.
    expect(isAwaitingMe(intent, state, me)).toBe(true)
  })

  it('returns false when someone else authored the failing PR', () => {
    const intent = intentByKind('feature-pr')
    const state = stateFor(intent.id)
    expect(isAwaitingMe(intent, state, someoneElse)).toBe(false)
  })
})

describe('isAwaitingMe — non-awaiting cases', () => {
  it('returns false for an active iteration with no gate', () => {
    const intent = intentByKind('nous-iteration')
    const state = stateFor(intent.id)
    expect(isAwaitingMe(intent, state, me)).toBe(false)
  })

  it('returns false for a paper section', () => {
    const intent = intentByKind('paper-section')
    const state = stateFor(intent.id)
    expect(isAwaitingMe(intent, state, me)).toBe(false)
  })

  it('returns false for an active coral attempt', () => {
    const intent = intentByKind('coral-attempt')
    const state = stateFor(intent.id)
    expect(isAwaitingMe(intent, state, me)).toBe(false)
  })
})
