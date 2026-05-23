import styles from './Sparkline.module.css'

export interface SparklineProps {
  values: readonly number[]
  width?: number
  height?: number
  /** Optional value to highlight as a horizontal "best" reference line. */
  best?: number
  /** Accessible description; falls back to a generated summary. */
  ariaLabel?: string
}

/**
 * Sparkline — minimal time-series line chart.
 *
 * Discipline:
 *  - Surfaces are responsible for *whether* to render a sparkline (the
 *    figure-conditional rule from the v0.1 spec); this atom renders given
 *    values without enforcing that policy.
 *  - For < 2 values, renders a placeholder ("—") so the slot is consistent.
 *  - The chart is a typed `<svg role="img">` with an aria-label that
 *    describes the data — never just decorative.
 *  - Exposes `data-points`, `data-min`, `data-max`, `data-last` on the root
 *    so tests and surface code can read the shape without parsing the SVG.
 */
export function Sparkline({
  values,
  width = 120,
  height = 28,
  best,
  ariaLabel,
}: SparklineProps) {
  if (values.length < 2) {
    return (
      <span
        className={styles.placeholder}
        role="img"
        aria-label={ariaLabel ?? 'sparkline · insufficient data'}
        data-points={values.length}
      >
        —
      </span>
    )
  }

  const min = Math.min(...values)
  const max = Math.max(...values)
  const last = values[values.length - 1]!
  const constant = max === min
  // For constant series, render the line at vertical mid-track rather than at
  // the bottom (the naive `(v - min) / 0` collapses everything to y = bottom,
  // which visually misrepresents a plateau as a floor). The data-constant
  // attribute exposes this state to surfaces and tests.
  const range = max - min
  const xstep = width / (values.length - 1)
  const yFor = (v: number) =>
    constant
      ? height / 2
      : height - ((v - min) / range) * (height - 2) - 1
  const points = values.map((v, i) => {
    const x = i * xstep
    return [x, yFor(v)] as const
  })
  const d = points
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`)
    .join(' ')
  const lastPoint = points[points.length - 1]!

  const generatedLabel = constant
    ? `sparkline · ${values.length} points · constant at ${last.toFixed(3)}`
    : `sparkline · ${values.length} points · min ${min.toFixed(3)} · max ${max.toFixed(3)} · last ${last.toFixed(3)}`

  const bestY = best !== undefined ? yFor(best) : null

  return (
    <svg
      className={styles.svg}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={ariaLabel ?? generatedLabel}
      data-points={values.length}
      data-min={min}
      data-max={max}
      data-last={last}
      {...(constant && { 'data-constant': 'true' })}
      {...(best !== undefined && { 'data-best': best })}
    >
      <path d={d} className={styles.path} />
      <circle
        cx={lastPoint[0]}
        cy={lastPoint[1]}
        r={2.5}
        className={styles.lastPoint}
      />
      {bestY !== null && (
        <line
          x1={0}
          x2={width}
          y1={bestY}
          y2={bestY}
          className={styles.bestLine}
        />
      )}
    </svg>
  )
}
