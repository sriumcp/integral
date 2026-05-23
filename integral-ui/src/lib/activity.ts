import type {
  Intent,
  IntentKind,
  IntentState,
  Party,
  StateTransition,
  Workspace,
} from '@/schema'

export type Significance = 'critical' | 'notable' | 'routine'

export interface ActivityEvent {
  /** Stable id for React keys: `${state.id}#${index}`. */
  id: string
  intent: Intent
  state: IntentState
  at: string
  by: Party
  cause: string
  fromStatus: StateTransition['from_status']
  toStatus: StateTransition['to_status']
  significance: Significance
}

/**
 * Classify a single state transition against its target intent.
 *
 * v0.1 heuristic (per goals.md). Operates on `cause` strings + the
 * target intent's extension.kind, since the schema doesn't model a
 * typed event taxonomy until v0.2:
 *
 *  - feature-pr CI passing→failing → critical
 *  - gate-resolved on any intent → notable
 *  - coral attempt-scored with "new best" annotation → notable
 *  - proposed-next-iteration on nous-campaign → notable
 *  - everything else → routine
 *
 * Schema-exhaustive: every `IntentKind` falls through to a `routine`
 * default rather than throwing, but the test suite parameterizes over
 * `IntentKindSchema.options` so a v0.2 kind addition still surfaces.
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
 * Derive activity events from a validated workspace.
 *
 * One `ActivityEvent` per `StateTransition` across all states. Most-recent
 * first. Events whose target intent isn't resolvable (defensive — the
 * `WorkspaceSchema.refine` bijection guarantees this won't happen for
 * validated workspaces) are silently skipped rather than throwing.
 */
export function deriveEvents(workspace: Workspace): ActivityEvent[] {
  const intentById = new Map(workspace.intents.map((i) => [i.id, i]))
  const events: ActivityEvent[] = []

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
      })
    })
  }

  events.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
  return events
}
