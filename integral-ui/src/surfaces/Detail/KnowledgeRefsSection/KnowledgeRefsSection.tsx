import type { Intent, KnowledgeRef } from '@/schema'
import { Chip, SectionLabel } from '@/components/atoms'
import styles from './KnowledgeRefsSection.module.css'

export interface KnowledgeRefsSectionProps {
  intent: Intent
}

interface KnowledgeGroup {
  scope: KnowledgeRef['scope']
  role: KnowledgeRef['role']
  count: number
  /** Inherited groups carry the parent IntentId; only set for scope='inherited'. */
  inheritedFrom?: string
}

const SCOPE_ORDER: KnowledgeRef['scope'][] = [
  'global',
  'project',
  'campaign',
  'iteration',
  'inherited',
]

/**
 * KnowledgeRefsSection — summarizes attached `KnowledgeRef`s as count rows
 * grouped by (scope, role).
 *
 * v0.1 design: opaque URIs are NOT rendered. The schema can't carry the
 * dereferenced content yet (gaps.md G-N-2), so a list of unclickable URIs
 * would be a tease. Counts give the user the "what kinds of knowledge
 * attach here" shape without overpromising. Full clickability returns in
 * v0.2 once principles become first-class typed objects.
 *
 * Inherited refs still surface their `inherited_from` source — that one
 * bit (where the inheritance came from) is meaningful even without
 * dereferenceable content.
 */
export function KnowledgeRefsSection({ intent }: KnowledgeRefsSectionProps) {
  if (intent.knowledge_refs.length === 0) return null

  const groups = groupKnowledgeRefs(intent.knowledge_refs)

  return (
    <section className={styles.section}>
      <SectionLabel hint={`${intent.knowledge_refs.length}`}>
        knowledge
      </SectionLabel>
      <ul className={styles.list}>
        {groups.map((g) => (
          <li
            key={`${g.scope}:${g.role}:${g.inheritedFrom ?? ''}`}
            className={styles.row}
            data-knowledge-group="true"
            data-scope={g.scope}
            data-role={g.role}
          >
            <span className={styles.scopeChips}>
              <Chip mono tone="mute">
                {g.scope}
              </Chip>
              <Chip mono tone="mute">
                {g.role}
              </Chip>
            </span>
            <span className={styles.count}>
              {g.count} {g.count === 1 ? 'ref' : 'refs'}
            </span>
            {g.scope === 'inherited' && g.inheritedFrom && (
              <span className={styles.inheritedFrom}>
                inherited from <code>{g.inheritedFrom}</code>
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

function groupKnowledgeRefs(refs: KnowledgeRef[]): KnowledgeGroup[] {
  // Inherited refs split by their `inherited_from` (each parent gets its own
  // row); other scopes collapse purely on (scope, role).
  const map = new Map<string, KnowledgeGroup>()
  for (const ref of refs) {
    const inheritedFrom =
      ref.scope === 'inherited' ? ref.inherited_from : undefined
    const key = `${ref.scope}:${ref.role}:${inheritedFrom ?? ''}`
    const existing = map.get(key)
    if (existing) {
      existing.count += 1
    } else {
      const group: KnowledgeGroup = {
        scope: ref.scope,
        role: ref.role,
        count: 1,
      }
      if (inheritedFrom) group.inheritedFrom = inheritedFrom
      map.set(key, group)
    }
  }
  return [...map.values()].sort((a, b) => {
    const s = SCOPE_ORDER.indexOf(a.scope) - SCOPE_ORDER.indexOf(b.scope)
    if (s !== 0) return s
    return a.role.localeCompare(b.role)
  })
}
