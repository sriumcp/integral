import styles from './FilterChip.module.css'

/**
 * FilterChip — a `key:value` mono token with optional × remove.
 *
 * Composes the visual genre of `Chip mono soft` but adds the remove
 * affordance. The remove × turns amber on hover (single-amber-signal
 * rule from the cognitive-instrument identity).
 */
export interface FilterChipProps {
  /** Filter category, e.g. `kind`, `status`, `awaiting`, `tag`. */
  filterKey: string
  /** Filter value, e.g. `nous-campaign`, `active`, `me`, `urgent`. */
  value: string
  /** Optional remove handler — when omitted, no × button renders. */
  onRemove?: () => void
}

export function FilterChip({ filterKey, value, onRemove }: FilterChipProps) {
  return (
    <span
      className={styles.chip}
      data-filter-key={filterKey}
      data-filter-value={value}
      aria-label={`filter: ${filterKey}:${value}`}
    >
      <span className={styles.token}>
        <span className={styles.k}>{filterKey}</span>
        <span className={styles.colon}>:</span>
        <span className={styles.v}>{value}</span>
      </span>
      {onRemove && (
        <button
          type="button"
          className={styles.remove}
          onClick={onRemove}
          aria-label={`remove filter ${filterKey}:${value}`}
        >
          ×
        </button>
      )}
    </span>
  )
}
