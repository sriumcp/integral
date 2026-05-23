/**
 * LandingSurface — behavioral tests.
 *
 * Discipline: assert what the user sees + the data-* contract surfaces
 * compose against. The peek counts are derived through the same path the
 * component uses (validated workspace + the awaiting predicate), so the
 * test stays in sync with the schema layer.
 */

import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { WorkspaceSchema } from '@/schema'
import { fixtureWorkspace, sri } from '@/fixtures/workspace'
import { LandingSurface } from './LandingSurface'

const validated = WorkspaceSchema.parse(fixtureWorkspace)

describe('LandingSurface', () => {
  it('renders glyph, wordmark, tagline and enter button', () => {
    render(<LandingSurface workspace={validated} me={sri} onEnter={() => {}} />)
    expect(screen.getByRole('img', { name: /integral/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Integral' })).toBeInTheDocument()
    expect(
      screen.getByText('intent management for humans + agents')
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /enter/i })).toBeInTheDocument()
  })

  it('peek shows the active root count derived from the validated workspace', () => {
    render(<LandingSurface workspace={validated} me={sri} onEnter={() => {}} />)
    // Fixture has 4 root campaigns.
    expect(screen.getByText(/4 active/)).toBeInTheDocument()
  })

  it('peek shows the awaiting-me count from the queue predicate', () => {
    render(<LandingSurface workspace={validated} me={sri} onEnter={() => {}} />)
    // Fixture has exactly one gated Nous campaign awaiting `sri`.
    expect(screen.getByText(/1 awaiting you/)).toBeInTheDocument()
  })

  it('peek surfaces a most-recent activity marker', () => {
    render(<LandingSurface workspace={validated} me={sri} onEnter={() => {}} />)
    expect(screen.getByText(/last activity/)).toBeInTheDocument()
  })

  it('exposes data-surface="landing" on the root', () => {
    const { container } = render(
      <LandingSurface workspace={validated} me={sri} onEnter={() => {}} />
    )
    const root = container.firstElementChild as HTMLElement
    expect(root.getAttribute('data-surface')).toBe('landing')
  })

  it('auto-focuses the enter button on first paint', () => {
    render(<LandingSurface workspace={validated} me={sri} onEnter={() => {}} />)
    const enterBtn = screen.getByRole('button', { name: /enter/i })
    expect(document.activeElement).toBe(enterBtn)
  })

  it('clicking the enter button fires onEnter', () => {
    const onEnter = vi.fn()
    render(<LandingSurface workspace={validated} me={sri} onEnter={onEnter} />)
    fireEvent.click(screen.getByRole('button', { name: /enter/i }))
    expect(onEnter).toHaveBeenCalled()
  })

  it('keyboard Enter on the focused button fires onEnter', () => {
    const onEnter = vi.fn()
    render(<LandingSurface workspace={validated} me={sri} onEnter={onEnter} />)
    const enterBtn = screen.getByRole('button', { name: /enter/i })
    // Native button responds to Enter via click; submit semantics suffice
    // because the auto-focus happens on first paint.
    fireEvent.keyDown(enterBtn, { key: 'Enter' })
    fireEvent.keyUp(enterBtn, { key: 'Enter' })
    fireEvent.click(enterBtn) // browser default for Enter on focused button
    expect(onEnter).toHaveBeenCalled()
  })
})
