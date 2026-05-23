import type { CSSProperties, ReactNode } from 'react'
import type { Status } from '@/schema'
import styles from './Chip.module.css'

export type ChipTone = 'mute' | 'amber' | 'sage' | 'rose' | 'blue'

export interface ChipProps {
  /** Tone-based coloring — independent of any schema status. */
  tone?: ChipTone
  /** Status-based coloring — drives the chip's color from a schema Status.
   *  `tone` and `status` are mutually exclusive; if both are passed, `status`
   *  takes precedence (and a console warning fires in dev). */
  status?: Status
  /** Show a leading dot. `true` uses the chip's accent color; a string is
   *  treated as an explicit CSS color override for the dot. */
  dot?: boolean | string
  /** Add the pulse animation to the dot. Implies `dot`. */
  pulse?: boolean
  /** Use the monospace face + slightly tighter sizing. */
  mono?: boolean
  /** Transparent background (border-only). */
  soft?: boolean
  /** Native `title` attribute for hover-tooltip. */
  title?: string
  children: ReactNode
}

/**
 * Chip — small inline pill with optional leading dot.
 *
 * Coloring lives in `Chip.module.css` via `data-tone` / `data-status`
 * attribute selectors; this component sets attributes, never inline colors.
 * The single inline-style escape hatch is the explicit dot color override
 * (passing `dot="<color>"`) — stored in a CSS custom property so the
 * stylesheet stays the source of truth.
 */
export function Chip({
  tone,
  status,
  dot = false,
  pulse = false,
  mono = false,
  soft = false,
  title,
  children,
}: ChipProps) {
  if (tone && status && import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.warn('Chip: `tone` and `status` are mutually exclusive; `status` wins.')
  }

  const showDot = !!dot || pulse
  const explicitDotColor = typeof dot === 'string' ? dot : undefined
  const styleVars = explicitDotColor
    ? ({ '--chip-dot-color': explicitDotColor } as CSSProperties)
    : undefined

  // tone falls back to 'mute' so every chip has a defined data-tone for CSS.
  const effectiveTone = status ? undefined : (tone ?? 'mute')

  return (
    <span
      className={styles.chip}
      data-tone={effectiveTone}
      data-status={status}
      data-mono={mono ? 'true' : undefined}
      data-soft={soft ? 'true' : undefined}
      title={title}
      style={styleVars}
    >
      {showDot && (
        <span
          className={pulse ? `${styles.dot} ${styles.dotPulse}` : styles.dot}
          aria-hidden="true"
        />
      )}
      {children}
    </span>
  )
}
