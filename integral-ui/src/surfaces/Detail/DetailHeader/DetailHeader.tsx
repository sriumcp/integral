import type { Intent, IntentState, Party, ZoomLevel } from '@/schema'
import {
  Chip,
  IdPill,
  KindBadge,
  PartyChip,
  StatusDot,
  Tag,
  ZoomToggle,
} from '@/components/atoms'
import { isAwaitingMe } from '@/lib/queue'
import styles from './DetailHeader.module.css'

export interface DetailHeaderProps {
  intent: Intent
  state: IntentState
  /** Current zoom level — drives the toggle's active segment. */
  zoom: ZoomLevel
  onZoomChange: (zoom: ZoomLevel) => void
  /** Back to Map. */
  onBack: () => void
  /** Optional current user — drives the awaiting-me chip in the header right. */
  me?: Party
}

/**
 * DetailHeader — uniform header across every Intent kind.
 *
 * The chrome (kind badge, status, holder mode, lifetime, id, title,
 * summary, tags, success criterion, last advanced, zoom toggle) is the
 * same regardless of kind. Per-kind specialization lives in the body
 * (ChildrenSection); the header is the cross-kind anchor that keeps
 * the substrate identity intact (CLAUDE.md § What NOT to do, point on
 * surface chrome drift).
 */
export function DetailHeader({
  intent,
  state,
  zoom,
  onZoomChange,
  onBack,
  me,
}: DetailHeaderProps) {
  const awaiting = me ? isAwaitingMe(intent, state, me) : false
  const declaredBy = intent.provenance.declared_by
  const lastAdvancedRel = humanRelTime(state.last_advanced_at)

  return (
    <header className={styles.header} data-kind={intent.kind}>
      <nav className={styles.crumbs}>
        <button type="button" className={styles.back} onClick={onBack}>
          ← map
        </button>
        <span className={styles.crumbsSep}>·</span>
        <span className={styles.crumbsLabel}>{intent.kind}</span>
      </nav>

      <div className={styles.metaRow}>
        <StatusDot status={state.status} ariaLabel={`status ${state.status}`} />
        <KindBadge kind={intent.kind} label={intent.kind} />
        {intent.provenance.source && (
          <Chip mono tone="mute" soft title={`source: ${intent.provenance.source}`}>
            via {intent.provenance.source}
          </Chip>
        )}
        <Chip mono tone="mute">
          {intent.holder.mode}
        </Chip>
        <Chip mono tone="mute">
          {intent.lifetime.kind}
        </Chip>
        <IdPill id={intent.id} />
        <span className={styles.metaRight}>
          {awaiting ? (
            <Chip tone="amber" mono dot>
              awaiting you
            </Chip>
          ) : (
            <Chip status={state.status} mono>
              {state.status}
            </Chip>
          )}
        </span>
      </div>

      <h1 className={styles.title}>{intent.declaration.title}</h1>
      {intent.declaration.summary && (
        <p className={styles.summary}>{intent.declaration.summary}</p>
      )}

      {intent.tags && intent.tags.length > 0 && (
        <div className={styles.tags}>
          {intent.tags.map((t) => (
            <Tag key={t}>{t}</Tag>
          ))}
        </div>
      )}

      {intent.declaration.success_criterion && (
        <p className={styles.success}>
          <span className={styles.successLabel}>success</span>{' '}
          {intent.declaration.success_criterion}
        </p>
      )}

      <div className={styles.footer}>
        <span className={styles.footerCell}>
          declared by <PartyChip party={declaredBy} dim />
        </span>
        <span className={styles.footerCell}>
          last advanced {lastAdvancedRel} by{' '}
          <PartyChip party={state.last_advanced_by} dim />
        </span>
        <span className={styles.footerSpacer} />
        <ZoomToggle value={zoom} onChange={onZoomChange} />
      </div>
    </header>
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
