import type {
  HMainTimelineDatum,
  HypothesisResult,
} from '@/lib/visual-data-shapes'
import styles from './HMainTimeline.module.css'

export type { HMainTimelineDatum }

export interface HMainTimelineProps {
  /** Per-iteration h_main result. Order is preserved as cell order;
   *  the adapter is expected to sort by `iterationNumber` ascending. */
  data: ReadonlyArray<HMainTimelineDatum>
  /** Optional caption rendered as a `<figcaption>` above the SVG. */
  title?: string
  /** Per-cell square size in px. Default 22. */
  cellSize?: number
  /** Accessible label override; defaults to a generated summary. */
  ariaLabel?: string
}

/**
 * HMainTimeline — 1×N strip of h_main result per iteration.
 *
 * The shape carries the campaign's central epistemic signal at a
 * glance: a `[✓ ✓ ✓ ✓ ✓]` strip says "h_main survived every probe";
 * a `[? ✓ − ✓ ?]` strip says "h_main was contested." The strip is
 * the campaign's *spine* — confirmation streak vs. mixed history is
 * the load-bearing visual question.
 *
 * Renders meaningfully on v0.1 data: only `h_main` lands today (gap
 * G-N-9 keeps ablation/control/robustness from being mapped), so
 * HypothesisGrid stays hidden — but a 1×N strip *is* the data we
 * have. Once G-N-9 promotes, both atoms coexist: this strip as the
 * spine, the grid as the full ablation matrix.
 *
 * Visual register matches the substrate's instrument genre:
 *  - `--sage` confirmed (✓), `--rose` refuted (−), `--mute-2`
 *    inconclusive or pending (?), no cell when result is undefined.
 *  - mono iteration-number labels below cells; no legend.
 *  - no animation; static SVG only.
 */
export function HMainTimeline({
  data,
  title,
  cellSize = 22,
  ariaLabel,
}: HMainTimelineProps) {
  if (data.length === 0) {
    return (
      <span
        className={styles.placeholder}
        role="img"
        aria-label={ariaLabel ?? 'h_main timeline · no iterations yet'}
      >
        —
      </span>
    )
  }

  type Cell = { iterationNumber: number; result: HypothesisResult }
  const cells: Cell[] = []
  let confirmedCount = 0
  let refutedCount = 0
  let inconclusiveCount = 0
  let pendingCount = 0

  for (const datum of data) {
    if (datum.result === undefined) continue
    cells.push({ iterationNumber: datum.iterationNumber, result: datum.result })
    if (datum.result === 'confirmed') confirmedCount++
    else if (datum.result === 'refuted') refutedCount++
    else if (datum.result === 'inconclusive') inconclusiveCount++
    else if (datum.result === 'pending') pendingCount++
  }

  if (cells.length === 0) {
    return (
      <span
        className={styles.placeholder}
        role="img"
        aria-label={ariaLabel ?? 'h_main timeline · no probes yet'}
      >
        —
      </span>
    )
  }

  const colLabelH = 16
  const padX = 4
  const padY = 4
  const stripW = data.length * cellSize
  const totalW = padX + stripW + padX
  const totalH = padY + cellSize + colLabelH + padY

  // Render one slot per input datum (so iteration ordering reads
  // even when some results are missing). Cells emit only when result
  // is defined; iteration labels emit for every datum so the user
  // can see "iter 2 ran, iter 2 wasn't probed."
  const xFor = (col: number) => padX + col * cellSize
  const cellY = padY

  const markFor = (r: HypothesisResult): string => {
    if (r === 'confirmed') return '✓'
    if (r === 'refuted') return '−'
    return '?'
  }

  const generatedLabel = `h_main timeline · ${cells.length} ${cells.length === 1 ? 'probe' : 'probes'} across ${data.length} iteration${data.length === 1 ? '' : 's'} · ${confirmedCount} confirmed · ${refutedCount} refuted · ${inconclusiveCount + pendingCount} unresolved`

  const svg = (
    <svg
      className={styles.svg}
      width={totalW}
      height={totalH}
      viewBox={`0 0 ${totalW} ${totalH}`}
      role="img"
      aria-label={ariaLabel ?? generatedLabel}
      data-atom="h-main-timeline"
      data-cells={cells.length}
      data-iterations={data.length}
      data-confirmed-count={confirmedCount}
      data-refuted-count={refutedCount}
      data-inconclusive-count={inconclusiveCount}
      data-pending-count={pendingCount}
    >
      {/* Cells — only emitted when result is defined. */}
      {data.map((datum, col) => {
        if (datum.result === undefined) return null
        const cx = xFor(col) + cellSize / 2
        const cy = cellY + cellSize / 2
        return (
          <g
            key={`cell-${datum.iterationNumber}`}
            data-cell="true"
            data-iteration={datum.iterationNumber}
            data-result={datum.result}
          >
            <rect
              x={xFor(col) + 1}
              y={cellY + 1}
              width={cellSize - 2}
              height={cellSize - 2}
              rx={2}
              className={styles[`cellBg-${datum.result}`]}
            />
            <text
              x={cx}
              y={cy + 4}
              textAnchor="middle"
              className={styles[`cellMark-${datum.result}`]}
            >
              {markFor(datum.result)}
            </text>
          </g>
        )
      })}

      {/* Iteration-number labels — bottom margin, mono, mute. */}
      {data.map((datum, col) => (
        <text
          key={`col-${datum.iterationNumber}`}
          x={xFor(col) + cellSize / 2}
          y={padY + cellSize + colLabelH - 4}
          textAnchor="middle"
          className={styles.colLabel}
          data-col-label="true"
        >
          {datum.iterationNumber}
        </text>
      ))}
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
