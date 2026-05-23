import styles from './HypothesisBars.module.css'

export interface HypothesisCounts {
  confirmed: number
  refuted: number
  pending: number
}

export interface HypothesisBarsProps {
  counts: HypothesisCounts
  width?: number
  height?: number
  /** Accessible description; falls back to a generated summary. */
  ariaLabel?: string
}

/**
 * HypothesisBars — segmented bar visualizing a Nous iteration's hypothesis
 * outcomes (confirmed / refuted / pending) with a small mono caption.
 *
 * Discipline:
 *  - Accepts plain `counts` rather than the schema's `HypothesisBundle` so
 *    the atom is reusable for any "X / Y / Z out of total" breakdown.
 *    Surfaces are responsible for deriving counts from a `HypothesisBundle`.
 *  - When total = 0, renders a placeholder ("—") rather than a zero-width
 *    bar that would be invisible and confusing.
 *  - aria-label always describes the breakdown numerically.
 *  - Exposes `data-confirmed`, `data-refuted`, `data-pending`, `data-total`
 *    on the root for tests and surface code.
 */
export function HypothesisBars({
  counts,
  width = 120,
  height = 8,
  ariaLabel,
}: HypothesisBarsProps) {
  const { confirmed, refuted, pending } = counts
  const total = confirmed + refuted + pending

  if (total === 0) {
    return (
      <span
        className={styles.placeholder}
        role="img"
        aria-label={ariaLabel ?? 'hypothesis bars · no hypotheses'}
        data-total="0"
      >
        —
      </span>
    )
  }

  const w = (n: number) => (n / total) * width
  const generatedLabel = `hypothesis bars · ${confirmed} confirmed, ${refuted} refuted, ${pending} pending of ${total}`

  return (
    <span
      className={styles.row}
      role="img"
      aria-label={ariaLabel ?? generatedLabel}
      data-confirmed={confirmed}
      data-refuted={refuted}
      data-pending={pending}
      data-total={total}
    >
      <svg
        className={styles.bar}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        aria-hidden="true"
      >
        <rect
          x={0}
          width={w(confirmed)}
          height={height}
          className={styles.confirmed}
        />
        <rect
          x={w(confirmed)}
          width={w(refuted)}
          height={height}
          className={styles.refuted}
        />
        <rect
          x={w(confirmed) + w(refuted)}
          width={w(pending)}
          height={height}
          className={styles.pending}
        />
      </svg>
      <span className={styles.caption}>
        {confirmed}c · {refuted}r · {pending}p
      </span>
    </span>
  )
}
