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
            operations: [],
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

describe('WorkspaceActivityStrip — scope filter (focusedIntentId)', () => {
  const NOUS_ID = '01HXYZ-NOUS-CAMPAIGN-001'

  function renderWithFocus(focusedIntentId: string) {
    return render(
      <HoveredIntentProvider>
        <WorkspaceActivityStrip
          workspace={fixtureWorkspace}
          onOpenIntent={() => {}}
          focusedIntentId={focusedIntentId}
        />
      </HoveredIntentProvider>
    )
  }

  it('renders the scope chip when focusedIntentId is set', () => {
    renderWithFocus(NOUS_ID)
    const scopeBtn = screen.getByRole('button', { name: /scope/i })
    expect(scopeBtn).toBeInTheDocument()
    // The chip's text: "scope · this intent" — assert the scope value lives
    // inside the scope button itself.
    expect(scopeBtn.textContent).toMatch(/this intent/)
  })

  it('defaults scope to "this" and filters events to that intent', () => {
    const { container } = renderWithFocus(NOUS_ID)
    const rows = container.querySelectorAll('[data-event][data-intent-id]')
    // Every visible event row must target the focused intent.
    for (const row of Array.from(rows)) {
      expect(row.getAttribute('data-intent-id')).toBe(NOUS_ID)
    }
  })

  it('does not render the scope chip when focusedIntentId is not set', () => {
    renderStrip()
    expect(
      screen.queryByRole('button', { name: /scope/i })
    ).not.toBeInTheDocument()
  })

  it('clicking the scope chip toggles between "this" and "all"', () => {
    const { container } = renderWithFocus(NOUS_ID)
    const scopeBtn = screen.getByRole('button', { name: /scope/i })
    // Default 'this' — events filtered.
    const initialRows = container.querySelectorAll('[data-event][data-intent-id]')
    const initialUnique = new Set(
      Array.from(initialRows).map((r) => r.getAttribute('data-intent-id'))
    )
    expect(initialUnique.size).toBe(1)
    expect(initialUnique.has(NOUS_ID)).toBe(true)

    // Toggle to 'all' — events unfiltered.
    fireEvent.click(scopeBtn)
    const afterRows = container.querySelectorAll('[data-event][data-intent-id]')
    const afterUnique = new Set(
      Array.from(afterRows).map((r) => r.getAttribute('data-intent-id'))
    )
    expect(afterUnique.size).toBeGreaterThan(1)
  })

  it('renders the empty-state message when scope=this and intent has no activity', () => {
    // coral-attempt has no operations or history in fixture targeting it.
    renderWithFocus('01HXYZ-CORAL-ATTEMPT-042')
    expect(screen.getByText(/no activity for this intent/i)).toBeInTheDocument()
  })
})

describe('WorkspaceActivityStrip — collapse rail', () => {
  it('renders rail (no buckets) when collapsed=true', () => {
    const { container } = render(
      <HoveredIntentProvider>
        <WorkspaceActivityStrip
          workspace={fixtureWorkspace}
          onOpenIntent={() => {}}
          collapsed={true}
          onToggleCollapsed={() => {}}
        />
      </HoveredIntentProvider>
    )
    const rail = container.firstElementChild as HTMLElement
    expect(rail.getAttribute('data-collapsed')).toBe('true')
    // No bucket containers rendered when collapsed.
    expect(container.querySelectorAll('[data-bucket]').length).toBe(0)
    // Has a "show activity" toggle.
    expect(
      screen.getByRole('button', { name: /show activity/i })
    ).toBeInTheDocument()
  })

  it('clicking the rail toggle fires onToggleCollapsed', () => {
    const onToggle = vi.fn()
    render(
      <HoveredIntentProvider>
        <WorkspaceActivityStrip
          workspace={fixtureWorkspace}
          onOpenIntent={() => {}}
          collapsed={true}
          onToggleCollapsed={onToggle}
        />
      </HoveredIntentProvider>
    )
    fireEvent.click(screen.getByRole('button', { name: /show activity/i }))
    expect(onToggle).toHaveBeenCalled()
  })

  it('renders the hide toggle when expanded with onToggleCollapsed', () => {
    render(
      <HoveredIntentProvider>
        <WorkspaceActivityStrip
          workspace={fixtureWorkspace}
          onOpenIntent={() => {}}
          collapsed={false}
          onToggleCollapsed={() => {}}
        />
      </HoveredIntentProvider>
    )
    expect(
      screen.getByRole('button', { name: /hide activity/i })
    ).toBeInTheDocument()
  })

  it('does not render the hide toggle when onToggleCollapsed is omitted', () => {
    renderStrip()
    expect(
      screen.queryByRole('button', { name: /hide activity/i })
    ).not.toBeInTheDocument()
  })
})
