/**
 * Research-thread adapter — pure interpreter.
 *
 * Turns a `ResearchThreadSource`'s descriptor list into a typed
 * `Workspace` of `research-thread` Intents + matching IntentStates.
 *
 * Discipline: pure (no fs, no network). The transport handles I/O;
 * this layer is structurally a transformation. Same split as the
 * Nous / Coral / Feature adapters.
 *
 * Each thread becomes a single leaf Intent — no decomposition into
 * typed children, no sub-iteration intents. The chrome's projection
 * layer reads the directory at navigation time and produces meaning;
 * the schema doesn't pre-impose structure on what's inside.
 */

import type {
  EvidenceLink,
  Intent,
  IntentState,
  Operation,
  Party,
  Workspace,
} from '../../schema'
import type { ResearchThreadSource, ResearchThreadDescriptor } from './types'

/** Synthetic placeholder for human attribution when the source has no
 *  holder information attached. Mirrors the Nous adapter's
 *  UNKNOWN_HUMAN convention (gaps.md G-N-13). */
const UNKNOWN_HUMAN: Party = {
  id: 'unknown-human',
  kind: 'human',
  display_name: '(unknown)',
}

const SCHEMA_VERSION = '0.3.0' as const

/** Build an Intent + IntentState pair from a thread descriptor.
 *  Exported for unit testing — callers should usually go through
 *  `buildResearchThreadWorkspace`. */
export function intentFromDescriptor(
  desc: ResearchThreadDescriptor,
  sourceId: string,
): { intent: Intent; state: IntentState } {
  const id = `research-thread:${sourceId}:${desc.name}`
  const stateId = `${id}-STATE`
  const intent: Intent = {
    id,
    schema_version: SCHEMA_VERSION,
    kind: 'research-thread',
    declaration: {
      title: desc.name,
      // The summary + success_criterion are projection territory — the
      // adapter has no schema-shaped declaration to extract from a
      // free-form folder. Empty strings here; the projection plugin
      // surfaces meaning at navigation time.
      summary: '',
      success_criterion: '',
    },
    holder: { mode: 'human-held', parties: [UNKNOWN_HUMAN] },
    lifetime: { kind: 'standing', started_at: desc.lastModified },
    decomposition: { children: [] },
    provenance: {
      declared_by: UNKNOWN_HUMAN,
      declared_at: desc.lastModified,
      motivated_by: [],
      source: sourceId,
    },
    knowledge_refs: [],
    tags: [],
    state_ref: stateId,
    extension: {
      kind: 'research-thread',
      root_anchor: {
        kind: 'filesystem-path',
        uri: `file://${desc.rootPath}`,
        read_only: true,
      },
    },
  }
  const state: IntentState = {
    id: stateId,
    intent_id: id,
    schema_version: SCHEMA_VERSION,
    status: 'active',
    last_advanced_at: desc.lastModified,
    last_advanced_by: UNKNOWN_HUMAN,
    history: [],
    external_anchors: [
      {
        kind: 'filesystem-path',
        uri: `file://${desc.rootPath}`,
        read_only: true,
        last_synced: desc.lastModified,
      },
    ],
  }
  return { intent, state }
}

/**
 * Build a Workspace from a research-thread source. Pure async over an
 * abstract `ResearchThreadSource` — concrete transports
 * (FilesystemResearchThreadSource, future S3/HTTP variants) all conform.
 */
export async function buildResearchThreadWorkspace(
  source: ResearchThreadSource,
): Promise<Workspace> {
  const descriptors = await source.listThreads()
  const intents: Intent[] = []
  const states: IntentState[] = []
  for (const d of descriptors) {
    const { intent, state } = intentFromDescriptor(d, source.id)
    intents.push(intent)
    states.push(state)
  }
  const evidence_links: EvidenceLink[] = []
  const operations: Operation[] = []
  return { intents, states, evidence_links, operations }
}
