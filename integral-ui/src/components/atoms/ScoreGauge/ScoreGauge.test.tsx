/**
 * ScoreGauge — behavioral tests.
 *
 * Discipline applied:
 *  - Test the public API (score, best, ariaLabel).
 *  - Test the data-* contract (data-score, data-best, data-is-best on fill).
 *  - Test the accessibility surface (role="img" + descriptive aria-label).
 *  - Test the placeholder branch (score === null).
 *  - Don't assert pixel widths; rely on data-* and percentage style
 *    (which lives in the inline `style` and is part of the visible contract).
 */

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ScoreGauge } from './ScoreGauge'

describe('ScoreGauge', () => {
  it('renders a placeholder when score is null', () => {
    const { container } = render(<ScoreGauge score={null} />)
    const ph = container.firstElementChild as HTMLElement
    expect(ph.getAttribute('role')).toBe('img')
    expect(ph.textContent).toBe('—')
  })

  it('exposes the score via data-score', () => {
    const { container } = render(<ScoreGauge score={0.842} />)
    const root = container.firstElementChild as HTMLElement
    expect(root.getAttribute('data-score')).toBe('0.842')
  })

  it('exposes data-best when best is provided', () => {
    const { container } = render(<ScoreGauge score={0.7} best={0.84} />)
    const root = container.firstElementChild as HTMLElement
    expect(root.getAttribute('data-best')).toBe('0.84')
  })

  it('omits data-best when best is not provided', () => {
    const { container } = render(<ScoreGauge score={0.7} />)
    const root = container.firstElementChild as HTMLElement
    expect(root.getAttribute('data-best')).toBeNull()
  })

  it('marks the fill as best when score equals best', () => {
    const { container } = render(<ScoreGauge score={0.84} best={0.84} />)
    const fill = container.querySelector('[data-is-best="true"]')
    expect(fill).not.toBeNull()
  })

  it('does not mark the fill as best when score < best', () => {
    const { container } = render(<ScoreGauge score={0.7} best={0.84} />)
    const fill = container.querySelector('[data-is-best="true"]')
    expect(fill).toBeNull()
  })

  it('renders the score with three decimal places', () => {
    render(<ScoreGauge score={0.842} />)
    expect(screen.getByText('0.842')).toBeInTheDocument()
  })

  it('generates a default aria-label that includes the score', () => {
    render(<ScoreGauge score={0.842} />)
    const root = screen.getByRole('img')
    const label = root.getAttribute('aria-label')!
    expect(label).toMatch(/score 0\.842/)
  })

  it('default aria-label includes best when provided', () => {
    render(<ScoreGauge score={0.7} best={0.84} />)
    const root = screen.getByRole('img')
    const label = root.getAttribute('aria-label')!
    expect(label).toMatch(/score 0\.700/)
    expect(label).toMatch(/best 0\.840/)
  })

  it('respects an explicit ariaLabel', () => {
    render(<ScoreGauge score={0.7} ariaLabel="attempt-040 score" />)
    expect(screen.getByLabelText('attempt-040 score')).toBeInTheDocument()
  })

  it('clamps out-of-range scores visually but still reports the raw value', () => {
    // A score of 1.5 should not blow up the bar; the data-score remains 1.5
    // so surfaces can detect anomalies without us silently lying.
    const { container } = render(<ScoreGauge score={1.5} />)
    const root = container.firstElementChild as HTMLElement
    expect(root.getAttribute('data-score')).toBe('1.5')
    // Fill width should be clamped to 100%.
    const fill = container.querySelector('[data-role="fill"]') as HTMLElement
    expect(fill).not.toBeNull()
    expect(fill.style.width).toBe('100%')
  })

  it('marks out-of-range scores with data-out-of-range', () => {
    const { container: above } = render(<ScoreGauge score={1.5} />)
    expect(
      above.querySelector('[data-role="fill"]')!.getAttribute('data-out-of-range')
    ).toBe('true')
    const { container: below } = render(<ScoreGauge score={-0.2} />)
    expect(
      below.querySelector('[data-role="fill"]')!.getAttribute('data-out-of-range')
    ).toBe('true')
  })

  it('reports out-of-range in the generated aria-label', () => {
    render(<ScoreGauge score={1.5} />)
    const root = screen.getByRole('img')
    expect(root.getAttribute('aria-label')).toMatch(/out of range/)
  })

  it('omits data-out-of-range for in-range scores', () => {
    const { container } = render(<ScoreGauge score={0.5} />)
    const fill = container.querySelector('[data-role="fill"]')!
    expect(fill.getAttribute('data-out-of-range')).toBeNull()
  })

  it('renders a best-marker line when best differs from score', () => {
    const { container } = render(<ScoreGauge score={0.7} best={0.84} />)
    const marker = container.querySelector('[data-role="best-marker"]')
    expect(marker).not.toBeNull()
  })

  it('omits the best-marker line when best equals score', () => {
    const { container } = render(<ScoreGauge score={0.84} best={0.84} />)
    const marker = container.querySelector('[data-role="best-marker"]')
    expect(marker).toBeNull()
  })

  it('handles score = 0 (exact lower bound)', () => {
    const { container } = render(<ScoreGauge score={0} />)
    const fill = container.querySelector('[data-role="fill"]') as HTMLElement
    expect(fill.style.width).toBe('0%')
    expect(fill.getAttribute('data-out-of-range')).toBeNull()
  })

  it('clamps negative scores visually', () => {
    const { container } = render(<ScoreGauge score={-0.2} />)
    const fill = container.querySelector('[data-role="fill"]') as HTMLElement
    expect(fill.style.width).toBe('0%')
  })
})
