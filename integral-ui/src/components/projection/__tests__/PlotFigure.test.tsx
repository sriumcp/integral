import { render, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PlotFigure } from '../PlotFigure'
import type { PreparedFigure } from '@/lib/projection/spec'

const baseFig: PreparedFigure = {
  id: 'f',
  title: 'Test figure',
  data: [
    { iter: 1, score: 0.12 },
    { iter: 2, score: 0.34 },
    { iter: 3, score: 0.55 },
  ],
  mark: { type: 'line' },
  encodings: { x: 'iter', y: 'score' },
}

describe('PlotFigure', () => {
  it('renders the figure title', () => {
    const { getByText } = render(<PlotFigure figure={baseFig} />)
    expect(getByText('Test figure')).toBeInTheDocument()
  })

  it('mounts an SVG element produced by Plot.plot', async () => {
    const { container } = render(<PlotFigure figure={baseFig} />)
    await waitFor(() => {
      expect(container.querySelector('svg, figure svg')).not.toBeNull()
    })
  })

  it('exposes data-figure-id and data-mark-type as test hooks', () => {
    const { container } = render(<PlotFigure figure={baseFig} />)
    const root = container.querySelector('[data-figure-id="f"]')
    expect(root).not.toBeNull()
    expect(root!.getAttribute('data-mark-type')).toBe('line')
  })

  it('renders the rendered caption when present', () => {
    const { getByText } = render(
      <PlotFigure figure={{ ...baseFig, caption_rendered: 'Climbed by 0.43 across 3 iterations.' }} />
    )
    expect(getByText('Climbed by 0.43 across 3 iterations.')).toBeInTheDocument()
  })

  it('renders bar marks too', async () => {
    const { container } = render(<PlotFigure figure={{
      ...baseFig,
      mark: { type: 'bar', orientation: 'vertical' },
    }} />)
    await waitFor(() => {
      const root = container.querySelector('[data-mark-type="bar"]')
      expect(root).not.toBeNull()
    })
  })

  it('renders dot marks', async () => {
    const { container } = render(<PlotFigure figure={{
      ...baseFig,
      mark: { type: 'dot' },
    }} />)
    await waitFor(() => {
      expect(container.querySelector('[data-mark-type="dot"]')).not.toBeNull()
    })
  })

  it('does not crash on a figure with empty data when emit_empty was true', () => {
    const { container } = render(<PlotFigure figure={{ ...baseFig, data: [] }} />)
    // Empty data is valid: Plot.plot returns an SVG with no marks.
    expect(container.querySelector('[data-figure-id="f"]')).not.toBeNull()
  })
})
