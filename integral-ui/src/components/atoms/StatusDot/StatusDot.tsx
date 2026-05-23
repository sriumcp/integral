import type { Status } from '@/schema'
import styles from './StatusDot.module.css'

export interface StatusDotProps {
  /** Canonical schema status. */
  status: Status
  /** When true, renders a pulsing halo to express active agent presence. */
  presence?: boolean
  /** Diameter in pixels. Default 8. */
  size?: number
  /** Optional accessible label; the dot is decorative if omitted. */
  ariaLabel?: string
}

/**
 * StatusDot — small colored circle whose color expresses an Intent's `Status`.
 *
 * The atom consumes design tokens from `index.css` (`--status-*` variables)
 * via attribute selectors in `StatusDot.module.css`. Coloring lives in CSS,
 * not JS — there's no JS lookup table to drift from the palette.
 *
 * For UI states that aren't canonical Status values (e.g. "a child intent in
 * the proposal state"), compose atoms at the surface layer rather than
 * extending this atom's vocabulary.
 */
export function StatusDot({
  status,
  presence = false,
  size = 8,
  ariaLabel,
}: StatusDotProps) {
  const className = presence ? `${styles.dot} ${styles.presence}` : styles.dot
  return (
    <span
      className={className}
      data-status={status}
      data-presence={presence ? 'true' : undefined}
      style={{ width: size, height: size }}
      role={ariaLabel ? 'img' : undefined}
      aria-label={ariaLabel}
      aria-hidden={ariaLabel ? undefined : true}
    />
  )
}
