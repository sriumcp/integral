import type { Intent, IntentState, Party } from '@/schema'

/**
 * "Awaiting me" predicate — drives the queue filter and the per-card
 * "awaiting you" badge on the Map surface.
 *
 * Closed by CLAUDE.md § Resolved surface decisions:
 *  (a) Status === 'gated' AND awaiting_party === me; OR
 *  (b) any open proposal in the activity log assigned to me (not yet
 *      modeled in the schema — placeholder for a future bump).
 *
 * v0.1 included a third branch for `feature-pr` (CI-failing / changes-
 * requested on a PR I authored). v0.2.0 removed the `feature-pr` kind
 * along with the fixture; that branch returns when the full feature-dev
 * adapter ships in v0.3+.
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

  // Branch (a): gated and waiting on me specifically. The schema's gate
  // information lives in the kind-specific extension (currently only
  // `nous-campaign` carries `gate_status.awaiting_party`).
  if (state.status === 'gated' && ext.kind === 'nous-campaign') {
    if (ext.gate_status.awaiting_party?.id === me.id) return true
  }

  // Branch (b) is a future bump — proposal queue not yet modeled in the
  // schema.
  return false
}
