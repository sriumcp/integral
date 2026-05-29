/**
 * Nous-campaign projection plugin (v2 — typed-evidence pipeline).
 *
 * Builds TypedEvidence from the campaign's runtime artifacts (ledger.json,
 * principles.json) when available, falling back to workspace-derived
 * iteration data otherwise. The composer + executor + lint do the rest.
 */

import type { ConfiguredSource } from '../sources-config'
import type { Workspace } from '../../src/schema'
import type {
  KindProjectionPlugin,
  ProjectionContext,
} from '../../src/lib/projection'
import type { TypedEvidence } from '../../src/lib/projection/spec'
import { parseNousCampaign } from '../parser-packs/nous'
import { fetchCampaignFilesForIntent } from './nous-shared'

export function makeNousCampaignPlugin(
  resolveSource: (workspace: Workspace) => ConfiguredSource | null
): KindProjectionPlugin {
  return {
    kind: 'nous-campaign',

    async evidence(ctx: ProjectionContext): Promise<TypedEvidence> {
      const source = resolveSource(ctx.workspace)
      const files = source
        ? await fetchCampaignFilesForIntent(source, ctx.intent.id)
        : { ledger: null, principles: null, state: null }
      return parseNousCampaign({
        intent: ctx.intent,
        state: ctx.state,
        workspace: ctx.workspace,
        files,
      })
    },

    intentSummary(ctx: ProjectionContext): string {
      const ext = ctx.intent.extension
      const rq = ext.kind === 'nous-campaign' ? ext.research_question : ''
      const childCount = ctx.intent.decomposition.children.length
      const tags = ctx.intent.tags?.length ? ` tags: ${ctx.intent.tags.join(', ')}` : ''
      return [
        `Nous campaign: "${ctx.intent.declaration.title}"`,
        `Status: ${ctx.state.status}`,
        rq ? `Research question: ${rq}` : '',
        `Iterations declared: ${childCount}`,
        tags,
      ].filter(Boolean).join('\n')
    },
  }
}
