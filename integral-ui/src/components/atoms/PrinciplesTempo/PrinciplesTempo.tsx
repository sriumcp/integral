import styles from './PrinciplesTempo.module.css'

export interface PrinciplesTempoDatum {
  /** Iteration index (1-based; supplied by the adapter). Must be unique
   *  across the input array; the atom does not deduplicate. */
  iterationNumber: number
  /** Number of principles emitted *during* this iteration (NOT cumulative). */
  principlesEmitted: number
}

export interface PrinciplesTempoProps {
  /** Per-iteration counts. The atom cumulates internally. Order should
   *  reflect chronological iteration order (typically by iterationNumber). */
  data: ReadonlyArray<PrinciplesTempoDatum>
  /** Optional caption rendered as a `<figcaption>` above the SVG.
   *  When provided, the atom wraps in a `<figure>`; when absent, the
   *  atom renders bare. */
  title?: string
  /** Pixel width of the SVG. Default 240. */
  width?: number
  /** Pixel height of the SVG. Default 60. */
  height?: number
  /** Accessible label override; defaults to a generated summary. */
  ariaLabel?: string
}

/**
 * PrinciplesTempo — cumulative-step visualization of principle extraction
 * across iterations.
 *
 * The shape of the line carries the load-bearing signal: a steep rise
 * means the campaign is *learning* (principles being extracted in bursts);
 * a flat segment means iterations ran without producing principles. A
 * researcher reading the plot in 2 seconds sees both the total volume and
 * the temporal pattern.
 *
 * Visual register matches the v0.1.5 cross-adapter discipline:
 *  - `--ink-2` for the line, `--amber` for the most-recent (current) point
 *  - mono tick labels, no gridlines, no animation
 *  - inline annotation of the final cumulative count next to the last point
 *  - placeholder when total is zero (the threshold isn't met)
 *
 * Pure presentational — the surface decides whether to render this at all
 * based on its own threshold logic; the atom only emits a placeholder for
 * structurally-empty input (`[]` or all-zero counts).
 */
export function PrinciplesTempo({
  data,
  title,
  width = 240,
  height = 60,
  ariaLabel,
}: PrinciplesTempoProps) {
  const total = data.reduce((acc, d) => acc + d.principlesEmitted, 0)

  // Empty input — no iterations yet.
  if (data.length === 0) {
    return (
      <span
        className={styles.placeholder}
        role="img"
        aria-label={ariaLabel ?? 'principles tempo · no iterations yet'}
        data-points="0"
        data-total="0"
      >
        —
      </span>
    )
  }

  // Threshold not met — iterations exist but no principles have been
  // extracted. The substrate's "figures conditional on data threshold"
  // commitment kicks in here.
  if (total === 0) {
    return (
      <span
        className={styles.placeholder}
        role="img"
        aria-label={ariaLabel ?? 'principles tempo · no principles yet'}
        data-points={data.length}
        data-total="0"
      >
        —
      </span>
    )
  }

  // Cumulative series.
  const cumulative: number[] = []
  let acc = 0
  for (const d of data) {
    acc += d.principlesEmitted
    cumulative.push(acc)
  }
  const finalCumulative = cumulative[cumulative.length - 1]!
  const iterMin = data[0]!.iterationNumber
  const iterMax = data[data.length - 1]!.iterationNumber

  // Layout — inset margins so axis labels + annotations have room.
  const padX = 18
  const padTop = 8
  const padBot = 16
  const plotW = width - padX * 2
  const plotH = height - padTop - padBot
  const xspan = data.length > 1 ? data.length - 1 : 1
  const yMax = finalCumulative === 0 ? 1 : finalCumulative

  // Step-line segments — for each i, draw horizontal from prev x to
  // current x at prev cumulative, then vertical to current cumulative.
  // First point is just M.
  const xFor = (i: number) => padX + (i / xspan) * plotW
  const yFor = (v: number) => padTop + plotH - (v / yMax) * plotH

  const stepCommands: string[] = []
  for (let i = 0; i < cumulative.length; i++) {
    const x = xFor(i)
    const y = yFor(cumulative[i]!)
    if (i === 0) {
      stepCommands.push(`M${x.toFixed(1)},${y.toFixed(1)}`)
    } else {
      const prevY = yFor(cumulative[i - 1]!)
      // Horizontal at previous y, then vertical to current y.
      stepCommands.push(`H${x.toFixed(1)}`)
      if (prevY !== y) stepCommands.push(`V${y.toFixed(1)}`)
    }
  }
  const d = stepCommands.join(' ')

  const lastIdx = cumulative.length - 1
  const lastX = xFor(lastIdx)
  const lastY = yFor(finalCumulative)

  const generatedLabel = `principles tempo · ${total} principle${total === 1 ? '' : 's'} extracted across ${data.length} iteration${data.length === 1 ? '' : 's'} (iter ${iterMin}–${iterMax})`

  const svg = (
    <svg
      className={styles.svg}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={ariaLabel ?? generatedLabel}
      data-atom="principles-tempo"
      data-points={data.length}
      data-total={total}
      data-iterations={data.length}
      data-final-cumulative={finalCumulative}
      data-iter-min={iterMin}
      data-iter-max={iterMax}
    >
      {/* Baseline at y = 0 so a flat-then-rise pattern reads as actual rise */}
      <line
        x1={padX}
        x2={width - padX}
        y1={padTop + plotH}
        y2={padTop + plotH}
        className={styles.baseline}
      />
      <path d={d} className={styles.line} />
      <circle
        cx={lastX}
        cy={lastY}
        r={3}
        className={styles.lastPoint}
        data-last-point="true"
      />
      {/* Inline annotation of the final cumulative value, placed above
          the last point — small mono numeral. */}
      <text
        x={lastX}
        y={Math.max(lastY - 6, padTop + 8)}
        textAnchor="end"
        className={styles.lastValue}
      >
        {finalCumulative}
      </text>
      {/* Iteration span tick labels at the corners — mono. */}
      <text
        x={padX}
        y={height - 3}
        textAnchor="start"
        className={styles.tick}
      >
        iter {iterMin}
      </text>
      <text
        x={width - padX}
        y={height - 3}
        textAnchor="end"
        className={styles.tick}
      >
        iter {iterMax}
      </text>
    </svg>
  )

  if (title) {
    return (
      <figure className={styles.figure}>
        <figcaption className={styles.caption}>{title}</figcaption>
        {svg}
      </figure>
    )
  }

  return svg
}
