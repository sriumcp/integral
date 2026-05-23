import type { CSSProperties } from 'react'

export interface IntegralGlyphProps {
  /** Rendered size in px. Interpreted as height; width defaults to the
   *  viewBox aspect (square unless `tall` is set). Default 22 — matches
   *  the AppHeader's left cluster. */
  size?: number
  /** Render with a tall aspect (≈13:22) by cropping the surrounding
   *  horizontal whitespace from the viewBox. The integral character is
   *  itself naturally tall, so this variant tightens the perceived width
   *  without changing the path. Default false (square). */
  tall?: boolean
  /** Optional title — when provided, exposes role="img" + aria-label.
   *  When omitted, the glyph is decorative (aria-hidden). */
  title?: string
  /** Optional inline style passthrough for surface-level color/spacing. */
  style?: CSSProperties
  className?: string
}

/**
 * IntegralGlyph — the brand mark.
 *
 * A single hand-drawn squiggle, shaped to approximate an integration
 * symbol: a top arch curling up-and-over for the cap, a mostly-vertical
 * body with a gentle rightward slant, and a mirrored bottom arch
 * curling down-and-under for the tail. Stroke-based so the calligraphic
 * character holds at both 22px (header) and 140px (Landing).
 *
 * Stays within a 1-unit margin of the 22×22 viewBox so the glyph never
 * clips against the surface frame regardless of stroke-width tuning.
 * Inherits `currentColor` from the surrounding text.
 */
export function IntegralGlyph({
  size = 22,
  tall = false,
  title,
  style,
  className,
}: IntegralGlyphProps) {
  const viewBox = tall ? '5 0 13 22' : '0 0 22 22'
  const width = tall ? Math.round((size * 13) / 22) : size
  const height = size
  return (
    <svg
      width={width}
      height={height}
      viewBox={viewBox}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      className={className}
      style={style}
    >
      <path
        d="
          M 15 4
          C 17 1 10 1 11 4.5
          L 12 16
          C 13 20 6 20 7 17
        "
      />
    </svg>
  )
}
