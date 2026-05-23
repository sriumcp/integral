/**
 * ShapingSurface — behavioral tests.
 *
 * Discipline: assert what the user sees + the data-* contract. Tests
 * exercise both fixture drafts (Nous fully-resolved, Coral partial) so
 * the resolved-vs-pending split is verified end-to-end.
 */

import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { fixtureWorkspace, DRAFT_NOUS_ID, DRAFT_CORAL_ID } from '@/fixtures/workspace'
import { shapingFor } from '@/fixtures/shaping'
import { ShapingSurface } from './ShapingSurface'

function intentById(id: string) {
  const found = fixtureWorkspace.intents.find((i) => i.id === id)
  if (!found) throw new Error(`fixture missing ${id}`)
  return found
}

describe('ShapingSurface', () => {
  it('renders both panes (dialog + draft) and the title', () => {
    const intent = intentById(DRAFT_NOUS_ID)
    render(
      <ShapingSurface
        intent={intent}
        shape={shapingFor(intent.id)!}
        onCommit={() => {}}
        onBack={() => {}}
      />
    )
    expect(screen.getByRole('heading', { name: /shaping dialog/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /intent draft/i })).toBeInTheDocument()
    expect(screen.getByText('evaluator-aware mutation study')).toBeInTheDocument()
  })

  it('renders dialog turns from the fixture', () => {
    const intent = intentById(DRAFT_NOUS_ID)
    render(
      <ShapingSurface
        intent={intent}
        shape={shapingFor(intent.id)!}
        onCommit={() => {}}
        onBack={() => {}}
      />
    )
    // Dialog body text — the agent's "confirms nous-campaign" turn appears
    // only in the dialog (no overlap with the right-pane draft).
    expect(screen.getByText(/confirms nous-campaign/)).toBeInTheDocument()
    expect(screen.getByText(/v3 methodology, plus the principles ledger/)).toBeInTheDocument()
  })

  it('all fields resolved → commit-to-active button is enabled', () => {
    const intent = intentById(DRAFT_NOUS_ID)
    render(
      <ShapingSurface
        intent={intent}
        shape={shapingFor(intent.id)!}
        onCommit={() => {}}
        onBack={() => {}}
      />
    )
    const commit = screen.getByRole('button', { name: /commit to active/i })
    expect(commit).not.toBeDisabled()
    // No pending chips should render.
    expect(screen.queryByText(/⚠ pending/)).not.toBeInTheDocument()
  })

  it('partial resolution → commit-to-active disabled and pending chips render', () => {
    const intent = intentById(DRAFT_CORAL_ID)
    render(
      <ShapingSurface
        intent={intent}
        shape={shapingFor(intent.id)!}
        onCommit={() => {}}
        onBack={() => {}}
      />
    )
    const commit = screen.getByRole('button', { name: /commit to active/i })
    expect(commit).toBeDisabled()
    // Coral draft has summary, success_criterion, and scoring_function_ref pending.
    const pendingChips = screen.getAllByText(/⚠ pending/)
    expect(pendingChips.length).toBeGreaterThanOrEqual(3)
  })

  it('clicking commit fires onCommit when enabled', () => {
    const intent = intentById(DRAFT_NOUS_ID)
    const onCommit = vi.fn()
    render(
      <ShapingSurface
        intent={intent}
        shape={shapingFor(intent.id)!}
        onCommit={onCommit}
        onBack={() => {}}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /commit to active/i }))
    expect(onCommit).toHaveBeenCalledWith(intent.id)
  })

  it('clicking commit does not fire onCommit when disabled', () => {
    const intent = intentById(DRAFT_CORAL_ID)
    const onCommit = vi.fn()
    render(
      <ShapingSurface
        intent={intent}
        shape={shapingFor(intent.id)!}
        onCommit={onCommit}
        onBack={() => {}}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /commit to active/i }))
    expect(onCommit).not.toHaveBeenCalled()
  })

  it('renders all 4 restructure buttons inert with v0.2 tooltip', () => {
    const intent = intentById(DRAFT_NOUS_ID)
    render(
      <ShapingSurface
        intent={intent}
        shape={shapingFor(intent.id)!}
        onCommit={() => {}}
        onBack={() => {}}
      />
    )
    for (const op of ['decompose', 'fork', 'merge', 'reframe']) {
      const btn = screen.getByRole('button', { name: new RegExp(op, 'i') })
      expect(btn.getAttribute('title')).toMatch(/v0\.2/)
    }
  })

  it('clicking a restructure button does not crash and does not fire commit', () => {
    const intent = intentById(DRAFT_NOUS_ID)
    const onCommit = vi.fn()
    const consoleInfo = vi.spyOn(console, 'info').mockImplementation(() => {})
    render(
      <ShapingSurface
        intent={intent}
        shape={shapingFor(intent.id)!}
        onCommit={onCommit}
        onBack={() => {}}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /reframe/i }))
    expect(onCommit).not.toHaveBeenCalled()
    expect(consoleInfo).toHaveBeenCalledWith(expect.stringContaining('reframe'))
    consoleInfo.mockRestore()
  })

  it('exposes data-surface="shaping" on the root', () => {
    const intent = intentById(DRAFT_NOUS_ID)
    const { container } = render(
      <ShapingSurface
        intent={intent}
        shape={shapingFor(intent.id)!}
        onCommit={() => {}}
        onBack={() => {}}
      />
    )
    const root = container.firstElementChild as HTMLElement
    expect(root.getAttribute('data-surface')).toBe('shaping')
  })

  it('clicking the back button fires onBack', () => {
    const intent = intentById(DRAFT_NOUS_ID)
    const onBack = vi.fn()
    render(
      <ShapingSurface
        intent={intent}
        shape={shapingFor(intent.id)!}
        onCommit={() => {}}
        onBack={onBack}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /^← map$/ }))
    expect(onBack).toHaveBeenCalled()
  })
})
