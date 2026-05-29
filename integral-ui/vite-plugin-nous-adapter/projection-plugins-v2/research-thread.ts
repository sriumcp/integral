/**
 * Research-thread projection plugin (v2 — typed-evidence pipeline).
 */

import type {
  KindProjectionPlugin,
  ProjectionContext,
} from '../../src/lib/projection'
import type { TypedEvidence } from '../../src/lib/projection/spec'
import { parseResearchThread } from '../parser-packs/research-thread'

export const researchThreadPluginV2: KindProjectionPlugin = {
  kind: 'research-thread',

  async evidence(ctx: ProjectionContext): Promise<TypedEvidence> {
    const root = rootAnchorPath(ctx.intent)
    if (!root) {
      return { datasets: [], excerpts: [], files_seen: [], fingerprint: 'no-anchor' }
    }
    return parseResearchThread(root, {
      zoom: ctx.zoom === 'detail' ? 'detail' : 'structure',
    })
  },

  intentSummary(ctx: ProjectionContext): string {
    return [
      `Research thread: "${ctx.intent.declaration.title}"`,
      ctx.intent.declaration.summary
        ? `Summary: ${ctx.intent.declaration.summary}`
        : '',
      `Status: ${ctx.state.status}`,
    ].filter(Boolean).join('\n')
  },
}

function rootAnchorPath(intent: ProjectionContext['intent']): string | null {
  const ext = intent.extension
  if (ext.kind !== 'research-thread') return null
  const uri = ext.root_anchor.uri
  if (uri.startsWith('file://')) return uri.slice('file://'.length)
  if (uri.startsWith('/')) return uri
  return null
}
