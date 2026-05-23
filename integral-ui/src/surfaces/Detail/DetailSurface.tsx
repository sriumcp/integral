import { useMemo, useState } from 'react'
import type { Intent, Party, Workspace, ZoomLevel } from '@/schema'
import { DetailHeader } from './DetailHeader/DetailHeader'
import { ChildrenSection } from './ChildrenSection/ChildrenSection'
import { EvidenceEdges } from './EvidenceEdges/EvidenceEdges'
import { KnowledgeRefsSection } from './KnowledgeRefsSection/KnowledgeRefsSection'
import { IntentActivityStrip } from './IntentActivityStrip/IntentActivityStrip'
import styles from './DetailSurface.module.css'

export interface DetailSurfaceProps {
  workspace: Workspace
  intent: Intent
  me: Party
  /** Open another intent (cross-tree navigation from a child or evidence edge). */
  onOpenIntent: (intent: Intent) => void
  /** Back to the Map surface. */
  onBack: () => void
}

/**
 * DetailSurface — composes header, structural body, evidence edges,
 * knowledge corpus, and a per-intent activity strip into the daily-use
 * detail view.
 *
 * Owns `zoom` state locally; the toggle in the header drives all body
 * sections that respect it. Per CLAUDE.md § Resolved surface decisions,
 * the toggle is *not* decorative — it changes body content.
 */
export function DetailSurface({
  workspace,
  intent,
  me,
  onOpenIntent,
  onBack,
}: DetailSurfaceProps) {
  const [zoom, setZoom] = useState<ZoomLevel>('structure')

  const state = useMemo(() => {
    // Bijection refine guarantees the state exists for any in-workspace intent.
    return workspace.states.find((s) => s.intent_id === intent.id)!
  }, [workspace, intent])

  return (
    <main className={styles.surface}>
      <div className={styles.main}>
        <DetailHeader
          intent={intent}
          state={state}
          me={me}
          zoom={zoom}
          onZoomChange={setZoom}
          onBack={onBack}
        />
        <ChildrenSection
          intent={intent}
          workspace={workspace}
          zoom={zoom}
          onOpen={onOpenIntent}
        />
        <EvidenceEdges
          intent={intent}
          workspace={workspace}
          onOpen={onOpenIntent}
        />
        <KnowledgeRefsSection intent={intent} />
      </div>
      <div className={styles.aside}>
        <IntentActivityStrip intent={intent} state={state} />
      </div>
    </main>
  )
}
