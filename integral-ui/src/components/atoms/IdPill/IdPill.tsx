import styles from './IdPill.module.css'

export interface IdPillProps {
  /** Canonical full id (e.g. ULID). Always exposed via `title` for hover and
   *  via `aria-label` for assistive tech, regardless of what's displayed. */
  id: string
  /** Short display text (e.g. "iter-2"). When omitted, the full `id` is shown. */
  short?: string
}

/**
 * IdPill — monospace pill that displays an id (typically a ULID) in
 * abbreviated form, with the full id available via `title` (hover tooltip)
 * and `aria-label` (assistive tech).
 *
 * Single visual mode by design: ids look the same wherever they appear, which
 * is what makes them *recognizable as ids* across surfaces. If a future
 * variant is needed (e.g. emphasis for a focused id), add a `variant` prop —
 * don't extend tone/status (those belong to status-bearing atoms).
 *
 * The `data-truncated` attribute is exposed so CSS can hint visually
 * (cursor:help) when the pill is showing a shortened form. Surfaces and
 * tests can also use it to detect the truncation state without recomputing.
 */
export function IdPill({ id, short }: IdPillProps) {
  const truncated = short !== undefined && short !== id
  const display = short ?? id
  return (
    <span
      className={styles.pill}
      data-truncated={truncated ? 'true' : undefined}
      title={id}
      aria-label={id}
    >
      {display}
    </span>
  )
}
