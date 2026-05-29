/**
 * Workspace diff — derives typed `Operation`s from a (prior, current) pair
 * of workspaces. Adapter-agnostic: any source-of-truth that can produce two
 * snapshots can use it (Nous adapter is the first consumer; Coral and GH
 * adapters will follow).
 *
 * Discipline:
 *  - Pure function. No filesystem, no time. Caller passes in `by` (the party
 *    emitting) and `at` (the timestamp to stamp on each op).
 *  - Deterministic op ids. Re-running the diff with the same inputs produces
 *    the same op ids — adapter refresh idempotency.
 *  - Specialized ops win over generic. `status -> satisfied` emits `satisfy`,
 *    not `advance`. `status -> gated` emits `gate`, etc.
 *  - Schema-exhaustive over `OperationKindSchema.options` — every kind has
 *    a documented disposition (emits-when, or doesn't-emit-because).
 */

import { describe, expect, it } from 'vitest'
import {
  IntentSchema,
  IntentStateSchema,
  OperationKindSchema,
  OperationSchema,
  WorkspaceSchema,
  type Intent,
  type IntentState,
  type Party,
  type Workspace,
} from '@/schema'
import {
  KIND_DISPOSITIONS,
  diffWorkspaces,
} from '../workspace-diff'

const PROJECTOR: Party = {
  id: 'nous-projector',
  kind: 'agent',
  display_name: 'nous-projector',
}

// ─── Synthetic intent + state builders ─────────────────────────────────────

let _idCounter = 0
function uniqueId(prefix: string): string {
  _idCounter += 1
  return `${prefix}-${_idCounter}`
}

function makeCampaign(opts: {
  id?: string
  status?: IntentState['status']
  children?: string[]
  title?: string
}): { intent: Intent; state: IntentState } {
  const id = opts.id ?? uniqueId('camp')
  const intent: Intent = {
    id,
    schema_version: '0.3.0',
    kind: 'nous-campaign',
    declaration: {
      title: opts.title ?? 'Test campaign',
      summary: 'A test campaign',
      success_criterion: '',
    },
    holder: { mode: 'jointly-held', parties: [PROJECTOR] },
    lifetime: { kind: 'campaign', started_at: '2026-05-23T08:00:00Z' },
    decomposition: { children: opts.children ?? [] },
    provenance: {
      declared_by: PROJECTOR,
      declared_at: '2026-05-23T08:00:00Z',
      motivated_by: [],
      source: 'nous',
    },
    knowledge_refs: [],
    tags: [],
    state_ref: `${id}-STATE`,
    extension: {
      kind: 'nous-campaign',
      research_question: 'is it real?',
      open_hypothesis_bundles: [],
      gate_status: { current_gate: 'none' },
    },
  }
  const state: IntentState = {
    id: `${id}-STATE`,
    intent_id: id,
    schema_version: '0.3.0',
    status: opts.status ?? 'active',
    last_advanced_at: '2026-05-23T08:00:00Z',
    last_advanced_by: PROJECTOR,
    history: [],
    external_anchors: [],
  }
  return { intent, state }
}

function makeIteration(opts: {
  id?: string
  status?: IntentState['status']
  parentId: string
}): { intent: Intent; state: IntentState } {
  const id = opts.id ?? uniqueId('iter')
  const intent: Intent = {
    id,
    schema_version: '0.3.0',
    kind: 'nous-iteration',
    declaration: {
      title: 'iter-1 · pilot',
      summary: 'iteration 1',
      success_criterion: '',
    },
    holder: { mode: 'jointly-held', parties: [PROJECTOR] },
    lifetime: { kind: 'discrete', started_at: '2026-05-23T08:00:00Z' },
    decomposition: { children: [] },
    provenance: {
      declared_by: PROJECTOR,
      declared_at: '2026-05-23T08:00:00Z',
      motivated_by: [],
      source: 'nous',
    },
    knowledge_refs: [],
    tags: ['pilot'],
    state_ref: `${id}-STATE`,
    extension: {
      kind: 'nous-iteration',
      iteration_number: 1,
      hypothesis_bundle: {
        h_main: {
          statement: 's',
          prediction: 'p',
          conditions: [],
        },
        h_ablation: [],
      },
    },
  }
  const state: IntentState = {
    id: `${id}-STATE`,
    intent_id: id,
    schema_version: '0.3.0',
    status: opts.status ?? 'active',
    last_advanced_at: '2026-05-23T08:00:00Z',
    last_advanced_by: PROJECTOR,
    history: [],
    external_anchors: [],
  }
  return { intent, state }
}

