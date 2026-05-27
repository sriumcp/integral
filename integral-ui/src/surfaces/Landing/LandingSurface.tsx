import { useEffect, useMemo, useRef } from 'react'
import type { Party, Workspace } from '@/schema'
import { isAwaitingMe } from '@/lib/queue'
import { IntegralGlyph } from '@/components'
import styles from './LandingSurface.module.css'

const ROOT_KINDS = new Set([
  'nous-campaign',
  'coral-optimization',
  'feature-campaign',
  'paper-campaign',
])

export interface LandingSurfaceProps {
  workspace: Workspace
  me: Party
  /** Called when the user clicks `enter →` (or activates it via keyboard).
   *  Surfaces handle the actual navigation + the once-per-session flag. */
  onEnter: () => void
}

/**
 * LandingSurface — first paint before Map.
 *
 * Reads as a control panel powering on, not a marketing splash: the
 * inverted-integral brand mark scaled large, the wordmark in serif, a
 * mute tagline, and a single-line monospace status peek that tells the
 * user *what's already going on inside* the substrate before they enter.
 *
 * The peek counts are derived from the same `Workspace` the Map will
 * render, so first impression and first navigation stay in sync — there's
 * no "the landing said one thing and the dashboard said another" gap.
 *
 * The `enter →` button is auto-focused on first paint so keyboard users
 * can press Enter or Space without a tab.
 */
export function LandingSurface({ workspace, me, onEnter }: LandingSurfaceProps) {
  const enterRef = useRef<HTMLButtonElement | null>(null)
  useEffect(() => {
    enterRef.current?.focus()
  }, [])

  const { activeCount, awaitingCount, lastActivityRel } = useMemo(() => {
    const stateById = new Map(workspace.states.map((s) => [s.intent_id, s]))
    const roots = workspace.intents.filter((i) =>
      ROOT_KINDS.has(i.kind as never)
    )
    // "Active" excludes drafts — drafts surface separately on the Map and
    // route to ShapingSurface, not Detail.
    const active = roots.filter((intent) => {
      const state = stateById.get(intent.id)!
      return state.status === 'active' || state.status === 'gated'
    })
    const awaiting = active.filter((intent) => {
      const state = stateById.get(intent.id)!
      return isAwaitingMe(intent, state, me)
    })
    const mostRecent = workspace.states.reduce<string | null>((acc, s) => {
      if (acc === null) return s.last_advanced_at
      return s.last_advanced_at > acc ? s.last_advanced_at : acc
    }, null)
    return {
      activeCount: active.length,
      awaitingCount: awaiting.length,
      lastActivityRel: mostRecent ? humanRelTime(mostRecent) : 'no activity',
    }
  }, [workspace, me])

  return (
    <main className={styles.surface} data-surface="landing">
      <div className={styles.column}>
        <IntegralGlyph size={280} tall title="Integral logo" className={styles.glyph} />
        <div className={styles.textBlock}>
          <h1 className={styles.wordmark}>Integral</h1>
          <div className={styles.tagBlock}>
            <p className={styles.claim}>Common ground for humans and agents.</p>
            <p className={styles.tagline}>
              The work in flight, the state of every intent, the audit trail — in one view.
            </p>
          </div>
          <p className={styles.peek}>
            <span>{activeCount} active</span>
            <span aria-hidden="true" className={styles.peekSep}>
              ·
            </span>
            <span>{awaitingCount} awaiting you</span>
            <span aria-hidden="true" className={styles.peekSep}>
              ·
            </span>
            <span>last activity {lastActivityRel}</span>
          </p>
          <button
            ref={enterRef}
            type="button"
            className={styles.enter}
            onClick={onEnter}
          >
            enter <span aria-hidden="true" className={styles.enterArrow}>→</span>
          </button>
        </div>
      </div>
    </main>
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
