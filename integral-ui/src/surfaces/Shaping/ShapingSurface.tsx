import { useCallback, useMemo, useState } from 'react'
import type { Intent } from '@/schema'
import type { DraftShape } from '@/lib/draft-shape'
import {
  applyShapePatch,
  type DraftState,
} from '@/adapters/nous/shape-patch'
import type { NousWritebackConfig } from '@/adapters/nous/writeback'
import type { SourceEntry } from '@/lib/sources'
import { ShapingDialog } from './ShapingDialog'
import {
  ShapingChat,
  type ShapingChatTurn,
} from './ShapingChat/ShapingChat'
import { IntentDraftPane } from './IntentDraftPane'
import {
  WritebackForm,
  type WritebackFormChange,
} from './WritebackForm/WritebackForm'
import { usePreflight } from './usePreflight'
import styles from './ShapingSurface.module.css'

export interface WritebackResult {
  ok: boolean
  error?: string
  /** Filled when ok=true; the disk path the YAML was written to. */
  path?: string
  /** Filled when ok=true; the run_id Nous will use for this campaign. */
  run_id?: string
}

export interface WritebackArgs {
  intentId: string
  sourceId: string
  config: WritebackFormChange['config']
  /** A4.6: pass the *live* intent (with LLM-shaped fields) so the
   *  writeback uses the user's latest values, not the stale prop. */
  intent: Intent
}

export interface ShapeMessageArgs {
  draft: DraftState
  history: ReadonlyArray<ShapingChatTurn>
  user_message: string
}

export interface ShapeMessageResult {
  reply: string
  patch: import('@/adapters/nous/shape-patch').ShapePatch | null
  status: 'shaping' | 'ready-to-commit' | 'kind-mismatch'
  concerns: ReadonlyArray<string>
  kind_suggestion?: string
}

export interface ShapingSurfaceProps {
  intent: Intent
  shape: DraftShape
  /** Fires with the intent id when commit is clicked; flips state from
   *  draft to active. */
  onCommit: (intentId: string) => void
  onBack: () => void
  /** Source registry; when provided alongside a `writeback_template`,
   *  the WritebackForm renders. */
  registry?: ReadonlyArray<SourceEntry>
  /** A4 writeback handler. */
  onWriteback?: (args: WritebackArgs) => Promise<WritebackResult>
  /** A4.6 LLM-shaping handler. When provided AND the draft has an
   *  empty scripted dialog, ShapingChat replaces ShapingDialog and
   *  the surface drives an interactive LLM clarification flow. */
  onShapeMessage?: (args: ShapeMessageArgs) => Promise<ShapeMessageResult>
}

const RESTRUCTURE_OPS = ['decompose', 'fork', 'merge', 'reframe'] as const
type RestructureOp = (typeof RESTRUCTURE_OPS)[number]

/** Default writeback config used as the live state seed when the
 *  draft's `writeback_template` is absent or partial. */
function defaultWritebackConfig(): NousWritebackConfig {
  return {
    max_iterations: 5,
    target_system: { name: '', description: '', repo_path: '' },
  }
}

function seedWritebackConfig(
  template: DraftShape['writeback_template']
): NousWritebackConfig {
  const base = defaultWritebackConfig()
  if (!template) return base
  return {
    ...base,
    ...(template.max_iterations !== undefined
      ? { max_iterations: template.max_iterations }
      : {}),
    target_system: { ...base.target_system, ...(template.target_system ?? {}) },
    ...(template.run_id !== undefined ? { run_id: template.run_id } : {}),
  }
}

/**
 * ShapingSurface — two-pane shaping mode for `Status: 'draft'` intents.
 *
 * **Two operating modes:**
 *  - **Scripted (existing fixture drafts):** `shape.dialog` has canned
 *    turns; resolvedFields baked into the fixture. Renders ShapingDialog
 *    on the left, IntentDraftPane (showing the prop intent) on the right.
 *    Commit gates on `requiredFields.every(f => resolvedFields.has(f))`.
 *  - **LLM-driven (new drafts via "+ new"):** `shape.dialog` is empty
 *    AND `onShapeMessage` is provided. Renders ShapingChat on the left;
 *    user messages POST to /api/shape; LLM replies + emits a typed
 *    patch that fills the live draft (right pane auto-updates).
 *    Resolved-fields are computed from the live draft. Commit gates on
 *    all required fields having non-trivial values.
 *
 * Both modes feed the same WritebackForm + commit-to-active button.
 * The same-button A4 contract still holds: commit posts writeback, on
 * success flips in-memory state.
 */
