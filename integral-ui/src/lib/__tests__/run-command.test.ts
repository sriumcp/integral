/**
 * run-command dispatcher tests.
 *
 * The dispatcher is pure: given an intent + state + registry + plugin map,
 * return the typed RunCommand or null. The plugin layer (per-kind) is
 * tested separately in `run-command-plugins/__tests__/`.
 *
 * Plan reference: integral-ui/.plan-a5.md § TDD plan — `run-command.ts (pure)`.
 */

import { describe, expect, it } from 'vitest'
import type { Intent, IntentState } from '@/schema'
import type { SourceEntry } from '@/lib/sources'
import {
  runCommandFor,
  shellQuote,
  composeOneLiner,
  type RunCommand,
  type RunCommandPlugin,
  type RunCommandRegistry,
} from '../run-command'

// ─── Fixtures ──────────────────────────────────────────────────────────────

const PARTY = { id: 'sri', kind: 'human' as const, display_name: 'sri' }

const nousAdapterSource: SourceEntry = {
  id: 'nous',
  label: 'nous campaigns',
  kind: 'adapter',
  path: '/Users/sri/Documents/Projects/inference-sim',
}

function nousIntent(opts?: {
  id?: string
  source?: string
}): Intent {
  return {
    id: opts?.id ?? 'nous:nous:run-foo',
    schema_version: '0.1.0',
    kind: 'nous-campaign',
    declaration: {
      title: 'demo',
      summary: 'a demo campaign',
      success_criterion: 'something measurable',
    },
    holder: { mode: 'jointly-held', parties: [PARTY] },
    lifetime: { kind: 'campaign', started_at: '2026-05-24T00:00:00Z' },
    decomposition: { children: [] },
    provenance: {
      declared_by: PARTY,
      declared_at: '2026-05-24T00:00:00Z',
      motivated_by: [],
      source: opts?.source ?? 'nous',
    },
    knowledge_refs: [],
    tags: [],
    state_ref: (opts?.id ?? 'nous:nous:run-foo') + '-STATE',
    extension: {
      kind: 'nous-campaign',
      research_question: 'is this a demo?',
      open_hypothesis_bundles: [],
      gate_status: { current_gate: 'none' },
    },
  }
}

function activeState(intentId: string): IntentState {
  return {
    id: `${intentId}-STATE`,
    intent_id: intentId,
    schema_version: '0.1.0',
    status: 'active',
    last_advanced_at: '2026-05-24T01:00:00Z',
    last_advanced_by: PARTY,
    history: [],
    external_anchors: [],
  }
}

const stubPlugin: RunCommandPlugin = ({ source }) => ({
  cwd: source.path ?? '/unknown',
  argv: ['echo', 'stub'],
  oneLiner: `cd '${source.path}' && echo stub`,
})

const STUB_REGISTRY: RunCommandRegistry = {
  'nous-campaign': stubPlugin,
}

// ─── Dispatcher behavior ───────────────────────────────────────────────────

describe('runCommandFor — dispatcher', () => {
  it('returns null when no plugin is registered for the intent kind', () => {
    const intent = nousIntent()
    const out = runCommandFor({
      intent,
      state: activeState(intent.id),
      registry: [nousAdapterSource],
      plugins: {}, // no plugins
    })
    expect(out).toBeNull()
  })

  it('returns null when the intent has no provenance.source', () => {
    const intent = nousIntent()
    // strip the source field after construction (provenance.source is optional)
    const noSource: Intent = {
      ...intent,
      provenance: { ...intent.provenance, source: undefined },
    }
    const out = runCommandFor({
      intent: noSource,
      state: activeState(intent.id),
      registry: [nousAdapterSource],
      plugins: STUB_REGISTRY,
    })
    expect(out).toBeNull()
  })

  it('returns null when the source id is not in the registry', () => {
    const intent = nousIntent({ source: 'unknown-source' })
    const out = runCommandFor({
      intent,
      state: activeState(intent.id),
      registry: [nousAdapterSource],
      plugins: STUB_REGISTRY,
    })
    expect(out).toBeNull()
  })

  it('invokes the plugin and returns its RunCommand when all conditions met', () => {
    const intent = nousIntent()
    const out = runCommandFor({
      intent,
      state: activeState(intent.id),
      registry: [nousAdapterSource],
      plugins: STUB_REGISTRY,
    })
    expect(out).toEqual<RunCommand>({
      cwd: '/Users/sri/Documents/Projects/inference-sim',
      argv: ['echo', 'stub'],
      oneLiner: `cd '/Users/sri/Documents/Projects/inference-sim' && echo stub`,
    })
  })

  it('passes the plugin null through when the plugin opts out', () => {
    const intent = nousIntent()
    const optingOut: RunCommandPlugin = () => null
    const out = runCommandFor({
      intent,
      state: activeState(intent.id),
      registry: [nousAdapterSource],
      plugins: { 'nous-campaign': optingOut },
    })
    expect(out).toBeNull()
  })
})

// ─── shellQuote ─────────────────────────────────────────────────────────────

describe('shellQuote', () => {
  it('wraps simple paths in single quotes', () => {
    expect(shellQuote('/Users/sri/inference-sim')).toBe(
      `'/Users/sri/inference-sim'`
    )
  })

  it('preserves spaces inside the quotes', () => {
    expect(shellQuote('/Users/sri/My Stuff/inference-sim')).toBe(
      `'/Users/sri/My Stuff/inference-sim'`
    )
  })

  it("escapes embedded single quotes via the '\\'' POSIX trick", () => {
    expect(shellQuote(`it's mine`)).toBe(`'it'\\''s mine'`)
  })

  it('handles strings with multiple single quotes', () => {
    expect(shellQuote(`a'b'c`)).toBe(`'a'\\''b'\\''c'`)
  })

  it('handles empty strings', () => {
    expect(shellQuote('')).toBe(`''`)
  })
})

// ─── composeOneLiner ────────────────────────────────────────────────────────

describe('composeOneLiner', () => {
  it('joins cd <quoted-cwd> && <space-joined argv>', () => {
    const out = composeOneLiner({
      cwd: '/Users/sri/inference-sim',
      argv: ['nous', 'run', '--auto-approve', 'campaign-foo.yaml'],
    })
    expect(out).toBe(
      `cd '/Users/sri/inference-sim' && nous run --auto-approve campaign-foo.yaml`
    )
  })

  it('quotes individual argv items containing spaces', () => {
    const out = composeOneLiner({
      cwd: '/tmp',
      argv: ['nous', 'run', '--name', 'campaign with spaces.yaml'],
    })
    expect(out).toBe(
      `cd '/tmp' && nous run --name 'campaign with spaces.yaml'`
    )
  })

  it('does not quote argv items that are simple tokens', () => {
    const out = composeOneLiner({
      cwd: '/tmp',
      argv: ['nous', 'run', '--auto-approve', 'campaign-foo.yaml'],
    })
    // Each simple token unquoted to keep the line readable.
    expect(out).not.toContain(`'nous'`)
    expect(out).not.toContain(`'--auto-approve'`)
  })
})
