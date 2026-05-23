import type { Intent, IntentState, Party } from '@/schema'

/**
 * "Awaiting me" predicate — drives the queue filter and the per-card
 * "awaiting you" badge on the Map surface.
 *
 * Closed by CLAUDE.md § Resolved surface decisions:
 *  (a) Status === 'gated' AND awaiting_party === me; OR
 *  (b) any open proposal in the activity log assigned to me (not yet
 *      modeled in v0.1 — placeholder); OR
 *  (c) for `feature-pr` intents I authored, ci_status === 'failing' OR
 *      review_status === 'changes-requested'.
 *
 * The predicate takes the *me* party explicitly rather than reading from
 * a global so unit tests can exercise both the matching and non-matching
 * cases without ambient state.
 */
export function isAwaitingMe(
  intent: Intent,
  state: IntentState,
  me: Party
): boolean {
  // We narrow on `intent.extension.kind` (the discriminator on the
  // TypeExtension union) rather than `intent.kind` so TS narrows the
  // extension type alongside. Both are equal at runtime via the schema's
  // .refine invariant.
  const ext = intent.extension

  // Branch (c): a feature-PR I authored that's in a state I have to act on.
  if (ext.kind === 'feature-pr') {
    const authored = intent.provenance.declared_by.id === me.id
    if (authored) {
      if (ext.ci_status === 'failing' || ext.review_status === 'changes-requested') {
        return true
      }
    }
  }

  // Branch (a): gated and waiting on me specifically. The schema's gate
  // information lives in the kind-specific extension (currently only
  // `nous-campaign` carries `gate_status.awaiting_party`).
  if (state.status === 'gated' && ext.kind === 'nous-campaign') {
    if (ext.gate_status.awaiting_party?.id === me.id) return true
  }

  // Branch (b) is v0.2 — proposal queue not yet modeled in the schema.
  return false
}
