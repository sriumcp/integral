/**
 * IdPill — behavioral tests.
 *
 * Discipline applied:
 *  - Test the public API (props) and what surfaces will see.
 *  - Test the data-* contract with CSS (`data-truncated`).
 *  - Test accessibility surface (title for hover, aria-label for AT).
 *  - Test the conditional rule the component uniquely enforces:
 *      `short || id` for display; `id` always for title/aria-label.
 *  - Don't test class names (CSS Module hashes), computed CSS, or framework
 *    behaviour (span rendering, children handling).
 */

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { IdPill } from './IdPill'

const FULL_ID = '01HXYZ-NOUS-CAMPAIGN-001'

describe('IdPill', () => {
  it('renders the short display text when given', () => {
    render(<IdPill id={FULL_ID} short="nous-c01" />)
    expect(screen.getByText('nous-c01')).toBeInTheDocument()
  })

  it('falls back to the full id when short is not given', () => {
    render(<IdPill id={FULL_ID} />)
    expect(screen.getByText(FULL_ID)).toBeInTheDocument()
  })

  it('always exposes the full id via title (hover tooltip)', () => {
    render(<IdPill id={FULL_ID} short="nous-c01" />)
    const pill = screen.getByText('nous-c01')
    expect(pill.getAttribute('title')).toBe(FULL_ID)
  })

  it('always exposes the full id via aria-label (assistive tech)', () => {
    render(<IdPill id={FULL_ID} short="nous-c01" />)
    // findByLabelText would also match — using attribute lookup keeps the
    // assertion specific to the aria-label contract on this element.
    const pill = screen.getByLabelText(FULL_ID)
    expect(pill).toBeInTheDocument()
    expect(pill.textContent).toBe('nous-c01')
  })

  it('marks truncation via data-truncated when short ≠ id', () => {
    render(<IdPill id={FULL_ID} short="nous-c01" />)
    const pill = screen.getByText('nous-c01')
    expect(pill.getAttribute('data-truncated')).toBe('true')
  })

  it('omits data-truncated when short equals id', () => {
    render(<IdPill id={FULL_ID} short={FULL_ID} />)
    const pill = screen.getByText(FULL_ID)
    expect(pill.getAttribute('data-truncated')).toBeNull()
  })

  it('omits data-truncated when short is not provided', () => {
    render(<IdPill id={FULL_ID} />)
    const pill = screen.getByText(FULL_ID)
    expect(pill.getAttribute('data-truncated')).toBeNull()
  })

  // We deliberately do NOT test the `short={undefined}` case at runtime —
  // `exactOptionalPropertyTypes: true` forbids it at compile time, so any
  // such test would assert against an unreachable TS-compliant call site.
  // The "no short" path is covered by the omission tests above.

  it('preserves the visible label when short is empty string', () => {
    // An empty string is intentionally treated as a real (zero-width) display
    // text — the `??` fallback only fires on `undefined`. This test pins that
    // contract so a future change to `||` (which would treat '' as falsy)
    // is caught.
    render(<IdPill id={FULL_ID} short="" />)
    const pill = screen.getByLabelText(FULL_ID)
    expect(pill.textContent).toBe('')
    // empty-string short still differs from the full id, so truncation is on
    expect(pill.getAttribute('data-truncated')).toBe('true')
  })
})
