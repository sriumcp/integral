/**
 * HypothesisGrid — behavioral tests (TDD).
 *
 * Discipline:
 *  - Assert structural attributes + per-cell `data-result` hooks; never
 *    SVG path data, never specific coordinates.
 *  - The atom is pure presentational. Surfaces decide whether to render.
 *  - Visual register matches the v0.1.5 cross-adapter discipline:
 *    confirmed = `--sage`, refuted = `--rose`, inconclusive/pending =
 *    `--mute-2`, blank = no cell. We only test the data-* hooks here;
 *    color is verified via visual baselines.
 */

import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { HypothesisGrid } from './HypothesisGrid'

const SIMPLE_DATA = [
  {
    iterationNumber: 1,
    hypotheses: [
      { label: 'h_main', result: 'pending' as const },
      { label: 'h_ablation[0]', result: 'pending' as const },
    ],
  },
  {
    iterationNumber: 2,
    hypotheses: [
      { label: 'h_main', result: 'confirmed' as const },
      { label: 'h_ablation[0]', result: 'refuted' as const },
      { label: 'h_robustness[0]', result: 'inconclusive' as const },
    ],
  },
  {
    iterationNumber: 3,
    hypotheses: [
      { label: 'h_main', result: 'confirmed' as const },
      { label: 'h_ablation[0]', result: 'confirmed' as const },
    ],
  },
]

describe('HypothesisGrid', () => {
  it('renders a placeholder when no iterations have results', () => {
    const { container } = render(
      <HypothesisGrid
        iterations={[
          {
            iterationNumber: 1,
            hypotheses: [{ label: 'h_main' }],
          },
        ]}
      />
    )
    const placeholder = container.querySelector('[role="img"]')
    expect(placeholder?.getAttribute('aria-label')).toMatch(/no probes yet/i)
  })

  it('renders a placeholder when input is empty', () => {
    const { container } = render(<HypothesisGrid iterations={[]} />)
    const placeholder = container.querySelector('[role="img"]')
    expect(placeholder?.getAttribute('aria-label')).toMatch(/no iterations/i)
  })

  it('renders an SVG with role="img" when ≥1 result is present', () => {
    const { container } = render(<HypothesisGrid iterations={SIMPLE_DATA} />)
    const svg = container.querySelector('svg')
    expect(svg).not.toBeNull()
    expect(svg?.getAttribute('role')).toBe('img')
  })

  it('exposes data-rows = unique hypothesis-label count', () => {
    // SIMPLE_DATA: h_main, h_ablation[0], h_robustness[0] → 3 unique.
    const { container } = render(<HypothesisGrid iterations={SIMPLE_DATA} />)
    const svg = container.querySelector('svg')!
    expect(svg.getAttribute('data-rows')).toBe('3')
  })

  it('exposes data-cols = number of iterations', () => {
    const { container } = render(<HypothesisGrid iterations={SIMPLE_DATA} />)
    const svg = container.querySelector('svg')!
    expect(svg.getAttribute('data-cols')).toBe('3')
  })

  it('exposes data-confirmed-count, data-refuted-count, data-inconclusive-count', () => {
    // SIMPLE_DATA confirmed: 3 (h_main iter2/iter3 + h_ablation[0] iter3).
    // SIMPLE_DATA refuted: 1 (h_ablation[0] iter2).
    // SIMPLE_DATA inconclusive: 1 (h_robustness[0] iter2).
    const { container } = render(<HypothesisGrid iterations={SIMPLE_DATA} />)
    const svg = container.querySelector('svg')!
    expect(svg.getAttribute('data-confirmed-count')).toBe('3')
    expect(svg.getAttribute('data-refuted-count')).toBe('1')
    expect(svg.getAttribute('data-inconclusive-count')).toBe('1')
  })

  it('emits one cell element per (iteration × hypothesis) intersection with results', () => {
    const { container } = render(<HypothesisGrid iterations={SIMPLE_DATA} />)
    const cells = container.querySelectorAll('[data-cell="true"]')
    // 3 + 1 + 1 = 5 result cells (pending counts as a cell too).
    // SIMPLE_DATA total result-bearing cells: iter1 = 2 (pending), iter2 = 3, iter3 = 2 = 7.
    expect(cells.length).toBe(7)
  })

  it('per-cell data-result attribute matches the input result', () => {
    const { container } = render(<HypothesisGrid iterations={SIMPLE_DATA} />)
    // h_main / iter 2 should be 'confirmed'
    const cell = container.querySelector(
      '[data-cell="true"][data-row-label="h_main"][data-iteration="2"]'
    )
    expect(cell?.getAttribute('data-result')).toBe('confirmed')
  })

  it('preserves hypothesis label first-seen order across iterations', () => {
    // SIMPLE_DATA introduces h_main, h_ablation[0] in iter1; h_robustness[0]
    // in iter2 — row order should be [h_main, h_ablation[0], h_robustness[0]].
    const { container } = render(<HypothesisGrid iterations={SIMPLE_DATA} />)
    const rowLabels = container.querySelectorAll('[data-row-label-text="true"]')
    expect(Array.from(rowLabels).map((el) => el.textContent)).toEqual([
      'h_main',
      'h_ablation[0]',
      'h_robustness[0]',
    ])
  })

  it('preserves iteration order across columns', () => {
    const { container } = render(<HypothesisGrid iterations={SIMPLE_DATA} />)
    const colLabels = container.querySelectorAll('[data-col-label="true"]')
    expect(Array.from(colLabels).map((el) => el.textContent)).toEqual([
      '1',
      '2',
      '3',
    ])
  })

  it('aria-label summarizes total result counts', () => {
    const { container } = render(<HypothesisGrid iterations={SIMPLE_DATA} />)
    const svg = container.querySelector('svg')!
    const label = svg.getAttribute('aria-label') ?? ''
    expect(label).toMatch(/3 hypotheses/i)
    expect(label).toMatch(/3 iterations/i)
    expect(label).toMatch(/3 confirmed/i)
    expect(label).toMatch(/1 refuted/i)
  })

  it('honors a custom title prop by rendering a <figure> with <figcaption>', () => {
    const { container } = render(
      <HypothesisGrid
        iterations={SIMPLE_DATA}
        title="hypothesis ledger"
      />
    )
    const figure = container.querySelector('figure')
    expect(figure).not.toBeNull()
    const caption = figure?.querySelector('figcaption')
    expect(caption?.textContent).toBe('hypothesis ledger')
  })

  it('omits the figure wrapper when no title is provided', () => {
    const { container } = render(<HypothesisGrid iterations={SIMPLE_DATA} />)
    expect(container.querySelector('figure')).toBeNull()
  })

  it('a hypothesis missing in some iterations renders no cell at those positions', () => {
    // h_robustness[0] only appears in iter2 — should have a cell only there.
    const { container } = render(<HypothesisGrid iterations={SIMPLE_DATA} />)
    const robustnessCells = container.querySelectorAll(
      '[data-cell="true"][data-row-label="h_robustness[0]"]'
    )
    expect(robustnessCells.length).toBe(1)
    expect(robustnessCells[0]?.getAttribute('data-iteration')).toBe('2')
  })
})
