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
import { sri, nousPlanner } from '@/test/seed-workspace'
import { AppHeader, type FocusSegment, type ScopePill } from './AppHeader'

const NOUS_SCOPE: ScopePill[] = [{ id: 'nous', label: 'nous' }]
const MULTI_SCOPE: ScopePill[] = [
  { id: 'nous', label: 'nous' },
  { id: 'github-integral', label: 'github-integral' },
]
// Single-segment focus chain — Detail of a root campaign with no
// ancestry above it. Most of the existing tests don't care about
// chain depth, so this stays terse.
const DETAIL_FOCUS: FocusSegment[] = [{ label: 'v3 plateau study' }]

describe('AppHeader', () => {
  it('renders the wordmark and the version chip', () => {
    render(<AppHeader surface="map" scope={NOUS_SCOPE} me={sri} />)
    expect(screen.getByText('Integral')).toBeInTheDocument()
    expect(screen.getByText('v0.1')).toBeInTheDocument()
  })

  it('renders the brand glyph with an accessible label', () => {
    render(<AppHeader surface="map" scope={NOUS_SCOPE} me={sri} />)
    expect(screen.getByRole('img', { name: /integral/i })).toBeInTheDocument()
  })

  it('renders one source pill per scope entry on Map', () => {
    render(<AppHeader surface="map" scope={MULTI_SCOPE} me={sri} />)
    expect(screen.getByText('nous')).toBeInTheDocument()
    expect(screen.getByText('github-integral')).toBeInTheDocument()
  })

  it('renders no source pills when scope is empty', () => {
    const { container } = render(<AppHeader surface="map" scope={[]} me={sri} />)
    // No rendered scope row when scope is empty — the center cluster
    // collapses cleanly rather than carrying an empty container.
    expect(container.querySelector('[data-scope="true"]')).toBeNull()
  })

  // ─── Interactive scope pills (v0.2.0) ────────────────────────────────────
  // The AppHeader is the canonical scope-control surface. Pills are
  // rendered as buttons when `onClick` is provided; click toggles the
  // source. The `data-enabled` attribute distinguishes enabled (filled
  // style) from disabled (muted/dashed) states.

  it('renders pills as buttons when onClick is provided (interactive mode)', () => {
    const onClick = vi.fn()
    const interactive: ScopePill[] = [
      { id: 'nous', label: 'nous', enabled: true, onClick },
      { id: 'coral', label: 'coral', enabled: false, onClick },
    ]
    render(<AppHeader surface="map" scope={interactive} me={sri} />)
    expect(
      screen.getByRole('button', { name: /disable source nous/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /enable source coral/i }),
    ).toBeInTheDocument()
  })

  it('exposes data-enabled on every pill (true for on, false for off)', () => {
    const interactive: ScopePill[] = [
      { id: 'nous', label: 'nous', enabled: true, onClick: () => {} },
      { id: 'coral', label: 'coral', enabled: false, onClick: () => {} },
    ]
    const { container } = render(
      <AppHeader surface="map" scope={interactive} me={sri} />,
    )
    expect(
      container.querySelector('[data-source-id="nous"]')?.getAttribute('data-enabled'),
    ).toBe('true')
    expect(
      container.querySelector('[data-source-id="coral"]')?.getAttribute('data-enabled'),
    ).toBe('false')
  })

  it('clicking an interactive pill fires its onClick', () => {
    const onClick = vi.fn()
    const interactive: ScopePill[] = [
      { id: 'nous', label: 'nous', enabled: true, onClick },
    ]
    render(<AppHeader surface="map" scope={interactive} me={sri} />)
    fireEvent.click(screen.getByRole('button', { name: /disable source nous/i }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('renders pills as passive spans (legacy read-only) when onClick is omitted', () => {
    const passive: ScopePill[] = [{ id: 'nous', label: 'nous' }]
    render(<AppHeader surface="map" scope={passive} me={sri} />)
    expect(
      screen.queryByRole('button', { name: /disable source nous/i }),
    ).toBeNull()
    // The label still appears, just inside a non-interactive element.
    expect(screen.getByText('nous')).toBeInTheDocument()
  })

  it('renders source + chevron + focus title on Detail', () => {
    render(
      <AppHeader
        surface="detail"
        scope={NOUS_SCOPE}
        focus={DETAIL_FOCUS}
        me={sri}
      />
    )
    expect(screen.getByText('nous')).toBeInTheDocument()
    expect(screen.getByText('v3 plateau study')).toBeInTheDocument()
    // The leaf focus segment is never rendered as a button (no onClick).
    expect(
      screen.queryByRole('button', { name: 'v3 plateau study' })
    ).not.toBeInTheDocument()
  })

  it('renders ancestor segments as clickable buttons', () => {
    // Ancestry chain: campaign → iteration. The campaign segment has
    // an onClick (back-nav); the iteration is the leaf (current).
    render(
      <AppHeader
        surface="detail"
        scope={NOUS_SCOPE}
        focus={[
          { label: 'v3 plateau study', onClick: () => {} },
          { label: 'iter-2 · reward-curvature probe' },
        ]}
        me={sri}
      />
    )
    expect(
      screen.getByRole('button', { name: 'v3 plateau study' })
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /iter-2/ })
    ).not.toBeInTheDocument()
  })

  it('clicking an ancestor segment fires its onClick', () => {
    const onAncestorClick = vi.fn()
    render(
      <AppHeader
        surface="detail"
        scope={NOUS_SCOPE}
        focus={[
          { label: 'v3 plateau study', onClick: onAncestorClick },
          { label: 'iter-2 · reward-curvature probe' },
        ]}
        me={sri}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: 'v3 plateau study' }))
    expect(onAncestorClick).toHaveBeenCalledTimes(1)
  })

  it('exposes data-source-id on every scope pill', () => {
    // Visual / E2E hooks compose against this attribute. Locking it
    // at the unit layer prevents silent removal during refactors.
    const { container } = render(
      <AppHeader surface="map" scope={MULTI_SCOPE} me={sri} />
    )
    expect(
      container.querySelector('[data-source-id="nous"]')
    ).not.toBeNull()
    expect(
      container.querySelector('[data-source-id="github-integral"]')
    ).not.toBeNull()
  })

  it('omits chevron when focus is absent (Map case)', () => {
    const { container } = render(
      <AppHeader surface="map" scope={NOUS_SCOPE} me={sri} />
    )
    // No chevron because there's no focus segment to separate from scope.
    expect(container.textContent).not.toContain('›')
  })

  it('renders focus alone (no chevron) when scope is empty', () => {
    // Edge case — Detail of an intent whose provenance.source is unknown
    // to the registry. The intent title still renders as the focus.
    const { container } = render(
      <AppHeader
        surface="detail"
        scope={[]}
        focus={DETAIL_FOCUS}
        me={sri}
      />
    )
    expect(screen.getByText('v3 plateau study')).toBeInTheDocument()
    expect(container.textContent).not.toContain('›')
  })

  it('schema-version chip text derives from the SCHEMA_VERSION literal', () => {
    render(<AppHeader surface="map" scope={NOUS_SCOPE} me={sri} />)
    expect(
      screen.getByText(new RegExp(`schema v${SCHEMA_VERSION}`))
    ).toBeInTheDocument()
  })

  it('renders a refresh button when onRefresh is provided', () => {
    render(
      <AppHeader
        surface="map"
        scope={NOUS_SCOPE}
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
        scope={NOUS_SCOPE}
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
        scope={NOUS_SCOPE}
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
        scope={NOUS_SCOPE}
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
        scope={NOUS_SCOPE}
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
        scope={NOUS_SCOPE}
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

  it('omits the refresh affordance when onRefresh is absent', () => {
    render(<AppHeader surface="map" scope={NOUS_SCOPE} me={sri} />)
    expect(screen.queryByRole('button', { name: /refresh workspace/i })).toBeNull()
    expect(screen.queryByText(/reversibility/)).toBeNull()
  })

  it('renders the current Party display name in the me chip', () => {
    render(<AppHeader surface="map" scope={NOUS_SCOPE} me={nousPlanner} />)
    expect(screen.getByText('nous-planner')).toBeInTheDocument()
  })

  it('exposes data-surface on the root for visual tests', () => {
    const { container } = render(
      <AppHeader
        surface="detail"
        scope={NOUS_SCOPE}
        focus={DETAIL_FOCUS}
        me={sri}
      />
    )
    const root = container.firstElementChild as HTMLElement
    expect(root.getAttribute('data-surface')).toBe('detail')
  })

  it('left cluster is non-interactive (no button) when onLogoClick is omitted', () => {
    render(<AppHeader surface="map" scope={NOUS_SCOPE} me={sri} />)
    const wordmark = screen.getByText('Integral')
    expect(wordmark.closest('button')).toBeNull()
  })

  it('renders a logo button when onLogoClick is provided', () => {
    render(
      <AppHeader
        surface="map"
        scope={NOUS_SCOPE}
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
        scope={NOUS_SCOPE}
        me={sri}
        onLogoClick={onLogoClick}
      />
    )
    fireEvent.click(
      screen.getByRole('button', { name: /integral · back to landing/i })
    )
    expect(onLogoClick).toHaveBeenCalled()
  })

  it('truncates long focus titles via title attribute', () => {
    const longTitle = 'a really long intent title that will not fit at narrow widths'
    render(
      <AppHeader
        surface="detail"
        scope={NOUS_SCOPE}
        focus={[{ label: longTitle }]}
        me={sri}
      />
    )
    const segment = screen.getByText(longTitle)
    // The full title is preserved as the native tooltip so truncation never
    // hides information from the user.
    expect(segment.getAttribute('title')).toBe(longTitle)
  })
})
