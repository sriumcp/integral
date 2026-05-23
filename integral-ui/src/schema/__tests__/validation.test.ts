/**
 * Schema falsification tests.
 *
 * The point of these tests is to make `intent-schema-v0.1.md` *falsifiable in
 * code*. We feed a workspace fixture covering all four kinds; if the schema
 * accepts shapes it shouldn't or rejects shapes it should accept, these tests
 * fail.
 *
 * When the schema goes to v0.2, these tests will likely break — by design.
 * Update the fixture, then update the test, then commit.
 */

import { describe, expect, it } from 'vitest'
import {
  EvidenceLinkSchema,
  IntentKindSchema,
  IntentSchema,
  IntentStateSchema,
  KnowledgeRefSchema,
  OperationKindSchema,
  OperationSchema,
  SCHEMA_VERSION,
  WorkspaceSchema,
  isIntentOfKind,
} from '@/schema'
import { fixtureWorkspace, sri, nousPlanner } from '@/fixtures/workspace'

describe('WorkspaceSchema — fixture validation', () => {
  it('accepts the v0.1 fixture covering all four intent kinds', () => {
    const result = WorkspaceSchema.safeParse(fixtureWorkspace)
    if (!result.success) {
      // surface the full error so CI output is actionable
      throw new Error(
        'WorkspaceSchema rejected the fixture:\n' +
          JSON.stringify(result.error.issues, null, 2)
      )
    }
    expect(result.success).toBe(true)
  })

  it('exercises every IntentKind in v0.1', () => {
    // Derived from the schema enum — when v0.2 adds a kind without adding it
    // to the fixture, this test fails. The prior hardcoded list could pass
    // a stale fixture against an extended schema.
    const kinds = new Set(fixtureWorkspace.intents.map((i) => i.kind))
    expect(kinds).toEqual(new Set(IntentKindSchema.options))
  })

  it('has one IntentState per Intent (1:1 invariant)', () => {
    const intentIds = new Set(fixtureWorkspace.intents.map((i) => i.id))
    const stateIntentIds = new Set(
      fixtureWorkspace.states.map((s) => s.intent_id)
    )
    expect(stateIntentIds).toEqual(intentIds)
  })
})

describe('IntentSchema — kind/extension consistency', () => {
  it('rejects an Intent where kind ≠ extension.kind', () => {
    const broken = {
      ...fixtureWorkspace.intents[0],
      kind: 'coral-optimization',
    }
    const result = IntentSchema.safeParse(broken)
    expect(result.success).toBe(false)
  })

  it('rejects an Intent with the wrong schema_version', () => {
    const broken = {
      ...fixtureWorkspace.intents[0],
      schema_version: '0.2.0',
    }
    const result = IntentSchema.safeParse(broken)
    expect(result.success).toBe(false)
  })

  it('pins SCHEMA_VERSION to the v0.1 literal', () => {
    // If this test ever needs updating, it's a v0.2 file — see
    // intent-schema-v0.2.md, not this one.
    expect(SCHEMA_VERSION).toBe('0.1.0')
  })

  it('IntentStateSchema rejects mismatched schema_version too', () => {
    const broken = {
      ...fixtureWorkspace.states[0],
      schema_version: '0.2.0',
    }
    const result = IntentStateSchema.safeParse(broken)
    expect(result.success).toBe(false)
  })
})

describe('Per-extension validation — schema-exhaustive falsification', () => {
  // Each per-kind extension should reject empty payloads. This is the
  // discriminated union doing its job: TypeExtensionSchema parses {kind: K}
  // alone only if K's extension has no required fields beyond `kind` —
  // which none of v0.1's extensions do.
  it('rejects every IntentKind with an empty extension payload', () => {
    for (const kind of IntentKindSchema.options) {
      const result = IntentSchema.safeParse({
        ...fixtureWorkspace.intents[0],
        kind,
        extension: { kind },
      })
      expect(result.success, `kind=${kind} with empty extension`).toBe(false)
    }
  })
})

