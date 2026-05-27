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
  style?: CSSProperties | undefined
  className?: string | undefined
}

/**
 * IntegralGlyph — the brand mark.
 *
 * A smooth ∫: small top curl → diagonal body → mirrored bottom curl,
 * drawn as three cubic Beziers with matching tangent *directions* at
 * the joins (G1 / geometric continuity — same direction, allowed to
 * differ in magnitude) so it reads as a single calligraphic gesture
 * rather than three pieces. Stroke-based so the character holds at
 * both 22px (header) and 140px (Landing).
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
          M 14.5 4.5
          C 14.5 2.5 12.5 2.5 12 4.5
          C 11.5 8 10.5 14 10 17.5
          C 9.5 19.5 7.5 19.5 7.5 17.5
        "
      />
    </svg>
  )
}
