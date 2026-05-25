import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { GroupSortControls } from './GroupSortControls'

describe('GroupSortControls', () => {
  it('renders nothing when visible=false', () => {
    const { container } = render(
      <GroupSortControls
        group="none"
        sort="awaiting-recency"
        visible={false}
        onChangeGroup={() => undefined}
        onChangeSort={() => undefined}
      />
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders both menus when visible=true', () => {
    render(
      <GroupSortControls
        group="none"
        sort="awaiting-recency"
        visible={true}
        onChangeGroup={() => undefined}
        onChangeSort={() => undefined}
      />
    )
    expect(screen.getByTestId('group-menu')).toBeInTheDocument()
    expect(screen.getByTestId('sort-menu')).toBeInTheDocument()
  })

  it('shows current group + sort labels in summaries', () => {
    render(
      <GroupSortControls
        group="source"
        sort="recency"
        visible={true}
        onChangeGroup={() => undefined}
        onChangeSort={() => undefined}
      />
    )
    const groupSummary = screen
      .getByTestId('group-menu')
      .querySelector('summary')
    const sortSummary = screen
      .getByTestId('sort-menu')
      .querySelector('summary')
    expect(groupSummary?.textContent).toContain('group:')
    expect(groupSummary?.textContent).toContain('source')
    expect(sortSummary?.textContent).toContain('sort:')
    expect(sortSummary?.textContent).toContain('recent')
  })

  it('default labels match design (none / awaiting,recent)', () => {
    render(
      <GroupSortControls
        group="none"
        sort="awaiting-recency"
        visible={true}
        onChangeGroup={() => undefined}
        onChangeSort={() => undefined}
      />
    )
    const groupSummary = screen
      .getByTestId('group-menu')
      .querySelector('summary')
    const sortSummary = screen
      .getByTestId('sort-menu')
      .querySelector('summary')
    expect(groupSummary?.textContent).toContain('none')
    expect(sortSummary?.textContent).toContain('awaiting,recent')
  })

  it('clicking a group option calls onChangeGroup', () => {
    const onChangeGroup = vi.fn()
    render(
      <GroupSortControls
        group="none"
        sort="awaiting-recency"
        visible={true}
        onChangeGroup={onChangeGroup}
        onChangeSort={() => undefined}
      />
    )
    // Open group menu, click "kind"
    fireEvent.click(screen.getByTestId('group-menu').querySelector('summary')!)
    fireEvent.click(screen.getByRole('menuitem', { name: 'kind' }))
    expect(onChangeGroup).toHaveBeenCalledWith('kind')
  })

  it('clicking a sort option calls onChangeSort', () => {
    const onChangeSort = vi.fn()
    render(
      <GroupSortControls
        group="none"
        sort="awaiting-recency"
        visible={true}
        onChangeGroup={() => undefined}
        onChangeSort={onChangeSort}
      />
    )
    fireEvent.click(screen.getByTestId('sort-menu').querySelector('summary')!)
    fireEvent.click(screen.getByRole('menuitem', { name: 'a-z' }))
    expect(onChangeSort).toHaveBeenCalledWith('alphabetical')
  })
})