describe('KnowledgeRef — discriminated by scope', () => {
  it('rejects an inherited KnowledgeRef without inherited_from', () => {
    const result = KnowledgeRefSchema.safeParse({
      scope: 'inherited',
      uri: 'file://x',
      role: 'principles',
      // inherited_from omitted
    })
    expect(result.success).toBe(false)
  })

  it('accepts an inherited KnowledgeRef with inherited_from', () => {
    const result = KnowledgeRefSchema.safeParse({
      scope: 'inherited',
      uri: 'file://x',
      role: 'principles',
      inherited_from: '01HXYZ-NOUS-CAMPAIGN-001',
    })
    expect(result.success).toBe(true)
  })

  it('accepts a non-inherited KnowledgeRef without inherited_from', () => {
    const result = KnowledgeRefSchema.safeParse({
      scope: 'campaign',
      uri: 'file://principles.md',
      role: 'principles',
    })
    expect(result.success).toBe(true)
  })

  // We do NOT test that a non-inherited KnowledgeRef with `inherited_from`
  // set is rejected at runtime — zod's default object parsing is permissive
  // about unknown keys (no `.strict()`). The discriminated *type* prevents
  // construction via TS, which is the contract that matters for surfaces
  // and adapters writing in TypeScript.
})

describe('EvidenceLinkSchema — cross-intent edges', () => {
  it('accepts the fixture evidence links (all IntentId-shaped to_intent)', () => {
    for (const e of fixtureWorkspace.evidence_links) {
      const result = EvidenceLinkSchema.safeParse(e)
      if (!result.success) {
        throw new Error(
          'EvidenceLinkSchema rejected ' +
            e.id +
            ':\n' +
            JSON.stringify(result.error.issues, null, 2)
        )
      }
      expect(result.success).toBe(true)
    }
  })

  it('accepts a link whose to_intent is an external Reference', () => {
    // The schema's union allows `to_intent` to be either an IntentId or a
    // typed Reference (for cites-external-work edges). The fixture only
    // exercises the IntentId branch; this test pins the Reference branch.
    const link = {
      id: 'edge-test-reference',
      from_intent: '01HXYZ-PAPER-CLAIM-019',
      to_intent: {
        kind: 'external' as const,
        target: 'https://example.com/smith-2024',
        note: 'Smith et al 2024',
      },
      relation: 'cites' as const,
      asserted_by: sri,
      asserted_at: '2026-05-19T14:30:00Z',
    }
    const result = EvidenceLinkSchema.safeParse(link)
    if (!result.success) {
      throw new Error(JSON.stringify(result.error.issues, null, 2))
    }
    expect(result.success).toBe(true)
  })
})

describe('IntentStateSchema — projection budget enforcement', () => {
  function stateWithProjection(zoom: 'overview' | 'structure' | 'detail', body: string) {
    return {
      ...fixtureWorkspace.states[0],
      projections: {
        [zoom]: {
          zoom,
          rendered_at: '2026-05-22T15:00:00Z',
          rendered_by: nousPlanner,
          body,
        },
      },
    }
  }

  it('accepts an overview projection at exactly 280 chars (the boundary)', () => {
    const result = IntentStateSchema.safeParse(stateWithProjection('overview', 'x'.repeat(280)))
    expect(result.success).toBe(true)
  })

  it('rejects an overview projection at 281 chars', () => {
    const result = IntentStateSchema.safeParse(stateWithProjection('overview', 'x'.repeat(281)))
    expect(result.success).toBe(false)
  })

  it('accepts a structure projection at exactly 800 chars', () => {
    const result = IntentStateSchema.safeParse(stateWithProjection('structure', 'x'.repeat(800)))
    expect(result.success).toBe(true)
  })

  it('rejects a structure projection at 801 chars', () => {
    const result = IntentStateSchema.safeParse(stateWithProjection('structure', 'x'.repeat(801)))
    expect(result.success).toBe(false)
  })

  it('accepts an arbitrarily large detail projection (unbounded)', () => {
    const result = IntentStateSchema.safeParse(stateWithProjection('detail', 'x'.repeat(100_000)))
    expect(result.success).toBe(true)
  })

  it('accepts an empty projection body (zero is valid)', () => {
    const result = IntentStateSchema.safeParse(stateWithProjection('overview', ''))
    expect(result.success).toBe(true)
  })
})

describe('WorkspaceSchema — 1:1 Intent↔IntentState bijection', () => {
  it('rejects a workspace with more states than intents', () => {
    const broken = {
      ...fixtureWorkspace,
      states: [...fixtureWorkspace.states, fixtureWorkspace.states[0]!],
    }
    const result = WorkspaceSchema.safeParse(broken)
    expect(result.success).toBe(false)
  })

  it('rejects a workspace with a state pointing at a nonexistent intent', () => {
    const broken = {
      ...fixtureWorkspace,
      states: [
        ...fixtureWorkspace.states.slice(0, -1),
        {
          ...fixtureWorkspace.states[fixtureWorkspace.states.length - 1]!,
          intent_id: 'nonexistent-intent-id',
        },
      ],
    }
    const result = WorkspaceSchema.safeParse(broken)
    expect(result.success).toBe(false)
  })

  it('rejects a workspace where two intents share the same state_ref', () => {
    const broken = {
      ...fixtureWorkspace,
      intents: [
        fixtureWorkspace.intents[0]!,
        {
          ...fixtureWorkspace.intents[1]!,
          state_ref: fixtureWorkspace.intents[0]!.state_ref,
        },
        ...fixtureWorkspace.intents.slice(2),
      ],
    }
    const result = WorkspaceSchema.safeParse(broken)
    expect(result.success).toBe(false)
  })
})

