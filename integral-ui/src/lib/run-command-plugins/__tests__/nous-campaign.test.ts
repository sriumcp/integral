/**
 * nous-campaign run-command plugin — tests.
 *
 * Plugin contract: given an Intent + IntentState + SourceEntry, return a
 * RunCommand if the campaign is in a state where running makes sense and
 * the intent id parses, otherwise null.
 *
 * Plan reference: integral-ui/.plan-a5.md § Mapping intent → command.
 */

import { describe, expect, it } from 'vitest'
import type { Intent, IntentState, Status } from '@/schema'
import type { SourceEntry } from '@/lib/sources'
import { nousCampaignRunCommand } from '../nous-campaign'

const PARTY = { id: 'sri', kind: 'human' as const, display_name: 'sri' }

const ADAPTER_SOURCE: SourceEntry = {
  id: 'nous',
  label: 'nous campaigns',
  kind: 'adapter',
  path: '/Users/sri/Documents/Projects/inference-sim',
}

function intentWithId(id: string): Intent {
  return {
    id,
    schema_version: '0.3.0',
    kind: 'nous-campaign',
    declaration: {
      title: 'demo',
      summary: 'a demo campaign',
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
    schema_version: '0.3.0',
    status,
    last_advanced_at: '2026-05-24T01:00:00Z',
    last_advanced_by: PARTY,
    history: [],
    external_anchors: [],
  }
}

// ─── Status gating ─────────────────────────────────────────────────────────

describe('nousCampaignRunCommand — status gating', () => {
  it.each(['draft', 'satisfied', 'revoked', 'abandoned'] as const)(
    'returns null for status=%s (running does not apply)',
    (status) => {
      const intent = intentWithId('nous:nous:run-foo')
      const out = nousCampaignRunCommand({
        intent,
        state: stateWith(intent.id, status),
        source: ADAPTER_SOURCE,
      })
      expect(out).toBeNull()
    }
  )

  it('returns a RunCommand for status=active', () => {
    const intent = intentWithId('nous:nous:run-foo')
    const out = nousCampaignRunCommand({
      intent,
      state: stateWith(intent.id, 'active'),
      source: ADAPTER_SOURCE,
    })
    expect(out).not.toBeNull()
  })

  it('returns a RunCommand for status=gated', () => {
    const intent = intentWithId('nous:nous:run-foo')
    const out = nousCampaignRunCommand({
      intent,
      state: stateWith(intent.id, 'gated'),
      source: ADAPTER_SOURCE,
    })
    expect(out).not.toBeNull()
  })
})

// ─── Intent id parsing ─────────────────────────────────────────────────────

describe('nousCampaignRunCommand — intent id parsing', () => {
  it('extracts the runId from a simple `nous:<slug>:<runId>` id', () => {
    const intent = intentWithId('nous:nous:run-foo')
    const out = nousCampaignRunCommand({
      intent,
      state: stateWith(intent.id, 'active'),
      source: ADAPTER_SOURCE,
    })
    expect(out?.argv).toEqual([
      'nous',
      'run',
      '--auto-approve',
      'campaign-run-foo.yaml',
    ])
  })

  it('handles slugs containing hyphens (path-derived slug)', () => {
    // FilesystemNousSource slugs paths like /Users/sri/.../inference-sim
    // → fs-Users-sri-Documents-Projects-inference-sim. The runId is
    // everything after the SECOND colon, regardless of slug shape.
    const intent = intentWithId(
      'nous:fs-Users-sri-Documents-Projects-inference-sim:my-campaign-001'
    )
    const out = nousCampaignRunCommand({
      intent,
      state: stateWith(intent.id, 'active'),
      source: ADAPTER_SOURCE,
    })
    expect(out?.argv[3]).toBe('campaign-my-campaign-001.yaml')
  })

  it('handles runIds containing hyphens', () => {
    const intent = intentWithId('nous:nous:2026-05-24-experiment-3')
    const out = nousCampaignRunCommand({
      intent,
      state: stateWith(intent.id, 'active'),
      source: ADAPTER_SOURCE,
    })
    expect(out?.argv[3]).toBe('campaign-2026-05-24-experiment-3.yaml')
  })

  it('returns null when the intent id is not in `nous:*:*` shape', () => {
    const intent = intentWithId('01HXYZ-NOUS-CAMPAIGN-001') // fixture-style id
    const out = nousCampaignRunCommand({
      intent,
      state: stateWith(intent.id, 'active'),
      source: ADAPTER_SOURCE,
    })
    expect(out).toBeNull()
  })

  it('returns null when the intent id has only one colon segment', () => {
    const intent = intentWithId('nous:onlyslug')
    const out = nousCampaignRunCommand({
      intent,
      state: stateWith(intent.id, 'active'),
      source: ADAPTER_SOURCE,
    })
    expect(out).toBeNull()
  })

  it('returns null when the prefix is not `nous`', () => {
    const intent = intentWithId('coral:nous:run-foo')
    const out = nousCampaignRunCommand({
      intent,
      state: stateWith(intent.id, 'active'),
      source: ADAPTER_SOURCE,
    })
    expect(out).toBeNull()
  })
})

// ─── Source path requirement ───────────────────────────────────────────────

describe('nousCampaignRunCommand — source.path required', () => {
  it('returns null when the source has no filesystem path', () => {
    const sourceNoPath: SourceEntry = {
      id: 'nous',
      label: 'nous',
      kind: 'adapter',
      // path intentionally absent
    }
    const intent = intentWithId('nous:nous:run-foo')
    const out = nousCampaignRunCommand({
      intent,
      state: stateWith(intent.id, 'active'),
      source: sourceNoPath,
    })
    expect(out).toBeNull()
  })
})

// ─── Full RunCommand shape ─────────────────────────────────────────────────

describe('nousCampaignRunCommand — RunCommand shape', () => {
  it('produces a complete RunCommand with cwd, argv, and oneLiner', () => {
    const intent = intentWithId('nous:nous:run-foo')
    const out = nousCampaignRunCommand({
      intent,
      state: stateWith(intent.id, 'active'),
      source: ADAPTER_SOURCE,
    })
    expect(out).toEqual({
      cwd: '/Users/sri/Documents/Projects/inference-sim',
      argv: ['nous', 'run', '--auto-approve', 'campaign-run-foo.yaml'],
      oneLiner:
        `cd '/Users/sri/Documents/Projects/inference-sim' && ` +
        `nous run --auto-approve campaign-run-foo.yaml`,
    })
  })

  it('shell-quotes the cwd when it contains spaces', () => {
    const sourceWithSpaces: SourceEntry = {
      id: 'nous',
      label: 'nous',
      kind: 'adapter',
      path: '/Users/sri/My Stuff/inference-sim',
    }
    const intent = intentWithId('nous:nous:run-foo')
    const out = nousCampaignRunCommand({
      intent,
      state: stateWith(intent.id, 'active'),
      source: sourceWithSpaces,
    })
    expect(out?.oneLiner).toContain(`cd '/Users/sri/My Stuff/inference-sim'`)
  })
})
