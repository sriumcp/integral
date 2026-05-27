/**
 * SourcesDropdown — behavioral contract (TDD).
 *
 * Each test pins a user-visible behavior, not implementation. The
 * `data-testid="source-picker"`, `button[data-source=…]`, and
 * `data-enabled="true"` hooks are the load-bearing contract — visual
 * regression + E2E (`e2e/scaffold.spec.ts`) compose against them.
 */

import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { SourcesDropdown } from './SourcesDropdown'
import type { SourceEntry } from '@/lib/sources'

const SOURCES: SourceEntry[] = [
  { id: 'fixture', label: 'demo fixture', kind: 'fixture' },
  { id: 'nous', label: 'nous', kind: 'adapter' },
  { id: 'github-integral', label: 'github-integral', kind: 'adapter' },
]

function renderDropdown(opts: {
  enabled?: ReadonlySet<string>
  onToggle?: (id: string) => void
} = {}) {
  return render(
    <SourcesDropdown
      knownSources={SOURCES}
      enabledSources={opts.enabled ?? new Set(['fixture'])}
      onToggleSource={opts.onToggle ?? (() => {})}
    />
  )
}

/**
 * Helpers — the dropdown panel is wrapped in a native <details>; tests
 * open it explicitly so subsequent queries see the panel content.
 */
function openPanel() {
  fireEvent.click(screen.getByTestId('sources-summary'))
}

describe('SourcesDropdown', () => {
  it('renders inside a data-testid="source-picker" wrapper', () => {
    // The E2E + visual baselines target this hook — moving or
    // renaming it breaks them.
    renderDropdown()
    expect(screen.getByTestId('source-picker')).toBeInTheDocument()
  })

  it('trigger label reads "sources: <enabled> of <total>"', () => {
    renderDropdown({ enabled: new Set(['fixture', 'nous']) })
    const summary = screen.getByTestId('sources-summary')
    expect(summary.textContent).toMatch(/sources:\s*2\s*of\s*3/i)
  })

  it('trigger label updates when enabled set changes', () => {
    const { rerender } = render(
      <SourcesDropdown
        knownSources={SOURCES}
        enabledSources={new Set(['fixture'])}
        onToggleSource={() => {}}
      />
    )
    expect(screen.getByTestId('sources-summary').textContent).toMatch(
      /1\s*of\s*3/
    )
    rerender(
      <SourcesDropdown
        knownSources={SOURCES}
        enabledSources={new Set(['fixture', 'nous', 'github-integral'])}
        onToggleSource={() => {}}
      />
    )
    expect(screen.getByTestId('sources-summary').textContent).toMatch(
      /3\s*of\s*3/
    )
  })

  it('trigger reads "0 of N" when no source is enabled', () => {
    renderDropdown({ enabled: new Set() })
    expect(screen.getByTestId('sources-summary').textContent).toMatch(
      /0\s*of\s*3/
    )
  })

  it('panel renders one toggle button per registered source', () => {
    renderDropdown()
    openPanel()
    const panel = screen.getByRole('menu')
    expect(within(panel).getByText('demo fixture')).toBeInTheDocument()
    expect(within(panel).getByText('nous')).toBeInTheDocument()
    expect(within(panel).getByText('github-integral')).toBeInTheDocument()
  })

  it('every option carries data-source + (when enabled) data-enabled', () => {
    // E2E contract: the existing scaffold spec selects
    // `button[data-source="X"][data-enabled="true"]`.
    const { container } = renderDropdown({ enabled: new Set(['fixture']) })
    openPanel()
    const fixtureBtn = container.querySelector('button[data-source="fixture"]')
    const nousBtn = container.querySelector('button[data-source="nous"]')
    expect(fixtureBtn).not.toBeNull()
    expect(nousBtn).not.toBeNull()
    expect(fixtureBtn?.getAttribute('data-enabled')).toBe('true')
    expect(nousBtn?.getAttribute('data-enabled')).toBeNull()
  })

  it('options use role="menuitemcheckbox" + aria-checked (multi-select semantics)', () => {
    // Group / Sort dropdowns are single-select (menuitem + aria-current).
    // Sources is multi-select — different ARIA hook.
    renderDropdown({ enabled: new Set(['nous']) })
    openPanel()
    const fixture = screen.getByRole('menuitemcheckbox', { name: /demo fixture/ })
    const nous = screen.getByRole('menuitemcheckbox', { name: /^nous$/ })
    expect(fixture.getAttribute('aria-checked')).toBe('false')
    expect(nous.getAttribute('aria-checked')).toBe('true')
  })

  it('clicking an option fires onToggleSource with that source id', () => {
    const onToggle = vi.fn()
    renderDropdown({ onToggle })
    openPanel()
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: /^nous$/ }))
    expect(onToggle).toHaveBeenCalledTimes(1)
    expect(onToggle).toHaveBeenCalledWith('nous')
  })

  it('clicking an already-enabled option also fires onToggleSource (toggle off)', () => {
    const onToggle = vi.fn()
    renderDropdown({ enabled: new Set(['fixture']), onToggle })
    openPanel()
    fireEvent.click(
      screen.getByRole('menuitemcheckbox', { name: /demo fixture/ })
    )
    expect(onToggle).toHaveBeenCalledWith('fixture')
  })

  it('renders sources in registry order (not enabled order)', () => {
    // Stability promise — toggling a source off then on keeps its
    // pill in its original position. Mirrors the mapScope helper.
    renderDropdown({ enabled: new Set(['github-integral', 'fixture']) })
    openPanel()
    const items = screen.getAllByRole('menuitemcheckbox')
    expect(items.map((b) => b.getAttribute('data-source'))).toEqual([
      'fixture',
      'nous',
      'github-integral',
    ])
  })

  it('panel is closed by default (details element is collapsed)', () => {
    const { container } = renderDropdown()
    const details = container.querySelector('details')
    expect(details?.hasAttribute('open')).toBe(false)
  })

  it('renders nothing when knownSources is empty', () => {
    // Defensive — when the registry has no entries, the dropdown
    // adds chrome with no purpose. Better to render nothing.
    const { container } = render(
      <SourcesDropdown
        knownSources={[]}
        enabledSources={new Set()}
        onToggleSource={() => {}}
      />
    )
    expect(container.firstChild).toBeNull()
  })
})
