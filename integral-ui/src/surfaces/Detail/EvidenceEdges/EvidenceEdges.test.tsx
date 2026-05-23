/**
 * EvidenceEdges — behavioral tests.
 *
 * EvidenceLinks live in a separate edge collection (CLAUDE.md § Core
 * decisions). This section reads `workspace.evidence_links` and partitions
 * them into outgoing (this intent → other) and incoming (other → this intent).
 * The `to_intent` field is a union of `IntentId | Reference`, so external
 * targets that aren't in-workspace must still render a row.
 */

import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Intent } from '@/schema'
import { fixtureWorkspace } from '@/fixtures/workspace'
import { EvidenceEdges } from './EvidenceEdges'

function intentById(id: string): Intent {
  const found = fixtureWorkspace.intents.find((i) => i.id === id)
  if (!found) throw new Error(`fixture missing intent ${id}`)
  return found
}

describe('EvidenceEdges', () => {
  it('renders outgoing edges from this intent', () => {
    // paper-claim PCID has 2 outgoing edges in the fixture (edge-001, edge-002).
    const claim = intentById('01HXYZ-PAPER-CLAIM-019')
    render(
      <EvidenceEdges
        intent={claim}
        workspace={fixtureWorkspace}
        onOpen={() => {}}
      />
    )
    // Both edges' relations should surface.
    expect(screen.getByText(/derived-from/)).toBeInTheDocument()
    expect(screen.getByText(/replicates/)).toBeInTheDocument()
  })

  it('renders incoming edges to this intent', () => {
    // nous-iteration NIID has 1 incoming edge (edge-001 from PCID).
    const iter = intentById('01HXYZ-NOUS-ITER-002')
    render(
      <EvidenceEdges
        intent={iter}
        workspace={fixtureWorkspace}
        onOpen={() => {}}
      />
    )
    expect(screen.getByText(/derived-from/)).toBeInTheDocument()
  })

  it('renders nothing when the intent has no edges', () => {
    // coral-attempt CAID has no edges in the fixture.
    const attempt = intentById('01HXYZ-CORAL-ATTEMPT-042')
    const { container } = render(
      <EvidenceEdges
        intent={attempt}
        workspace={fixtureWorkspace}
        onOpen={() => {}}
      />
    )
    // Either the section is absent, or it explicitly renders an empty state.
    // We assert that no row buttons render.
    const rows = container.querySelectorAll('button[data-edge]')
    expect(rows.length).toBe(0)
  })

  it('clicking an outgoing edge to an in-workspace intent fires onOpen', () => {
    // edge-001: PCID → NIID, both in workspace.
    const claim = intentById('01HXYZ-PAPER-CLAIM-019')
    const onOpen = vi.fn()
    render(
      <EvidenceEdges
        intent={claim}
        workspace={fixtureWorkspace}
        onOpen={onOpen}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /derived-from/ }))
    expect(onOpen).toHaveBeenCalled()
    expect(onOpen.mock.calls[0]?.[0]?.id).toBe('01HXYZ-NOUS-ITER-002')
  })

  it('renders an external (non-workspace) target without crashing and does not fire onOpen', () => {
    // edge-002: PCID → 01HXYZ-CORAL-ATTEMPT-031 (not in workspace).
    const claim = intentById('01HXYZ-PAPER-CLAIM-019')
    const onOpen = vi.fn()
    render(
      <EvidenceEdges
        intent={claim}
        workspace={fixtureWorkspace}
        onOpen={onOpen}
      />
    )
    // Edge surfaces (relation visible).
    expect(screen.getByText(/replicates/)).toBeInTheDocument()
    // Click the external row — its disabled-button form should not fire onOpen.
    const replicateRow = screen.getByRole('button', { name: /replicates/ })
    fireEvent.click(replicateRow)
    // External target should not navigate (it's outside the workspace).
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('exposes data-direction on each edge row', () => {
    const claim = intentById('01HXYZ-PAPER-CLAIM-019')
    const { container } = render(
      <EvidenceEdges
        intent={claim}
        workspace={fixtureWorkspace}
        onOpen={() => {}}
      />
    )
    const rows = container.querySelectorAll('[data-edge][data-direction]')
    expect(rows.length).toBeGreaterThan(0)
  })
})
