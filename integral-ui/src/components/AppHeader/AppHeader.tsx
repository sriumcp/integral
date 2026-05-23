import type { Party } from '@/schema'
import { SCHEMA_VERSION } from '@/schema'
import { Chip, PartyChip } from '@/components/atoms'
import { IntegralGlyph } from './IntegralGlyph'
import styles from './AppHeader.module.css'

export interface Crumb {
  /** Display text for this segment. */
  label: string
  /** Click handler — when undefined, the segment is the current position
   *  and renders as plain text rather than a button. */
  onClick?: () => void
}

export interface AppHeaderProps {
  /** Identifier for the current view; written to `data-surface` on the root
   *  so visual tests and surface-scoped CSS can scope assertions. */
  surface: string
  /** Breadcrumb path. The first segment is conventionally `workspace`; the
   *  last is the current position (no `onClick`). */
  breadcrumbs: ReadonlyArray<Crumb>
  /** The current user — drives the right-cluster me chip. */
  me: Party
  /** Click handler for the brand mark (glyph + wordmark). When present,
   *  the left cluster renders as a button — typically wired to return to
   *  the Landing surface. */
  onLogoClick?: () => void
}

/**
 * AppHeader — sticky-top chrome bar across every surface (after Landing).
 *
 * Three clusters (left / center / right) sized by the natural width of
 * their content; the center cluster ellipsis-truncates its long intent-
 * title segment below the 768px breakpoint so the breadcrumb path stays
 * legible without overflowing.
 *
 * The schema-version chip reads the `SCHEMA_VERSION` literal directly —
 * the chrome cannot silently drift from the schema layer's source of
 * truth (CLAUDE.md § Operating conventions).
 */
export function AppHeader({
  surface,
  breadcrumbs,
  me,
  onLogoClick,
}: AppHeaderProps) {
  const left = (
    <>
      <IntegralGlyph title="Integral logo" />
      <span className={styles.wordmark}>Integral</span>
      <Chip mono tone="mute">
        v0.1
      </Chip>
    </>
  )

  return (
    <header className={styles.header} data-surface={surface}>
      {onLogoClick ? (
        <button
          type="button"
          className={styles.leftBtn}
          onClick={onLogoClick}
          aria-label="Integral · back to landing"
        >
          {left}
        </button>
      ) : (
        <div className={styles.left}>{left}</div>
      )}

      <nav className={styles.center} aria-label="breadcrumbs">
        {breadcrumbs.map((crumb, i) => {
          const isLast = i === breadcrumbs.length - 1
          const isLong = i === breadcrumbs.length - 1 && breadcrumbs.length > 2
          return (
            <span key={i} className={styles.crumbRow}>
              {i > 0 && (
                <span className={styles.crumbSep} aria-hidden="true">
                  ›
                </span>
              )}
              {crumb.onClick ? (
                <button
                  type="button"
                  className={styles.crumbBtn}
                  onClick={crumb.onClick}
                >
                  {crumb.label}
                </button>
              ) : (
                <span
                  className={isLong ? styles.crumbCurrentLong : styles.crumbCurrent}
                  data-current={isLast ? 'true' : undefined}
                  title={isLong ? crumb.label : undefined}
                >
                  {crumb.label}
                </span>
              )}
            </span>
          )
        })}
      </nav>

      <div className={styles.right}>
        <Chip mono tone="mute" dot={'var(--sage)'}>
          schema v{SCHEMA_VERSION}
        </Chip>
        <Chip mono tone="mute" title="v0.2 — audit log">
          reversibility · 24h
        </Chip>
        <PartyChip party={me} />
      </div>
    </header>
  )
}
