/**
 * StatusDot — behavioral tests.
 *
 * Discipline: assert what the user (or upstream component) sees, not the
 * implementation. We check rendered DOM attributes (`data-status`, presence
 * marker), accessibility surface (role/aria-label/aria-hidden), and that the
 * atom accepts every canonical Status without crashing.
 */

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { StatusSchema, type Status } from '@/schema'
import { StatusDot } from './StatusDot'

// Derived from the schema enum so a v0.2 status addition fails this suite
// until the dot stylesheet (and any other consumer) is updated.
const ALL_STATUSES = StatusSchema.options as readonly Status[]

describe('StatusDot', () => {
  it('exposes the status via data-status', () => {
    const { container } = render(<StatusDot status="gated" />)
    const dot = container.firstElementChild as HTMLElement
    expect(dot).not.toBeNull()
    expect(dot.getAttribute('data-status')).toBe('gated')
  })

  it('renders for every canonical Status without error', () => {
    for (const s of ALL_STATUSES) {
      const { container, unmount } = render(<StatusDot status={s} />)
      const dot = container.firstElementChild as HTMLElement
      expect(dot.getAttribute('data-status')).toBe(s)
      unmount()
    }
  })

  it('marks presence via data-presence', () => {
    const { container } = render(<StatusDot status="active" presence />)
    const dot = container.firstElementChild as HTMLElement
    expect(dot.getAttribute('data-presence')).toBe('true')
  })

  it('omits data-presence when presence is false', () => {
    const { container } = render(<StatusDot status="active" />)
    const dot = container.firstElementChild as HTMLElement
    expect(dot.getAttribute('data-presence')).toBeNull()
  })

  it('respects the size prop', () => {
    const { container } = render(<StatusDot status="active" size={14} />)
    const dot = container.firstElementChild as HTMLElement
    expect(dot.style.width).toBe('14px')
    expect(dot.style.height).toBe('14px')
  })

  it('is decorative by default (aria-hidden, no role)', () => {
    const { container } = render(<StatusDot status="active" />)
    const dot = container.firstElementChild as HTMLElement
    expect(dot.getAttribute('aria-hidden')).toBe('true')
    expect(dot.getAttribute('role')).toBeNull()
  })

  it('exposes an accessible label when ariaLabel is set', () => {
    render(<StatusDot status="gated" ariaLabel="iter-2 is gated" />)
    const dot = screen.getByLabelText('iter-2 is gated')
    expect(dot.getAttribute('role')).toBe('img')
    expect(dot.getAttribute('aria-hidden')).toBeNull()
  })
})
