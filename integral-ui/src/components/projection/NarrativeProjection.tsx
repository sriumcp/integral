/**
 * NarrativeProjection — renders an ExecutedProjection.
 *
 * Layout discipline:
 *  - Figures render first, in the order the LLM declared them, so the
 *    visual story leads the prose.
 *  - Prose renders below as a paragraph (one or more, separated by blank
 *    lines). Inline numerics from quoted_numerics are wrapped in spans
 *    that carry data-cite attributes for hover-citation tooltips.
 *  - cite_index is currently surfaced as data-attributes only; richer
 *    hover UI is a v0.4+ enhancement.
 */

import type { ExecutedProjection } from '@/lib/projection/spec'
import { PlotFigure } from './PlotFigure'
import styles from './NarrativeProjection.module.css'

export interface NarrativeProjectionProps {
  projection: ExecutedProjection
}

export function NarrativeProjection({ projection }: NarrativeProjectionProps) {
  const paragraphs = paragraphSplit(projection.prose)
  return (
    <div
      className={styles.narrative}
      data-projection-source={projection.source}
      data-figure-count={projection.figures.length}
    >
      {projection.figures.length > 0 && (
        <div className={styles.figureStack}>
          {projection.figures.map((f) => (
            <PlotFigure key={f.id} figure={f} />
          ))}
        </div>
      )}
      <div className={styles.prose}>
        {paragraphs.map((para, i) => (
          <p key={i}>{para}</p>
        ))}
      </div>
      {projection.source === 'fallback' && projection.fallback_reason && (
        <p
          className={styles.fallbackReason}
          data-testid="projection-fallback-reason"
          title="The narrative-arc projection couldn't be generated. This is the reason."
        >
          fell back · {projection.fallback_reason}
        </p>
      )}
    </div>
  )
}

function paragraphSplit(prose: string): string[] {
  const parts = prose
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter((p) => p.length > 0)
  return parts.length > 0 ? parts : [prose]
}
