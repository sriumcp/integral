/**
 * Workspace diff — derives typed `Operation`s from a (prior, current) pair
 * of `Workspace`s. Adapter-agnostic engine; the Nous adapter is the first
 * consumer (Phase 4); Coral and GH issue adapters will reuse it.
 *
 * Discipline:
 *  - Pure function. No filesystem, no time-of-day. Caller passes `by` and
 *    `at`; the diff stamps every emitted op with these.
 *  - Deterministic op ids — re-running with the same inputs produces the
 *    same ids. Adapters refresh idempotently.
 *  - Specialized ops win over generic. `status -> satisfied` emits
 *    `satisfy`, not `advance`. Same for `gate` / `revoke`.
 *  - Schema-exhaustive over `OperationKindSchema.options` via the
 *    `KIND_DISPOSITIONS` map. Every kind has a documented "fires when X"
 *    rule (or "doesn't fire from this diff because Y") so a v0.2 op kind
 *    addition fails the unit test until acknowledged.
 */

import type {
  Operation,
  OperationKind,
  Party,
  Status,
  Workspace,
} from '../schema'

// ─── Schema-exhaustive disposition table ───────────────────────────────────

/**
 * For every `OperationKind`, a short string describing whether and when
 * `diffWorkspaces` emits it. The schema-exhaustive test asserts every kind
 * has an entry; if a v0.2 kind is added without a disposition, the test
 * fails until we decide: emits-when, or doesn't-emit-because.
 */
export const KIND_DISPOSITIONS: Record<OperationKind, string> = {
  // Lifecycle — the diff fires these.
  declare: 'fires when an intent appears in current but not in prior',
  refine:
    'reserved (v0.1 skip): would fire on declaration field changes; rare in adapter output',
  delegate:
    'reserved (v0.1 skip): would fire on holder.parties changes; rare in adapter output',
  advance:
    'fires on status change that is not satisfied/gated/revoked (catch-all)',
  gate: 'fires when status flips to "gated" (specialization of advance)',
  'propose-transition':
    'never (no proposal mechanism in adapter-driven sources)',
  'accept-proposal':
    'never (no proposal mechanism in adapter-driven sources)',
  satisfy: 'fires when status flips to "satisfied" (specialization of advance)',
  revoke: 'fires when status flips to "revoked" (specialization of advance)',
  // Shaping
  decompose:
    'fires when a parent intent\'s decomposition.children grew (with only the new ids)',
  fork: "never (Nous doesn't fork; future shaping-side ops only)",
  merge: "never (Nous doesn't merge; future shaping-side ops only)",
  reframe: 'never (kind is fixed per intent; reframe is shaping-side)',
  probe: 'never (probes come from the Shaping surface, not adapter diffs)',
  clarify: 'never (clarifies come from the Shaping surface, not adapter diffs)',
  commit: 'never (drafts commit via Shaping, not adapter diffs)',
}

// ─── Public API ────────────────────────────────────────────────────────────

export interface DiffWorkspacesArgs {
  prior: Workspace
  current: Workspace
  by: Party
  at: string
}

/**
 * Compare two workspaces; emit typed `Operation`s describing what changed.
 *
 * Returned ops are sorted deterministically (by intent id, then op kind)
 * so re-running the same diff produces a byte-stable result.
 */
export function diffWorkspaces(args: DiffWorkspacesArgs): Operation[] {
  const { prior, current, by, at } = args

  const priorIntents = new Map(prior.intents.map((i) => [i.id, i]))
  const priorStates = new Map(prior.states.map((s) => [s.intent_id, s]))

  const ops: Operation[] = []

  for (const intent of current.intents) {
    const priorIntent = priorIntents.get(intent.id)
    const isNewlyDeclared = !priorIntent

    if (isNewlyDeclared) {
      ops.push({
        id: makeOpId('declare', intent.id, at),
        kind: 'declare',
        at,
        by,
        target_intent_id: intent.id,
        cause: 'intent appeared in current workspace',
      })
      // For a newly declared intent, status and children both already
      // arrive "as is" — emitting advance/decompose on top would be noise.
      continue
    }

    // Status-change ops — specialized wins over advance.
    const priorState = priorStates.get(intent.id)
    const currentState = current.states.find((s) => s.intent_id === intent.id)
    if (priorState && currentState && priorState.status !== currentState.status) {
      ops.push(
        statusChangeOp({
          targetId: intent.id,
          fromStatus: priorState.status,
          toStatus: currentState.status,
          at,
          by,
        })
      )
    }

    // Decompose — children list grew.
    const priorChildren = new Set(priorIntent.decomposition.children)
    const newChildren = intent.decomposition.children.filter(
      (c) => !priorChildren.has(c)
    )
    if (newChildren.length > 0) {
      ops.push({
        id: makeOpId('decompose', intent.id, at),
        kind: 'decompose',
        at,
        by,
        target_intent_id: intent.id,
        cause: `${newChildren.length} new ${newChildren.length === 1 ? 'child' : 'children'} appeared`,
        children: newChildren,
      })
    }
  }

  return ops.sort(compareOps)
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function statusChangeOp(args: {
  targetId: string
  fromStatus: Status
  toStatus: Status
  at: string
  by: Party
}): Operation {
  const { targetId, fromStatus, toStatus, at, by } = args
  if (toStatus === 'satisfied') {
    return {
      id: makeOpId('satisfy', targetId, at),
      kind: 'satisfy',
      at,
      by,
      target_intent_id: targetId,
      cause: `status: ${fromStatus} → satisfied`,
    }
  }
  if (toStatus === 'gated') {
    return {
      id: makeOpId('gate', targetId, at),
      kind: 'gate',
      at,
      by,
      target_intent_id: targetId,
      cause: `status: ${fromStatus} → gated`,
      gate: 'unspecified',
    }
  }
  if (toStatus === 'revoked') {
    return {
      id: makeOpId('revoke', targetId, at),
      kind: 'revoke',
      at,
      by,
      target_intent_id: targetId,
      cause: `status: ${fromStatus} → revoked`,
    }
  }
  return {
    id: makeOpId('advance', targetId, at),
    kind: 'advance',
    at,
    by,
    target_intent_id: targetId,
    cause: `status: ${fromStatus} → ${toStatus}`,
    from_status: fromStatus,
    to_status: toStatus,
  }
}

function makeOpId(kind: OperationKind, targetId: string, at: string): string {
  return `op:${kind}:${targetId}:${at}`
}

function compareOps(a: Operation, b: Operation): number {
  if (a.target_intent_id !== b.target_intent_id) {
    return a.target_intent_id < b.target_intent_id ? -1 : 1
  }
  if (a.kind !== b.kind) return a.kind < b.kind ? -1 : 1
  return 0
}
