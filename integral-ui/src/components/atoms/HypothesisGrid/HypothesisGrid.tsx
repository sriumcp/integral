import styles from './HypothesisGrid.module.css'

/** Hypothesis result vocabulary — matches the schema's HypothesisResult enum. */
export type HypothesisResult =
  | 'pending'
  | 'confirmed'
  | 'refuted'
  | 'inconclusive'

export interface HypothesisGridDatum {
  /** Stable label for this hypothesis position. The atom uses label
   *  identity to align cells across iterations — first-seen order
   *  determines row order. Adapter convention: 'h_main',
   *  'h_ablation[0]', 'h_super_additivity', 'h_control_negative',
   *  'h_robustness[0]', etc. */
  label: string
  /** Optional result. When undefined, no cell is emitted (the position
   *  exists in the iteration but wasn't probed at that point). */
  result?: HypothesisResult
}

export interface HypothesisGridIteration {
  iterationNumber: number
  hypotheses: ReadonlyArray<HypothesisGridDatum>
}

export interface HypothesisGridProps {
  /** Per-iteration hypothesis state. Order is preserved as column order. */
  iterations: ReadonlyArray<HypothesisGridIteration>
  /** Optional caption rendered as a `<figcaption>` above the SVG. */
  title?: string
  /** Pixel width override; defaults to a width derived from iteration count. */
  width?: number
  /** Per-cell square size in px. Default 20. */
  cellSize?: number
  /** Accessible label override; defaults to a generated summary. */
  ariaLabel?: string
}

/**
 * HypothesisGrid — 2D matrix of hypotheses (rows) × iterations (columns)
 * with per-cell status marks for confirmed / refuted / inconclusive /
 * pending.
 *
 * The shape carries the campaign's epistemic story at a glance:
 *  - A row of greens is a confirmed hypothesis surviving across iterations.
 *  - A row that flips green → red shows a hypothesis that was confirmed
 *    early but failed under later probing — strong falsification signal.
 *  - Columns dominated by `--mute-2` (inconclusive) signal "iterations
 *    we ran but didn't learn from."
 *  - Sparse columns (only h_main probed) vs. dense columns (full bundle)
 *    signal where the campaign focused depth.
 *
 * Visual register matches the v0.1.5 cross-adapter discipline:
 *  - `--sage` confirmed (✓), `--rose` refuted (−), `--mute-2` inconclusive
 *    or pending (?), no cell when result is undefined.
 *  - mono row + column labels; no legend (cells self-describe via mark).
 *  - no gridlines (whitespace > gridlines); subtle column rule between
 *    iterations only if needed at higher cell counts (deferred).
 *
 * Pure presentational. Surfaces decide whether to render based on the
 * "≥1 hypothesis probed" threshold; the atom emits a placeholder when
 * structurally empty.
 */
