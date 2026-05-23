/**
 * Chip — behavioral tests.
 *
 * Discipline: assert what the user sees and what surfaces compose against.
 * We check rendered text, attribute-driven styling hooks (data-tone,
 * data-status, data-mono, data-soft), dot rendering rules, and accessibility.
 * Not asserted: specific class names, specific CSS color values, internal
 * style structure.
 */

import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Chip } from './Chip'

describe('Chip', () => {
  it('renders children', () => {
    render(<Chip>iter-2</Chip>)
    expect(screen.getByText('iter-2')).toBeInTheDocument()
  })

  it('defaults to mute tone when no tone or status is given', () => {
    render(<Chip>x</Chip>)
    const chip = screen.getByText('x').closest('span')!
    expect(chip.getAttribute('data-tone')).toBe('mute')
    expect(chip.getAttribute('data-status')).toBeNull()
  })

  it('applies tone via data-tone', () => {
    render(<Chip tone="amber">awaiting you</Chip>)
    const chip = screen.getByText('awaiting you').closest('span')!
    expect(chip.getAttribute('data-tone')).toBe('amber')
  })

  it('applies status via data-status (and not data-tone)', () => {
    render(<Chip status="gated">gated</Chip>)
    const chip = screen.getByText('gated').closest('span')!
    expect(chip.getAttribute('data-status')).toBe('gated')
    expect(chip.getAttribute('data-tone')).toBeNull()
  })

  it('warns in dev when both tone and status are passed', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    render(
      <Chip tone="amber" status="gated">
        x
      </Chip>
    )
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('mutually exclusive')
    )
    warn.mockRestore()
  })

  it('does not render a dot by default', () => {
    const { container } = render(<Chip tone="sage">ok</Chip>)
    const dots = container.querySelectorAll('[aria-hidden="true"]')
    expect(dots.length).toBe(0)
  })

  it('renders a dot when dot is true', () => {
    const { container } = render(
      <Chip tone="sage" dot>
        ok
      </Chip>
    )
    const dots = container.querySelectorAll('[aria-hidden="true"]')
    expect(dots.length).toBe(1)
  })

  it('renders a dot with explicit color when dot is a string', () => {
    const { container } = render(
      <Chip dot="#ff00aa">x</Chip>
    )
    const chip = container.firstElementChild as HTMLElement
    expect(chip.style.getPropertyValue('--chip-dot-color')).toBe('#ff00aa')
    const dots = container.querySelectorAll('[aria-hidden="true"]')
    expect(dots.length).toBe(1)
  })

  it('pulse implies a dot', () => {
    const { container } = render(
      <Chip tone="blue" pulse>
        agent working
      </Chip>
    )
    const dots = container.querySelectorAll('[aria-hidden="true"]')
    expect(dots.length).toBe(1)
  })

  it('marks mono variant via data-mono', () => {
    render(
      <Chip mono tone="mute">
        v0.1
      </Chip>
    )
    const chip = screen.getByText('v0.1').closest('span')!
    expect(chip.getAttribute('data-mono')).toBe('true')
  })

  it('omits data-mono when not set', () => {
    render(<Chip tone="mute">x</Chip>)
    const chip = screen.getByText('x').closest('span')!
    expect(chip.getAttribute('data-mono')).toBeNull()
  })

  it('marks soft variant via data-soft', () => {
    render(
      <Chip soft tone="sage">
        clean
      </Chip>
    )
    const chip = screen.getByText('clean').closest('span')!
    expect(chip.getAttribute('data-soft')).toBe('true')
  })

  it('passes title through to the native attribute', () => {
    render(
      <Chip tone="rose" title="ci has been failing for 1h">
        ci failing
      </Chip>
    )
    const chip = screen.getByText('ci failing').closest('span')!
    expect(chip.getAttribute('title')).toBe('ci has been failing for 1h')
  })
})