export function ShapingSurface({
  intent,
  shape,
  onCommit,
  onBack,
  registry,
  onWriteback,
  onShapeMessage,
}: ShapingSurfaceProps) {
  // ── Live state (LLM-driven mode) ─────────────────────────────────────────
  // For scripted drafts, liveDraft is initialized once from the prop and
  // never changes (LLM-shaping isn't active, so no patches arrive). For
  // LLM drafts, liveDraft mutates as the LLM emits patches.
  const [liveDraft, setLiveDraft] = useState<DraftState>(() => ({
    intent,
    writeback: seedWritebackConfig(shape.writeback_template),
  }))
  const [liveTurns, setLiveTurns] = useState<ReadonlyArray<ShapingChatTurn>>(
    () =>
      shape.dialog.map((t) => ({
        speaker: t.speaker.id === 'sri' ? 'user' : 'shaper',
        body: t.body,
        at: t.at,
      }))
  )
  const [concerns, setConcerns] = useState<ReadonlyArray<string>>([])
  const [llmStatus, setLlmStatus] = useState<
    'shaping' | 'ready-to-commit' | 'kind-mismatch'
  >('shaping')
  const [kindSuggestion, setKindSuggestion] = useState<string | undefined>()
  const [llmLoading, setLlmLoading] = useState(false)

  const llmShapingActive =
    shape.dialog.length === 0 && Boolean(onShapeMessage)

  // ── Resolved-fields ──────────────────────────────────────────────────────
  // Scripted drafts: use the fixture's set as-is. LLM drafts: derive from
  // the live draft's field values being non-trivial.
  const dynamicResolvedFields = useMemo(() => {
    if (!llmShapingActive) return shape.resolvedFields
    const set = new Set<string>()
    if (liveDraft.intent.declaration.title.trim().length > 0) {
      set.add('declaration.title')
    }
    if (liveDraft.intent.declaration.summary.trim().length > 0) {
      set.add('declaration.summary')
    }
    if (liveDraft.intent.declaration.success_criterion.trim().length > 0) {
      set.add('declaration.success_criterion')
    }
    if (
      liveDraft.intent.extension.kind === 'nous-campaign' &&
      liveDraft.intent.extension.research_question.trim().length > 0 &&
      liveDraft.intent.extension.research_question !== '(to be shaped)'
    ) {
      set.add('extension.research_question')
    }
    // Scripted drafts include `holder` / `knowledge_refs` in required —
    // those aren't shaped via the LLM in v0.1 but their default values
    // (jointly-held + empty) count as resolved for ship purposes.
    set.add('holder')
    set.add('knowledge_refs')
    return set
  }, [llmShapingActive, shape.resolvedFields, liveDraft.intent])

  const liveShape: DraftShape = useMemo(
    () => ({
      ...shape,
      resolvedFields: dynamicResolvedFields,
    }),
    [shape, dynamicResolvedFields]
  )

  const allResolved = shape.requiredFields.every((f) =>
    dynamicResolvedFields.has(f)
  )
  const pendingCount = shape.requiredFields.filter(
    (f) => !dynamicResolvedFields.has(f)
  ).length

  // ── Writeback ────────────────────────────────────────────────────────────
  const writebackActive = Boolean(
    shape.writeback_template && registry && onWriteback
  )

  const [writebackChange, setWritebackChange] =
    useState<WritebackFormChange | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [writebackError, setWritebackError] = useState<string | null>(null)

  const handleWritebackChange = useCallback(
    (change: WritebackFormChange | null) => {
      setWritebackChange(change)
    },
    []
  )

  const writebackReady = !writebackActive || writebackChange !== null

  // ── Pre-flight ───────────────────────────────────────────────────────────
  // Only fire when writeback is actually active — Coral drafts (no
  // writeback_template) and registry-less callers don't trigger any
  // network I/O. Empty sourceId in the input also short-circuits the
  // hook so a hidden form doesn't poll.
  const preflightSourceId =
    writebackActive && writebackChange ? writebackChange.sourceId : ''
  const preflightInput = useMemo(
    () => ({
      sourceId: preflightSourceId,
      targetRepoPath:
        writebackActive && writebackChange
          ? writebackChange.config.target_system.repo_path
          : '',
      runId:
        writebackActive && writebackChange
          ? (writebackChange.config.run_id ?? '')
          : '',
    }),
    [preflightSourceId, writebackActive, writebackChange],
  )
  const preflight = usePreflight(preflightInput)

  // Fail-closed gate (PR review CRITICAL #1, #2): when writeback is
  // active, the commit button stays disabled UNTIL pre-flight has
  // affirmatively settled with no failing checks. `idle`, `loading`,
  // and `error` all keep the gate closed — silence is not consent.
  const preflightActive = writebackActive
  const preflightOk =
    !preflightActive ||
    (preflight.phase === 'ok' &&
      !preflight.checks.some((c) => c.status === 'fail'))

  // Surface checks for indicator rendering. During `loading` or
  // `error`, fall back to the previous settled checks so the UI
  // doesn't flicker during re-fetch — but the gate above ignores
  // `previous`; only `phase: 'ok'` opens it.
  const preflightChecksForUI =
    preflight.phase === 'ok'
      ? preflight.checks
      : preflight.phase === 'loading' || preflight.phase === 'error'
        ? preflight.previous
        : null
  const preflightError =
    preflight.phase === 'error' ? preflight.error : null
  const failedPreflightCount =
    preflight.phase === 'ok'
      ? preflight.checks.filter((c) => c.status === 'fail').length
      : 0

  const commitEnabled =
    allResolved && writebackReady && !submitting && !llmLoading && preflightOk

  // ── ShapingChat onSend ───────────────────────────────────────────────────
  const handleShapeSend = useCallback(
    async (message: string) => {
      if (!onShapeMessage) return
      const userTurn: ShapingChatTurn = {
        speaker: 'user',
        body: message,
        at: new Date().toISOString(),
      }
      // Optimistically append the user's turn; show loading spinner.
      setLiveTurns((prev) => [...prev, userTurn])
      setLlmLoading(true)
      try {
        const result = await onShapeMessage({
          draft: liveDraft,
          history: [...liveTurns, userTurn],
          user_message: message,
        })
        const shaperTurn: ShapingChatTurn = {
          speaker: 'shaper',
          body: result.reply,
          at: new Date().toISOString(),
        }
        setLiveTurns((prev) => [...prev, shaperTurn])
        if (result.patch) {
          setLiveDraft((prev) => applyShapePatch(prev, result.patch))
        }
        setConcerns(result.concerns)
        setLlmStatus(result.status)
        setKindSuggestion(result.kind_suggestion)
      } catch (err) {
        setLiveTurns((prev) => [
          ...prev,
          {
            speaker: 'shaper',
            body: `(error: ${err instanceof Error ? err.message : String(err)})`,
            at: new Date().toISOString(),
          },
        ])
      } finally {
        setLlmLoading(false)
      }
    },
    [onShapeMessage, liveDraft, liveTurns]
  )

  // ── Commit handler ───────────────────────────────────────────────────────
  const onCommitClick = useCallback(async () => {
    if (!commitEnabled) return
    if (writebackActive && writebackChange && onWriteback) {
      setSubmitting(true)
      setWritebackError(null)
      try {
        const result = await onWriteback({
          intentId: intent.id,
          sourceId: writebackChange.sourceId,
          config: writebackChange.config,
          intent: liveDraft.intent,
        })
        if (!result.ok) {
          setWritebackError(result.error ?? 'writeback failed')
          setSubmitting(false)
          return
        }
        onCommit(intent.id)
      } catch (err) {
        setWritebackError(err instanceof Error ? err.message : String(err))
      } finally {
        setSubmitting(false)
      }
      return
    }
    onCommit(intent.id)
  }, [
    commitEnabled,
    writebackActive,
    writebackChange,
    onWriteback,
    onCommit,
    intent.id,
    liveDraft.intent,
  ])

  return (
    <main className={styles.surface} data-surface="shaping">
      <nav className={styles.crumbs}>
        <button type="button" className={styles.back} onClick={onBack}>
          ← map
        </button>
      </nav>

      <div className={styles.panes}>
        {llmShapingActive ? (
          <ShapingChat
            turns={liveTurns}
            loading={llmLoading}
            onSend={handleShapeSend}
            concerns={concerns}
          />
        ) : (
          <ShapingDialog turns={shape.dialog} />
        )}
        <div className={styles.rightCol}>
          <IntentDraftPane intent={liveDraft.intent} shape={liveShape} />
          {writebackActive && shape.writeback_template && registry && (
            <WritebackForm
              registry={registry}
              template={liveDraft.writeback}
              onChange={handleWritebackChange}
              preflight={preflightChecksForUI}
            />
          )}
          {kindSuggestion && (
            <div className={styles.kindSuggestion} role="status">
              Shaper suggests this is a <strong>{kindSuggestion}</strong>, not
              a nous-campaign. v0.1 doesn't reframe — start a new draft of
              that kind, or carry on shaping as nous.
            </div>
          )}
        </div>
      </div>

      <footer className={styles.controls}>
        <div className={styles.restructureRow}>
          {RESTRUCTURE_OPS.map((op) => (
            <button
              key={op}
              type="button"
              className={styles.restructureBtn}
              title="v0.2"
              onClick={() => handleRestructure(op)}
            >
              {op}
            </button>
          ))}
        </div>
        {writebackError && (
          <span className={styles.writebackError} role="alert">
            {writebackError}
          </span>
        )}
        {preflightError && (
          <span
            className={styles.writebackError}
            role="alert"
            data-testid="preflight-error"
          >
            pre-flight error: {preflightError}
          </span>
        )}
        {llmShapingActive && llmStatus === 'ready-to-commit' && allResolved && (
          <span
            className={styles.readyHint}
            role="status"
            data-testid="ready-to-commit-hint"
          >
            ✓ shaper says this is ready to commit
          </span>
        )}
        <button
          type="button"
          className={styles.commit}
          disabled={!commitEnabled}
          onClick={onCommitClick}
          aria-label={
            commitEnabled
              ? 'commit to active'
              : `commit to active (disabled — ${disabledReason({
                  allResolved,
                  pendingCount,
                  submitting,
                  llmLoading,
                  writebackReady,
                  preflightActive,
                  preflightPhase: preflight.phase,
                  failedPreflightCount,
                })})`
          }
        >
          {submitting ? 'committing…' : 'commit to active'}
          {!allResolved && (
            <span className={styles.commitHint}>· {pendingCount} pending</span>
          )}
          {allResolved && writebackReady && !preflightOk && preflightActive && (
            <span className={styles.commitHint}>
              · {commitHintForPreflight(preflight.phase, failedPreflightCount)}
            </span>
          )}
        </button>
      </footer>
    </main>
  )
}