function workspaceOf(...pairs: { intent: Intent; state: IntentState }[]): Workspace {
  const intents = pairs.map((p) => p.intent)
  const states = pairs.map((p) => p.state)
  return {
    intents,
    states,
    evidence_links: [],
    operations: [],
  }
}

const FIXED_AT = '2026-05-23T09:00:00Z'

// ─── Schema-exhaustive disposition coverage ────────────────────────────────

describe('KIND_DISPOSITIONS — schema-exhaustive', () => {
  it.each(OperationKindSchema.options)(
    'every OperationKind has a documented disposition (%s)',
    (kind) => {
      // If a v0.2 schema bump adds an op kind, this fails until we add a
      // disposition entry — the falsification gate that keeps "fires when
      // X" / "never fires from this diff" complete.
      expect(KIND_DISPOSITIONS).toHaveProperty(kind)
      expect(KIND_DISPOSITIONS[kind].length).toBeGreaterThan(0)
    }
  )
})

// ─── Idempotency ───────────────────────────────────────────────────────────

describe('diffWorkspaces — idempotency', () => {
  it('emits no ops when prior === current', () => {
    const a = makeCampaign({ id: 'c1' })
    const ws = workspaceOf(a)
    const ops = diffWorkspaces({
      prior: ws,
      current: ws,
      by: PROJECTOR,
      at: FIXED_AT,
    })
    expect(ops).toEqual([])
  })

  it('produces the same op ids when called twice with the same inputs', () => {
    const camp = makeCampaign({ id: 'c1' })
    const iter = makeIteration({ id: 'i1', parentId: 'c1' })
    const prior = workspaceOf(camp)
    const camp2 = makeCampaign({ id: 'c1', children: ['i1'] })
    const current = workspaceOf(camp2, iter)
    const opsA = diffWorkspaces({ prior, current, by: PROJECTOR, at: FIXED_AT })
    const opsB = diffWorkspaces({ prior, current, by: PROJECTOR, at: FIXED_AT })
    expect(opsA.map((o) => o.id)).toEqual(opsB.map((o) => o.id))
  })
})

// ─── Declare ───────────────────────────────────────────────────────────────

describe('diffWorkspaces — declare', () => {
  it('emits declare for an intent that appears in current but not prior', () => {
    const camp = makeCampaign({ id: 'c1' })
    const iter = makeIteration({ id: 'i1', parentId: 'c1' })
    const prior = workspaceOf(camp)
    const current = workspaceOf(camp, iter)
    const ops = diffWorkspaces({ prior, current, by: PROJECTOR, at: FIXED_AT })
    const declares = ops.filter((o) => o.kind === 'declare')
    expect(declares.length).toBe(1)
    expect(declares[0]?.target_intent_id).toBe('i1')
  })

  it('does not emit declare for intents present in prior', () => {
    const camp = makeCampaign({ id: 'c1' })
    const ws = workspaceOf(camp)
    const ops = diffWorkspaces({
      prior: ws,
      current: ws,
      by: PROJECTOR,
      at: FIXED_AT,
    })
    expect(ops.filter((o) => o.kind === 'declare')).toEqual([])
  })
})

// ─── Decompose ─────────────────────────────────────────────────────────────

