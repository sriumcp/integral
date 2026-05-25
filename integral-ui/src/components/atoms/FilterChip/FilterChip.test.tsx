import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { FilterChip } from './FilterChip'

describe('FilterChip', () => {
  it('renders key:value text', () => {
    render(<FilterChip filterKey="kind" value="nous-campaign" />)
    expect(screen.getByText('kind')).toBeInTheDocument()
    expect(screen.getByText('nous-campaign')).toBeInTheDocument()
    expect(screen.getByText(':')).toBeInTheDocument()
  })

  it('renders × button when onRemove is provided', () => {
    render(
      <FilterChip
        filterKey="status"
        value="active"
        onRemove={() => undefined}
      />
    )
    expect(
      screen.getByRole('button', { name: /remove filter status:active/i })
    ).toBeInTheDocument()
  })

  it('does NOT render × when onRemove is omitted', () => {
    render(<FilterChip filterKey="status" value="active" />)
    expect(
      screen.queryByRole('button', { name: /remove filter/i })
    ).toBeNull()
  })

  it('clicking × calls onRemove', () => {
    const onRemove = vi.fn()
    render(
      <FilterChip filterKey="kind" value="nous-campaign" onRemove={onRemove} />
    )
    fireEvent.click(
      screen.getByRole('button', { name: /remove filter kind:nous-campaign/i })
    )
    expect(onRemove).toHaveBeenCalledTimes(1)
  })

  it('exposes data-filter-key and data-filter-value attributes', () => {
    const { container } = render(
      <FilterChip filterKey="awaiting" value="me" />
    )
    const chip = container.querySelector('[data-filter-key="awaiting"]')
    expect(chip?.getAttribute('data-filter-value')).toBe('me')
  })

  it('aria-label describes the filter token', () => {
    render(<FilterChip filterKey="status" value="gated" />)
    expect(screen.getByLabelText(/filter: status:gated/i)).toBeInTheDocument()
  })
})
