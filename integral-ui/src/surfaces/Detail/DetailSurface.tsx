import { useMemo, useState } from 'react'
import type { Intent, Party, Workspace, ZoomLevel } from '@/schema'
import type { SourceEntry } from '@/lib/sources'
import { DetailHeader } from './DetailHeader/DetailHeader'
import { ChildrenSection } from './ChildrenSection/ChildrenSection'
import { EvidenceEdges } from './EvidenceEdges/EvidenceEdges'
import { KnowledgeRefsSection } from './KnowledgeRefsSection/KnowledgeRefsSection'
import { ProjectionSection } from './ProjectionSection/ProjectionSection'
import { RunCommand } from './RunCommand'
import styles from './DetailSurface.module.css'

export interface DetailSurfaceProps {
  workspace: Workspace
  intent: Intent
  me: Party
  /** Open another intent (cross-tree navigation from a child or evidence edge). */
  onOpenIntent: (intent: Intent) => void
  /** Back to the Map surface. */
  onBack: () => void
  /** Optional refresh callback — when provided, DetailHeader renders a
   *  small ↻ button next to the id pill. Wires to the workspace-level
   *  refresh in v0.1 (no per-intent re-read endpoint yet). */
  onRefresh?: () => void
  refreshing?: boolean
  /** Source registry — passed to A5 RunCommand for per-source filesystem
   *  path resolution. Optional so tests + preview environments can render
   *  Detail without it; the RunCommand panel just hides itself. */
  registry?: ReadonlyArray<SourceEntry>
}

/**
 * DetailSurface — composes header, structural body, evidence edges, and
 * knowledge corpus.
 *
 * Per-intent activity used to live as a sibling aside column inside
 * Detail. As of v0.1.next (Path 2 from `roadmap.md`), per-intent activity
 * is folded into `WorkspaceActivityStrip` via a "this intent" filter
 * chip — one panel, one chrome, one source of truth. Detail is now a
 * single-column main layout.
 *
 * Owns `zoom` state locally; the header's toggle drives body sections
 * that respect it. Per CLAUDE.md § Resolved surface decisions, the
 * toggle changes body content, not just its own highlight.
 */
export function DetailSurface({
  workspace,
  intent,
  me,
  onOpenIntent,
  onBack,
  onRefresh,
  refreshing,
  registry,
}: DetailSurfaceProps) {
  const [zoom, setZoom] = useState<ZoomLevel>('structure')

  const state = useMemo(() => {
    // Bijection refine guarantees the state exists for any in-workspace intent.
    return workspace.states.find((s) => s.intent_id === intent.id)!
  }, [workspace, intent])

  return (
    <main className={styles.surface}>
      <DetailHeader
        intent={intent}
        state={state}
        me={me}
        zoom={zoom}
        onZoomChange={setZoom}
        onBack={onBack}
        {...(onRefresh && { onRefresh })}
        {...(refreshing !== undefined && { refreshing })}
      />
      <ProjectionSection intentId={intent.id} zoom={zoom} />
      {registry && (
        <RunCommand intent={intent} state={state} registry={registry} />
      )}
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
    </main>
  )
}
