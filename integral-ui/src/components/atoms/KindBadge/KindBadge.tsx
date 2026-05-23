import type { CSSProperties } from 'react'
import type { IntentKind } from '@/schema'
import styles from './KindBadge.module.css'

/**
 * Single-character glyph per IntentKind. Exported so that any code that needs
 * to render the glyph standalone (e.g. dense list views, breadcrumbs, search
 * results) can consume the same mapping without hand-rolling a switch.
 *
 * Rule: every value in the schema's `IntentKind` enum MUST have a glyph here.
 * If a v0.2 schema bump adds a new kind, TypeScript will fail to satisfy the
 * `Record<IntentKind, string>` constraint until this map is updated — that's
 * the intended falsification path.
 */
export const KIND_GLYPHS: Record<IntentKind, string> = {
  // (a) Nous-shaped — capital for parent, lowercase for child
  'nous-campaign': 'N',
  'nous-iteration': 'n',
  // (b) Coral-shaped
  'coral-optimization': 'C',
  'coral-attempt': 'c',
  // (c) Feature-development-shaped
  'feature-campaign': 'F',
  'feature-pr': '↗',
  // (d) Paper-shaped
  'paper-campaign': 'P',
  'paper-section': '§',
  'paper-claim': '·',
}

export interface KindBadgeProps {
  kind: IntentKind
  /** Optional caption rendered alongside the glyph. */
  label?: string
  /** Glyph box edge length in px. Default 18. */
  size?: number
  /** Accessible label override; when omitted the glyph is decorative. */
  ariaLabel?: string
}

/**
 * KindBadge — typographic glyph identifying an Intent's kind, optionally
 * paired with a label.
 *
 * The glyph mapping is in JS (not CSS `::before content`) so that the glyph
 * is real text — copyable, selectable, and screen-reader-friendly when
 * `ariaLabel` is provided.
 *
 * `data-kind` is exposed on both the wrapper and the glyph so CSS or surface
 * code can target a specific kind without prop drilling.
 */
export function KindBadge({
  kind,
  label,
  size = 18,
  ariaLabel,
}: KindBadgeProps) {
  const glyph = KIND_GLYPHS[kind]
  const sizeStyle = { '--kind-badge-size': `${size}px` } as CSSProperties
  return (
    <span
      className={styles.badge}
      data-kind={kind}
      style={sizeStyle}
      role={ariaLabel ? 'img' : undefined}
      aria-label={ariaLabel}
    >
      <span
        className={styles.glyph}
        data-kind={kind}
        aria-hidden={ariaLabel ? undefined : true}
      >
        {glyph}
      </span>
      {label !== undefined && <span className={styles.label}>{label}</span>}
    </span>
  )
}
