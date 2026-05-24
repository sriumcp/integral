/**
 * nous-campaign run-command plugin.
 *
 * Resolves a Nous-adapter-emitted Intent into the exact `nous run` shell
 * invocation string. The plugin is *kind-specific*: it knows the Nous
 * adapter's intent-id convention (`nous:<slug>:<runId>`, see
 * `src/adapters/nous/interpreter.ts:271-276`) and the on-disk yaml
 * convention (`<sourcePath>/campaign-<runId>.yaml`).
 *
 * Returns null (panel hidden) when:
 *  - state.status is not `active` or `gated`.
 *  - intent.id doesn't match the `nous:<slug>:<runId>` shape.
 *  - source.path is undefined.
 */

import type { RunCommand, RunCommandPlugin } from '../run-command'
import { composeOneLiner } from '../run-command'

const NOUS_ID_PATTERN = /^nous:([^:]+):(.+)$/

export const nousCampaignRunCommand: RunCommandPlugin = ({
  intent,
  state,
  source,
}): RunCommand | null => {
  if (state.status !== 'active' && state.status !== 'gated') return null
  if (!source.path) return null

  const match = NOUS_ID_PATTERN.exec(intent.id)
  if (!match) return null
  const runId = match[2]
  if (!runId) return null

  const yamlName = `campaign-${runId}.yaml`
  const cwd = source.path
  const argv = ['nous', 'run', '--auto-approve', yamlName]
  return {
    cwd,
    argv,
    oneLiner: composeOneLiner({ cwd, argv }),
  }
}
