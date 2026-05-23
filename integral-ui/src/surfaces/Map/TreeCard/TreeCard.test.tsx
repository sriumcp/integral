/**
 * TreeCard — behavioral tests.
 *
 * Discipline applied:
 *  - Test the public API (intent, state, me, onOpen).
 *  - Test the chrome contract (data-kind, data-awaiting on the card root).
 *  - Test the click-to-open flow (callback fires with the intent).
 *  - Test accessibility surface (button role + descriptive aria-label).
 *  - Test conditional figure rendering per kind (data threshold deferred to
 *    surfaces; the *atom* renders always when given data — the molecule
 *    decides whether to render the atom at all based on schema content).
 *  - Don't assert internal layout, class names, or computed CSS.
 */

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Intent, IntentState, Party } from '@/schema'
import { fixtureWorkspace } from '@/fixtures/workspace'
import { TreeCard } from './TreeCard'

const me: Party = { id: 'sri', kind: 'human', display_name: 'sri' }

function pair(kind: Intent['kind']): { intent: Intent; state: IntentState } {
  const intent = fixtureWorkspace.intents.find((i) => i.kind === kind)!
  const state = fixtureWorkspace.states.find((s) => s.intent_id === intent.id)!
  return { intent, state }
}

describe('TreeCard', () => {
  it('renders the title and summary', () => {
    const { intent, state } = pair('nous-campaign')
    render(<TreeCard intent={intent} state={state} me={me} />)
    expect(screen.getByText(intent.declaration.title)).toBeInTheDocument()
    expect(screen.getByText(intent.declaration.summary)).toBeInTheDocument()
  })

  it('exposes data-kind on the card root', () => {
    const { intent, state } = pair('paper-claim')
    const { container } = render(<TreeCard intent={intent} state={state} me={me} />)
    const card = container.firstElementChild as HTMLElement
    expect(card.getAttribute('data-kind')).toBe('paper-claim')
  })

  it('marks data-awaiting when isAwaitingMe matches', () => {
    const { intent, state } = pair('nous-campaign')
    const { container } = render(<TreeCard intent={intent} state={state} me={me} />)
    const card = container.firstElementChild as HTMLElement
    expect(card.getAttribute('data-awaiting')).toBe('true')
  })

  it('omits data-awaiting when not awaiting me', () => {
    const { intent, state } = pair('nous-iteration')
    const { container } = render(<TreeCard intent={intent} state={state} me={me} />)
    const card = container.firstElementChild as HTMLElement
    expect(card.getAttribute('data-awaiting')).toBeNull()
  })

  it('renders the awaiting-you chip when awaiting me', () => {
    const { intent, state } = pair('nous-campaign')
    render(<TreeCard intent={intent} state={state} me={me} />)
    expect(screen.getByText('awaiting you')).toBeInTheDocument()
  })

  it('renders the status chip when not awaiting me', () => {
    const { intent, state } = pair('nous-iteration')
    render(<TreeCard intent={intent} state={state} me={me} />)
    // The status chip exists and shows the current status.
    expect(screen.getByText(state.status)).toBeInTheDocument()
    expect(screen.queryByText('awaiting you')).not.toBeInTheDocument()
  })

  it('fires onOpen with the intent when clicked', async () => {
    const { intent, state } = pair('coral-attempt')
    const onOpen = vi.fn()
    render(<TreeCard intent={intent} state={state} me={me} onOpen={onOpen} />)
    const card = screen.getByRole('button')
    await userEvent.click(card)
    expect(onOpen).toHaveBeenCalledWith(intent)
  })

  it('renders as a button with a descriptive aria-label', () => {
    const { intent, state } = pair('feature-pr')
    render(<TreeCard intent={intent} state={state} me={me} />)
    const card = screen.getByRole('button')
    const label = card.getAttribute('aria-label')!
    expect(label).toMatch(/feature-pr/)
    expect(label).toContain(intent.declaration.title)
  })

  it('renders tags when present', () => {
    const { intent, state } = pair('nous-campaign')
    render(<TreeCard intent={intent} state={state} me={me} />)
    for (const tag of intent.tags ?? []) {
      expect(screen.getByText(tag)).toBeInTheDocument()
    }
  })

  it('renders a HypothesisBars figure for nous-iteration', () => {
    const { intent, state } = pair('nous-iteration')
    const { container } = render(<TreeCard intent={intent} state={state} me={me} />)
    // HypothesisBars exposes data-total on its root span.
    const bars = container.querySelector('[data-total]')
    expect(bars).not.toBeNull()
  })

  it('renders a ScoreGauge figure for coral-attempt (placeholder when score=null)', () => {
    const { intent, state } = pair('coral-attempt')
    render(<TreeCard intent={intent} state={state} me={me} />)
    // The fixture's coral-attempt has score=null → placeholder "—" with role=img.
    expect(screen.getByLabelText(/attempt not scored/i)).toBeInTheDocument()
  })

  it('renders without crashing for every kind in the fixture', () => {
    for (const intent of fixtureWorkspace.intents) {
      const state = fixtureWorkspace.states.find(
        (s) => s.intent_id === intent.id
      )!
      const { unmount } = render(<TreeCard intent={intent} state={state} me={me} />)
      expect(screen.getByRole('button')).toBeInTheDocument()
      unmount()
    }
  })
})
