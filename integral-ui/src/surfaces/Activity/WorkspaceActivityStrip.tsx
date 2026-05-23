import { useMemo, useState } from 'react'
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
}

type FilterMode = 'notable+' | 'routine+'

/**
 * WorkspaceActivityStrip — workspace-wide events bucketed by significance.
 *
 * Per CLAUDE.md § Resolved decision #2 and goals.md Item 3:
 *  - Buckets render in critical → notable → routine order.
 *  - The routine bucket is collapsed by default with a `▸ N` toggle.
 *  - Filter chip cycles between `notable+` (default) and `routine+`. When
 *    `routine+` is active the routine bucket auto-expands.
 *  - Hovering an event row writes the target intent id into the shared
 *    hovered-intent context; the Map reads it to preview-pulse the card.
 *
 * Event derivation lives in `src/lib/activity.ts` so the heuristic is
 * unit-testable in isolation and the strip stays presentation-only.
 */
export function WorkspaceActivityStrip({
  workspace,
  onOpenIntent,
}: WorkspaceActivityStripProps) {
  const events = useMemo(() => deriveEvents(workspace), [workspace])
  const [filter, setFilter] = useState<FilterMode>('notable+')
  const [routineExpanded, setRoutineExpanded] = useState(false)

  const buckets = {
    critical: events.filter((e) => e.significance === 'critical'),
    notable: events.filter((e) => e.significance === 'notable'),
    routine: events.filter((e) => e.significance === 'routine'),
  }

  const showRoutine = filter === 'routine+' || routineExpanded

  if (events.length === 0) {
    return (
      <aside className={styles.strip}>
        <SectionLabel hint="workspace">activity</SectionLabel>
        <p className={styles.emptyState}>no activity yet</p>
      </aside>
    )
  }

  return (
    <aside className={styles.strip}>
      <header className={styles.header}>
        <SectionLabel hint="workspace">activity</SectionLabel>
        <button
          type="button"
          className={styles.filterToggle}
          aria-label="significance filter"
          onClick={() =>
            setFilter((f) => (f === 'notable+' ? 'routine+' : 'notable+'))
          }
        >
          <Chip mono tone={filter === 'routine+' ? 'amber' : 'mute'}>
            {filter}
          </Chip>
        </button>
      </header>

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
    </aside>
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
      data-intent-id={event.intent.id}
      onClick={() => onOpenIntent(event.intent)}
      onMouseEnter={() => setHovered(event.intent.id)}
      onMouseLeave={() => setHovered(null)}
      aria-label={`${event.cause} on ${event.intent.declaration.title}`}
    >
      <span className={styles.rowMeta}>
        <span className={styles.rowTime}>{humanRelTime(event.at)}</span>
        <PartyChip party={event.by} dim />
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
