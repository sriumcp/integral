/**
 * ShapingSurface — behavioral tests.
 *
 * Discipline: assert what the user sees + the data-* contract. Tests
 * exercise both fixture drafts (Nous fully-resolved, Coral partial) so
 * the resolved-vs-pending split is verified end-to-end.
 */

import { fireEvent, render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fixtureWorkspace, DRAFT_NOUS_ID, DRAFT_CORAL_ID } from '@/fixtures/workspace'
import { shapingFor } from '@/fixtures/shaping'
import type { SourceEntry } from '@/lib/sources'
import type { PreflightCheck } from '@/lib/nous-preflight'
import { ShapingSurface } from './ShapingSurface'

const REGISTRY: ReadonlyArray<SourceEntry> = [
  { id: 'fixture', label: 'demo fixture', kind: 'fixture' },
  { id: 'nous', label: 'nous campaigns', kind: 'adapter' },
]

/** Default ALL-OK preflight response. Tests that need the failing
 *  branch override this with mockFetchPreflight(checks). */
const DEFAULT_OK_CHECKS: PreflightCheck[] = [
  { name: 'repo-path-exists', status: 'ok' },
  { name: 'nous-cli-available', status: 'ok' },
  { name: 'writeback-target-writable', status: 'ok' },
  { name: 'run-id-not-in-use', status: 'ok' },
]

function mockFetchPreflight(checks: PreflightCheck[] = DEFAULT_OK_CHECKS) {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ checks }),
  } as Response)
}

beforeEach(() => {
  // The surface's usePreflight hook will fire after a 400ms debounce.
  // Stub fetch so tests don't see a real network call if they wait
  // long enough for the timer to fire.
  mockFetchPreflight()
})

