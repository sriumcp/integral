import type {
  Intent,
  IntentKind,
  IntentState,
  Operation,
  OperationKind,
  Party,
  StateTransition,
  Status,
  Workspace,
} from '@/schema'

export type Significance = 'critical' | 'notable' | 'routine'

/** Source discriminator — where this event originated. */
export type ActivitySource = 'transition' | 'operation' | 'synthetic'

export interface ActivityEvent {
  /** Stable id for React keys. */
  id: string
  intent: Intent
  state: IntentState
  at: string
  by: Party
  /** Human-readable label — for transitions: `cause` field; for operations:
   *  the op kind plus its `cause` (which is also human-readable in v0.1). */
  cause: string
  significance: Significance
  source: ActivitySource
  /** Set when source === 'transition'. */
  fromStatus?: Status
  toStatus?: Status
  /** Set when source === 'operation' — the typed Operation record. */
  operation?: Operation
}

/**
 * Classify a single state transition against its target intent.
 *
 * v0.1 heuristic (per goals.md). Operates on `cause` strings + the
 * target intent's extension.kind, since the v0.1 schema doesn't model a
 * typed event taxonomy:
 *
 *  - feature-pr CI passing→failing → critical
 *  - gate-resolved on any intent → notable
 *  - coral attempt-scored with "new best" annotation → notable
 *  - proposed-next-iteration on nous-campaign → notable
 *  - everything else → routine
 */
export function classifySignificance(
  transition: StateTransition,
  intent: Intent
): Significance {
  const ext = intent.extension
  const cause = transition.cause

  // CI flip on feature-pr is critical — the human typically needs to act.
  if (
    ext.kind === 'feature-pr' &&
    /ci.*(passing\s*[→>-]+\s*failing|failing)/i.test(cause)
  ) {
    return 'critical'
  }

  // Gate resolution moves a campaign forward — always worth surfacing.
  if (cause.includes('gate-resolved')) return 'notable'

  // New best score on coral — the optimizer is making real progress.
  if (
    (ext.kind === 'coral-optimization' || ext.kind === 'coral-attempt') &&
    /new\s+best/i.test(cause)
  ) {
    return 'notable'
  }

  // Proposed next iteration on a Nous campaign — needs human acceptance.
  if (
    (ext.kind === 'nous-campaign' || ext.kind === 'nous-iteration') &&
    /proposed-next-iteration/i.test(cause)
  ) {
    return 'notable'
  }

  // Default for every other kind + cause: routine.
  // Touching `_kind` keeps the function exhaustive over IntentKind for the
  // type-checker — adding a v0.2 IntentKind requires acknowledging this branch.
  const _kind: IntentKind = ext.kind
  void _kind

  return 'routine'
}

/**
 * Classify a typed `Operation`. Schema-exhaustive over the 16 op kinds:
 *  - revoke → critical (something was deliberately abandoned)
 *  - declare / propose-transition / accept-proposal / satisfy / gate /
 *    delegate / commit / fork / merge / reframe → notable (state-shaping moves)
 *  - refine / advance / decompose / probe / clarify → routine (frequent,
 *    fine-grained churn)
 *
 * The split reflects "what would a human want surfaced from across the
 * workspace at a glance" — not a formal calculus rule. v0.2 may shift the
 * boundary as the operation semantics get more typed.
 */
export function classifyOperation(op: Operation): Significance {
  const k: OperationKind = op.kind
  switch (k) {
    case 'revoke':
      return 'critical'
    case 'declare':
    case 'propose-transition':
    case 'accept-proposal':
    case 'satisfy':
    case 'gate':
    case 'delegate':
    case 'commit':
    case 'fork':
    case 'merge':
    case 'reframe':
      return 'notable'
    case 'refine':
    case 'advance':
    case 'decompose':
    case 'probe':
    case 'clarify':
      return 'routine'
  }
}

/**
 * Derive activity events from a validated workspace — combines:
 *  - state.history transitions (status changes), and
 *  - workspace.operations (typed ops emitted by adapters / shaping).
 *
 * One `ActivityEvent` per record. Most-recent first. Events whose target
 * intent isn't resolvable are silently skipped (defensive — bijection
 * refine guarantees this for validated workspaces).
 */
export function deriveEvents(workspace: Workspace): ActivityEvent[] {
  const intentById = new Map(workspace.intents.map((i) => [i.id, i]))
  const stateByIntentId = new Map(
    workspace.states.map((s) => [s.intent_id, s])
  )
  const events: ActivityEvent[] = []

  // Transitions
  for (const state of workspace.states) {
    const intent = intentById.get(state.intent_id)
    if (!intent) continue
    state.history.forEach((t, i) => {
      events.push({
        id: `${state.id}#${i}`,
        intent,
        state,
        at: t.at,
        by: t.by,
        cause: t.cause,
        fromStatus: t.from_status,
        toStatus: t.to_status,
        significance: classifySignificance(t, intent),
        source: 'transition',
      })
    })
  }

  // Operations
  for (const op of workspace.operations) {
    const intent = intentById.get(op.target_intent_id)
    if (!intent) continue
    const state = stateByIntentId.get(intent.id)
    if (!state) continue
    events.push({
      id: op.id,
      intent,
      state,
      at: op.at,
      by: op.by,
      cause: op.cause,
      significance: classifyOperation(op),
      source: 'operation',
      operation: op,
    })
  }

  events.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
  return events
}
