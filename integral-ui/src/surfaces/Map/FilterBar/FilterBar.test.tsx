import { describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, fireEvent } from '@testing-library/react'
import { FilterBar } from './FilterBar'
import { DEFAULT_FILTER, type FilterQuery } from '@/lib/filter-query'

const NOOP_TAGS: string[] = []

function renderBar(opts: {
  filter?: FilterQuery
  availableTags?: string[]
  onAdd?: (key: string, value: string) => void
  onRemove?: (key: string, value: string) => void
} = {}) {
  const onAdd = vi.fn(opts.onAdd ?? (() => undefined))
  const onRemove = vi.fn(opts.onRemove ?? (() => undefined))
  render(
    <FilterBar
      filter={opts.filter ?? DEFAULT_FILTER}
      availableTags={opts.availableTags ?? NOOP_TAGS}
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

  it('disclosure shows category headings', () => {
    renderBar()
    fireEvent.click(screen.getByText(/\+ filter/i))
    expect(screen.getByText('STATUS')).toBeInTheDocument()
    expect(screen.getByText('KIND')).toBeInTheDocument()
    expect(screen.getByText('HOLDER')).toBeInTheDocument()
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

  it('TAG section is hidden when availableTags is empty', () => {
    renderBar({ availableTags: [] })
    fireEvent.click(screen.getByText(/\+ filter/i))
    expect(screen.queryByText('TAG')).toBeNull()
  })

  it('TAG section is shown when availableTags is non-empty', () => {
    cleanup()
    renderBar({ availableTags: ['urgent', 'blocked'] })
    fireEvent.click(screen.getByText(/\+ filter/i))
    expect(screen.getByText('TAG')).toBeInTheDocument()
    expect(
      screen.getByRole('menuitem', { name: 'urgent' })
    ).toBeInTheDocument()
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
