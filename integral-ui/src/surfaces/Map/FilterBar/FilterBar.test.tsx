import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { FilterBar } from './FilterBar'
import { DEFAULT_FILTER, type FilterQuery } from '@/lib/filter-query'

function renderBar(opts: {
  filter?: FilterQuery
  onAdd?: (key: string, value: string) => void
  onRemove?: (key: string, value: string) => void
} = {}) {
  const onAdd = vi.fn(opts.onAdd ?? (() => undefined))
  const onRemove = vi.fn(opts.onRemove ?? (() => undefined))
  render(
    <FilterBar
      filter={opts.filter ?? DEFAULT_FILTER}
      onAdd={onAdd as never}
      onRemove={onRemove as never}
    />
  )
  return { onAdd, onRemove }
}

describe('FilterBar', () => {
  it('renders + filter button when no filters active', () => {
    renderBar()
    expect(screen.getByText(/\+ filter/i)).toBeInTheDocument()
  })

  it('renders chip for each active filter', () => {
    renderBar({
      filter: {
        ...DEFAULT_FILTER,
        awaitingMe: true,
        kinds: new Set(['nous-campaign']),
        statuses: new Set(['active']),
      },
    })
    expect(screen.getByLabelText(/filter: awaiting:me/i)).toBeInTheDocument()
    expect(
      screen.getByLabelText(/filter: kind:nous-campaign/i)
    ).toBeInTheDocument()
    expect(screen.getByLabelText(/filter: status:active/i)).toBeInTheDocument()
  })

  it('clicking + filter opens the disclosure', () => {
    renderBar()
    const summary = screen.getByText(/\+ filter/i)
    fireEvent.click(summary)
    const disclosure = screen.getByTestId('filter-disclosure')
    expect(disclosure.hasAttribute('open')).toBe(true)
  })

  it('disclosure shows STATUS / KIND / HOLDER section headings (no TAG)', () => {
    renderBar()
    fireEvent.click(screen.getByText(/\+ filter/i))
    expect(screen.getByText('STATUS')).toBeInTheDocument()
    expect(screen.getByText('KIND')).toBeInTheDocument()
    expect(screen.getByText('HOLDER')).toBeInTheDocument()
    // TAG was dropped in v0.2.0 — adapter-emitted tags are per-intent
    // metadata, not workspace-shared categories. They survive on
    // intents but not as a filter dimension.
    expect(screen.queryByText('TAG')).toBeNull()
  })

  it('clicking a status option calls onAdd("status", value)', () => {
    const { onAdd } = renderBar()
    fireEvent.click(screen.getByText(/\+ filter/i))
    fireEvent.click(screen.getByRole('menuitem', { name: 'active' }))
    expect(onAdd).toHaveBeenCalledWith('status', 'active')
  })

  it('clicking awaiting:me option calls onAdd("awaiting", "me")', () => {
    const { onAdd } = renderBar()
    fireEvent.click(screen.getByText(/\+ filter/i))
    fireEvent.click(screen.getByRole('menuitem', { name: 'awaiting:me' }))
    expect(onAdd).toHaveBeenCalledWith('awaiting', 'me')
  })

  it('clicking × on a chip calls onRemove', () => {
    const { onRemove } = renderBar({
      filter: {
        ...DEFAULT_FILTER,
        kinds: new Set(['nous-campaign']),
      },
    })
    fireEvent.click(
      screen.getByRole('button', { name: /remove filter kind:nous-campaign/i })
    )
    expect(onRemove).toHaveBeenCalledWith('kind', 'nous-campaign')
  })

  it('options for already-active filters are disabled', () => {
    renderBar({
      filter: { ...DEFAULT_FILTER, statuses: new Set(['active']) },
    })
    fireEvent.click(screen.getByText(/\+ filter/i))
    expect(screen.getByRole('menuitem', { name: 'active' })).toBeDisabled()
    expect(screen.getByRole('menuitem', { name: 'gated' })).not.toBeDisabled()
  })
})
