/**
 * DetailHeader — behavioral tests.
 *
 * Discipline: behavioral assertions on what the user sees and the
 * data-* contract the rest of the surface composes against. The header
 * is uniform across kinds — that uniformity is what keeps the four UX
 * surfaces from drifting in chrome (CLAUDE.md § What NOT to do).
 */

import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { IntentKindSchema, type Intent, type IntentState } from '@/schema'
import { seedWorkspace, sri } from '@/test/seed-workspace'
import { DetailHeader } from './DetailHeader'

const KINDS = IntentKindSchema.options

function pairFor(kind: (typeof KINDS)[number]): {
  intent: Intent
  state: IntentState
} {
  const intent = seedWorkspace.intents.find((i) => i.kind === kind)
  const state = seedWorkspace.states.find((s) => s.intent_id === intent?.id)
  if (!intent || !state) throw new Error(`fixture missing pair for ${kind}`)
  return { intent, state }
}

describe('DetailHeader', () => {
  it('renders the title and summary from the declaration', () => {
    const { intent, state } = pairFor('nous-campaign')
    render(
      <DetailHeader
        intent={intent}
        state={state}
        zoom="structure"
        onZoomChange={() => {}}
        onBack={() => {}}
      />
    )
    expect(screen.getByRole('heading', { name: intent.declaration.title })).toBeInTheDocument()
    expect(screen.getByText(intent.declaration.summary)).toBeInTheDocument()
  })

  it.each(KINDS)('renders without crashing for kind %s', (kind) => {
    const { intent, state } = pairFor(kind)
    render(
      <DetailHeader
        intent={intent}
        state={state}
        zoom="structure"
        onZoomChange={() => {}}
        onBack={() => {}}
      />
    )
    // The kind badge surfaces as text; verifies kind-aware rendering wired up.
    expect(screen.getAllByText(kind).length).toBeGreaterThan(0)
  })

  it('exposes data-kind on the header root for surface CSS hooks', () => {
    const { intent, state } = pairFor('coral-attempt')
    const { container } = render(
      <DetailHeader
        intent={intent}
        state={state}
        zoom="structure"
        onZoomChange={() => {}}
        onBack={() => {}}
      />
    )
    const root = container.firstElementChild as HTMLElement
    expect(root.getAttribute('data-kind')).toBe('coral-attempt')
  })

  it('renders the holder mode and lifetime kind', () => {
    const { intent, state } = pairFor('nous-campaign')
    render(
      <DetailHeader
        intent={intent}
        state={state}
        zoom="structure"
        onZoomChange={() => {}}
        onBack={() => {}}
      />
    )
    expect(screen.getByText('jointly-held')).toBeInTheDocument()
    expect(screen.getByText('campaign')).toBeInTheDocument()
  })

  it('renders the success criterion when present', () => {
    const { intent, state } = pairFor('nous-campaign')
    render(
      <DetailHeader
        intent={intent}
        state={state}
        zoom="structure"
        onZoomChange={() => {}}
        onBack={() => {}}
      />
    )
    expect(screen.getByText(/falsified hypotheses/)).toBeInTheDocument()
  })

  it('renders tags when present and skips when absent', () => {
    const withTags = pairFor('nous-campaign')
    const { rerender } = render(
      <DetailHeader
        intent={withTags.intent}
        state={withTags.state}
        zoom="structure"
        onZoomChange={() => {}}
        onBack={() => {}}
      />
    )
    expect(screen.getByText('investigation')).toBeInTheDocument()

    const withoutTags = pairFor('nous-iteration') // fixture has no tags
    rerender(
      <DetailHeader
        intent={withoutTags.intent}
        state={withoutTags.state}
        zoom="structure"
        onZoomChange={() => {}}
        onBack={() => {}}
      />
    )
    expect(screen.queryByText('investigation')).not.toBeInTheDocument()
  })

  it('renders the ZoomToggle wired to onZoomChange', () => {
    const { intent, state } = pairFor('nous-campaign')
    const onZoomChange = vi.fn()
    render(
      <DetailHeader
        intent={intent}
        state={state}
        zoom="structure"
        onZoomChange={onZoomChange}
        onBack={() => {}}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: 'detail' }))
    expect(onZoomChange).toHaveBeenCalledWith('detail')
  })

  it('reflects the current zoom on the toggle', () => {
    const { intent, state } = pairFor('nous-campaign')
    render(
      <DetailHeader
        intent={intent}
        state={state}
        zoom="overview"
        onZoomChange={() => {}}
        onBack={() => {}}
      />
    )
    expect(screen.getByRole('button', { name: 'overview' }).getAttribute('data-active')).toBe('true')
  })

  it('fires onBack when the back affordance is clicked', () => {
    const { intent, state } = pairFor('nous-campaign')
    const onBack = vi.fn()
    render(
      <DetailHeader
        intent={intent}
        state={state}
        zoom="structure"
        onZoomChange={() => {}}
        onBack={onBack}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /map/i }))
    expect(onBack).toHaveBeenCalled()
  })

  it("surfaces 'awaiting you' when the predicate matches", () => {
    // Nous campaign in fixture is gated awaiting `sri`.
    const { intent, state } = pairFor('nous-campaign')
    render(
      <DetailHeader
        intent={intent}
        state={state}
        me={sri}
        zoom="structure"
        onZoomChange={() => {}}
        onBack={() => {}}
      />
    )
    expect(screen.getByText(/awaiting you/i)).toBeInTheDocument()
  })
})
