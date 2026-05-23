import { useEffect, useMemo, useState } from 'react'
import type { Intent, Workspace } from '@/schema'
import {
  Chip,
  KindBadge,
  PartyChip,
  SectionLabel,
} from '@/components/atoms'
import { useHoveredIntent } from '@/lib/hovered-intent'
import {
  deriveEvents,
  type ActivityEvent,
  type Significance,
} from '@/lib/activity'
import styles from './WorkspaceActivityStrip.module.css'

export interface WorkspaceActivityStripProps {
  workspace: Workspace
  onOpenIntent: (intent: Intent) => void
  /** When set, the strip auto-defaults its scope filter to "this intent"
   *  (showing only events for `focusedIntentId`). The user can toggle to
   *  "all" to see workspace-wide events. The scope auto-resets to "this"
   *  whenever `focusedIntentId` changes. */
  focusedIntentId?: string
  /** When true, the strip renders as a thin vertical rail with just a
   *  count + expand chevron. Caller owns the boolean (typically persists
   *  it via sessionStorage) so the user's choice survives navigation. */
  collapsed?: boolean
  /** Toggle the collapsed state. Required when `collapsed` is provided. */
  onToggleCollapsed?: () => void
}

type SignificanceFilter = 'notable+' | 'routine+'
type ScopeFilter = 'this' | 'all'

/**
 * WorkspaceActivityStrip — workspace-wide events bucketed by significance.
 *
 * v0.1.next (Path 2 expansion): per-intent activity is folded into this
 * strip via the `focusedIntentId` prop + scope filter chip ("this intent" /
 * "all"). The previous `IntentActivityStrip` is removed; one panel does
 * both jobs.
 *
 * Behavior summary:
 *  - Buckets in critical → notable → routine order.
 *  - Routine bucket collapsed by default with a `▸ N` toggle.
 *  - Significance filter cycles `notable+` (default) ↔ `routine+`.
 *  - Scope filter "this" ↔ "all"; "this" only renders when `focusedIntentId`
 *    is set, and resets to "this" each time the focused intent changes.
 *  - Whole-strip collapse rail: when `collapsed`, renders as a narrow
 *    vertical column with the non-routine count + expand chevron.
 *  - Hovering an event row writes the target intent id into the shared
 *    hovered-intent context; the Map reads it to preview-pulse the card.
 */
