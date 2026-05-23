import type { ReactNode } from 'react'
import styles from './Tag.module.css'

export interface TagProps {
  children: ReactNode
}

/**
 * Tag — dashed-border free-form label. The visual treatment for an entry in
 * `Intent.tags` (free-form, user-controlled labels) and for any UI-side
 * ad-hoc labels at the same affordance level.
 *
 * Single visual mode by design — tags should look the same wherever they
 * appear so users learn the dashed-border = "free-form label" association
 * once and recognize it everywhere.
 */
export function Tag({ children }: TagProps) {
  return <span className={styles.tag}>{children}</span>
}
