/**
 * ChildrenSection — behavioral tests.
 *
 * The structural body is the only place per-kind specialization lives in
 * the Detail surface chrome. Tests verify:
 *   - Each kind renders without crashing.
 *   - The children list reflects fixture decomposition for parent kinds.
 *   - Clicking a child fires onOpen with the child Intent.
 *   - Zoom toggles body content (overview / structure / detail).
 */

import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { IntentKindSchema, type Intent } from '@/schema'
import { fixtureWorkspace } from '@/fixtures/workspace'
import { ChildrenSection } from './ChildrenSection'

const KINDS = IntentKindSchema.options

function intentFor(kind: (typeof KINDS)[number]): Intent {
  const found = fixtureWorkspace.intents.find((i) => i.kind === kind)
  if (!found) throw new Error(`fixture missing intent for ${kind}`)
  return found
}

describe('ChildrenSection', () => {
  it.each(KINDS)('renders without crashing for kind %s at structure zoom', (kind) => {
    const intent = intentFor(kind)
    const { container } = render(
      <ChildrenSection
        intent={intent}
        workspace={fixtureWorkspace}
        zoom="structure"
        onOpen={() => {}}
      />
    )
    // The data-kind hook anchors any per-kind CSS the surface adds later.
    expect(container.firstElementChild?.getAttribute('data-kind')).toBe(kind)
  })

  it.each(KINDS)('renders without crashing for kind %s at detail zoom', (kind) => {
    const intent = intentFor(kind)
    render(
      <ChildrenSection
        intent={intent}
        workspace={fixtureWorkspace}
        zoom="detail"
        onOpen={() => {}}
      />
    )
  })

  it('lists children of nous-campaign with iteration rows', () => {
    const nousCampaign = intentFor('nous-campaign')
    render(
      <ChildrenSection
        intent={nousCampaign}
        workspace={fixtureWorkspace}
        zoom="structure"
        onOpen={() => {}}
      />
    )
    // The fixture's iter-2 child surfaces with its title.
    expect(screen.getByText(/iter-2/i)).toBeInTheDocument()
  })

  it('lists children of coral-optimization with attempt rows', () => {
    const coral = intentFor('coral-optimization')
    render(
      <ChildrenSection
        intent={coral}
        workspace={fixtureWorkspace}
        zoom="structure"
        onOpen={() => {}}
      />
    )
    expect(screen.getByText(/attempt-042/i)).toBeInTheDocument()
  })

  it('lists children of feature-campaign with PR rows', () => {
    const feat = intentFor('feature-campaign')
    render(
      <ChildrenSection
        intent={feat}
        workspace={fixtureWorkspace}
        zoom="structure"
        onOpen={() => {}}
      />
    )
    expect(screen.getByText(/intent-state projection cache/i)).toBeInTheDocument()
  })

  it('lists children of paper-campaign with section cards', () => {
    const paper = intentFor('paper-campaign')
    render(
      <ChildrenSection
        intent={paper}
        workspace={fixtureWorkspace}
        zoom="structure"
        onOpen={() => {}}
      />
    )
    expect(screen.getByText(/§4 · Results/)).toBeInTheDocument()
  })

  it('clicking a child fires onOpen with that intent', () => {
    const nousCampaign = intentFor('nous-campaign')
    const onOpen = vi.fn()
    render(
      <ChildrenSection
        intent={nousCampaign}
        workspace={fixtureWorkspace}
        zoom="structure"
        onOpen={onOpen}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /iter-2/i }))
    expect(onOpen).toHaveBeenCalled()
    expect(onOpen.mock.calls[0]?.[0]?.kind).toBe('nous-iteration')
  })

  it('overview zoom collapses children list to a count summary', () => {
    const nousCampaign = intentFor('nous-campaign')
    render(
      <ChildrenSection
        intent={nousCampaign}
        workspace={fixtureWorkspace}
        zoom="overview"
        onOpen={() => {}}
      />
    )
    // No child detail rows visible; just a count.
    expect(screen.queryByText(/iter-2/i)).not.toBeInTheDocument()
    expect(screen.getByText(/1 child/i)).toBeInTheDocument()
  })

  it('detail zoom shows extension data for nous-iteration (hypothesis statements)', () => {
    const iter = intentFor('nous-iteration')
    render(
      <ChildrenSection
        intent={iter}
        workspace={fixtureWorkspace}
        zoom="detail"
        onOpen={() => {}}
      />
    )
    expect(
      screen.getByText(/Reward curvature induces premature convergence/)
    ).toBeInTheDocument()
  })

  it('detail zoom shows full diff_summary for feature-pr', () => {
    const pr = intentFor('feature-pr')
    render(
      <ChildrenSection
        intent={pr}
        workspace={fixtureWorkspace}
        zoom="detail"
        onOpen={() => {}}
      />
    )
    expect(
      screen.getByText(/ProjectionCache class/)
    ).toBeInTheDocument()
  })

  it('detail zoom shows full claim_text for paper-claim', () => {
    const claim = intentFor('paper-claim')
    render(
      <ChildrenSection
        intent={claim}
        workspace={fixtureWorkspace}
        zoom="detail"
        onOpen={() => {}}
      />
    )
    expect(
      screen.getByText(/Conditioning the mutation operator/)
    ).toBeInTheDocument()
  })

  it('structure zoom on coral-attempt shows ScoreGauge slot', () => {
    const attempt = intentFor('coral-attempt')
    const { container } = render(
      <ChildrenSection
        intent={attempt}
        workspace={fixtureWorkspace}
        zoom="structure"
        onOpen={() => {}}
      />
    )
    // ScoreGauge with null score renders a placeholder dash; either surfacing
    // through aria-label "no score yet" or the data-score="" attribute is fine.
    const gauge = container.querySelector('[data-score]')
    expect(gauge).not.toBeNull()
  })
})
