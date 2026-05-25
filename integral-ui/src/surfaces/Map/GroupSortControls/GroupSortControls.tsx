import type { GroupBy, SortBy } from '@/lib/filter-query'
import styles from './GroupSortControls.module.css'

/**
 * GroupSortControls — two `<details>`-based dropdowns for `group:` and
 * `sort:`. Visible only when `visible` is true (the parent
 * MapControls toggles based on filter count).
 */
export interface GroupSortControlsProps {
  group: GroupBy
  sort: SortBy
  visible: boolean
  onChangeGroup: (g: GroupBy) => void
  onChangeSort: (s: SortBy) => void
}

const GROUP_OPTIONS: ReadonlyArray<{ value: GroupBy; label: string }> = [
  { value: 'none', label: 'none' },
  { value: 'source', label: 'source' },
  { value: 'kind', label: 'kind' },
  { value: 'holder-mode', label: 'holder' },
  { value: 'status', label: 'status' },
]

const SORT_OPTIONS: ReadonlyArray<{ value: SortBy; label: string }> = [
  { value: 'awaiting-recency', label: 'awaiting,recent' },
  { value: 'recency', label: 'recent' },
  { value: 'status', label: 'status' },
  { value: 'alphabetical', label: 'a-z' },
]

function labelFor<T extends string>(
  options: ReadonlyArray<{ value: T; label: string }>,
  value: T
): string {
  return options.find((o) => o.value === value)?.label ?? String(value)
}

export function GroupSortControls({
  group,
  sort,
  visible,
  onChangeGroup,
  onChangeSort,
}: GroupSortControlsProps) {
  if (!visible) return null

  return (
    <div className={styles.controls} data-testid="group-sort-controls">
      <details className={styles.menu} data-testid="group-menu">
        <summary className={styles.summary}>
          <span className={styles.label}>group:</span>
          <span className={styles.current}>{labelFor(GROUP_OPTIONS, group)}</span>
        </summary>
        <ul className={styles.list} role="menu">
          {GROUP_OPTIONS.map((opt) => (
            <li key={opt.value}>
              <button
                type="button"
                role="menuitem"
                className={styles.option}
                aria-current={group === opt.value || undefined}
                onClick={() => onChangeGroup(opt.value)}
              >
                {opt.label}
              </button>
            </li>
          ))}
        </ul>
      </details>

      <details className={styles.menu} data-testid="sort-menu">
        <summary className={styles.summary}>
          <span className={styles.label}>sort:</span>
          <span className={styles.current}>{labelFor(SORT_OPTIONS, sort)}</span>
        </summary>
        <ul className={styles.list} role="menu">
          {SORT_OPTIONS.map((opt) => (
            <li key={opt.value}>
              <button
                type="button"
                role="menuitem"
                className={styles.option}
                aria-current={sort === opt.value || undefined}
                onClick={() => onChangeSort(opt.value)}
              >
                {opt.label}
              </button>
            </li>
          ))}
        </ul>
      </details>
    </div>
  )
}
