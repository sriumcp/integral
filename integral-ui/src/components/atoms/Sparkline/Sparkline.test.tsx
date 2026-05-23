/**
 * Sparkline — behavioral tests.
 *
 * Discipline applied:
 *  - Test the public API (values, width, height, best, ariaLabel).
 *  - Test the data-* contract (data-points, data-min, data-max, data-last,
 *    data-best). These are the surface-layer + test contract; SVG geometry
 *    isn't asserted because pixel positions are an implementation detail.
 *  - Test the accessibility surface (role="img" + descriptive aria-label).
 *  - Test the placeholder branch (< 2 values).
 *  - Don't test specific SVG path d-strings (brittle to viewBox / scale
 *    refactors); rely on data-* + role for the contract.
 */

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Sparkline } from './Sparkline'

describe('Sparkline', () => {
  it('renders a placeholder when values has fewer than 2 points', () => {
    const { container } = render(<Sparkline values={[]} />)
    const ph = container.firstElementChild as HTMLElement
    expect(ph.getAttribute('role')).toBe('img')
    expect(ph.getAttribute('data-points')).toBe('0')
    expect(ph.textContent).toBe('—')
  })

  it('renders a placeholder for a single value too', () => {
    const { container } = render(<Sparkline values={[0.42]} />)
    const ph = container.firstElementChild as HTMLElement
    expect(ph.getAttribute('data-points')).toBe('1')
  })

  it('renders an SVG with role="img" for ≥ 2 values', () => {
    const { container } = render(
      <Sparkline values={[0.1, 0.3, 0.5, 0.7]} />
    )
    const svg = container.querySelector('svg')!
    expect(svg.getAttribute('role')).toBe('img')
  })

  it('exposes value-shape via data-points / data-min / data-max / data-last', () => {
    const { container } = render(
      <Sparkline values={[0.1, 0.3, 0.84, 0.5, 0.7]} />
    )
    const svg = container.querySelector('svg')!
    expect(svg.getAttribute('data-points')).toBe('5')
    expect(svg.getAttribute('data-min')).toBe('0.1')
    expect(svg.getAttribute('data-max')).toBe('0.84')
    expect(svg.getAttribute('data-last')).toBe('0.7')
  })

  it('exposes data-best when best is provided', () => {
    const { container } = render(
      <Sparkline values={[0.1, 0.3, 0.5]} best={0.84} />
    )
    const svg = container.querySelector('svg')!
    expect(svg.getAttribute('data-best')).toBe('0.84')
  })

  it('omits data-best when best is not provided', () => {
    const { container } = render(<Sparkline values={[0.1, 0.3, 0.5]} />)
    const svg = container.querySelector('svg')!
    expect(svg.getAttribute('data-best')).toBeNull()
  })

  it('generates a default aria-label that describes the data', () => {
    render(<Sparkline values={[0.1, 0.5, 0.9]} />)
    // Asserts the label *includes* shape descriptors; doesn't pin the exact
    // string so future label refinements don't break the test.
    const svg = screen.getByRole('img')
    const label = svg.getAttribute('aria-label')!
    expect(label).toMatch(/sparkline/)
    expect(label).toMatch(/3 points/)
  })

  it('respects an explicit ariaLabel', () => {
    render(
      <Sparkline values={[0.1, 0.5, 0.9]} ariaLabel="last 3 attempts" />
    )
    expect(screen.getByLabelText('last 3 attempts')).toBeInTheDocument()
  })

  it('renders a path and a last-point circle for ≥ 2 values', () => {
    const { container } = render(<Sparkline values={[1, 2, 3]} />)
    expect(container.querySelector('path')).not.toBeNull()
    expect(container.querySelector('circle')).not.toBeNull()
  })

  it('renders a best-line element only when best is set', () => {
    const a = render(<Sparkline values={[0.1, 0.3, 0.5]} />).container
    expect(a.querySelector('line')).toBeNull()
    const b = render(<Sparkline values={[0.1, 0.3, 0.5]} best={0.4} />)
      .container
    expect(b.querySelector('line')).not.toBeNull()
  })

  it('marks constant series via data-constant', () => {
    const { container } = render(<Sparkline values={[0.71, 0.71, 0.71, 0.71]} />)
    const svg = container.querySelector('svg')!
    expect(svg.getAttribute('data-constant')).toBe('true')
  })

  it('describes constant series in the generated aria-label', () => {
    const { container } = render(<Sparkline values={[0.71, 0.71, 0.71]} />)
    const svg = container.querySelector('svg')!
    expect(svg.getAttribute('aria-label')).toMatch(/constant at 0\.710/)
  })

  it('omits data-constant for non-constant series', () => {
    const { container } = render(<Sparkline values={[0.1, 0.3, 0.5]} />)
    const svg = container.querySelector('svg')!
    expect(svg.getAttribute('data-constant')).toBeNull()
  })
})
