/**
 * Plugin registry factory — wires up every kind that participates in the
 * v0.3.x typed-evidence projection pipeline.
 *
 * The factory takes a `resolveSource(workspace) → ConfiguredSource | null`
 * function (the API handler knows which source produced which workspace)
 * so nous plugins can locate the campaign's runtime artifacts on disk.
 */

import type { Workspace } from '../../src/schema'
import type { PluginRegistry } from '../../src/lib/projection'
import type { ConfiguredSource } from '../sources-config'
import { makeNousCampaignPlugin } from './nous-campaign'
import { makeNousIterationPlugin } from './nous-iteration'
import { researchThreadPluginV2 } from './research-thread'

export function buildPluginRegistry(
  resolveSource: (workspace: Workspace) => ConfiguredSource | null
): PluginRegistry {
  return {
    'nous-campaign': makeNousCampaignPlugin(resolveSource),
    'nous-iteration': makeNousIterationPlugin(resolveSource),
    'research-thread': researchThreadPluginV2,
  }
}
