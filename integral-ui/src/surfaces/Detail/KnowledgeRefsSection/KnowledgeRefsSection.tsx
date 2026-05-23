import type { Intent, KnowledgeRef } from '@/schema'
import { Chip, SectionLabel } from '@/components/atoms'
import styles from './KnowledgeRefsSection.module.css'

export interface KnowledgeRefsSectionProps {
  intent: Intent
}

/**
 * KnowledgeRefsSection — lists `KnowledgeRef`s grouped by scope.
 *
 * KnowledgeRef is a discriminated union over `scope`; the `inherited` arm
 * carries `inherited_from`. Surfacing the inheritance source explicitly
 * makes provenance chains legible at the Detail surface — a load-bearing
 * affordance when adapters start hydrating campaign-scoped knowledge into
 * descendants.
 */
export function KnowledgeRefsSection({ intent }: KnowledgeRefsSectionProps) {
  if (intent.knowledge_refs.length === 0) return null

  // Stable scope order: from broadest (global) to narrowest, then inherited.
  const order: KnowledgeRef['scope'][] = [
    'global',
    'project',
    'campaign',
    'iteration',
    'inherited',
  ]
  const sorted = [...intent.knowledge_refs].sort(
    (a, b) => order.indexOf(a.scope) - order.indexOf(b.scope)
  )

  return (
    <section className={styles.section}>
      <SectionLabel hint={`${intent.knowledge_refs.length}`}>knowledge</SectionLabel>
      <ul className={styles.list}>
        {sorted.map((ref, i) => (
          <li
            key={`${ref.uri}-${i}`}
            className={styles.row}
            data-knowledge-ref="true"
            data-scope={ref.scope}
            data-role={ref.role}
          >
            <span className={styles.scopeChips}>
              <Chip mono tone="mute">
                {ref.scope}
              </Chip>
              <Chip mono tone="mute">
                {ref.role}
              </Chip>
            </span>
            <span className={styles.uri} title={ref.uri}>
              {ref.uri}
            </span>
            {ref.scope === 'inherited' && (
              <span className={styles.inheritedFrom}>
                inherited from <code>{ref.inherited_from}</code>
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
