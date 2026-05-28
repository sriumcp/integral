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

export interface PreflightHookResult {
  /** True while a fetch is in flight; false otherwise. Initial render
   *  reads false (no fetch has been queued yet). */
  loading: boolean
  /** Latest checks from the server, or null if none have settled yet. */
  checks: PreflightCheck[] | null
  /** Last network/parse error message, if any. Cleared on the next
   *  successful response. */
  error: string | null
}

const DEBOUNCE_MS = 400

/**
 * usePreflight — debounced /api/nous/preflight client.
 *
 * On every change to `(sourceId, targetRepoPath, runId)`, schedules a
 * fetch after `DEBOUNCE_MS` of quiet. In-flight requests for stale
 * inputs are ignored — a sequence of edits within the debounce window
 * results in exactly one network call against the latest values.
 *
 * Returns `{loading, checks, error}`. The Shaping surface uses
 * `checks` to render per-field status indicators and to gate the
 * commit button on `!checks.some(c => c.status === 'fail')`.
 *
 * Empty `sourceId` short-circuits — there's no source to validate
 * against, so the hook stays inert.
 */
export function usePreflight(input: PreflightHookInput): PreflightHookResult {
  const [state, setState] = useState<PreflightHookResult>({
    loading: false,
    checks: null,
    error: null,
  })

  // Each scheduled fetch carries a sequence number; only the latest
  // sequence is allowed to write to React state. This is simpler than
  // AbortController for our purposes (the server response is small +
  // cheap; we just discard the result).
  const seqRef = useRef(0)

  useEffect(() => {
    if (input.sourceId.length === 0) {
      // Nothing to validate against — leave state inert.
      return
    }

    const mySeq = ++seqRef.current
    const timer = setTimeout(() => {
      // Mark loading at fetch-fire time (not at debounce-schedule time)
      // so very-rapid edits don't show a spinner that never settles.
      setState((prev) => ({ ...prev, loading: true }))

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
          const body = (await res.json()) as { checks: PreflightCheck[] }
          if (mySeq !== seqRef.current) return
          setState({
            loading: false,
            checks: body.checks,
            error: null,
          })
        })
        .catch((err: unknown) => {
          if (mySeq !== seqRef.current) return
          setState({
            loading: false,
            checks: null,
            error: err instanceof Error ? err.message : String(err),
          })
        })
    }, DEBOUNCE_MS)

    return () => {
      clearTimeout(timer)
    }
  }, [input.sourceId, input.targetRepoPath, input.runId])

  return state
}
