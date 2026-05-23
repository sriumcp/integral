import type {
  EvidenceLink,
  Intent,
  IntentId,
  Reference,
  Workspace,
} from '@/schema'
import { Chip, KindBadge, SectionLabel } from '@/components/atoms'
import styles from './EvidenceEdges.module.css'

export interface EvidenceEdgesProps {
  intent: Intent
  workspace: Workspace
  /** Click handler — only fires when the target is an in-workspace intent. */
  onOpen: (intent: Intent) => void
}

interface ResolvedEdge {
  edge: EvidenceLink
  direction: 'outgoing' | 'incoming'
  /** The "other end" — either an in-workspace Intent or an external Reference,
   *  or a string IntentId pointing at an intent outside the workspace. */
  target: Intent | Reference | { kind: 'unresolved-id'; id: IntentId }
}

/**
 * EvidenceEdges — outgoing/incoming edge columns for the focused intent.
 *
 * Edges are not embedded in intents (CLAUDE.md § Core decisions), so this
 * surface reads `workspace.evidence_links` and resolves each edge's "other
 * end" — which may be an in-workspace Intent (clickable), an external
 * Reference (display only), or an IntentId pointing outside the workspace
 * (display only, not yet resolvable in v0.1).
 */
export function EvidenceEdges({
  intent,
  workspace,
  onOpen,
}: EvidenceEdgesProps) {
  const intentById = new Map(workspace.intents.map((i) => [i.id, i]))

  const resolved: ResolvedEdge[] = []
  for (const edge of workspace.evidence_links) {
    if (edge.from_intent === intent.id) {
      const target = resolveTo(edge.to_intent, intentById)
      resolved.push({ edge, direction: 'outgoing', target })
    } else if (typeof edge.to_intent === 'string' && edge.to_intent === intent.id) {
      // Incoming requires a string target equal to this intent's id.
      // Reference-shaped to_intent values can't be incoming (they point at
      // external resources, not other intents).
      const fromIntent = intentById.get(edge.from_intent)
      const target: ResolvedEdge['target'] = fromIntent ?? {
        kind: 'unresolved-id',
        id: edge.from_intent,
      }
      resolved.push({ edge, direction: 'incoming', target })
    }
  }

  if (resolved.length === 0) return null

  const outgoing = resolved.filter((r) => r.direction === 'outgoing')
  const incoming = resolved.filter((r) => r.direction === 'incoming')

  return (
    <section className={styles.section}>
      {outgoing.length > 0 && (
        <div className={styles.column}>
          <SectionLabel hint={`${outgoing.length}`}>evidence · outgoing</SectionLabel>
          <ul className={styles.list}>
            {outgoing.map((r) => (
              <li key={r.edge.id}>
                <EdgeRow resolved={r} onOpen={onOpen} />
              </li>
            ))}
          </ul>
        </div>
      )}
      {incoming.length > 0 && (
        <div className={styles.column}>
          <SectionLabel hint={`${incoming.length}`}>evidence · incoming</SectionLabel>
          <ul className={styles.list}>
            {incoming.map((r) => (
              <li key={r.edge.id}>
                <EdgeRow resolved={r} onOpen={onOpen} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

function EdgeRow({
  resolved,
  onOpen,
}: {
  resolved: ResolvedEdge
  onOpen: (intent: Intent) => void
}) {
  const { edge, direction, target } = resolved
  const arrow = direction === 'outgoing' ? '→' : '←'
  const inWorkspace = isWorkspaceIntent(target)
  const targetLabel = describeTarget(target)
  const ariaLabel = `${edge.relation} ${arrow} ${targetLabel}`

  return (
    <button
      type="button"
      className={styles.row}
      data-edge="true"
      data-direction={direction}
      data-resolvable={inWorkspace ? 'true' : undefined}
      onClick={() => {
        if (inWorkspace) onOpen(target)
      }}
      aria-label={ariaLabel}
    >
      <span className={styles.arrow} aria-hidden="true">
        {arrow}
      </span>
      <span className={styles.relation}>
        <Chip mono tone="mute">
          {edge.relation}
        </Chip>
        {edge.strength && (
          <Chip mono tone={strengthTone(edge.strength)}>
            {edge.strength}
          </Chip>
        )}
      </span>
      <span className={styles.target}>
        {isWorkspaceIntent(target) ? (
          <>
            <KindBadge kind={target.kind} label={target.kind} />
            <span className={styles.targetTitle}>{target.declaration.title}</span>
          </>
        ) : (
          <span className={styles.targetExternal}>{targetLabel}</span>
        )}
      </span>
      {edge.note && <span className={styles.note}>{edge.note}</span>}
    </button>
  )
}

// ─── Helpers ───────────────────────────────────────────────────────────────
function resolveTo(
  to: IntentId | Reference,
  intentById: Map<string, Intent>
): ResolvedEdge['target'] {
  if (typeof to === 'string') {
    const intent = intentById.get(to)
    return intent ?? { kind: 'unresolved-id', id: to }
  }
  return to
}

function isWorkspaceIntent(
  target: ResolvedEdge['target']
): target is Intent {
  return typeof target === 'object' && 'declaration' in target
}

function describeTarget(target: ResolvedEdge['target']): string {
  if (isWorkspaceIntent(target)) return target.declaration.title
  if ('kind' in target && target.kind === 'unresolved-id') return target.id
  // Reference
  return target.target
}

function strengthTone(
  strength: 'weak' | 'moderate' | 'strong'
): 'mute' | 'sage' | 'amber' {
  if (strength === 'strong') return 'sage'
  if (strength === 'moderate') return 'amber'
  return 'mute'
}
