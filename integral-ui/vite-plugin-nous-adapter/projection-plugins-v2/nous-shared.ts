/**
 * Shared helper: given a configured nous source + an intent ID for a
 * campaign, fetch the runtime artifacts (ledger.json / principles.json /
 * state.json) as strings.
 *
 * The intent ID convention from the nous adapter: `nous:<source-slug>:<runId>[:iter-N]?`.
 * For both campaigns and iterations we want the parent campaign's runId.
 * The plugin layer is responsible for resolving "campaign id for this intent."
 */

import { FilesystemNousSource, resolveCampaignParent } from '../filesystem-source'
import type { ConfiguredSource } from '../sources-config'

export async function fetchCampaignFilesForIntent(
  source: ConfiguredSource,
  campaignIntentId: string
): Promise<{
  ledger: string | null
  principles: string | null
  state: string | null
  workDir?: string | undefined
}> {
  if (source.kind !== 'nous') return { ledger: null, principles: null, state: null }
  const runId = extractRunIdFromIntentId(campaignIntentId)
  if (!runId) return { ledger: null, principles: null, state: null }
  try {
    const fs = new FilesystemNousSource(source.path, {
      campaignParent: resolveCampaignParent(),
    })
    // listRunIds is required so workDirByRunId is populated.
    await fs.listRunIds()
    const files = await fs.fetchCampaignFiles(runId)
    return {
      ledger: files.ledger,
      principles: files.principles,
      state: files.state,
      workDir: files.workDir,
    }
  } catch {
    return { ledger: null, principles: null, state: null }
  }
}

function extractRunIdFromIntentId(intentId: string): string | null {
  // `nous:<sourceSlug>:<runId>` (campaign) — runId is the last segment.
  const parts = intentId.split(':')
  if (parts.length < 3) return null
  if (parts[0] !== 'nous') return null
  return parts[parts.length - 1] ?? null
}