export function WorkspaceActivityStrip({
  workspace,
  onOpenIntent,
  focusedIntentId,
  collapsed = false,
  onToggleCollapsed,
}: WorkspaceActivityStripProps) {
  const allEvents = useMemo(() => deriveEvents(workspace), [workspace])
  const [significanceFilter, setSignificanceFilter] =
    useState<SignificanceFilter>('notable+')
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>(
    focusedIntentId ? 'this' : 'all'
  )
  const [routineExpanded, setRoutineExpanded] = useState(false)

  // Reset scope to "this" each time the focused intent changes — a fresh
  // Detail navigation should always start scoped to the focused intent;
  // the user has to opt-in to the wider workspace view per-intent.
  useEffect(() => {
    setScopeFilter(focusedIntentId ? 'this' : 'all')
  }, [focusedIntentId])

  const events = useMemo(() => {
    if (focusedIntentId && scopeFilter === 'this') {
      return allEvents.filter((e) => e.intent.id === focusedIntentId)
    }
    return allEvents
  }, [allEvents, focusedIntentId, scopeFilter])

  const buckets = {
    critical: events.filter((e) => e.significance === 'critical'),
    notable: events.filter((e) => e.significance === 'notable'),
    routine: events.filter((e) => e.significance === 'routine'),
  }
  const nonRoutineCount = buckets.critical.length + buckets.notable.length

  const showRoutine = significanceFilter === 'routine+' || routineExpanded

  // ── Collapsed rail ──────────────────────────────────────────────────────
  if (collapsed) {
    return (
      <aside
        className={styles.rail}
        data-collapsed="true"
        aria-label="activity (collapsed)"
      >
        <button
          type="button"
          className={styles.railToggle}
          onClick={onToggleCollapsed}
          aria-label="show activity"
          aria-expanded={false}
        >
          <span className={styles.railChevron} aria-hidden="true">
            ‹
          </span>
          <span className={styles.railLabel}>activity</span>
          {nonRoutineCount > 0 && (
            <span className={styles.railCount}>{nonRoutineCount}</span>
          )}
        </button>
      </aside>
    )
  }

  // ── Empty state ─────────────────────────────────────────────────────────
  if (events.length === 0) {
    return (
      <aside className={styles.strip}>
        <header className={styles.header}>
          <SectionLabel
            hint={focusedIntentId && scopeFilter === 'this' ? 'this intent' : 'workspace'}
          >
            activity
          </SectionLabel>
          {onToggleCollapsed && (
            <button
              type="button"
              className={styles.collapseToggle}
              onClick={onToggleCollapsed}
              aria-label="hide activity"
              aria-expanded={true}
              title="hide"
            >
              ›
            </button>
          )}
        </header>
        {focusedIntentId && (
          <ScopeChip
            scope={scopeFilter}
            onToggle={() =>
              setScopeFilter((s) => (s === 'this' ? 'all' : 'this'))
            }
          />
        )}
        <p className={styles.emptyState}>
          {focusedIntentId && scopeFilter === 'this'
            ? 'no activity for this intent yet'
            : 'no activity yet'}
        </p>
      </aside>
    )
  }

  // ── Expanded full strip ─────────────────────────────────────────────────
  return (
    <aside className={styles.strip}>
      <header className={styles.header}>
        <SectionLabel
          hint={focusedIntentId && scopeFilter === 'this' ? 'this intent' : 'workspace'}
        >
          activity
        </SectionLabel>
        <div className={styles.headerControls}>
          <button
            type="button"
            className={styles.filterToggle}
            aria-label="significance filter"
            onClick={() =>
              setSignificanceFilter((f) =>
                f === 'notable+' ? 'routine+' : 'notable+'
              )
            }
          >
            <Chip mono tone={significanceFilter === 'routine+' ? 'amber' : 'mute'}>
              {significanceFilter}
            </Chip>
          </button>
          {onToggleCollapsed && (
            <button
              type="button"
              className={styles.collapseToggle}
              onClick={onToggleCollapsed}
              aria-label="hide activity"
              aria-expanded={true}
              title="hide"
            >
              ›
            </button>
          )}
        </div>
      </header>

      {focusedIntentId && (
        <ScopeChip
          scope={scopeFilter}
          onToggle={() =>
            setScopeFilter((s) => (s === 'this' ? 'all' : 'this'))
          }
        />
      )}

      <Bucket
        kind="critical"
        events={buckets.critical}
        onOpenIntent={onOpenIntent}
      />

      <Bucket
        kind="notable"
        events={buckets.notable}
        onOpenIntent={onOpenIntent}
      />

      {buckets.routine.length > 0 && (
        <div data-bucket="routine" className={styles.bucket}>
          <button
            type="button"
            className={styles.routineToggle}
            aria-label={`routine ${buckets.routine.length}`}
            aria-expanded={showRoutine}
            onClick={() => setRoutineExpanded((v) => !v)}
          >
            <span className={styles.routineCaret} aria-hidden="true">
              {showRoutine ? '▾' : '▸'}
            </span>
            routine · {buckets.routine.length}
          </button>
          {showRoutine && (
            <ul className={styles.eventList}>
              {buckets.routine.map((ev) => (
                <li key={ev.id}>
                  <EventRow event={ev} onOpenIntent={onOpenIntent} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </aside>
  )
}

function ScopeChip({
  scope,
  onToggle,
}: {
  scope: ScopeFilter
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      className={styles.scopeToggle}
      onClick={onToggle}
      aria-label={`scope: ${scope === 'this' ? 'this intent' : 'all'}`}
      data-scope={scope}
    >
      <Chip mono tone={scope === 'this' ? 'sage' : 'mute'} soft={scope === 'all'}>
        scope · {scope === 'this' ? 'this intent' : 'all'}
      </Chip>
    </button>
  )
}

function Bucket({
  kind,
  events,
  onOpenIntent,
}: {
  kind: Exclude<Significance, 'routine'>
  events: ActivityEvent[]
  onOpenIntent: (intent: Intent) => void
}) {
  if (events.length === 0) return null
  return (
    <div data-bucket={kind} className={styles.bucket}>
      <p className={styles.bucketLabel} data-significance={kind}>
        {kind} · {events.length}
      </p>
      <ul className={styles.eventList}>
        {events.map((ev) => (
          <li key={ev.id}>
            <EventRow event={ev} onOpenIntent={onOpenIntent} />
          </li>
        ))}
      </ul>
    </div>
  )
}

function EventRow({
  event,
  onOpenIntent,
}: {
  event: ActivityEvent
  onOpenIntent: (intent: Intent) => void
}) {
  const { setHovered } = useHoveredIntent()
  return (
    <button
      type="button"
      className={styles.row}
      data-event="true"
      data-significance={event.significance}
      data-source={event.source}
      data-intent-id={event.intent.id}
      onClick={() => onOpenIntent(event.intent)}
      onMouseEnter={() => setHovered(event.intent.id)}
      onMouseLeave={() => setHovered(null)}
      aria-label={`${event.cause} on ${event.intent.declaration.title}`}
    >
      <span className={styles.rowMeta}>
        <span className={styles.rowTime}>{humanRelTime(event.at)}</span>
        <PartyChip party={event.by} dim />
        {event.source === 'operation' && event.operation && (
          <Chip mono tone="blue" soft>
            {event.operation.kind}
          </Chip>
        )}
      </span>
      <span className={styles.rowCause}>{event.cause}</span>
      <span className={styles.rowTarget}>
        <KindBadge kind={event.intent.kind} label={event.intent.kind} />
        <span className={styles.rowTargetTitle}>
          {event.intent.declaration.title}
        </span>
      </span>
    </button>
  )
}

function humanRelTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 60_000) return 'just now'
  const m = Math.round(ms / 60_000)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.round(h / 24)
  if (d < 30) return `${d}d ago`
  const mo = Math.round(d / 30)
  return `${mo}mo ago`
}
