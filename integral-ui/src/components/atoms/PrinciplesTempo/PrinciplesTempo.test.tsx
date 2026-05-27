/**
 * PrinciplesTempo — behavioral tests (TDD).
 *
 * Discipline:
 *  - Assert structural attributes + data-* hooks; never SVG path data
 *    (same as IntegralGlyph.test.tsx:5-6 + Sparkline test pattern).
 *  - The atom is pure presentational — derived data shape comes in,
 *    SVG goes out. Composition + threshold policy is the surface's job;
 *    the atom only renders a placeholder when the *intrinsic* data shape
 *    is invalid (empty input, zero total).
 *  - Tests cover the v0.1.5 cross-adapter genre commitments (aria-label
 *    text, data-* contract, caption render).
 */

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PrinciplesTempo } from './PrinciplesTempo'

const SIMPLE_DATA = [
  { iterationNumber: 1, principlesEmitted: 0 },
  { iterationNumber: 2, principlesEmitted: 1 },
  { iterationNumber: 3, principlesEmitted: 0 },
  { iterationNumber: 4, principlesEmitted: 2 },
]

describe('PrinciplesTempo', () => {
  it('renders a placeholder when data is empty', () => {
    render(<PrinciplesTempo data={[]} />)
    const el = screen.getByRole('img', { name: /principles tempo/i })
    expect(el.getAttribute('data-points')).toBe('0')
  })

  it('renders a placeholder when total principles = 0 (data threshold)', () => {
    render(
      <PrinciplesTempo
        data={[
          { iterationNumber: 1, principlesEmitted: 0 },
          { iterationNumber: 2, principlesEmitted: 0 },
        ]}
      />
    )
    const el = screen.getByRole('img', { name: /no principles yet/i })
    expect(el.getAttribute('data-total')).toBe('0')
  })

  it('renders an SVG with role="img" when ≥1 principle exists', () => {
    const { container } = render(<PrinciplesTempo data={SIMPLE_DATA} />)
    const svg = container.querySelector('svg')
    expect(svg).not.toBeNull()
    expect(svg?.getAttribute('role')).toBe('img')
  })

  it('exposes data-total = cumulative sum of principlesEmitted', () => {
    const { container } = render(<PrinciplesTempo data={SIMPLE_DATA} />)
    const svg = container.querySelector('svg')!
    expect(svg.getAttribute('data-total')).toBe('3')
  })

  it('exposes data-iterations = number of input rows', () => {
    const { container } = render(<PrinciplesTempo data={SIMPLE_DATA} />)
    const svg = container.querySelector('svg')!
    expect(svg.getAttribute('data-iterations')).toBe('4')
  })

  it('exposes data-final-cumulative = last cumulative value', () => {
    // For SIMPLE_DATA: cumulative = [0, 1, 1, 3]; final = 3.
    const { container } = render(<PrinciplesTempo data={SIMPLE_DATA} />)
    const svg = container.querySelector('svg')!
    expect(svg.getAttribute('data-final-cumulative')).toBe('3')
  })

  it('exposes data-iter-min and data-iter-max from input iterationNumber range', () => {
    const { container } = render(<PrinciplesTempo data={SIMPLE_DATA} />)
    const svg = container.querySelector('svg')!
    expect(svg.getAttribute('data-iter-min')).toBe('1')
    expect(svg.getAttribute('data-iter-max')).toBe('4')
  })

  it('generated aria-label names the total principles + iteration span', () => {
    const { container } = render(<PrinciplesTempo data={SIMPLE_DATA} />)
    const svg = container.querySelector('svg')!
    const label = svg.getAttribute('aria-label') ?? ''
    expect(label).toMatch(/3 principles/i)
    expect(label).toMatch(/4 iterations/i)
  })

  it('honors a custom title prop by rendering a <figure> with <figcaption>', () => {
    const { container } = render(
      <PrinciplesTempo data={SIMPLE_DATA} title="principles emitted" />
    )
    const figure = container.querySelector('figure')
    expect(figure).not.toBeNull()
    const caption = figure?.querySelector('figcaption')
    expect(caption?.textContent).toBe('principles emitted')
  })

  it('omits the figure wrapper when no title is provided', () => {
    const { container } = render(<PrinciplesTempo data={SIMPLE_DATA} />)
    expect(container.querySelector('figure')).toBeNull()
  })

  it('honors width and height props', () => {
    const { container } = render(
      <PrinciplesTempo data={SIMPLE_DATA} width={320} height={64} />
    )
    const svg = container.querySelector('svg')!
    expect(svg.getAttribute('width')).toBe('320')
    expect(svg.getAttribute('height')).toBe('64')
  })

  it('handles a single-iteration case without crashing (degenerate but valid)', () => {
    const { container } = render(
      <PrinciplesTempo data={[{ iterationNumber: 1, principlesEmitted: 2 }]} />
    )
    const svg = container.querySelector('svg')
    expect(svg).not.toBeNull()
    expect(svg?.getAttribute('data-total')).toBe('2')
  })

  it('renders an annotated last point (data-last-cumulative attr present)', () => {
    // The "current" / last point gets visual emphasis (--amber in CSS);
    // tests assert the attribute hook, not the color.
    const { container } = render(<PrinciplesTempo data={SIMPLE_DATA} />)
    const lastPoint = container.querySelector('[data-last-point="true"]')
    expect(lastPoint).not.toBeNull()
  })
})
