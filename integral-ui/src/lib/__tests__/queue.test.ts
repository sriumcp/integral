/**
 * isAwaitingMe — tests pin the predicate to the closed decisions in
 * CLAUDE.md § Resolved surface decisions. If the predicate evolves (v0.2
 * adds branch (b) for proposals), these tests will need updating; that's
 * intentional — the contract changes are auditable.
 */

import { describe, expect, it } from 'vitest'
import type { Intent, IntentState, Party } from '@/schema'
import { seedWorkspace } from '@/test/seed-workspace'
import { isAwaitingMe } from '../queue'

const me: Party = { id: 'sri', kind: 'human', display_name: 'sri' }
const someoneElse: Party = {
  id: 'other-human',
  kind: 'human',
  display_name: 'other',
}

function intentByKind(kind: Intent['kind']): Intent {
  const found = seedWorkspace.intents.find((i) => i.kind === kind)
  if (!found) throw new Error(`no fixture intent of kind ${kind}`)
  return found
}

function stateFor(intentId: string): IntentState {
  const found = seedWorkspace.states.find((s) => s.intent_id === intentId)
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

// The feature-pr branch (CI-failing on a PR I authored) was removed
// along with the feature-pr kind in v0.2.0. Tests return when the full
// feature-dev adapter ships.

describe('isAwaitingMe — non-awaiting cases', () => {
  it('returns false for an active iteration with no gate', () => {
    const intent = intentByKind('nous-iteration')
    const state = stateFor(intent.id)
    expect(isAwaitingMe(intent, state, me)).toBe(false)
  })

  it('returns false for an active feature-campaign', () => {
    const intent = intentByKind('feature-campaign')
    const state = stateFor(intent.id)
    expect(isAwaitingMe(intent, state, me)).toBe(false)
  })

  it('returns false for an active coral attempt', () => {
    const intent = intentByKind('coral-attempt')
    const state = stateFor(intent.id)
    expect(isAwaitingMe(intent, state, me)).toBe(false)
  })
})
