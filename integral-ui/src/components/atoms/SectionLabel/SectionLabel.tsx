import type { ReactNode } from 'react'
import styles from './SectionLabel.module.css'

export interface SectionLabelProps {
  children: ReactNode
  /** Optional right-aligned hint (e.g. counts, inline filters, status). */
  hint?: ReactNode
}

/**
 * SectionLabel — small-caps mono header that chunks a surface into named
 * regions. Pairs with an optional right-aligned hint for inline counts /
 * filters / status without taking a second row.
 *
 * Renders as `<h3>` for outline accessibility — surfaces compose multiple
 * SectionLabels under a single page-level `<h1>` (the surface header).
 */
export function SectionLabel({ children, hint }: SectionLabelProps) {
  return (
    <div className={styles.row}>
      <h3 className={styles.label}>{children}</h3>
      {hint !== undefined && <span className={styles.hint}>{hint}</span>}
    </div>
  )
}