describe('diffWorkspaces — decompose', () => {
  it("emits decompose with the new children when a parent's children list grew", () => {
    const priorCamp = makeCampaign({ id: 'c1', children: [] })
    const newIter = makeIteration({ id: 'i1', parentId: 'c1' })
    const prior = workspaceOf(priorCamp)
    const currentCamp = makeCampaign({ id: 'c1', children: ['i1'] })
    const current = workspaceOf(currentCamp, newIter)

    const ops = diffWorkspaces({ prior, current, by: PROJECTOR, at: FIXED_AT })
    const decomposes = ops.filter((o) => o.kind === 'decompose')
    expect(decomposes.length).toBe(1)
    if (decomposes[0]?.kind === 'decompose') {
      expect(decomposes[0].target_intent_id).toBe('c1')
      expect(decomposes[0].children).toEqual(['i1'])
    }
  })

  it('emits decompose only with the *new* children, not the full list', () => {
    const priorCamp = makeCampaign({ id: 'c1', children: ['i1'] })
    const oldIter = makeIteration({ id: 'i1', parentId: 'c1' })
    const newIter = makeIteration({ id: 'i2', parentId: 'c1' })
    const prior = workspaceOf(priorCamp, oldIter)
    const currentCamp = makeCampaign({ id: 'c1', children: ['i1', 'i2'] })
    const current = workspaceOf(currentCamp, oldIter, newIter)

    const ops = diffWorkspaces({ prior, current, by: PROJECTOR, at: FIXED_AT })
    const decomposes = ops.filter((o) => o.kind === 'decompose')
    expect(decomposes.length).toBe(1)
    if (decomposes[0]?.kind === 'decompose') {
      expect(decomposes[0].children).toEqual(['i2'])
    }
  })

  it('does not emit decompose when children list is unchanged', () => {
    const camp = makeCampaign({ id: 'c1', children: ['i1'] })
    const iter = makeIteration({ id: 'i1', parentId: 'c1' })
    const ws = workspaceOf(camp, iter)
    const ops = diffWorkspaces({
      prior: ws,
      current: ws,
      by: PROJECTOR,
      at: FIXED_AT,
    })
    expect(ops.filter((o) => o.kind === 'decompose')).toEqual([])
  })

  it('does not emit decompose when the parent itself is newly declared', () => {
    // A new parent with children appears all at once. The declare on the
    // parent already implies its children list; emitting decompose on top
    // of declare would be redundant noise.
    const newCamp = makeCampaign({ id: 'c1', children: ['i1'] })
    const newIter = makeIteration({ id: 'i1', parentId: 'c1' })
    const prior = workspaceOf()
    const current = workspaceOf(newCamp, newIter)

    const ops = diffWorkspaces({ prior, current, by: PROJECTOR, at: FIXED_AT })
    expect(ops.filter((o) => o.kind === 'decompose')).toEqual([])
  })
})

// ─── Status transitions: specialized ops win ───────────────────────────────

describe('diffWorkspaces — status transitions', () => {
  it('emits satisfy (not advance) when status flips to satisfied', () => {
    const priorIter = makeIteration({ id: 'i1', parentId: 'c1', status: 'active' })
    const camp = makeCampaign({ id: 'c1', children: ['i1'] })
    const prior = workspaceOf(camp, priorIter)
    const currentIter = makeIteration({ id: 'i1', parentId: 'c1', status: 'satisfied' })
    const current = workspaceOf(camp, currentIter)

    const ops = diffWorkspaces({ prior, current, by: PROJECTOR, at: FIXED_AT })
    expect(ops.filter((o) => o.kind === 'satisfy').length).toBe(1)
    expect(ops.filter((o) => o.kind === 'advance').length).toBe(0)
  })

  it('emits gate (not advance) when status flips to gated', () => {
    const priorCamp = makeCampaign({ id: 'c1', status: 'active' })
    const currentCamp = makeCampaign({ id: 'c1', status: 'gated' })

    const ops = diffWorkspaces({
      prior: workspaceOf(priorCamp),
      current: workspaceOf(currentCamp),
      by: PROJECTOR,
      at: FIXED_AT,
    })
    expect(ops.filter((o) => o.kind === 'gate').length).toBe(1)
    expect(ops.filter((o) => o.kind === 'advance').length).toBe(0)
  })

  it('emits revoke (not advance) when status flips to revoked', () => {
    const priorIter = makeIteration({ id: 'i1', parentId: 'c1', status: 'active' })
    const camp = makeCampaign({ id: 'c1' })
    const prior = workspaceOf(camp, priorIter)
    const currentIter = makeIteration({ id: 'i1', parentId: 'c1', status: 'revoked' })
    const current = workspaceOf(camp, currentIter)

    const ops = diffWorkspaces({ prior, current, by: PROJECTOR, at: FIXED_AT })
    expect(ops.filter((o) => o.kind === 'revoke').length).toBe(1)
    expect(ops.filter((o) => o.kind === 'advance').length).toBe(0)
  })

  it('emits advance for a status change that is not a specialized one', () => {
    // draft → active is a meaningful transition but doesn't have a
    // specialized op. Catch-all `advance` carries the from/to.
    const priorCamp = makeCampaign({ id: 'c1', status: 'draft' })
    const currentCamp = makeCampaign({ id: 'c1', status: 'active' })

    const ops = diffWorkspaces({
      prior: workspaceOf(priorCamp),
      current: workspaceOf(currentCamp),
      by: PROJECTOR,
      at: FIXED_AT,
    })
    const advances = ops.filter((o) => o.kind === 'advance')
    expect(advances.length).toBe(1)
    if (advances[0]?.kind === 'advance') {
      expect(advances[0].from_status).toBe('draft')
      expect(advances[0].to_status).toBe('active')
    }
  })

  it('does not emit advance/satisfy/gate/revoke when status is unchanged', () => {
    const camp = makeCampaign({ id: 'c1', status: 'active' })
    const ops = diffWorkspaces({
      prior: workspaceOf(camp),
      current: workspaceOf(camp),
      by: PROJECTOR,
      at: FIXED_AT,
    })
    expect(
      ops.filter((o) =>
        ['advance', 'satisfy', 'gate', 'revoke'].includes(o.kind)
      )
    ).toEqual([])
  })

  it('does not emit a status op for an intent that is newly declared', () => {
    // A new intent has no prior status to compare; the declare on it is
    // the only event. Emitting advance(undefined → active) would be noise.
    const newCamp = makeCampaign({ id: 'c1', status: 'active' })
    const ops = diffWorkspaces({
      prior: workspaceOf(),
      current: workspaceOf(newCamp),
      by: PROJECTOR,
      at: FIXED_AT,
    })
    expect(
      ops.filter((o) =>
        ['advance', 'satisfy', 'gate', 'revoke'].includes(o.kind)
      )
    ).toEqual([])
  })
})

