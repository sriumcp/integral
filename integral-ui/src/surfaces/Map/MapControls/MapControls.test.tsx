import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
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

  it('does NOT render any source picker (sources are managed in AppHeader as of v0.2.0)', () => {
    renderControls()
    expect(screen.queryByTestId('source-picker')).toBeNull()
    expect(screen.queryByTestId('sources-summary')).toBeNull()
  })
})