export function HypothesisGrid({
  iterations,
  title,
  width,
  cellSize = 20,
  ariaLabel,
}: HypothesisGridProps) {
  if (iterations.length === 0) {
    return (
      <span
        className={styles.placeholder}
        role="img"
        aria-label={ariaLabel ?? 'hypothesis grid · no iterations yet'}
      >
        —
      </span>
    )
  }

  // Aggregate: collect unique row labels in first-seen order, build a
  // sparse cell map keyed by `${row}::${iterationNumber}`.
  const rowOrder: string[] = []
  const seen = new Set<string>()
  type Cell = { rowLabel: string; iteration: number; result: HypothesisResult }
  const cells: Cell[] = []
  let confirmedCount = 0
  let refutedCount = 0
  let inconclusiveCount = 0
  let pendingCount = 0

  for (const iter of iterations) {
    for (const h of iter.hypotheses) {
      if (!seen.has(h.label)) {
        seen.add(h.label)
        rowOrder.push(h.label)
      }
      if (h.result !== undefined) {
        cells.push({
          rowLabel: h.label,
          iteration: iter.iterationNumber,
          result: h.result,
        })
        if (h.result === 'confirmed') confirmedCount++
        else if (h.result === 'refuted') refutedCount++
        else if (h.result === 'inconclusive') inconclusiveCount++
        else if (h.result === 'pending') pendingCount++
      }
    }
  }

  const hasResults = cells.length > 0
  if (!hasResults) {
    return (
      <span
        className={styles.placeholder}
        role="img"
        aria-label={ariaLabel ?? 'hypothesis grid · no probes yet'}
      >
        —
      </span>
    )
  }

  // Layout — labels live in left and bottom margins; cells form the
  // body grid.
  const rowLabelW = 96
  const colLabelH = 16
  const padX = 4
  const padY = 4
  const gridW = iterations.length * cellSize
  const gridH = rowOrder.length * cellSize
  const totalW = width ?? rowLabelW + padX + gridW + padX
  const totalH = padY + gridH + colLabelH + padY

  const xFor = (col: number) => rowLabelW + padX + col * cellSize
  const yFor = (row: number) => padY + row * cellSize

  // Cell mark glyphs — short, mono, scannable.
  const markFor = (r: HypothesisResult): string => {
    if (r === 'confirmed') return '✓'
    if (r === 'refuted') return '−'
    return '?'
  }

  const generatedLabel = `hypothesis grid · ${rowOrder.length} ${rowOrder.length === 1 ? 'hypothesis' : 'hypotheses'} across ${iterations.length} iteration${iterations.length === 1 ? '' : 's'} · ${confirmedCount} confirmed · ${refutedCount} refuted · ${inconclusiveCount + pendingCount} unresolved`

  const svg = (
    <svg
      className={styles.svg}
      width={totalW}
      height={totalH}
      viewBox={`0 0 ${totalW} ${totalH}`}
      role="img"
      aria-label={ariaLabel ?? generatedLabel}
      data-atom="hypothesis-grid"
      data-rows={rowOrder.length}
      data-cols={iterations.length}
      data-confirmed-count={confirmedCount}
      data-refuted-count={refutedCount}
      data-inconclusive-count={inconclusiveCount}
      data-pending-count={pendingCount}
    >
      {/* Row labels — left margin, mono, mute. */}
      {rowOrder.map((label, rowIdx) => (
        <text
          key={`row-${label}`}
          x={rowLabelW - 6}
          y={yFor(rowIdx) + cellSize / 2 + 3}
          textAnchor="end"
          className={styles.rowLabel}
          data-row-label-text="true"
        >
          {label}
        </text>
      ))}

      {/* Column labels — bottom margin, mono, mute. */}
      {iterations.map((iter, colIdx) => (
        <text
          key={`col-${iter.iterationNumber}`}
          x={xFor(colIdx) + cellSize / 2}
          y={padY + gridH + colLabelH - 4}
          textAnchor="middle"
          className={styles.colLabel}
          data-col-label="true"
        >
          {iter.iterationNumber}
        </text>
      ))}

      {/* Cells — only emitted when result is defined. */}
      {cells.map((cell) => {
        const colIdx = iterations.findIndex(
          (i) => i.iterationNumber === cell.iteration
        )
        const rowIdx = rowOrder.indexOf(cell.rowLabel)
        const cx = xFor(colIdx) + cellSize / 2
        const cy = yFor(rowIdx) + cellSize / 2
        return (
          <g
            key={`${cell.rowLabel}-${cell.iteration}`}
            data-cell="true"
            data-row-label={cell.rowLabel}
            data-iteration={cell.iteration}
            data-result={cell.result}
          >
            <rect
              x={xFor(colIdx) + 1}
              y={yFor(rowIdx) + 1}
              width={cellSize - 2}
              height={cellSize - 2}
              rx={2}
              className={styles[`cellBg-${cell.result}`]}
            />
            <text
              x={cx}
              y={cy + 4}
              textAnchor="middle"
              className={styles[`cellMark-${cell.result}`]}
            >
              {markFor(cell.result)}
            </text>
          </g>
        )
      })}
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
