import { useEffect, useRef, useState } from 'react'
import { SectionLabel } from '@/components/atoms'
import styles from './ShapingChat.module.css'

export interface ShapingChatTurn {
  speaker: 'user' | 'shaper'
  body: string
  at: string
}

export interface ShapingChatProps {
  turns: ReadonlyArray<ShapingChatTurn>
  loading: boolean
  onSend: (message: string) => Promise<void>
  /** Optional concerns surfaced by the most recent LLM turn. Rendered
   *  as a small warning panel above the input. */
  concerns?: ReadonlyArray<string>
}

/**
 * ShapingChat — interactive chat for the LLM-driven shaping flow.
 *
 * The user types in their own words; the LLM (server-side via
 * `/api/shape`) replies + emits a typed patch that fills the form on
 * the right pane. Replaces the scripted `ShapingDialog` for blank
 * drafts created via "+ new"; existing fixture drafts keep their
 * scripted dialog.
 */
export function ShapingChat({
  turns,
  loading,
  onSend,
  concerns,
}: ShapingChatProps) {
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const scrollerRef = useRef<HTMLDivElement>(null)

  // Auto-focus the input on mount + after each turn arrives.
  useEffect(() => {
    if (!loading) inputRef.current?.focus()
  }, [loading, turns.length])

  // Auto-scroll to the bottom when turns change.
  useEffect(() => {
    const el = scrollerRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [turns.length, loading])

  const handleSend = async () => {
    const trimmed = draft.trim()
    if (trimmed.length === 0 || loading) return
    setDraft('')
    await onSend(trimmed)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void handleSend()
    }
  }

  return (
    <section className={styles.section}>
      <SectionLabel>shaping dialog</SectionLabel>
      <div className={styles.scroller} ref={scrollerRef}>
        {turns.length === 0 && !loading && (
          <p className={styles.empty}>
            Tell me what you want to investigate, in your own words. I'll
            help shape it into a Nous campaign.
          </p>
        )}
        {turns.map((t, i) => (
          <div
            key={i}
            className={styles.turn}
            data-speaker={t.speaker}
          >
            <span className={styles.speakerLabel}>
              {t.speaker === 'user' ? 'you' : 'shaper'}
            </span>
            <p className={styles.body}>{t.body}</p>
          </div>
        ))}
        {loading && (
          <div className={styles.thinking} data-testid="shaper-thinking">
            <span>shaper is thinking…</span>
          </div>
        )}
      </div>
      {concerns && concerns.length > 0 && (
        <ul className={styles.concerns} aria-label="shaper concerns">
          {concerns.map((c, i) => (
            <li key={i}>{c}</li>
          ))}
        </ul>
      )}
      <div className={styles.inputRow}>
        <textarea
          ref={inputRef}
          className={styles.input}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={loading}
          placeholder="describe what you want to investigate…"
          rows={2}
          aria-label="message"
        />
        <button
          type="button"
          className={styles.sendButton}
          onClick={() => void handleSend()}
          disabled={loading || draft.trim().length === 0}
          aria-label="send"
        >
          send →
        </button>
      </div>
    </section>
  )
}
