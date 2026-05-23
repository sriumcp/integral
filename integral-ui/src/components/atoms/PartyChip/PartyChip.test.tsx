/**
 * PartyChip — behavioral tests.
 *
 * Discipline applied:
 *  - Test the public API (party object, dim flag).
 *  - Test the data-* contract with CSS (`data-party-kind`, `data-dim`).
 *  - Test schema exhaustiveness at runtime: the chip must render for every
 *    `PartyKind` from the schema. Combined with the TS `Party.kind` type,
 *    this catches both compile-time omission (TS) and runtime regressions
 *    (e.g. a `as` cast bypassing TS).
 *  - Test the accessibility surface (dot is decorative; display name is the
 *    accessible content).
 *  - Don't test class names or computed CSS (jsdom doesn't compute it).
 *  - Don't reproduce the mock's `if (!party) return null` test — TS strict
 *    guarantees `party` is non-null at the call site.
 */

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PartyKindSchema, type Party, type PartyKind } from '@/schema'
import { PartyChip } from './PartyChip'

const ALL_KINDS = PartyKindSchema.options as readonly PartyKind[]

const sri: Party = { id: 'sri', kind: 'human', display_name: 'sri' }
const planner: Party = {
  id: 'nous-planner',
  kind: 'agent',
  display_name: 'nous-planner',
}
const ci: Party = { id: 'ci-runner', kind: 'system', display_name: 'ci-runner' }

describe('PartyChip', () => {
  it('renders the display name', () => {
    render(<PartyChip party={sri} />)
    expect(screen.getByText('sri')).toBeInTheDocument()
  })

  it('exposes the party kind via data-party-kind', () => {
    render(<PartyChip party={planner} />)
    const chip = screen.getByText('nous-planner').closest('span')!
    expect(chip.getAttribute('data-party-kind')).toBe('agent')
  })

  it('renders for every PartyKind in the schema', () => {
    // Falsification path: if v0.2 adds a PartyKind, the runtime mapping in
    // PartyChip.module.css needs to add a matching attribute selector. This
    // test fails if the rendered chip ever crashes for a valid kind.
    for (const kind of ALL_KINDS) {
      const party: Party = { id: kind, kind, display_name: kind }
      const { container, unmount } = render(<PartyChip party={party} />)
      const chip = container.firstElementChild as HTMLElement
      expect(chip.getAttribute('data-party-kind')).toBe(kind)
      unmount()
    }
  })

  it('marks dim variant via data-dim', () => {
    render(<PartyChip party={sri} dim />)
    const chip = screen.getByText('sri').closest('span')!
    expect(chip.getAttribute('data-dim')).toBe('true')
  })

  it('omits data-dim when dim is not set', () => {
    render(<PartyChip party={sri} />)
    const chip = screen.getByText('sri').closest('span')!
    expect(chip.getAttribute('data-dim')).toBeNull()
  })

  it('renders a decorative dot (aria-hidden)', () => {
    const { container } = render(<PartyChip party={ci} />)
    const dot = container.querySelector('[aria-hidden="true"]')
    expect(dot).not.toBeNull()
  })

  it('does not assign a role to the chip wrapper (the display name is the accessible content)', () => {
    const { container } = render(<PartyChip party={sri} />)
    const chip = container.firstElementChild as HTMLElement
    expect(chip.getAttribute('role')).toBeNull()
  })

  it('handles agent and system parties without crashing or losing display', () => {
    const { rerender } = render(<PartyChip party={planner} />)
    expect(screen.getByText('nous-planner')).toBeInTheDocument()
    rerender(<PartyChip party={ci} />)
    expect(screen.getByText('ci-runner')).toBeInTheDocument()
  })
})
