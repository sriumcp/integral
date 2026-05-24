import { useCallback, useState } from 'react'
import type { Intent } from '@/schema'
import type { DraftShape } from '@/fixtures/shaping'
import type { SourceEntry } from '@/lib/sources'
import { ShapingDialog } from './ShapingDialog'
import { IntentDraftPane } from './IntentDraftPane'
import {
  WritebackForm,
  type WritebackFormChange,
} from './WritebackForm/WritebackForm'
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
}

export interface ShapingSurfaceProps {
  intent: Intent
  shape: DraftShape
  /** Fires with the intent id when commit is clicked, the draft is fully
   *  resolved, AND there's no writeback active. The in-memory-only
   *  backwards-compat path. */
  onCommit: (intentId: string) => void
  /** Back to the Map surface. */
  onBack: () => void
  /** When provided AND the draft has a `writeback_template`, the
   *  WritebackForm is rendered and commit-to-active POSTs the writeback
   *  before flipping the draft state. Without this prop, ShapingSurface
   *  falls back to the in-memory-only `onCommit` path. */
  registry?: ReadonlyArray<SourceEntry>
  /** Async writeback handler. ShapingSurface awaits the result; on `ok:
   *  true` it fires `onCommit` to flip the in-memory state. On `ok:
   *  false` it shows `error` inline and leaves the draft in place so
   *  the user can fix and retry. */
  onWriteback?: (args: WritebackArgs) => Promise<WritebackResult>
}

const RESTRUCTURE_OPS = ['decompose', 'fork', 'merge', 'reframe'] as const
type RestructureOp = (typeof RESTRUCTURE_OPS)[number]

/**
 * ShapingSurface — two-pane shaping mode for `Status: 'draft'` intents.
 *
 * Composes `ShapingDialog` (left, scripted clarification turns) and
 * `IntentDraftPane` (right, live typed draft with `⚠ pending` markers
 * for unresolved fields). Restructure operations render inert in v0.1
 * (CLAUDE.md § What NOT to do — agents probe, humans restructure, and
 * the wire-level shape is deferred to v0.2).
 *
 * Commit is gated on `shape.requiredFields.every(f => shape.resolvedFields.has(f))`.
 * The discipline keeps "shaping outputs an executable intent" honest:
 * users can't ship a half-shaped object.
 *
 * **Writeback (A4):** when the draft has a `writeback_template` and a
 * `registry` is provided, ShapingSurface renders `WritebackForm` in the
 * right pane and gates commit additionally on form validity. Commit
 * triggers `onWriteback` (writes a real `campaign-<run_id>.yaml`); on
 * success, `onCommit` flips the in-memory state. Without writeback,
 * the legacy in-memory-only path runs (Coral drafts, registry-less
 * environments).
 */
export function ShapingSurface({
  intent,
  shape,
  onCommit,
  onBack,
  registry,
  onWriteback,
}: ShapingSurfaceProps) {
  const allResolved = shape.requiredFields.every((f) =>
    shape.resolvedFields.has(f)
  )
  const pendingCount = shape.requiredFields.filter(
    (f) => !shape.resolvedFields.has(f)
  ).length

  // Writeback is "active" iff the draft declares a template AND the
  // surface has the registry+callback to wire it. Coral drafts (no
  // template) and registry-less callers (tests, preview) keep the
  // in-memory-only commit path — backwards compat per A4 scope.
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
  const commitEnabled = allResolved && writebackReady && !submitting

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
  ])

  return (
    <main className={styles.surface} data-surface="shaping">
      <nav className={styles.crumbs}>
        <button type="button" className={styles.back} onClick={onBack}>
          ← map
        </button>
      </nav>

      <div className={styles.panes}>
        <ShapingDialog turns={shape.dialog} />
        <div className={styles.rightCol}>
          <IntentDraftPane intent={intent} shape={shape} />
          {writebackActive && shape.writeback_template && registry && (
            <WritebackForm
              registry={registry}
              template={shape.writeback_template}
              onChange={handleWritebackChange}
            />
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
        <button
          type="button"
          className={styles.commit}
          disabled={!commitEnabled}
          onClick={onCommitClick}
          aria-label={
            commitEnabled
              ? 'commit to active'
              : `commit to active (disabled — ${
                  !allResolved
                    ? `${pendingCount} pending`
                    : submitting
                      ? 'submitting'
                      : 'writeback config invalid'
                })`
          }
        >
          {submitting ? 'committing…' : 'commit to active'}
          {!allResolved && (
            <span className={styles.commitHint}>
              · {pendingCount} pending
            </span>
          )}
        </button>
      </footer>
    </main>
  )
}

function handleRestructure(op: RestructureOp) {
  // v0.1: rendered as an affordance but inert. The wire-level shape of
  // shaping operations is deferred to v0.2 (CLAUDE.md § Adapter conventions).
  // eslint-disable-next-line no-console
  console.info(`shaping-restructure: ${op} (v0.2)`)
}
