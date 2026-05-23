/**
 * IntegralGlyph — behavioral tests.
 *
 * Discipline: assert structural attributes (size, accessibility, viewBox)
 * but never the SVG path data — the path is hand-tuned and may iterate
 * between v0.1 polish passes without invalidating the contract.
 */

import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { IntegralGlyph } from './IntegralGlyph'

describe('IntegralGlyph', () => {
  it('renders an svg with the default size', () => {
    const { container } = render(<IntegralGlyph />)
    const svg = container.querySelector('svg')!
    expect(svg.getAttribute('width')).toBe('22')
    expect(svg.getAttribute('height')).toBe('22')
  })

  it('honors an explicit size', () => {
    const { container } = render(<IntegralGlyph size={120} />)
    const svg = container.querySelector('svg')!
    expect(svg.getAttribute('width')).toBe('120')
    expect(svg.getAttribute('height')).toBe('120')
  })

  it('is decorative (aria-hidden) when no title is given', () => {
    const { container } = render(<IntegralGlyph />)
    const svg = container.querySelector('svg')!
    expect(svg.getAttribute('aria-hidden')).toBe('true')
    expect(svg.getAttribute('role')).toBeNull()
  })

  it('exposes a role="img" + aria-label when given a title', () => {
    const { container } = render(<IntegralGlyph title="Integral logo" />)
    const svg = container.querySelector('svg')!
    expect(svg.getAttribute('role')).toBe('img')
    expect(svg.getAttribute('aria-label')).toBe('Integral logo')
    expect(svg.getAttribute('aria-hidden')).toBeNull()
  })

  it('inherits stroke color from currentColor (surface decides tone)', () => {
    const { container } = render(<IntegralGlyph />)
    const svg = container.querySelector('svg')!
    expect(svg.getAttribute('stroke')).toBe('currentColor')
  })
})
