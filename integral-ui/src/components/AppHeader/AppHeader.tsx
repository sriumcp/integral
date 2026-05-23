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
  /** Click handler for the refresh button. When provided, the right
   *  cluster renders a refresh affordance instead of the legacy
   *  "reversibility · 24h" placeholder chip. The button shows
   *  "↻ synced <relative-time> ago" and goes amber past the staleness
   *  threshold (60min) to flag that the workspace data may be old. */
  onRefresh?: () => void
  /** Timestamp of the last successful workspace fetch. Drives the
   *  "synced X ago" hint and the amber-when-stale state. ISO 8601. */
  lastSyncedAt?: string
  /** When true, the refresh button is disabled and shows "refreshing…". */
  refreshing?: boolean
}

const STALE_AFTER_MS = 60 * 60 * 1000

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
  onRefresh,
  lastSyncedAt,
  refreshing,
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
        {onRefresh ? (
          <RefreshButton
            onClick={onRefresh}
            lastSyncedAt={lastSyncedAt}
            refreshing={refreshing}
          />
        ) : (
          <Chip mono tone="mute" title="v0.2 — audit log">
            reversibility · 24h
          </Chip>
        )}
        <PartyChip party={me} />
      </div>
    </header>
  )
}

interface RefreshButtonProps {
  onClick: () => void
  lastSyncedAt: string | undefined
  refreshing: boolean | undefined
}

function RefreshButton({
  onClick,
  lastSyncedAt,
  refreshing,
}: RefreshButtonProps) {
  const ageMs = lastSyncedAt ? Date.now() - new Date(lastSyncedAt).getTime() : 0
  const stale = lastSyncedAt ? ageMs > STALE_AFTER_MS : false
  const ageLabel = lastSyncedAt ? humanRelTime(lastSyncedAt) : ''

  return (
    <button
      type="button"
      className={styles.refreshButton}
      onClick={onClick}
      disabled={refreshing}
      aria-label="refresh workspace"
      data-stale={stale ? 'true' : undefined}
      title={
        refreshing
          ? 'refreshing…'
          : lastSyncedAt
            ? `last synced ${new Date(lastSyncedAt).toLocaleString()}`
            : 'refresh workspace'
      }
    >
      <span className={styles.refreshIcon} aria-hidden="true">
        ↻
      </span>
      <span className={styles.refreshLabel}>
        {refreshing ? 'refreshing…' : `synced ${ageLabel} ago`}
      </span>
    </button>
  )
}

function humanRelTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 0) return 'just now'
  if (ms < 60_000) return 'just now'
  const m = Math.round(ms / 60_000)
  if (m < 60) return `${m}m`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h`
  const d = Math.round(h / 24)
  return `${d}d`
}
