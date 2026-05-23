import styles from './ScoreGauge.module.css'

export interface ScoreGaugeProps {
  /** Score in [0, 1]; null/undefined renders a placeholder. */
  score: number | null
  /** Optional best-so-far reference; renders a separate marker line and
   *  highlights the fill in sage when score equals best. */
  best?: number
  /** Track width in px. Default 96. */
  width?: number
  /** Accessible description; falls back to a generated summary. */
  ariaLabel?: string
}

/**
 * ScoreGauge — score bar with optional best-so-far marker.
 *
 * Discipline:
 *  - Score is clamped to [0, 1] for visual rendering; out-of-range values
 *    are still reported in the label so the data isn't silently lost.
 *  - When score is null, renders a placeholder ("—") so the slot is
 *    consistent.
 *  - Exposes `data-score` and `data-best` so tests and surface code can
 *    read the values without parsing the rendered output.
 */
export function ScoreGauge({
  score,
  best,
  width = 96,
  ariaLabel,
}: ScoreGaugeProps) {
  if (score == null) {
    return (
      <span
        className={styles.placeholder}
        role="img"
        aria-label={ariaLabel ?? 'no score yet'}
        data-score=""
      >
        —
      </span>
    )
  }

  const clamped = Math.min(1, Math.max(0, score))
  const outOfRange = score < 0 || score > 1
  const isBest = best !== undefined && score === best
  // Out-of-range is reported in the label so anomalous scorer output is loud,
  // not silently clamped (the data-out-of-range attribute also drives an
  // optional CSS hint at the surface layer).
  const generatedLabel = `score ${score.toFixed(3)}${
    best !== undefined ? ` (best ${best.toFixed(3)})` : ''
  }${outOfRange ? ' · out of range' : ''}`

  return (
    <span
      className={styles.row}
      role="img"
      aria-label={ariaLabel ?? generatedLabel}
      data-score={score}
      {...(best !== undefined && { 'data-best': best })}
    >
      <span className={styles.track} style={{ width }}>
        <span
          className={styles.fill}
          data-role="fill"
          data-is-best={isBest ? 'true' : undefined}
          data-out-of-range={outOfRange ? 'true' : undefined}
          style={{ width: `${clamped * 100}%` }}
        />
        {best !== undefined && best !== score && (
          <span
            className={styles.bestMarker}
            data-role="best-marker"
            style={{ left: `${Math.min(1, Math.max(0, best)) * 100}%` }}
          />
        )}
      </span>
      <span className={styles.value}>{score.toFixed(3)}</span>
    </span>
  )
}
