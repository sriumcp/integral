import type { Intent } from '@/schema'
import type { DraftShape } from '@/fixtures/shaping'
import { ShapingDialog } from './ShapingDialog'
import { IntentDraftPane } from './IntentDraftPane'
import styles from './ShapingSurface.module.css'

export interface ShapingSurfaceProps {
  intent: Intent
  shape: DraftShape
  /** Fires with the intent id when commit is clicked and the draft is
   *  fully resolved. Surfaces use this to transition Status: 'draft' →
   *  'active' in the live workspace state. */
  onCommit: (intentId: string) => void
  /** Back to the Map surface. */
  onBack: () => void
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
 */
export function ShapingSurface({
  intent,
  shape,
  onCommit,
  onBack,
}: ShapingSurfaceProps) {
  const allResolved = shape.requiredFields.every((f) =>
    shape.resolvedFields.has(f)
  )
  const pendingCount = shape.requiredFields.filter(
    (f) => !shape.resolvedFields.has(f)
  ).length

  return (
    <main className={styles.surface} data-surface="shaping">
      <nav className={styles.crumbs}>
        <button type="button" className={styles.back} onClick={onBack}>
          ← map
        </button>
      </nav>

      <div className={styles.panes}>
        <ShapingDialog turns={shape.dialog} />
        <IntentDraftPane intent={intent} shape={shape} />
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
        <button
          type="button"
          className={styles.commit}
          disabled={!allResolved}
          onClick={() => {
            if (allResolved) onCommit(intent.id)
          }}
          aria-label={
            allResolved
              ? 'commit to active'
              : `commit to active (disabled — ${pendingCount} pending)`
          }
        >
          commit to active
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
