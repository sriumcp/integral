/**
 * RunCommand — chrome panel that surfaces the exact `nous run` invocation
 * for a Nous campaign whose state is `active` or `gated`.
 *
 * Behavioral tests via React Testing Library; no real spawning, no real
 * clipboard. The plugin layer is tested separately. These tests mock
 * navigator.clipboard.writeText.
 *
 * Plan reference: integral-ui/.plan-a5.md § TDD plan — RunCommand.tsx (RTL).
 */

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Intent, IntentState, Status } from '@/schema'
import type { SourceEntry } from '@/lib/sources'
import { fixtureWorkspace } from '@/fixtures/workspace'
import { RunCommand } from './RunCommand'

const PARTY = { id: 'sri', kind: 'human' as const, display_name: 'sri' }

const ADAPTER_SOURCE: SourceEntry = {
  id: 'nous',
  label: 'nous',
  kind: 'adapter',
  path: '/Users/sri/Documents/Projects/inference-sim',
}

function nousIntent(id: string = 'nous:nous:run-foo'): Intent {
  return {
    id,
    schema_version: '0.1.0',
    kind: 'nous-campaign',
    declaration: {
      title: 'demo',
      summary: 'demo',
      success_criterion: 'measurable',
    },
    holder: { mode: 'jointly-held', parties: [PARTY] },
    lifetime: { kind: 'campaign', started_at: '2026-05-24T00:00:00Z' },
    decomposition: { children: [] },
    provenance: {
      declared_by: PARTY,
      declared_at: '2026-05-24T00:00:00Z',
      motivated_by: [],
      source: 'nous',
    },
    knowledge_refs: [],
    tags: [],
    state_ref: `${id}-STATE`,
    extension: {
      kind: 'nous-campaign',
      research_question: 'is this a demo?',
      open_hypothesis_bundles: [],
      gate_status: { current_gate: 'none' },
    },
  }
}

function stateWith(intentId: string, status: Status): IntentState {
  return {
    id: `${intentId}-STATE`,
    intent_id: intentId,
    schema_version: '0.1.0',
    status,
    last_advanced_at: '2026-05-24T01:00:00Z',
    last_advanced_by: PARTY,
    history: [],
    external_anchors: [],
  }
}

// Mock navigator.clipboard. JSDOM provides a partial Navigator stub but no
// clipboard property by default; we install one so writeText is callable
// and observable from tests.
const writeTextMock = vi.fn(async () => undefined)

beforeEach(() => {
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: writeTextMock },
    configurable: true,
  })
  writeTextMock.mockClear()
})

afterEach(() => {
  vi.useRealTimers()
})

// ─── Visibility ────────────────────────────────────────────────────────────

describe('RunCommand — visibility', () => {
  it('renders nothing when the dispatcher returns null (kind/state mismatch)', () => {
    const intent = nousIntent()
    const { container } = render(
      <RunCommand
        intent={intent}
        state={stateWith(intent.id, 'satisfied')}
        registry={[ADAPTER_SOURCE]}
      />
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when intent kind is not nous-campaign', () => {
    // Pull a non-Nous intent from the falsification fixture rather than
    // hand-constructing one (paper-campaign requires draft + citation
    // anchors that aren't load-bearing for this test).
    const nonNous = fixtureWorkspace.intents.find(
      (i) => i.kind !== 'nous-campaign'
    )!
    const nonNousState = fixtureWorkspace.states.find(
      (s) => s.intent_id === nonNous.id
    )!
    const { container } = render(
      <RunCommand
        intent={nonNous}
        state={nonNousState}
        registry={[ADAPTER_SOURCE]}
      />
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when source is missing from the registry', () => {
    const intent = nousIntent()
    const { container } = render(
      <RunCommand
        intent={intent}
        state={stateWith(intent.id, 'active')}
        registry={[]} // empty registry
      />
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders the panel for an active Nous campaign with a path-bearing source', () => {
    const intent = nousIntent()
    render(
      <RunCommand
        intent={intent}
        state={stateWith(intent.id, 'active')}
        registry={[ADAPTER_SOURCE]}
      />
    )
    expect(screen.getByTestId('run-command-panel')).toBeInTheDocument()
  })

  it('renders the panel for a gated Nous campaign', () => {
    const intent = nousIntent()
    render(
      <RunCommand
        intent={intent}
        state={stateWith(intent.id, 'gated')}
        registry={[ADAPTER_SOURCE]}
      />
    )
    expect(screen.getByTestId('run-command-panel')).toBeInTheDocument()
  })
})

// ─── Content ───────────────────────────────────────────────────────────────

describe('RunCommand — content', () => {
  it('shows the cwd and the nous argv', () => {
    const intent = nousIntent()
    render(
      <RunCommand
        intent={intent}
        state={stateWith(intent.id, 'active')}
        registry={[ADAPTER_SOURCE]}
      />
    )
    expect(
      screen.getByText(/\/Users\/sri\/Documents\/Projects\/inference-sim/)
    ).toBeInTheDocument()
    expect(
      screen.getByText(/nous run --auto-approve campaign-run-foo\.yaml/)
    ).toBeInTheDocument()
  })

  it('includes a hint nudging the user to refresh after running', () => {
    const intent = nousIntent()
    render(
      <RunCommand
        intent={intent}
        state={stateWith(intent.id, 'active')}
        registry={[ADAPTER_SOURCE]}
      />
    )
    // Hint references "refresh" so screen-reader users have continuity.
    expect(
      screen.getByText(/refresh/i)
    ).toBeInTheDocument()
  })
})

// ─── Copy ──────────────────────────────────────────────────────────────────

describe('RunCommand — copy interaction', () => {
  it('copies the one-liner to the clipboard on button click', async () => {
    // (no userEvent.setup; using userEvent directly per project convention)
    const intent = nousIntent()
    render(
      <RunCommand
        intent={intent}
        state={stateWith(intent.id, 'active')}
        registry={[ADAPTER_SOURCE]}
      />
    )
    await userEvent.click(screen.getByRole('button', { name: /copy/i }))
    expect(writeTextMock).toHaveBeenCalledTimes(1)
    expect(writeTextMock).toHaveBeenCalledWith(
      `cd '/Users/sri/Documents/Projects/inference-sim' && ` +
        `nous run --auto-approve campaign-run-foo.yaml`
    )
  })

  it('flips the button to "copied ✓" briefly after a successful copy', async () => {
    // (no userEvent.setup; using userEvent directly per project convention)
    const intent = nousIntent()
    render(
      <RunCommand
        intent={intent}
        state={stateWith(intent.id, 'active')}
        registry={[ADAPTER_SOURCE]}
      />
    )
    const btn = screen.getByRole('button', { name: /copy/i })
    await userEvent.click(btn)
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /copied/i })
      ).toBeInTheDocument()
    })
  })

  it('does not throw when the clipboard API rejects', async () => {
    writeTextMock.mockRejectedValueOnce(new Error('clipboard denied'))
    // (no userEvent.setup; using userEvent directly per project convention)
    const intent = nousIntent()
    render(
      <RunCommand
        intent={intent}
        state={stateWith(intent.id, 'active')}
        registry={[ADAPTER_SOURCE]}
      />
    )
    // Should not throw or unmount; panel stays.
    await userEvent.click(screen.getByRole('button', { name: /copy/i }))
    expect(screen.getByTestId('run-command-panel')).toBeInTheDocument()
  })
})
