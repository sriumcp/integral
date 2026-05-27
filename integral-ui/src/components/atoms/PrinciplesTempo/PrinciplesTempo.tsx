import type { PrinciplesTempoDatum } from '@/lib/visual-data-shapes'
import styles from './PrinciplesTempo.module.css'

export type { PrinciplesTempoDatum }

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
  /** Whether the rendered campaign is in a *current* state — `active`
   *  or `gated`. When true (default), the rightmost cumulative point
   *  paints in `--amber` (the substrate's reserved "current/active/
   *  awaiting" signal). When false (terminal states: satisfied /
   *  abandoned / revoked), the last point falls back to ink so the
   *  amber slot stays exclusive to live work. */
  current?: boolean
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
 * Visual register matches the substrate's instrument-genre commitments:
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
  current = true,
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
  // padTop = 18 reserves the upper strip for the inline numerical
  // annotation; the cumulative-monotone line always ends at the top
  // of the plot region (y = padTop), so the value text needs to sit
  // *above* it without overlapping the dot or path. With a 10px font,
  // text-baseline at lastY - 6 yields ~3px clearance above the dot.
  const padX = 18
  const padTop = 18
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
        className={current ? styles.lastPoint : styles.lastPointTerminal}
        data-last-point="true"
        data-current={current ? 'true' : 'false'}
      />
      {/* Inline annotation of the final cumulative value, placed above
          the last point — small mono numeral. textAnchor="end" + x=lastX
          grows the text leftward so it never clips the right edge; the
          enlarged padTop guarantees the text sits above the dot/path
          with clean separation. */}
      <text
        x={lastX}
        y={lastY - 6}
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
