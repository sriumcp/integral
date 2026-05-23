/**
 * WorkspaceActivityStrip — behavioral tests.
 *
 * Discipline: assert what the user sees + the data-* hooks the surface
 * exposes. Hover behavior is verified through the shared hovered-intent
 * context, never by inspecting CSS.
 */

import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { fixtureWorkspace } from '@/fixtures/workspace'
import { HoveredIntentProvider, useHoveredIntent } from '@/lib/hovered-intent'
import { WorkspaceActivityStrip } from './WorkspaceActivityStrip'

function renderStrip(opts: { onOpenIntent?: (i: { id: string }) => void } = {}) {
  return render(
    <HoveredIntentProvider>
      <WorkspaceActivityStrip
        workspace={fixtureWorkspace}
        onOpenIntent={opts.onOpenIntent ?? (() => {})}
      />
    </HoveredIntentProvider>
  )
}

describe('WorkspaceActivityStrip', () => {
  it('renders the three buckets in critical → notable → routine order', () => {
    const { container } = renderStrip()
    const buckets = container.querySelectorAll('[data-bucket]')
    const labels = Array.from(buckets).map((b) => b.getAttribute('data-bucket'))
    // Critical first if non-empty, then notable, then routine.
    expect(labels.slice(0, 3)).toEqual(['critical', 'notable', 'routine'])
  })

  it('renders the critical fixture event (ci passing→failing on feature-pr)', () => {
    renderStrip()
    expect(screen.getByText(/ci-status-changed/)).toBeInTheDocument()
  })

  it('renders notable fixture events (gate-resolved, new-best score)', () => {
    renderStrip()
    expect(screen.getByText(/gate-resolved/)).toBeInTheDocument()
    expect(screen.getByText(/new best/)).toBeInTheDocument()
  })

  it('routine bucket is collapsed by default with a toggle showing the count', () => {
    renderStrip()
    const toggle = screen.getByRole('button', { name: /routine/i })
    // Toggle exposes the count.
    expect(toggle.textContent).toMatch(/\d+/)
    // Routine event content should not be visible while collapsed.
    expect(screen.queryByText(/section-status-changed/)).not.toBeInTheDocument()
  })

  it('expanding the routine bucket reveals its rows', () => {
    renderStrip()
    fireEvent.click(screen.getByRole('button', { name: /routine/i }))
    expect(screen.getByText(/section-status-changed/)).toBeInTheDocument()
  })

  it('clicking an event row fires onOpenIntent with the target intent', () => {
    const onOpenIntent = vi.fn()
    renderStrip({ onOpenIntent })
    // The critical PR event row has `data-event` and is clickable.
    const eventRow = screen
      .getByText(/ci-status-changed/)
      .closest('[data-event]') as HTMLElement
    fireEvent.click(eventRow)
    expect(onOpenIntent).toHaveBeenCalled()
    expect(onOpenIntent.mock.calls[0]?.[0]?.kind).toBe('feature-pr')
  })

  it('default filter is notable+; toggling to routine+ reveals routine rows inline', () => {
    renderStrip()
    // Notable+ is the default — routine bucket is collapsed but visible as
    // a toggle. After switching to routine+, the routine rows render
    // expanded automatically.
    const filterToggle = screen.getByRole('button', { name: /significance/i })
    fireEvent.click(filterToggle)
    expect(screen.getByText(/section-status-changed/)).toBeInTheDocument()
  })

  it('hovering an event row writes the target intent id into the hover context', () => {
    let captured: { hovered: string | null } = { hovered: null }
    function Probe() {
      const { hovered } = useHoveredIntent()
      captured = { hovered }
      return null
    }
    render(
      <HoveredIntentProvider>
        <WorkspaceActivityStrip
          workspace={fixtureWorkspace}
          onOpenIntent={() => {}}
        />
        <Probe />
      </HoveredIntentProvider>
    )
    const row = screen
      .getByText(/ci-status-changed/)
      .closest('[data-event]') as HTMLElement
    fireEvent.mouseEnter(row)
    expect(captured.hovered).toBe('01HXYZ-FEATURE-PR-007')
    fireEvent.mouseLeave(row)
    expect(captured.hovered).toBeNull()
  })

  it('exposes data-significance on each event row', () => {
    const { container } = renderStrip()
    const rows = container.querySelectorAll('[data-event][data-significance]')
    expect(rows.length).toBeGreaterThan(0)
    const sigs = new Set(
      Array.from(rows).map((r) => r.getAttribute('data-significance'))
    )
    expect(sigs.has('critical')).toBe(true)
    expect(sigs.has('notable')).toBe(true)
  })

  it('renders an empty-state message when no events match', () => {
    render(
      <HoveredIntentProvider>
        <WorkspaceActivityStrip
          workspace={{
            intents: fixtureWorkspace.intents,
            states: fixtureWorkspace.states.map((s) => ({ ...s, history: [] })),
            evidence_links: [],
          }}
          onOpenIntent={() => {}}
        />
      </HoveredIntentProvider>
    )
    expect(screen.getByText(/no activity/i)).toBeInTheDocument()
  })

  it('renders the strip header label', () => {
    renderStrip()
    expect(
      screen.getByRole('heading', { name: /activity/i })
    ).toBeInTheDocument()
  })
})
