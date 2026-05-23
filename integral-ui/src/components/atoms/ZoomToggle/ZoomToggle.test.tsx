/**
 * ZoomToggle — behavioral tests.
 *
 * Discipline: assert what the user sees and the data-* contract surfaces
 * compose against. Iterate over `ZoomLevelSchema.options` so adding a v0.2
 * zoom level fails these tests until the toggle and its consumers update.
 */

import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ZoomLevelSchema, type ZoomLevel } from '@/schema'
import { ZoomToggle } from './ZoomToggle'

const ZOOMS = ZoomLevelSchema.options

describe('ZoomToggle', () => {
  it('renders one button per zoom level', () => {
    render(<ZoomToggle value="structure" onChange={() => {}} />)
    for (const z of ZOOMS) {
      expect(screen.getByRole('button', { name: z })).toBeInTheDocument()
    }
  })

  it.each(ZOOMS)('marks the %s segment active when value matches', (z) => {
    render(<ZoomToggle value={z} onChange={() => {}} />)
    const btn = screen.getByRole('button', { name: z })
    expect(btn.getAttribute('data-active')).toBe('true')
    expect(btn.getAttribute('aria-pressed')).toBe('true')
  })

  it('marks non-active segments as inactive', () => {
    render(<ZoomToggle value="structure" onChange={() => {}} />)
    const overview = screen.getByRole('button', { name: 'overview' })
    expect(overview.getAttribute('data-active')).toBeNull()
    expect(overview.getAttribute('aria-pressed')).toBe('false')
  })

  it('exposes data-zoom on every segment for CSS hooks', () => {
    render(<ZoomToggle value="structure" onChange={() => {}} />)
    for (const z of ZOOMS) {
      const btn = screen.getByRole('button', { name: z })
      expect(btn.getAttribute('data-zoom')).toBe(z)
    }
  })

  it('fires onChange with the clicked zoom level', () => {
    const onChange = vi.fn<(z: ZoomLevel) => void>()
    render(<ZoomToggle value="structure" onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'overview' }))
    expect(onChange).toHaveBeenCalledWith('overview')
    fireEvent.click(screen.getByRole('button', { name: 'detail' }))
    expect(onChange).toHaveBeenCalledWith('detail')
  })

  it('does not fire onChange when clicking the already-active segment', () => {
    const onChange = vi.fn<(z: ZoomLevel) => void>()
    render(<ZoomToggle value="structure" onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'structure' }))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('groups segments under an aria-label for screen readers', () => {
    render(<ZoomToggle value="structure" onChange={() => {}} />)
    const group = screen.getByRole('group', { name: /zoom/i })
    expect(group).toBeInTheDocument()
  })
})
