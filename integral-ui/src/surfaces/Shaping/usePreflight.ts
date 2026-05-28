import { useEffect, useRef, useState } from 'react'
import type { PreflightCheck } from '@/lib/nous-preflight'

/**
 * Hook input — the writeback fields the user is currently editing in
 * Shaping. Whenever any of these change, the hook re-runs the
 * pre-flight check (debounced).
 */
export interface PreflightHookInput {
  /** Configured source id; empty disables the hook (no place to write to). */
  sourceId: string
  /** From `writeback.target_system.repo_path`. */
  targetRepoPath: string
  /** From `writeback.run_id`. Empty is fine — server treats as
   *  not-yet-derived and warns instead of failing. */
  runId: string
}

/**
 * Discriminated union over the four valid hook states. Replaces the
 * earlier `{loading, checks, error}` triple, which admitted impossible
 * states (loading + error simultaneously) and — more dangerously —
 * left the commit-button gate fail-OPEN: when `checks === null`
 * (initial mount or transport error), `failedPreflightCount === 0`
 * read as "all OK," allowing the user to commit a writeback that
 * pre-flight had never validated. (PR review CRITICAL #1, #2.)
 *
 * The phase shape forces consumers to check `phase === 'ok'` before
 * trusting `checks` — fail-closed by construction.
 *
 * `previous` is carried through `loading` and `error` so the UI can
 * keep showing the last-known indicators while a re-fetch is in
 * flight or has just failed (less flicker, no stale-trust). The
 * commit gate ignores `previous` — only `phase: 'ok'` opens it.
 */
export type PreflightHookResult =
  | { phase: 'idle' }
  | { phase: 'loading'; previous: PreflightCheck[] | null }
  | { phase: 'ok'; checks: PreflightCheck[] }
  | { phase: 'error'; error: string; previous: PreflightCheck[] | null }

const DEBOUNCE_MS = 400

/**
 * usePreflight — debounced /api/nous/preflight client.
 *
 * On every change to `(sourceId, targetRepoPath, runId)`, schedules a
 * fetch after `DEBOUNCE_MS` of quiet. In-flight requests for stale
 * inputs are dropped via a sequence-number ref — a sequence of edits
 * within the debounce window results in exactly one network call
 * against the latest values, AND a slow earlier response can't
 * clobber a newer one (PR review pr-test #1).
 *
 * Returns a discriminated `PreflightHookResult`. The Shaping surface
 * gates the commit button on `phase === 'ok' && !hasFailingCheck(checks)`.
 *
 * Empty `sourceId` short-circuits — there's no source to validate
 * against, so the hook stays in `phase: 'idle'`. Note: `idle` does NOT
 * unblock the commit gate when writeback is active; the caller must
 * separately decide whether preflight applies (e.g., Coral drafts
 * have no writeback so preflight is irrelevant).
 */
export function usePreflight(input: PreflightHookInput): PreflightHookResult {
  const [state, setState] = useState<PreflightHookResult>({ phase: 'idle' })

  // Each scheduled fetch carries a sequence number; only the latest
  // sequence is allowed to write to React state. This is simpler than
  // AbortController for our purposes (the server response is small +
  // cheap; we just discard the result). The same ref guards loading
  // setState (so a debounce-cancel doesn't flicker the spinner) AND
  // success/error setState (so a slow earlier response can't clobber
  // a newer one).
  const seqRef = useRef(0)

  useEffect(() => {
    if (input.sourceId.length === 0) {
      // Nothing to validate against — leave state in `idle`.
      return
    }

    const mySeq = ++seqRef.current
    const timer = setTimeout(() => {
      // Re-check the seq before flipping to loading: a debounce that's
      // about to fire could be racing a newer rerender that's already
      // bumped seqRef. Without this guard we'd flicker the loading
      // indicator for an effect that's about to be cleaned up.
      if (mySeq !== seqRef.current) return
      setState((prev) => ({
        phase: 'loading',
        previous: extractChecks(prev),
      }))

      fetch('/api/nous/preflight', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sourceId: input.sourceId,
          target_system: { repo_path: input.targetRepoPath },
          runId: input.runId,
        }),
      })
        .then(async (res) => {
          if (!res.ok) throw new Error(`pre-flight failed: ${res.status}`)
          const body = (await res.json()) as { checks?: unknown }
          if (!Array.isArray(body.checks)) {
            throw new Error('pre-flight response missing or invalid `checks`')
          }
          // Drop the result if a newer fetch has been scheduled —
          // see test "drops a slow earlier response when a faster
          // later one wins" for the falsification.
          if (mySeq !== seqRef.current) return
          setState({ phase: 'ok', checks: body.checks as PreflightCheck[] })
        })
        .catch((err: unknown) => {
          // Same staleness guard for errors: a slow earlier rejection
          // must not flip phase to `error` after a fresher fetch has
          // already settled to `ok`.
          if (mySeq !== seqRef.current) return
          setState((prev) => ({
            phase: 'error',
            error: err instanceof Error ? err.message : String(err),
            previous: extractChecks(prev),
          }))
        })
    }, DEBOUNCE_MS)

    return () => {
      clearTimeout(timer)
    }
  }, [input.sourceId, input.targetRepoPath, input.runId])

  return state
}

/** Pull the most recent settled checks out of any phase. Used to seed
 *  `previous` when transitioning into `loading` or `error`, so the UI
 *  can keep showing the prior indicators rather than blanking out. */
function extractChecks(state: PreflightHookResult): PreflightCheck[] | null {
  switch (state.phase) {
    case 'idle':
      return null
    case 'loading':
      return state.previous
    case 'ok':
      return state.checks
    case 'error':
      return state.previous
  }
}