afterEach(() => {
  vi.restoreAllMocks()
})

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

  // ─── A4: Nous writeback integration ────────────────────────────────────

  it('renders WritebackForm when the Nous draft has a writeback_template + registry is provided', () => {
    const intent = intentById(DRAFT_NOUS_ID)
    render(
      <ShapingSurface
        intent={intent}
        shape={shapingFor(intent.id)!}
        registry={REGISTRY}
        onCommit={() => {}}
        onWriteback={async () => ({ ok: true })}
        onBack={() => {}}
      />
    )
    // The form's section label "target" is rendered when active.
    expect(screen.getByLabelText(/target source/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/max iterations/i)).toBeInTheDocument()
  })

  it('does NOT render WritebackForm when registry is absent (backwards compat)', () => {
    const intent = intentById(DRAFT_NOUS_ID)
    render(
      <ShapingSurface
        intent={intent}
        shape={shapingFor(intent.id)!}
        onCommit={() => {}}
        onBack={() => {}}
      />
    )
    expect(screen.queryByLabelText(/target source/i)).not.toBeInTheDocument()
    // commit-to-active still enabled (in-memory-only path).
    expect(
      screen.getByRole('button', { name: /commit to active/i })
    ).not.toBeDisabled()
  })

  it('does NOT render WritebackForm for drafts without a writeback_template (Coral backwards compat)', () => {
    const intent = intentById(DRAFT_CORAL_ID)
    render(
      <ShapingSurface
        intent={intent}
        shape={shapingFor(intent.id)!}
        registry={REGISTRY}
        onCommit={() => {}}
        onWriteback={async () => ({ ok: true })}
        onBack={() => {}}
      />
    )
    // Coral fixture has no writeback_template — form is hidden even though
    // registry is provided.
    expect(screen.queryByLabelText(/target source/i)).not.toBeInTheDocument()
  })

  it('clicking commit fires onWriteback then onCommit (same-button: writeback + in-memory flip)', async () => {
    const user = userEvent.setup()
    const intent = intentById(DRAFT_NOUS_ID)
    const onCommit = vi.fn()
    const onWriteback = vi.fn().mockResolvedValue({ ok: true })
    render(
      <ShapingSurface
        intent={intent}
        shape={shapingFor(intent.id)!}
        registry={REGISTRY}
        onCommit={onCommit}
        onWriteback={onWriteback}
        onBack={() => {}}
      />
    )
    await user.click(screen.getByRole('button', { name: /commit to active/i }))
    await waitFor(() => {
      expect(onWriteback).toHaveBeenCalledTimes(1)
      expect(onCommit).toHaveBeenCalledWith(intent.id)
    })
    const arg = onWriteback.mock.calls[0]?.[0] as {
      intentId: string
      sourceId: string
      config: { max_iterations: number }
    }
    expect(arg.intentId).toBe(intent.id)
    expect(arg.sourceId).toBe('nous')
    expect(arg.config.max_iterations).toBe(5)
  })

  it('does NOT fire onCommit when writeback fails', async () => {
    const user = userEvent.setup()
    const intent = intentById(DRAFT_NOUS_ID)
    const onCommit = vi.fn()
    const onWriteback = vi
      .fn()
      .mockResolvedValue({ ok: false, error: 'overwrite refused' })
    render(
      <ShapingSurface
        intent={intent}
        shape={shapingFor(intent.id)!}
        registry={REGISTRY}
        onCommit={onCommit}
        onWriteback={onWriteback}
        onBack={() => {}}
      />
    )
    await user.click(screen.getByRole('button', { name: /commit to active/i }))
    await waitFor(() => {
      expect(onWriteback).toHaveBeenCalled()
      expect(screen.getByText(/overwrite refused/i)).toBeInTheDocument()
    })
    expect(onCommit).not.toHaveBeenCalled()
  })

  it('clicking commit fires onCommit when no writeback (backwards compat)', () => {
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

  it('disables commit while a writeback is in flight', async () => {
    const user = userEvent.setup()
    const intent = intentById(DRAFT_NOUS_ID)
    let resolve: (v: { ok: true }) => void = () => {}
    const onWriteback = vi.fn(
      () => new Promise<{ ok: true }>((r) => (resolve = r))
    )
    render(
      <ShapingSurface
        intent={intent}
        shape={shapingFor(intent.id)!}
        registry={REGISTRY}
        onCommit={() => {}}
        onWriteback={onWriteback}
        onBack={() => {}}
      />
    )
    const button = screen.getByRole('button', {
      name: /commit to active/i,
    }) as HTMLButtonElement
    await user.click(button)
    await waitFor(() => {
      expect(button.disabled).toBe(true)
    })
    resolve({ ok: true })
  })

  // ─── v0.1.5: pre-flight commit gate ────────────────────────────────────

  describe('preflight commit gate', () => {
    const FAILING_CHECKS: PreflightCheck[] = [
      {
        name: 'repo-path-exists',
        status: 'fail',
        message: 'path does not exist: /nonexistent',
      },
      { name: 'nous-cli-available', status: 'ok' },
      { name: 'writeback-target-writable', status: 'ok' },
      { name: 'run-id-not-in-use', status: 'warn' },
    ]

    it('disables the commit button when any preflight check fails', async () => {
      mockFetchPreflight(FAILING_CHECKS)
      const intent = intentById(DRAFT_NOUS_ID)
      render(
        <ShapingSurface
          intent={intent}
          shape={shapingFor(intent.id)!}
          registry={REGISTRY}
          onCommit={() => {}}
          onWriteback={async () => ({ ok: true })}
          onBack={() => {}}
        />
      )
      const button = screen.getByRole('button', {
        name: /commit to active/i,
      }) as HTMLButtonElement

      // Wait for the debounce + fetch to settle and the gate to kick in.
      await waitFor(() => {
        expect(button.disabled).toBe(true)
      })
    })

    it('renders failing-check count in the disabled commit reason', async () => {
      mockFetchPreflight(FAILING_CHECKS)
      const intent = intentById(DRAFT_NOUS_ID)
      render(
        <ShapingSurface
          intent={intent}
          shape={shapingFor(intent.id)!}
          registry={REGISTRY}
          onCommit={() => {}}
          onWriteback={async () => ({ ok: true })}
          onBack={() => {}}
        />
      )
      const button = screen.getByRole('button', {
        name: /commit to active/i,
      }) as HTMLButtonElement
      await waitFor(() => {
        expect(button.disabled).toBe(true)
      })
      // The button's aria-label or visible hint should mention the
      // failed pre-flight check count.
      const ariaLabel = button.getAttribute('aria-label') ?? ''
      const visibleText = button.textContent ?? ''
      const combined = `${ariaLabel} ${visibleText}`
      expect(combined).toMatch(/preflight|pre-flight|check/i)
    })

    it('renders fail indicator next to repo_path field on bad path', async () => {
      mockFetchPreflight(FAILING_CHECKS)
      const intent = intentById(DRAFT_NOUS_ID)
      render(
        <ShapingSurface
          intent={intent}
          shape={shapingFor(intent.id)!}
          registry={REGISTRY}
          onCommit={() => {}}
          onWriteback={async () => ({ ok: true })}
          onBack={() => {}}
        />
      )
      await waitFor(() => {
        expect(screen.getByTestId('preflight-repo-path-exists')).toHaveAttribute(
          'data-preflight-status',
          'fail'
        )
      })
    })

    it('warns (does not fail) on missing nous CLI — commit stays unblocked', async () => {
      const cliMissing: PreflightCheck[] = [
        { name: 'repo-path-exists', status: 'ok' },
        {
          name: 'nous-cli-available',
          status: 'warn',
          message: '`nous` CLI not on PATH',
        },
        { name: 'writeback-target-writable', status: 'ok' },
        { name: 'run-id-not-in-use', status: 'ok' },
      ]
      mockFetchPreflight(cliMissing)
      const intent = intentById(DRAFT_NOUS_ID)
      render(
        <ShapingSurface
          intent={intent}
          shape={shapingFor(intent.id)!}
          registry={REGISTRY}
          onCommit={() => {}}
          onWriteback={async () => ({ ok: true })}
          onBack={() => {}}
        />
      )
      // After preflight settles with only warns, button stays enabled.
      const button = screen.getByRole('button', {
        name: /commit to active/i,
      }) as HTMLButtonElement
      // Allow time for the debounce + fetch to settle without making the
      // assertion flaky — wait until the warn indicator appears, then
      // confirm the button isn't disabled.
      await waitFor(() => {
        expect(
          screen.getByTestId('preflight-nous-cli-available')
        ).toHaveAttribute('data-preflight-status', 'warn')
      })
      expect(button.disabled).toBe(false)
    })

    it('does not call /api/nous/preflight when no writeback active (Coral path)', async () => {
      mockFetchPreflight()
      const intent = intentById(DRAFT_CORAL_ID)
      render(
        <ShapingSurface
          intent={intent}
          shape={shapingFor(intent.id)!}
          registry={REGISTRY}
          onCommit={() => {}}
          onWriteback={async () => ({ ok: true })}
          onBack={() => {}}
        />
      )
      // Sleep long enough for the debounce to fire if it were going to.
      await act(async () => {
        await new Promise((r) => setTimeout(r, 500))
      })
      expect(globalThis.fetch).not.toHaveBeenCalled()
    })
  })

  it('shows the error message when writeback fails (e.g., 409 overwrite)', async () => {
    const user = userEvent.setup()
    const intent = intentById(DRAFT_NOUS_ID)
    const onWriteback = vi.fn().mockResolvedValue({
      ok: false,
      error: 'campaign-evaluator-aware-mutation-study.yaml already exists',
    })
    render(
      <ShapingSurface
        intent={intent}
        shape={shapingFor(intent.id)!}
        registry={REGISTRY}
        onCommit={() => {}}
        onWriteback={onWriteback}
        onBack={() => {}}
      />
    )
    await user.click(screen.getByRole('button', { name: /commit to active/i }))
    await waitFor(() => {
      expect(screen.getByText(/already exists/i)).toBeInTheDocument()
    })
  })
})