/**
 * Map the disabled commit-button state to a single human-readable
 * reason. Order matters — earlier branches dominate later ones; this
 * is the precedence the aria-label exposes to screen readers and the
 * truth-table tests assert against.
 */
function disabledReason(args: {
  allResolved: boolean
  pendingCount: number
  submitting: boolean
  llmLoading: boolean
  writebackReady: boolean
  preflightActive: boolean
  preflightPhase: 'idle' | 'loading' | 'ok' | 'error'
  failedPreflightCount: number
}): string {
  if (!args.allResolved) return `${args.pendingCount} pending`
  if (args.submitting) return 'submitting'
  if (args.llmLoading) return 'waiting for shaper'
  if (!args.writebackReady) return 'writeback config invalid'
  if (args.preflightActive) {
    if (args.preflightPhase === 'idle' || args.preflightPhase === 'loading') {
      return 'waiting for preflight'
    }
    if (args.preflightPhase === 'error') {
      return 'preflight error — see message above'
    }
    if (args.failedPreflightCount > 0) {
      return `${args.failedPreflightCount} preflight check${args.failedPreflightCount === 1 ? '' : 's'} failed`
    }
  }
  return 'unknown'
}

/** Visible-hint copy for the commit button when preflight gates it. */
function commitHintForPreflight(
  phase: 'idle' | 'loading' | 'ok' | 'error',
  failedCount: number,
): string {
  if (phase === 'idle' || phase === 'loading') return 'preflight pending'
  if (phase === 'error') return 'preflight error'
  return `${failedCount} preflight failed`
}

function handleRestructure(op: RestructureOp) {
  // v0.1: rendered as an affordance but inert. The wire-level shape of
  // shaping operations is deferred to v0.2 (CLAUDE.md § Adapter conventions).
  // eslint-disable-next-line no-console
  console.info(`shaping-restructure: ${op} (v0.2)`)
}
