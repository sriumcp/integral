/**
 * Nous-iteration projection plugin (v2 — typed-evidence pipeline).
 */

import type { ConfiguredSource } from '../sources-config'
import type { Workspace } from '../../src/schema'
import type {
  KindProjectionPlugin,
  ProjectionContext,
} from '../../src/lib/projection'
import type { TypedEvidence } from '../../src/lib/projection/spec'
import { parseNousIteration } from '../parser-packs/nous'
import { fetchCampaignFilesForIntent } from './nous-shared'

export function makeNousIterationPlugin(
  resolveSource: (workspace: Workspace) => ConfiguredSource | null
): KindProjectionPlugin {
  return {
    kind: 'nous-iteration',

    async evidence(ctx: ProjectionContext): Promise<TypedEvidence> {
      const source = resolveSource(ctx.workspace)
      const parent = ctx.workspace.intents.find(
        (i) =>
          i.kind === 'nous-campaign' &&
          i.decomposition.children.includes(ctx.intent.id)
      )
      const files = source && parent
        ? await fetchCampaignFilesForIntent(source, parent.id)
        : { ledger: null, principles: null, state: null }
      return parseNousIteration({
        intent: ctx.intent,
        state: ctx.state,
        workspace: ctx.workspace,
        files,
      })
    },

    intentSummary(ctx: ProjectionContext): string {
      const ext = ctx.intent.extension
      const iter = ext.kind === 'nous-iteration' ? ext.iteration_number : -1
      const family = ctx.intent.tags?.[0] ?? 'unknown'
      return [
        `Nous iteration: "${ctx.intent.declaration.title}"`,
        `Iteration number: ${iter}`,
        `Family: ${family}`,
        `Status: ${ctx.state.status}`,
      ].join('\n')
    },
  }
}
