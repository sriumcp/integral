/**
 * HMainTimeline — behavioral tests (TDD).
 *
 * Same discipline as PrinciplesTempo + HypothesisGrid: assert
 * structural attributes + per-cell `data-result` hooks; never SVG
 * path data, never specific coordinates. Visual register matches
 * the substrate's instrument genre — colors verified via visual
 * baselines, not unit tests.
 */

import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { HMainTimeline } from './HMainTimeline'

const STREAK = [
  { iterationNumber: 1, result: 'confirmed' as const },
  { iterationNumber: 2, result: 'confirmed' as const },
  { iterationNumber: 3, result: 'confirmed' as const },
  { iterationNumber: 4, result: 'confirmed' as const },
  { iterationNumber: 5, result: 'confirmed' as const },
]

const CONTESTED = [
  { iterationNumber: 1, result: 'pending' as const },
  { iterationNumber: 2, result: 'confirmed' as const },
  { iterationNumber: 3, result: 'refuted' as const },
  { iterationNumber: 4, result: 'confirmed' as const },
  { iterationNumber: 5, result: 'inconclusive' as const },
]

describe('HMainTimeline', () => {
  it('renders a placeholder when input is empty', () => {
    const { container } = render(<HMainTimeline data={[]} />)
    const placeholder = container.querySelector('[role="img"]')
    expect(placeholder?.getAttribute('aria-label')).toMatch(/no iterations/i)
  })

  it('renders a placeholder when no iterations carry a result', () => {
    const { container } = render(
      <HMainTimeline
        data={[
          { iterationNumber: 1 },
          { iterationNumber: 2 },
        ]}
      />
    )
    const placeholder = container.querySelector('[role="img"]')
    expect(placeholder?.getAttribute('aria-label')).toMatch(/no probes yet/i)
  })

  it('renders an SVG with role="img" when ≥1 iteration carries a result', () => {
    const { container } = render(<HMainTimeline data={STREAK} />)
    const svg = container.querySelector('svg')
    expect(svg).not.toBeNull()
    expect(svg?.getAttribute('role')).toBe('img')
  })

  it('exposes data-cells = number of iterations with results', () => {
    const { container } = render(<HMainTimeline data={STREAK} />)
    const svg = container.querySelector('svg')!
    expect(svg.getAttribute('data-cells')).toBe('5')
  })

  it('exposes data-confirmed-count, data-refuted-count, data-inconclusive-count, data-pending-count', () => {
    const { container } = render(<HMainTimeline data={CONTESTED} />)
    const svg = container.querySelector('svg')!
    expect(svg.getAttribute('data-confirmed-count')).toBe('2')
    expect(svg.getAttribute('data-refuted-count')).toBe('1')
    expect(svg.getAttribute('data-inconclusive-count')).toBe('1')
    expect(svg.getAttribute('data-pending-count')).toBe('1')
  })

  it('emits one cell element per iteration with a result', () => {
    const { container } = render(<HMainTimeline data={CONTESTED} />)
    const cells = container.querySelectorAll('[data-cell="true"]')
    expect(cells).toHaveLength(5)
  })

  it('skips iterations whose result is undefined (no cell emitted)', () => {
    const { container } = render(
      <HMainTimeline
        data={[
          { iterationNumber: 1, result: 'confirmed' },
          { iterationNumber: 2 }, // no result
          { iterationNumber: 3, result: 'refuted' },
        ]}
      />
    )
    const cells = container.querySelectorAll('[data-cell="true"]')
    expect(cells).toHaveLength(2)
    // The cell for iter 2 must not render.
    expect(
      container.querySelector('[data-cell="true"][data-iteration="2"]')
    ).toBeNull()
  })

  it('per-cell data-result attribute matches input', () => {
    const { container } = render(<HMainTimeline data={CONTESTED} />)
    const iter3 = container.querySelector(
      '[data-cell="true"][data-iteration="3"]'
    )
    expect(iter3?.getAttribute('data-result')).toBe('refuted')
  })

  it('preserves iteration order across cells (data-iteration ascending)', () => {
    const reversed = [
      { iterationNumber: 5, result: 'confirmed' as const },
      { iterationNumber: 1, result: 'pending' as const },
      { iterationNumber: 3, result: 'refuted' as const },
    ]
    const { container } = render(<HMainTimeline data={reversed} />)
    const cells = container.querySelectorAll('[data-cell="true"]')
    // Atom does not sort — it preserves caller-supplied order. The
    // adapter is responsible for sorting. This test pins that contract.
    expect(Array.from(cells).map((c) => c.getAttribute('data-iteration'))).toEqual([
      '5',
      '1',
      '3',
    ])
  })

  it('aria-label summarizes total result counts and the streak shape', () => {
    const { container } = render(<HMainTimeline data={STREAK} />)
    const label = container.querySelector('svg')!.getAttribute('aria-label') ?? ''
    expect(label).toMatch(/h_main/i)
    expect(label).toMatch(/5 confirmed/i)
  })

  it('aria-label includes the contested-pattern signal when results are mixed', () => {
    const { container } = render(<HMainTimeline data={CONTESTED} />)
    const label = container.querySelector('svg')!.getAttribute('aria-label') ?? ''
    expect(label).toMatch(/2 confirmed/i)
    expect(label).toMatch(/1 refuted/i)
  })

  it('honors a custom title prop by rendering a <figure> with <figcaption>', () => {
    const { container } = render(
      <HMainTimeline data={STREAK} title="h_main timeline" />
    )
    const figure = container.querySelector('figure')
    expect(figure).not.toBeNull()
    const caption = figure?.querySelector('figcaption')
    expect(caption?.textContent).toBe('h_main timeline')
  })

  it('omits the figure wrapper when no title is provided', () => {
    const { container } = render(<HMainTimeline data={STREAK} />)
    expect(container.querySelector('figure')).toBeNull()
  })

  it('exposes iteration numbers as column labels for visual readability', () => {
    const { container } = render(<HMainTimeline data={STREAK} />)
    const colLabels = container.querySelectorAll('[data-col-label="true"]')
    expect(Array.from(colLabels).map((el) => el.textContent)).toEqual([
      '1',
      '2',
      '3',
      '4',
      '5',
    ])
  })
})
