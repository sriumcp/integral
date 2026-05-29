import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { NarrativeProjection } from '../NarrativeProjection'
import type { ExecutedProjection } from '@/lib/projection/spec'

function p(opts: Partial<ExecutedProjection> = {}): ExecutedProjection {
  return {
    spec_version: '1',
    figures: [],
    quoted_numerics: {},
    prose: '',
    cite_index: [],
    source: 'llm',
    generated_at: '2026-05-29T00:00:00Z',
    ...opts,
  }
}

describe('NarrativeProjection', () => {
  it('renders source attribute on the root for styling hooks', () => {
    const { container } = render(
      <NarrativeProjection projection={p({ prose: 'hi', source: 'fallback' })} />
    )
    expect(container.firstChild).toHaveAttribute('data-projection-source', 'fallback')
  })

  it('exposes data-figure-count for tests + chrome to assert against', () => {
    const { container } = render(
      <NarrativeProjection projection={p({
        prose: 'p',
        figures: [{
          id: 'f', title: 'T', data: [{ x: 1, y: 1 }],
          mark: { type: 'line' }, encodings: { x: 'x', y: 'y' },
        }],
      })} />
    )
    expect(container.firstChild).toHaveAttribute('data-figure-count', '1')
  })

  it('splits prose into paragraphs by blank lines', () => {
    const { container } = render(
      <NarrativeProjection projection={p({
        prose: 'first paragraph.\n\nsecond paragraph here.\n\nthird.',
      })} />
    )
    const paragraphs = container.querySelectorAll('p')
    expect(paragraphs).toHaveLength(3)
    expect(paragraphs[0]?.textContent).toBe('first paragraph.')
    expect(paragraphs[2]?.textContent).toBe('third.')
  })

  it('renders single-paragraph prose as one <p>', () => {
    const { container } = render(
      <NarrativeProjection projection={p({ prose: 'just one para' })} />
    )
    expect(container.querySelectorAll('p')).toHaveLength(1)
  })

  it('renders the figure title for each figure', () => {
    render(
      <NarrativeProjection projection={p({
        prose: 'p',
        figures: [
          { id: 'f1', title: 'Figure One', data: [{ x: 1, y: 1 }],
            mark: { type: 'line' }, encodings: { x: 'x', y: 'y' } },
          { id: 'f2', title: 'Figure Two', data: [{ x: 1, y: 1 }],
            mark: { type: 'line' }, encodings: { x: 'x', y: 'y' } },
        ],
      })} />
    )
    expect(screen.getByText('Figure One')).toBeInTheDocument()
    expect(screen.getByText('Figure Two')).toBeInTheDocument()
  })

  it('surfaces fallback_reason as a small dev hint when source=fallback', () => {
    const { getByTestId } = render(
      <NarrativeProjection projection={p({
        prose: 'fell back to title',
        source: 'fallback',
        fallback_reason: 'lint: unsourced digits in prose (5, 12)',
      })} />
    )
    const node = getByTestId('projection-fallback-reason')
    expect(node.textContent).toContain('lint')
    expect(node.textContent).toContain('unsourced digits')
  })

  it('does not render fallback_reason when source=llm even if the field is present', () => {
    const { queryByTestId } = render(
      <NarrativeProjection projection={p({
        prose: 'real prose',
        source: 'llm',
        fallback_reason: 'should not appear',
      })} />
    )
    expect(queryByTestId('projection-fallback-reason')).toBeNull()
  })

  it('does not render fallback chrome when fallback_reason is missing', () => {
    const { queryByTestId } = render(
      <NarrativeProjection projection={p({
        prose: 'fallback prose',
        source: 'fallback',
      })} />
    )
    expect(queryByTestId('projection-fallback-reason')).toBeNull()
  })

  it('renders figures BEFORE prose so the visual story leads', () => {
    const { container } = render(
      <NarrativeProjection projection={p({
        prose: 'after the figures',
        figures: [{ id: 'f', title: 'T', data: [{ x: 1, y: 1 }],
          mark: { type: 'line' }, encodings: { x: 'x', y: 'y' } }],
      })} />
    )
    const root = container.firstChild as HTMLElement
    const figureBlock = root.querySelector('[data-figure-id="f"]')
    const proseP = root.querySelector('p')
    expect(figureBlock).not.toBeNull()
    expect(proseP).not.toBeNull()
    // DOM order check: figureBlock comes before proseP.
    if (figureBlock && proseP) {
      const cmp = figureBlock.compareDocumentPosition(proseP)
      expect(cmp & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    }
  })
})
