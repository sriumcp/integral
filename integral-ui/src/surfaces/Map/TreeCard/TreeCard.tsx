import type { Intent, IntentState, Party } from '@/schema'
import {
  Chip,
  HypothesisBars,
  IdPill,
  KindBadge,
  PartyChip,
  ScoreGauge,
  Sparkline,
  StatusDot,
  Tag,
} from '@/components/atoms'
import { isAwaitingMe } from '@/lib/queue'
import { useHoveredIntent } from '@/lib/hovered-intent'
import styles from './TreeCard.module.css'

export interface TreeCardProps {
  intent: Intent
  state: IntentState
  /** Current user. Drives the awaiting-me badge. */
  me: Party
  /** Click handler for drill-down to the Detail surface. */
  onOpen?: (intent: Intent) => void
}

/**
 * TreeCard — overview-zoom card on the Map surface. Composes the atom
 * vocabulary into a single intent's "look at a glance" view.
 *
 * Per CLAUDE.md § Resolved surface decisions, the *content* differs by kind
 * (per-kind summary, conditional figure) but the *chrome* (header bar,
 * declaration, footer) stays uniform. That uniformity is what makes the
 * Map view scannable across heterogeneous kinds.
 */
export function TreeCard({ intent, state, me, onOpen }: TreeCardProps) {
  const awaiting = isAwaitingMe(intent, state, me)
  const { hovered } = useHoveredIntent()
  const externallyHovered = hovered === intent.id

  return (
    <button
      type="button"
      className={styles.card}
      data-awaiting={awaiting ? 'true' : undefined}
      data-kind={intent.kind}
      data-status={state.status}
      data-pulse={externallyHovered ? 'true' : undefined}
      onClick={() => onOpen?.(intent)}
      aria-label={`${intent.kind} · ${intent.declaration.title}`}
    >
      <header className={styles.header}>
        <StatusDot status={state.status} ariaLabel={`status ${state.status}`} />
        <KindBadge kind={intent.kind} label={intent.kind} />
        <Chip mono tone="mute">
          {intent.holder.mode}
        </Chip>
        <Chip mono tone="mute">
          {intent.lifetime.kind}
        </Chip>
        <span className={styles.headerRight}>
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
      </header>

      <div className={styles.declaration}>
        <h2 className={styles.title}>{intent.declaration.title}</h2>
        {intent.declaration.summary && (
          <p className={styles.summary}>{intent.declaration.summary}</p>
        )}
        {intent.tags && intent.tags.length > 0 && (
          <div className={styles.tags}>
            {intent.tags.slice(0, 4).map((t) => (
              <Tag key={t}>{t}</Tag>
            ))}
          </div>
        )}
        <PerKindSummary intent={intent} />
        <PerKindFigure intent={intent} />
      </div>

      <footer className={styles.footer}>
        <IdPill id={intent.id} short={shortIdFor(intent)} />
        <span>last advanced {humanRelTime(state.last_advanced_at)}</span>
        <span style={{ color: 'var(--mute-2)' }}>·</span>
        <PartyChip party={state.last_advanced_by} dim />
        <span className={styles.footerOpen}>open →</span>
      </footer>
    </button>
  )
}

// ─── Per-kind summary (text-only, structure-zoom-light) ────────────────────
// We narrow on `intent.extension.kind` (the canonical discriminator for the
// `TypeExtension` union) rather than `intent.kind`. Both are equal at runtime
// thanks to the schema's `.refine` invariant, but only the former tells TS
// to narrow the extension type.
function PerKindSummary({ intent }: { intent: Intent }) {
  const ext = intent.extension
  if (ext.kind === 'nous-campaign') {
    const open = ext.open_hypothesis_bundles.length
    const gate = ext.gate_status.current_gate
    return (
      <div style={summaryRowStyle}>
        <Chip mono tone="mute">
          {open} open bundle{open === 1 ? '' : 's'}
        </Chip>
        {gate && (
          <Chip tone="amber" mono>
            gate · {gate}
          </Chip>
        )}
      </div>
    )
  }
  if (ext.kind === 'coral-optimization') {
    return (
      <div style={summaryRowStyle}>
        <Chip mono tone="mute">{ext.search_algorithm}</Chip>
        <Chip mono tone="mute">pop {ext.population_size}</Chip>
        {ext.best_score_so_far !== undefined && (
          <Chip tone="sage" mono>
            best {ext.best_score_so_far.toFixed(3)}
          </Chip>
        )}
      </div>
    )
  }
  if (ext.kind === 'feature-campaign') {
    return (
      <div style={summaryRowStyle}>
        <Chip mono tone="mute">
          {ext.standing_invariants.length} invariant
          {ext.standing_invariants.length === 1 ? '' : 's'}
        </Chip>
      </div>
    )
  }
  if (ext.kind === 'paper-campaign') {
    return (
      <div style={summaryRowStyle}>
        {ext.venue && <Chip mono tone="mute">{ext.venue}</Chip>}
        <Chip mono tone="mute">{ext.sections.length} sections</Chip>
      </div>
    )
  }
  return null
}

// ─── Per-kind figure (only when the data threshold is met) ─────────────────
function PerKindFigure({ intent }: { intent: Intent }) {
  const ext = intent.extension
  if (ext.kind === 'nous-iteration') {
    const bundle = ext.hypothesis_bundle
    const all = [bundle.h_main, ...bundle.h_ablation]
    const counts = {
      confirmed: all.filter((h) => h.result === 'confirmed').length,
      refuted: all.filter((h) => h.result === 'refuted').length,
      pending: all.filter((h) => h.result === 'pending' || !h.result).length,
    }
    if (counts.confirmed + counts.refuted + counts.pending === 0) return null
    return (
      <div className={styles.figure}>
        <HypothesisBars counts={counts} ariaLabel="hypothesis outcomes" />
      </div>
    )
  }
  if (ext.kind === 'coral-attempt') {
    return (
      <div className={styles.figure}>
        <ScoreGauge
          score={ext.score}
          ariaLabel={ext.score === null ? 'attempt not scored' : 'attempt score'}
        />
      </div>
    )
  }
  if (ext.kind === 'coral-optimization' && ext.best_score_so_far !== undefined) {
    const best = ext.best_score_so_far
    return (
      <div className={styles.figure}>
        <Sparkline
          values={[best - 0.2, best - 0.1, best - 0.05, best - 0.02, best]}
          best={best}
          ariaLabel="recent best-score trend"
        />
      </div>
    )
  }
  return null
}

const summaryRowStyle = {
  marginTop: 10,
  display: 'flex',
  flexWrap: 'wrap' as const,
  gap: 6,
  alignItems: 'center',
}

// ─── Helpers ───────────────────────────────────────────────────────────────
function shortIdFor(intent: Intent): string {
  const id = intent.id
  const segments = id.split('-')
  if (segments.length >= 2) {
    return segments.slice(-2).join('-').toLowerCase()
  }
  return id.length > 12 ? id.slice(-12).toLowerCase() : id.toLowerCase()
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
