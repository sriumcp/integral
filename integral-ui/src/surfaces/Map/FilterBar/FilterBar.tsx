import { useMemo } from 'react'
import {
  HolderModeSchema,
  IntentKindSchema,
  StatusSchema,
  type HolderMode,
  type IntentKind,
  type Status,
} from '@/schema'
import { FilterChip } from '@/components/atoms/FilterChip/FilterChip'
import type { FilterQuery } from '@/lib/filter-query'
import styles from './FilterBar.module.css'

/**
 * FilterBar — active `key:value` chip list + `+ filter` disclosure.
 *
 * Native `<details>` element for the disclosure. No custom dropdown
 * widget; the cognitive-instrument genre rewards web-platform
 * primitives. Click outside collapses (browser handles it).
 *
 * Filter taxonomy:
 *  - STATUS: enum from StatusSchema
 *  - KIND: enum from IntentKindSchema
 *  - HOLDER: HolderModeSchema (plus the special `awaiting:me`)
 *  - TAG: free-form (autocomplete from `availableTags`)
 */
export interface FilterBarProps {
  filter: FilterQuery
  /** All known tag values across the loaded workspace, used to populate
   *  the TAG autocomplete list. */
  availableTags: ReadonlyArray<string>
  onAdd: (key: FilterCategory, value: string) => void
  onRemove: (key: FilterCategory, value: string) => void
}

export type FilterCategory =
  | 'awaiting'
  | 'kind'
  | 'status'
  | 'holder'
  | 'tag'

export function FilterBar({
  filter,
  availableTags,
  onAdd,
  onRemove,
}: FilterBarProps) {
  const activeChips = useMemo(() => collectActiveChips(filter), [filter])

  return (
    <div className={styles.bar} data-testid="filter-bar">
      {activeChips.map((c) => (
        <FilterChip
          key={`${c.key}:${c.value}`}
          filterKey={c.key}
          value={c.value}
          onRemove={() => onRemove(c.key, c.value)}
        />
      ))}

      <details className={styles.disclosure} data-testid="filter-disclosure">
        <summary className={styles.summary}>+ filter</summary>
        <div className={styles.menu} role="menu">
          <Section title="STATUS">
            {StatusSchema.options.map((s: Status) => (
              <Item
                key={s}
                disabled={filter.statuses.has(s)}
                onClick={() => onAdd('status', s)}
              >
                {s}
              </Item>
            ))}
          </Section>

          <Section title="KIND">
            {IntentKindSchema.options.map((k: IntentKind) => (
              <Item
                key={k}
                disabled={filter.kinds.has(k)}
                onClick={() => onAdd('kind', k)}
              >
                {k}
              </Item>
            ))}
          </Section>

          <Section title="HOLDER">
            <Item
              disabled={filter.awaitingMe}
              onClick={() => onAdd('awaiting', 'me')}
            >
              awaiting:me
            </Item>
            {HolderModeSchema.options.map((h: HolderMode) => (
              <Item
                key={h}
                disabled={filter.holderModes.has(h)}
                onClick={() => onAdd('holder', h)}
              >
                {h}
              </Item>
            ))}
          </Section>

          {availableTags.length > 0 && (
            <Section title="TAG">
              {availableTags.map((t) => (
                <Item
                  key={t}
                  disabled={filter.tags.has(t)}
                  onClick={() => onAdd('tag', t)}
                >
                  {t}
                </Item>
              ))}
            </Section>
          )}
        </div>
      </details>
    </div>
  )
}

interface ActiveChip {
  key: FilterCategory
  value: string
}

function collectActiveChips(filter: FilterQuery): ActiveChip[] {
  const out: ActiveChip[] = []
  if (filter.awaitingMe) out.push({ key: 'awaiting', value: 'me' })
  for (const k of [...filter.kinds].sort()) out.push({ key: 'kind', value: k })
  for (const s of [...filter.statuses].sort())
    out.push({ key: 'status', value: s })
  for (const h of [...filter.holderModes].sort())
    out.push({ key: 'holder', value: h })
  for (const t of [...filter.tags].sort()) out.push({ key: 'tag', value: t })
  return out
}

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className={styles.section}>
      <h4 className={styles.sectionTitle}>{title}</h4>
      <div className={styles.options}>{children}</div>
    </section>
  )
}

function Item({
  disabled,
  onClick,
  children,
}: {
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      className={styles.option}
      disabled={disabled}
      onClick={onClick}
      role="menuitem"
    >
      {children}
    </button>
  )
}
