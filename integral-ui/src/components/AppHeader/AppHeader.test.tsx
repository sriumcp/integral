/**
 * AppHeader — behavioral tests.
 *
 * Discipline: assert what the user sees + the data-* / aria contracts
 * surfaces and visual tests compose against. The schema-version chip's
 * text is asserted via the imported `SCHEMA_VERSION` literal so the chip
 * cannot silently drift from the schema layer.
 */

import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SCHEMA_VERSION } from '@/schema'
import { sri, nousPlanner } from '@/fixtures/workspace'
import { AppHeader, type Crumb } from './AppHeader'

const MAP_CRUMBS: Crumb[] = [
  { label: 'workspace', onClick: () => {} },
  { label: 'map' },
]

const DETAIL_CRUMBS: Crumb[] = [
  { label: 'workspace', onClick: () => {} },
  { label: 'detail', onClick: () => {} },
  { label: 'v3 plateau study' },
]

describe('AppHeader', () => {
  it('renders the wordmark and the version chip', () => {
    render(<AppHeader surface="map" breadcrumbs={MAP_CRUMBS} me={sri} />)
    expect(screen.getByText('Integral')).toBeInTheDocument()
    expect(screen.getByText('v0.1')).toBeInTheDocument()
  })

  it('renders the brand glyph with an accessible label', () => {
    render(<AppHeader surface="map" breadcrumbs={MAP_CRUMBS} me={sri} />)
    expect(screen.getByRole('img', { name: /integral/i })).toBeInTheDocument()
  })

  it('renders breadcrumb segments with separator marks', () => {
    render(<AppHeader surface="detail" breadcrumbs={DETAIL_CRUMBS} me={sri} />)
    expect(screen.getByRole('button', { name: 'workspace' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'detail' })).toBeInTheDocument()
    // The current-position crumb (no onClick) renders as plain text, not a button.
    expect(screen.getByText('v3 plateau study')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'v3 plateau study' })
    ).not.toBeInTheDocument()
  })

  it('breadcrumb click fires the corresponding navigate callback', () => {
    const onWorkspace = vi.fn()
    const onView = vi.fn()
    const crumbs: Crumb[] = [
      { label: 'workspace', onClick: onWorkspace },
      { label: 'detail', onClick: onView },
      { label: 'v3 plateau study' },
    ]
    render(<AppHeader surface="detail" breadcrumbs={crumbs} me={sri} />)
    fireEvent.click(screen.getByRole('button', { name: 'workspace' }))
    expect(onWorkspace).toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'detail' }))
    expect(onView).toHaveBeenCalled()
  })

  it('schema-version chip text derives from the SCHEMA_VERSION literal', () => {
    render(<AppHeader surface="map" breadcrumbs={MAP_CRUMBS} me={sri} />)
    // If SCHEMA_VERSION ever changes, the chip text follows automatically.
    expect(
      screen.getByText(new RegExp(`schema v${SCHEMA_VERSION}`))
    ).toBeInTheDocument()
  })

  it('renders a refresh button when onRefresh is provided', () => {
    render(
      <AppHeader
        surface="map"
        breadcrumbs={MAP_CRUMBS}
        me={sri}
        onRefresh={() => {}}
        lastSyncedAt={new Date().toISOString()}
      />
    )
    expect(
      screen.getByRole('button', { name: /refresh workspace/i })
    ).toBeInTheDocument()
  })

  it('refresh button shows "synced <time> ago"', () => {
    render(
      <AppHeader
        surface="map"
        breadcrumbs={MAP_CRUMBS}
        me={sri}
        onRefresh={() => {}}
        lastSyncedAt={new Date(Date.now() - 5 * 60_000).toISOString()}
      />
    )
    expect(screen.getByText(/synced 5m ago/i)).toBeInTheDocument()
  })

  it('refresh button is amber when stale (past 60min)', () => {
    render(
      <AppHeader
        surface="map"
        breadcrumbs={MAP_CRUMBS}
        me={sri}
        onRefresh={() => {}}
        lastSyncedAt={new Date(Date.now() - 90 * 60_000).toISOString()}
      />
    )
    const button = screen.getByRole('button', { name: /refresh workspace/i })
    expect(button.getAttribute('data-stale')).toBe('true')
  })

  it('refresh button is not amber when fresh', () => {
    render(
      <AppHeader
        surface="map"
        breadcrumbs={MAP_CRUMBS}
        me={sri}
        onRefresh={() => {}}
        lastSyncedAt={new Date().toISOString()}
      />
    )
    const button = screen.getByRole('button', { name: /refresh workspace/i })
    expect(button.getAttribute('data-stale')).toBeNull()
  })

  it('clicking refresh fires the onRefresh callback', async () => {
    const user = userEvent.setup()
    const onRefresh = vi.fn()
    render(
      <AppHeader
        surface="map"
        breadcrumbs={MAP_CRUMBS}
        me={sri}
        onRefresh={onRefresh}
        lastSyncedAt={new Date().toISOString()}
      />
    )
    await user.click(
      screen.getByRole('button', { name: /refresh workspace/i })
    )
    expect(onRefresh).toHaveBeenCalledTimes(1)
  })

  it('refresh button is disabled while refreshing', () => {
    render(
      <AppHeader
        surface="map"
        breadcrumbs={MAP_CRUMBS}
        me={sri}
        onRefresh={() => {}}
        lastSyncedAt={new Date().toISOString()}
        refreshing
      />
    )
    const button = screen.getByRole('button', {
      name: /refresh workspace/i,
    }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
  })

  it('falls back to legacy reversibility chip when onRefresh is absent', () => {
    // Backwards compat for tests that don't pass onRefresh — the v0.1
    // fixture-only render path used in visual baselines doesn't need
    // refresh affordances.
    render(<AppHeader surface="map" breadcrumbs={MAP_CRUMBS} me={sri} />)
    expect(screen.getByText(/reversibility · 24h/)).toBeInTheDocument()
  })

  it('renders the current Party display name in the me chip', () => {
    render(<AppHeader surface="map" breadcrumbs={MAP_CRUMBS} me={nousPlanner} />)
    expect(screen.getByText('nous-planner')).toBeInTheDocument()
  })

  it('exposes data-surface on the root for visual tests', () => {
    const { container } = render(
      <AppHeader surface="detail" breadcrumbs={DETAIL_CRUMBS} me={sri} />
    )
    const root = container.firstElementChild as HTMLElement
    expect(root.getAttribute('data-surface')).toBe('detail')
  })

  it('left cluster is non-interactive (no button) when onLogoClick is omitted', () => {
    render(<AppHeader surface="map" breadcrumbs={MAP_CRUMBS} me={sri} />)
    // The brand wordmark is text inside a non-button <div> when no handler.
    const wordmark = screen.getByText('Integral')
    expect(wordmark.closest('button')).toBeNull()
  })

  it('renders a logo button when onLogoClick is provided', () => {
    render(
      <AppHeader
        surface="map"
        breadcrumbs={MAP_CRUMBS}
        me={sri}
        onLogoClick={() => {}}
      />
    )
    expect(
      screen.getByRole('button', { name: /integral · back to landing/i })
    ).toBeInTheDocument()
  })

  it('clicking the logo fires onLogoClick', () => {
    const onLogoClick = vi.fn()
    render(
      <AppHeader
        surface="map"
        breadcrumbs={MAP_CRUMBS}
        me={sri}
        onLogoClick={onLogoClick}
      />
    )
    fireEvent.click(
      screen.getByRole('button', { name: /integral · back to landing/i })
    )
    expect(onLogoClick).toHaveBeenCalled()
  })

  it('truncates long intent-title crumbs at narrow widths via title attribute', () => {
    const longTitle = 'a really long intent title that will not fit at narrow widths'
    const crumbs: Crumb[] = [
      { label: 'workspace', onClick: () => {} },
      { label: 'detail', onClick: () => {} },
      { label: longTitle },
    ]
    render(<AppHeader surface="detail" breadcrumbs={crumbs} me={sri} />)
    const segment = screen.getByText(longTitle)
    // The full title is preserved as the native tooltip so truncation never
    // hides information from the user.
    expect(segment.getAttribute('title')).toBe(longTitle)
  })
})