describe('OperationSchema — fixture coverage + per-kind falsification', () => {
  it('accepts every operation in the fixture', () => {
    for (const op of fixtureWorkspace.operations) {
      const result = OperationSchema.safeParse(op)
      if (!result.success) {
        throw new Error(
          `OperationSchema rejected fixture op ${op.id}:\n` +
            JSON.stringify(result.error.issues, null, 2)
        )
      }
    }
  })

  it('exposes 16 operation kinds (9 lifecycle + 7 shaping)', () => {
    expect(OperationKindSchema.options).toHaveLength(16)
  })

  it.each(OperationKindSchema.options)(
    'requires id, kind, at, by, target_intent_id, cause for kind %s',
    (kind) => {
      const result = OperationSchema.safeParse({
        kind,
        // missing all required base fields
      })
      expect(result.success).toBe(false)
    }
  )

  it('rejects an operation with an unknown kind', () => {
    const result = OperationSchema.safeParse({
      id: 'op-bogus',
      kind: 'destroy', // not a real op kind in v0.1
      at: '2026-05-22T16:00:00Z',
      by: sri,
      target_intent_id: 'some-intent',
      cause: 'invented op',
    })
    expect(result.success).toBe(false)
  })

  it('decompose requires a non-empty children array', () => {
    const op = {
      id: 'op-x',
      kind: 'decompose',
      at: '2026-05-22T16:00:00Z',
      by: sri,
      target_intent_id: 'parent',
      cause: 'attempt',
      children: [],
    }
    const result = OperationSchema.safeParse(op)
    expect(result.success).toBe(false)
  })

  it('reframe requires from_kind and to_kind', () => {
    const op = {
      id: 'op-x',
      kind: 'reframe',
      at: '2026-05-22T16:00:00Z',
      by: sri,
      target_intent_id: 'target',
      cause: 'rethink',
      // missing from_kind / to_kind
    }
    const result = OperationSchema.safeParse(op)
    expect(result.success).toBe(false)
  })

  it('WorkspaceSchema requires the operations field', () => {
    const broken = {
      intents: fixtureWorkspace.intents,
      states: fixtureWorkspace.states,
      evidence_links: fixtureWorkspace.evidence_links,
      // missing operations
    }
    const result = WorkspaceSchema.safeParse(broken)
    expect(result.success).toBe(false)
  })
})

describe('Provenance.source — v0.1.0 additive amendment', () => {
  it('accepts intents without provenance.source (back-compat)', () => {
    const intent = fixtureWorkspace.intents[0]!
    // Fixture intents don't currently carry provenance.source — the
    // loader decorates them at fetch time. Schema must accept either.
    const result = WorkspaceSchema.safeParse(fixtureWorkspace)
    expect(result.success).toBe(true)
    expect(intent.provenance.source).toBeUndefined()
  })

  it('accepts intents with provenance.source set to a non-empty string', () => {
    const intent = fixtureWorkspace.intents[0]!
    const decorated = {
      ...intent,
      provenance: { ...intent.provenance, source: 'nous' },
    }
    const result = IntentSchema.safeParse(decorated)
    expect(result.success).toBe(true)
  })

  it('rejects intents with provenance.source as an empty string', () => {
    const intent = fixtureWorkspace.intents[0]!
    const decorated = {
      ...intent,
      provenance: { ...intent.provenance, source: '' },
    }
    const result = IntentSchema.safeParse(decorated)
    // z.string().min(1) — empty strings are not valid sources.
    expect(result.success).toBe(false)
  })
})

describe('isIntentOfKind — type narrowing helper', () => {
  it('narrows a Nous campaign to its extension shape', () => {
    const intent = fixtureWorkspace.intents.find(
      (i) => i.kind === 'nous-campaign'
    )!
    if (isIntentOfKind(intent, 'nous-campaign')) {
      // TypeScript should now know `extension.research_question` exists
      expect(intent.extension.research_question.length).toBeGreaterThan(0)
    } else {
      throw new Error('expected nous-campaign')
    }
  })
})
