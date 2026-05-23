import type { DialogTurn } from '@/fixtures/shaping'
import { PartyChip, SectionLabel } from '@/components/atoms'
import styles from './ShapingDialog.module.css'

export interface ShapingDialogProps {
  /** Scripted turns from the draft fixture. v0.1 has no input box —
   *  shaping in v0.1 is a kinetic preview, not an interactive session.
   *  Authoring lives in `src/fixtures/shaping.ts`. */
  turns: ReadonlyArray<DialogTurn>
}

/**
 * ShapingDialog — left pane of the Shaping surface.
 *
 * Renders scripted clarification turns between the human and the agent.
 * Free text per CLAUDE.md (v0.1 has no typed probe taxonomy).
 */
export function ShapingDialog({ turns }: ShapingDialogProps) {
  return (
    <section className={styles.pane}>
      <SectionLabel hint={`${turns.length} turn${turns.length === 1 ? '' : 's'}`}>
        shaping dialog
      </SectionLabel>
      <ol className={styles.list}>
        {turns.map((t, i) => (
          <li
            key={i}
            className={styles.turn}
            data-speaker-kind={t.speaker.kind}
          >
            <header className={styles.turnHeader}>
              <PartyChip party={t.speaker} />
              <span className={styles.turnTime}>{relativeShort(t.at)}</span>
            </header>
            <p className={styles.turnBody}>{t.body}</p>
          </li>
        ))}
      </ol>
    </section>
  )
}

function relativeShort(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 60_000) return 'just now'
  const m = Math.round(ms / 60_000)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.round(h / 24)
  return `${d}d ago`
}
