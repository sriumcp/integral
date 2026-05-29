import type { Party } from '@/schema'
import { SCHEMA_VERSION } from '@/schema'
import { Chip, PartyChip } from '@/components/atoms'
import { IntegralGlyph } from './IntegralGlyph'
import styles from './AppHeader.module.css'

export interface ScopePill {
  /** Stable source id (matches `SourceEntry.id` and `intent.provenance.source`). */
  id: string
  /** Human-readable label rendered in the pill. */
  label: string
  /** Whether the source is currently included in the workspace. When the
   *  pill cluster lists ALL known sources (the v0.2.0 scope-control
   *  pattern), this distinguishes enabled (filled style) from disabled
   *  (muted/dashed style). When omitted, defaults to `true` (passive
   *  read-only legacy rendering). */
  enabled?: boolean
  /** Click handler. When provided, the pill renders as a button that
   *  toggles the source on click. When omitted, the pill renders as a
   *  passive `<span>` (legacy read-only mode). */
  onClick?: () => void
}

export interface FocusSegment {
  /** Display text — typically `intent.declaration.title`. */
  label: string
  /** Click handler for ancestor segments. Omit on the leaf (current
   *  position) so it renders as plain text instead of a button. */
  onClick?: () => void
}

/** Surfaces that render the header — Landing hides it entirely so it's
 *  intentionally absent from this union. The literal type is also the
 *  contract for the `data-surface` attribute that visual tests target. */
export type HeaderSurface = 'map' | 'detail' | 'shaping'

export interface AppHeaderProps {
  /** Identifier for the current view; written to `data-surface` on the root
   *  so visual tests and surface-scoped CSS can scope assertions. */
  surface: HeaderSurface
  /** Sources in scope for the current view — rendered as small mono labels
   *  in the center cluster, separated by `·` mid-dots. On Map this is the
   *  enabled-source set in registry order (matching the topRow source
   *  picker; the picker is the control, the header is the read-only
   *  display). On Detail/Shaping this is the focused intent's own source.
   *  Empty array → no scope row. */
  scope: ReadonlyArray<ScopePill>
  /** Optional ancestry path leading to the focused intent. Rendered as a
   *  chevron-separated chain after the scope row (root → leaf). Segments
   *  with an `onClick` render as buttons that navigate up to that
   *  ancestor; the final segment (the current position) omits `onClick`
   *  and renders as plain text. The leaf ellipsis-truncates below 768px
   *  with the full label preserved as the native tooltip. Empty/missing →
   *  no focus chain (the Map case). */
  focus?: ReadonlyArray<FocusSegment> | undefined
  /** The current user — drives the right-cluster me chip. */
  me: Party
  /** Click handler for the brand mark (glyph + wordmark). When present,
   *  the left cluster renders as a button — typically wired to return to
   *  the Landing surface. */
  onLogoClick?: () => void
  /** Click handler for the refresh button. When provided, the right
   *  cluster renders "↻ synced <relative-time> ago" — goes amber past
   *  the staleness threshold (60min) to flag that the workspace data
   *  may be old. When absent, the right cluster simply omits the
   *  refresh affordance (test/preview environments without a wired
   *  reload). */
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
 * Three clusters: brand mark (left, width-natural), workspace path
 * (center, flex-grow), surface meta + me chip (right, width-natural).
 * The center cluster carries a read-only scope row (the sources in
 * view) followed by an optional focus chain (root → leaf ancestry of
 * the currently-focused intent). The leaf focus segment ellipsis-
 * truncates below 768px so the scope row stays legible at narrow
 * widths.
 *
 * The schema-version chip reads the `SCHEMA_VERSION` literal directly —
 * the chrome cannot silently drift from the schema layer's source of
 * truth (CLAUDE.md § Operating conventions).
 */
export function AppHeader({
  surface,
  scope,
  focus,
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

      <div className={styles.center} aria-label="workspace path">
        {scope.length > 0 && (
          <span className={styles.scopeRow} data-scope="true">
            {scope.map((pill, i) => {
              const enabled = pill.enabled ?? true
              const interactive = Boolean(pill.onClick)
              const dataAttrs = {
                'data-source-id': pill.id,
                'data-enabled': enabled ? 'true' : 'false',
              }
              return (
                <span key={pill.id} className={styles.scopePillWrap}>
                  {i > 0 && (
                    <span className={styles.scopeSep} aria-hidden="true">
                      ·
                    </span>
                  )}
                  {interactive ? (
                    <button
                      type="button"
                      className={styles.scopePill}
                      onClick={pill.onClick}
                      aria-pressed={enabled}
                      aria-label={`${enabled ? 'disable' : 'enable'} source ${pill.label}`}
                      {...dataAttrs}
                    >
                      {pill.label}
                    </button>
                  ) : (
                    <span className={styles.scopePill} {...dataAttrs}>
                      {pill.label}
                    </span>
                  )}
                </span>
              )
            })}
          </span>
        )}
        {focus && focus.length > 0 && (
          <span className={styles.focusRow} data-focus="true">
            {focus.map((segment, i) => {
              const isLeaf = i === focus.length - 1
              const showChevron = i > 0 || scope.length > 0
              return (
                <span key={i} className={styles.focusSegmentWrap}>
                  {showChevron && (
                    <span className={styles.scopeChevron} aria-hidden="true">
                      ›
                    </span>
                  )}
                  {segment.onClick && !isLeaf ? (
                    <button
                      type="button"
                      className={styles.focusBtn}
                      onClick={segment.onClick}
                    >
                      {segment.label}
                    </button>
                  ) : (
                    <span
                      className={isLeaf ? styles.focus : styles.focusAncestor}
                      data-current={isLeaf ? 'true' : undefined}
                      title={isLeaf ? segment.label : undefined}
                    >
                      {segment.label}
                    </span>
                  )}
                </span>
              )
            })}
          </span>
        )}
      </div>

      <div className={styles.right}>
        <Chip mono tone="mute" dot={'var(--sage)'}>
          schema v{SCHEMA_VERSION}
        </Chip>
        {onRefresh && (
          <RefreshButton
            onClick={onRefresh}
            lastSyncedAt={lastSyncedAt}
            refreshing={refreshing}
          />
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
