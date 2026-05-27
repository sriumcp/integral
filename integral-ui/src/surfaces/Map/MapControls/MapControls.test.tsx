import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MapControls } from './MapControls'
import { DEFAULT_VIEW, type MapView } from '@/lib/filter-query'

const NOOP = () => undefined
const COUNTS = { active: 3, awaiting: 1, working: 2, drafts: 0 }

function renderControls(opts: {
  view?: MapView
  counts?: typeof COUNTS
  knownSources?: ReturnType<typeof vi.fn>['mock']['calls']
} = {}) {
  render(
    <MapControls
      view={opts.view ?? DEFAULT_VIEW}
      counts={opts.counts ?? COUNTS}
      availableTags={[]}
      onAddFilter={NOOP}
      onRemoveFilter={NOOP}
      onChangeGroup={NOOP}
      onChangeSort={NOOP}
    />
  )
}

describe('MapControls', () => {
  it('renders the workspace counts header', () => {
    renderControls()
    expect(
      screen.getByText(/3 active · 1 awaiting you · 2 agents working/i)
    ).toBeInTheDocument()
  })

  it('renders FilterBar', () => {
    renderControls()
    expect(screen.getByTestId('filter-bar')).toBeInTheDocument()
  })

  it('hides GroupSortControls when no filters active and view is default', () => {
    renderControls()
    expect(screen.queryByTestId('group-sort-controls')).toBeNull()
  })

  it('shows GroupSortControls when ≥1 filter is active', () => {
    renderControls({
      view: {
        ...DEFAULT_VIEW,
        filter: { ...DEFAULT_VIEW.filter, awaitingMe: true },
      },
    })
    expect(screen.getByTestId('group-sort-controls')).toBeInTheDocument()
  })

  it('shows GroupSortControls when group is non-default (no filters)', () => {
    renderControls({
      view: { ...DEFAULT_VIEW, group: 'source' },
    })
    expect(screen.getByTestId('group-sort-controls')).toBeInTheDocument()
  })

  it('renders + new nous campaign button when handler is provided', () => {
    render(
      <MapControls
        view={DEFAULT_VIEW}
        counts={COUNTS}
        availableTags={[]}
        onAddFilter={NOOP}
        onRemoveFilter={NOOP}
        onChangeGroup={NOOP}
        onChangeSort={NOOP}
        onNewNousDraft={vi.fn()}
      />
    )
    expect(
      screen.getByRole('button', { name: /new nous campaign/i })
    ).toBeInTheDocument()
  })

  it('omits + new nous campaign button when handler is absent', () => {
    renderControls()
    expect(
      screen.queryByRole('button', { name: /new nous campaign/i })
    ).toBeNull()
  })

  it('renders the SourcesDropdown inline (no dedicated row) when sources are wired', () => {
    // Pre-migration: a separate `SOURCES` row sat below the filter
    // cluster. Post-migration: the picker is a dropdown chip on the
    // filter row, matching the Group / Sort pattern. The
    // `data-testid="source-picker"` hook moves with it so existing
    // E2E + visual baselines compose against the same locator.
    const { container } = render(
      <MapControls
        view={DEFAULT_VIEW}
        counts={COUNTS}
        availableTags={[]}
        onAddFilter={NOOP}
        onRemoveFilter={NOOP}
        onChangeGroup={NOOP}
        onChangeSort={NOOP}
        knownSources={[
          { id: 'fixture', label: 'demo fixture', kind: 'fixture' },
          { id: 'nous', label: 'nous', kind: 'adapter' },
        ]}
        enabledSources={new Set(['fixture'])}
        onToggleSource={NOOP}
      />
    )
    const picker = screen.getByTestId('source-picker')
    expect(picker).toBeInTheDocument()
    // Dropdown lives inside the filter cluster, not in a separate row.
    expect(picker.closest('[data-testid="filter-cluster"]')).not.toBeNull()
    // Trigger summary shows enabled-of-total.
    expect(screen.getByTestId('sources-summary').textContent).toMatch(
      /sources:\s*1\s*of\s*2/i
    )
    // After opening, the toggle buttons carry the data-source contract.
    fireEvent.click(screen.getByTestId('sources-summary'))
    expect(
      container.querySelector('button[data-source="fixture"][data-enabled="true"]')
    ).not.toBeNull()
    expect(
      container.querySelector('button[data-source="nous"]')
    ).not.toBeNull()
  })

  it('omits the source picker entirely when sources are not wired', () => {
    renderControls()
    expect(screen.queryByTestId('source-picker')).toBeNull()
  })
})
