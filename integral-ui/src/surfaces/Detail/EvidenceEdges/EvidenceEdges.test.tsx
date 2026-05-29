/**
 * EvidenceEdges — behavioral tests.
 *
 * EvidenceLinks live in a separate edge collection (CLAUDE.md § Core
 * decisions). This section reads `workspace.evidence_links` and partitions
 * them into outgoing (this intent → other) and incoming (other → this intent).
 * The `to_intent` field is a union of `IntentId | Reference`, so external
 * targets that aren't in-workspace must still render a row.
 *
 * v0.2.0 dropped paper-claim → nous-iteration as the headline cross-tree
 * link. The seed now exposes feature-campaign → nous-campaign instead;
 * these tests exercise the same component contract using the surviving
 * link plus a synthetic external link to test the non-workspace-target
 * branch.
 */

import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { EvidenceLink, Intent, Workspace } from '@/schema'
import { seedWorkspace, sri } from '@/test/seed-workspace'
import { EvidenceEdges } from './EvidenceEdges'

function intentById(id: string): Intent {
  const found = seedWorkspace.intents.find((i) => i.id === id)
  if (!found) throw new Error(`seed missing intent ${id}`)
  return found
}

const FID = '01HXYZ-FEATURE-CAMPAIGN-001'
const NID = '01HXYZ-NOUS-CAMPAIGN-001'

// Augment the seed workspace with one extra link pointing at an
// external (non-in-workspace) intent so the external-target branch
// has coverage.
const externalLink: EvidenceLink = {
  id: 'edge-external',
  from_intent: FID,
  to_intent: { kind: 'intent', target: '01HXYZ-EXTERNAL-NOT-IN-WORKSPACE' },
  relation: 'replicates',
  asserted_by: sri,
  asserted_at: '2026-05-22T10:00:00Z',
  strength: 'weak',
}

const workspace: Workspace = {
  ...seedWorkspace,
  evidence_links: [...seedWorkspace.evidence_links, externalLink],
}

describe('EvidenceEdges', () => {
  it('renders outgoing edges from this intent', () => {
    // FID → NID (derived-from) + the synthetic external link (replicates).
    const fc = intentById(FID)
    render(<EvidenceEdges intent={fc} workspace={workspace} onOpen={() => {}} />)
    expect(screen.getByText(/derived-from/)).toBeInTheDocument()
    expect(screen.getByText(/replicates/)).toBeInTheDocument()
  })

  it('renders incoming edges to this intent', () => {
    // NID has 1 incoming edge (edge-001 from FID).
    const nc = intentById(NID)
    render(<EvidenceEdges intent={nc} workspace={workspace} onOpen={() => {}} />)
    expect(screen.getByText(/derived-from/)).toBeInTheDocument()
  })

  it('renders nothing when the intent has no edges', () => {
    // coral-attempt has no edges in the seed.
    const attempt = intentById('01HXYZ-CORAL-ATTEMPT-042')
    const { container } = render(
      <EvidenceEdges intent={attempt} workspace={workspace} onOpen={() => {}} />
    )
    const rows = container.querySelectorAll('button[data-edge]')
    expect(rows.length).toBe(0)
  })

  it('clicking an outgoing edge to an in-workspace intent fires onOpen', () => {
    // edge-001: FID → NID, both in workspace.
    const fc = intentById(FID)
    const onOpen = vi.fn()
    render(<EvidenceEdges intent={fc} workspace={workspace} onOpen={onOpen} />)
    fireEvent.click(screen.getByRole('button', { name: /derived-from/ }))
    expect(onOpen).toHaveBeenCalled()
    expect(onOpen.mock.calls[0]?.[0]?.id).toBe(NID)
  })

  it('renders an external (non-workspace) target without crashing and does not fire onOpen', () => {
    const fc = intentById(FID)
    const onOpen = vi.fn()
    render(<EvidenceEdges intent={fc} workspace={workspace} onOpen={onOpen} />)
    // Edge surfaces (relation visible).
    expect(screen.getByText(/replicates/)).toBeInTheDocument()
    // Click the external row — its disabled-button form should not fire onOpen.
    const replicateRow = screen.getByRole('button', { name: /replicates/ })
    fireEvent.click(replicateRow)
    // External target should not navigate (it's outside the workspace).
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('exposes data-direction on each edge row', () => {
    const fc = intentById(FID)
    const { container } = render(
      <EvidenceEdges intent={fc} workspace={workspace} onOpen={() => {}} />
    )
    const rows = container.querySelectorAll('[data-edge][data-direction]')
    expect(rows.length).toBeGreaterThan(0)
  })
})
