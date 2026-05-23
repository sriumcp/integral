/**
 * HypothesisBars — behavioral tests.
 *
 * Discipline applied:
 *  - Test the public API (counts, ariaLabel).
 *  - Test the data-* contract (data-confirmed / data-refuted / data-pending /
 *    data-total).
 *  - Test the accessibility surface (role="img" + descriptive aria-label).
 *  - Test the placeholder branch (total === 0).
 *  - Don't assert SVG geometry — pixel widths are an implementation detail.
 */

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { HypothesisBars } from './HypothesisBars'

describe('HypothesisBars', () => {
  it('renders a placeholder when total is 0', () => {
    const { container } = render(
      <HypothesisBars counts={{ confirmed: 0, refuted: 0, pending: 0 }} />
    )
    const ph = container.firstElementChild as HTMLElement
    expect(ph.getAttribute('role')).toBe('img')
    expect(ph.getAttribute('data-total')).toBe('0')
    expect(ph.textContent).toBe('—')
  })

  it('exposes counts via data-* on the root', () => {
    const { container } = render(
      <HypothesisBars counts={{ confirmed: 1, refuted: 2, pending: 3 }} />
    )
    const root = container.firstElementChild as HTMLElement
    expect(root.getAttribute('data-confirmed')).toBe('1')
    expect(root.getAttribute('data-refuted')).toBe('2')
    expect(root.getAttribute('data-pending')).toBe('3')
    expect(root.getAttribute('data-total')).toBe('6')
  })

  it('generates a default aria-label that names every count', () => {
    render(
      <HypothesisBars counts={{ confirmed: 1, refuted: 2, pending: 3 }} />
    )
    const root = screen.getByRole('img')
    const label = root.getAttribute('aria-label')!
    expect(label).toMatch(/1 confirmed/)
    expect(label).toMatch(/2 refuted/)
    expect(label).toMatch(/3 pending/)
    expect(label).toMatch(/6/)
  })

  it('respects an explicit ariaLabel', () => {
    render(
      <HypothesisBars
        counts={{ confirmed: 1, refuted: 0, pending: 0 }}
        ariaLabel="iter-2 hypothesis outcomes"
      />
    )
    expect(screen.getByLabelText('iter-2 hypothesis outcomes')).toBeInTheDocument()
  })

  it('renders three SVG segments (confirmed / refuted / pending) when total > 0', () => {
    const { container } = render(
      <HypothesisBars counts={{ confirmed: 1, refuted: 1, pending: 1 }} />
    )
    const rects = container.querySelectorAll('rect')
    expect(rects.length).toBe(3)
  })

  it('renders a caption summarizing the breakdown', () => {
    render(
      <HypothesisBars counts={{ confirmed: 4, refuted: 1, pending: 2 }} />
    )
    expect(screen.getByText('4c · 1r · 2p')).toBeInTheDocument()
  })

  it('hides the SVG from accessibility (the root chip carries the label)', () => {
    const { container } = render(
      <HypothesisBars counts={{ confirmed: 1, refuted: 1, pending: 1 }} />
    )
    const svg = container.querySelector('svg')!
    expect(svg.getAttribute('aria-hidden')).toBe('true')
  })
})
