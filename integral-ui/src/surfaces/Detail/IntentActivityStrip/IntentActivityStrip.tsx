import type { Intent, IntentState, Party } from '@/schema'
import { PartyChip, SectionLabel } from '@/components/atoms'
import styles from './IntentActivityStrip.module.css'

export interface IntentActivityStripProps {
  intent: Intent
  state: IntentState
}

interface ActivityEvent {
  id: string
  at: string
  by: Party
  /** A short imperative-tense label ("gate-resolved", "last advanced"). */
  cause: string
  /** Optional sub-line — e.g. status transition or kind-specific detail. */
  detail?: string
}

/**
 * IntentActivityStrip — per-intent activity column.
 *
 * v0.1 doesn't have a first-class activity model (CLAUDE.md § Non-goals).
 * What the schema *does* track per-intent is `state.history`
 * (`StateTransition[]`) plus the `last_advanced_at` / `last_advanced_by`
 * marker. This strip surfaces both, and explicitly marks itself as a v0.1
 * placeholder so the surface doesn't imply richness it doesn't have.
 */
export function IntentActivityStrip({ intent, state }: IntentActivityStripProps) {
  // Synthesize a "last advanced" event so the strip is never empty even when
  // state.history is. Adapters at v0.2 will replace this with real activity.
  const synthetic: ActivityEvent = {
    id: `synthetic-last-advanced-${intent.id}`,
    at: state.last_advanced_at,
    by: state.last_advanced_by,
    cause: 'last advanced',
    detail: `status: ${state.status}`,
  }

  const historyEvents: ActivityEvent[] = state.history.map((t, i) => ({
    id: `${intent.id}-history-${i}`,
    at: t.at,
    by: t.by,
    cause: t.cause,
    detail: `${t.from_status} → ${t.to_status}`,
  }))

  // Most-recent-first.
  const events = [...historyEvents, synthetic].sort(
    (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()
  )

  return (
    <aside className={styles.strip}>
      <SectionLabel hint="this intent">activity</SectionLabel>
      <ul className={styles.list}>
        {events.map((ev) => (
          <li
            key={ev.id}
            className={styles.row}
            data-event={ev.id.includes('synthetic') ? 'synthetic' : 'history'}
          >
            <span className={styles.when}>{humanRelTime(ev.at)}</span>
            <span className={styles.by}>
              <PartyChip party={ev.by} dim />
            </span>
            <span className={styles.cause}>{ev.cause}</span>
            {ev.detail && <span className={styles.detail}>{ev.detail}</span>}
          </li>
        ))}
      </ul>
      <p className={styles.placeholder}>
        v0.1 placeholder — typed activity events arrive in v0.2
      </p>
    </aside>
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