// ─── Output validates against schema ───────────────────────────────────────

describe('diffWorkspaces — schema validity', () => {
  it('every emitted operation validates against OperationSchema', () => {
    const priorCamp = makeCampaign({ id: 'c1', status: 'active', children: [] })
    const newIter = makeIteration({ id: 'i1', parentId: 'c1', status: 'satisfied' })
    const prior = workspaceOf(priorCamp)
    const currentCamp = makeCampaign({
      id: 'c1',
      status: 'satisfied',
      children: ['i1'],
    })
    const current = workspaceOf(currentCamp, newIter)

    const ops = diffWorkspaces({ prior, current, by: PROJECTOR, at: FIXED_AT })
    expect(ops.length).toBeGreaterThan(0)
    for (const op of ops) {
      const parsed = OperationSchema.safeParse(op)
      if (!parsed.success) {
        throw new Error(
          `op ${op.kind} rejected: ${JSON.stringify(parsed.error.issues, null, 2)}`
        )
      }
    }
  })

  it('the merged workspace (current.intents + diff ops) validates against WorkspaceSchema', () => {
    const priorCamp = makeCampaign({ id: 'c1', status: 'active', children: [] })
    const newIter = makeIteration({ id: 'i1', parentId: 'c1', status: 'satisfied' })
    const prior = workspaceOf(priorCamp)
    const currentCamp = makeCampaign({
      id: 'c1',
      status: 'active',
      children: ['i1'],
    })
    const current = workspaceOf(currentCamp, newIter)

    const ops = diffWorkspaces({ prior, current, by: PROJECTOR, at: FIXED_AT })
    const merged: Workspace = { ...current, operations: ops }
    const parsed = WorkspaceSchema.safeParse(merged)
    if (!parsed.success) {
      throw new Error(
        `workspace rejected: ${JSON.stringify(parsed.error.issues, null, 2)}`
      )
    }
    // Sanity: the intent + state we placed are still valid in isolation
    // (guards against future builders drifting out of schema).
    expect(IntentSchema.safeParse(currentCamp.intent).success).toBe(true)
    expect(IntentStateSchema.safeParse(newIter.state).success).toBe(true)
  })
})

// ─── Op id determinism ─────────────────────────────────────────────────────

describe('diffWorkspaces — op ids', () => {
  it('emits stable, deterministic ids based on (kind, target, at)', () => {
    const prior = workspaceOf()
    const newCamp = makeCampaign({ id: 'c1' })
    const current = workspaceOf(newCamp)

    const ops = diffWorkspaces({ prior, current, by: PROJECTOR, at: FIXED_AT })
    expect(ops[0]?.id).toContain('declare')
    expect(ops[0]?.id).toContain('c1')
  })
})
