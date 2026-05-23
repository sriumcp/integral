import { ZoomLevelSchema, type ZoomLevel } from '@/schema'
import styles from './ZoomToggle.module.css'

export interface ZoomToggleProps {
  value: ZoomLevel
  onChange: (zoom: ZoomLevel) => void
  /** Optional accessible label; defaults to "zoom level". */
  ariaLabel?: string
}

/**
 * ZoomToggle — segmented 3-way control over `ZoomLevel`.
 *
 * Surfaces wire `value` + `onChange` so the body actually re-renders per
 * zoom (the resolved decision in CLAUDE.md § Resolved surface decisions).
 * Iterates `ZoomLevelSchema.options` so the segments stay in sync with
 * the schema — adding a v0.2 zoom level grows the toggle automatically.
 */
export function ZoomToggle({ value, onChange, ariaLabel = 'zoom level' }: ZoomToggleProps) {
  return (
    <div className={styles.toggle} role="group" aria-label={ariaLabel}>
      {ZoomLevelSchema.options.map((zoom) => {
        const active = zoom === value
        return (
          <button
            key={zoom}
            type="button"
            className={styles.segment}
            data-zoom={zoom}
            data-active={active ? 'true' : undefined}
            aria-pressed={active}
            onClick={() => {
              if (!active) onChange(zoom)
            }}
          >
            {zoom}
          </button>
        )
      })}
    </div>
  )
}
