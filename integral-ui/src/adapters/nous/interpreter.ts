import { parse as parseYaml } from 'yaml'
import type {
  EvidenceLink,
  Intent,
  IntentState,
  Operation,
  Party,
  Status,
  Workspace,
} from '../../schema'
import { diffWorkspaces } from '../../lib/workspace-diff'
import type {
  CampaignFiles,
  NousSource,
  ParsedCampaignYaml,
  ParsedNousState,
} from './types'
import { interpretIteration, parseLedger, type LedgerEntry } from './ledger'
import {
  interpretPrinciplesAsKnowledgeRefs,
  parsePrinciples,
} from './principles'

/**
 * Nous adapter interpreter — pure function from a `NousSource` to a typed
 * `Workspace`. Phase 1 (this commit) reads only the campaign-*.yaml files
 * + `.nous/<run>/state.json`. It produces:
 *
 *   - one `nous-campaign` Intent per discovered run
 *   - one `IntentState` per Intent (status derived from state.json's phase)
 *   - empty operations / evidence_links collections (Phase 2+ work)
 *
 * Lossy mappings are deliberate per the v0.1 falsification discipline
 * (see `gaps.md`). Specifically:
 *  - The campaign's `success_criterion` isn't in the YAML and isn't in
 *    the runtime state either; we leave it empty for now and surface
 *    the gap (G-N-8 candidate, not yet recorded).
 *  - `holder.parties` defaults to a synthetic `{nous-projector}` agent +
 *    the user `sri` since the YAML doesn't carry this. The schema will
 *    later (v0.2) need a way to express "holder unknown."
 *  - `provenance.declared_by` defaults to the same synthetic agent.
 */

const PROJECTOR_AGENT = {
  id: 'nous-projector',
  kind: 'agent' as const,
  display_name: 'nous-projector',
}
const DEFAULT_HUMAN_HOLDER = {
  id: 'sri',
  kind: 'human' as const,
  display_name: 'sri',
}

const SCHEMA_VERSION = '0.1.0' as const

export interface BuildNousWorkspaceOpts {
  /** Prior workspace snapshot — when provided, the adapter computes a
   *  typed `Operation[]` describing the delta and includes them in the
   *  returned workspace's `operations`. */
  prior?: Workspace
  /** Timestamp to stamp on emitted ops. Defaults to `new Date().toISOString()`
   *  but tests pass a fixed value for determinism. */
  at?: string
  /** Party emitting the ops. Defaults to the synthetic projector agent
   *  used elsewhere in this adapter. */
  by?: Party
}

export async function buildNousWorkspace(
  source: NousSource,
  opts: BuildNousWorkspaceOpts = {}
): Promise<Workspace> {
  const runIds = await source.listRunIds()
  const intents: Intent[] = []
  const states: IntentState[] = []
  const evidenceLinks: EvidenceLink[] = []
  const operations: Operation[] = []

  for (const runId of runIds) {
    const files = await source.fetchCampaignFiles(runId)
    if (files.campaignYaml.trim().length === 0) {
      // No campaign declaration on disk — skip this run for v0.1. v0.2
      // may want to render a placeholder for runs with state but no yaml.
      continue
    }
    const result = interpretCampaign(runId, files, source.id)
    if (!result) continue

    // Phase 2: parse ledger.json (if present) → child nous-iteration intents.
    // The baseline iter (iteration === 0, family === 'baseline') is a
    // synthetic seed Nous emits for every campaign — we skip it so the Map
    // doesn't show a fake first child.
    const ledgerEntries: LedgerEntry[] = files.ledger
      ? parseLedger(files.ledger).filter(
          (e) => !(e.iteration === 0 && e.family === 'baseline')
        )
      : []

    // Phase 3: parse principles.json (if present) → KnowledgeRefs to attach
    // at campaign + iteration scope.
    const principleBundle = files.principles
      ? interpretPrinciplesAsKnowledgeRefs(
          parsePrinciples(files.principles),
          runId
        )
      : { campaignRefs: [], iterationRefsByIter: new Map<number, never[]>() }

    const childIds: string[] = []
    let mostRecentIterId: string | undefined
    for (const entry of ledgerEntries) {
      const iter = interpretIteration({
        runId,
        parentIntentId: result.intent.id,
        entry,
        sourceId: source.id,
      })
      const iterRefs =
        principleBundle.iterationRefsByIter.get(entry.iteration) ?? []
      const iterIntent: Intent =
        iterRefs.length > 0
          ? { ...iter.intent, knowledge_refs: iterRefs }
          : iter.intent
      intents.push(iterIntent)
      states.push(iter.state)
      childIds.push(iterIntent.id)
      mostRecentIterId = iterIntent.id
    }

    // Wire iteration ids into the parent campaign's decomposition + extension,
    // and attach the full set of campaign-scoped principle refs.
    const wiredIntent: Intent = {
      ...result.intent,
      decomposition: { children: childIds },
      knowledge_refs: principleBundle.campaignRefs,
      extension:
        result.intent.extension.kind === 'nous-campaign' && mostRecentIterId
          ? {
              ...result.intent.extension,
              current_iteration: mostRecentIterId,
            }
          : result.intent.extension,
    }
    intents.push(wiredIntent)
    states.push(result.state)
  }

  const current: Workspace = {
    intents,
    states,
    evidence_links: evidenceLinks,
    operations,
  }

  // Phase 4: if a prior workspace was provided, derive Operations from
  // the delta. The diff engine is generic (`src/lib/workspace-diff.ts`);
  // the adapter just supplies its identity (`PROJECTOR_AGENT`) and a
  // timestamp.
  if (opts.prior) {
    const diffOps = diffWorkspaces({
      prior: opts.prior,
      current,
      by: opts.by ?? PROJECTOR_AGENT,
      at: opts.at ?? new Date().toISOString(),
    })
    current.operations = diffOps
  }

  return current
}

/** Pure mapping from a single campaign's raw files → typed Intent + IntentState.
 *  Exported so unit tests can target it without spinning up a NousSource. */
export function interpretCampaign(
  runId: string,
  files: CampaignFiles,
  sourceId: string
): { intent: Intent; state: IntentState } | null {
  let parsedYaml: ParsedCampaignYaml = {}
  try {
    const raw = parseYaml(files.campaignYaml) as unknown
    if (raw && typeof raw === 'object') {
      parsedYaml = raw as ParsedCampaignYaml
    }
  } catch {
    // Malformed YAML — skip. v0.2 can surface a parse-error indicator.
    return null
  }

  const parsedState: ParsedNousState | null = files.state
    ? safeParseJson<ParsedNousState>(files.state)
    : null

  const intentId = makeIntentId(sourceId, runId)
  const stateId = `${intentId}-STATE`

  // Stable fallback chain for the campaign's effective timestamp. When
  // state.json is absent (freshly-shaped campaign Nous hasn't run yet),
  // we prefer the YAML file's mtime over `synthTimestamp()` so the
  // projection cache key is stable across reads. Without this, the Vite
  // plugin re-generates LLM projections on every Detail navigation for
  // any campaign that hasn't been run.
  const declaredAt =
    parsedState?.timestamp ?? files.campaignYamlMtime ?? synthTimestamp()
  const startedAt = parsedState?.timestamp ?? declaredAt

  const title = makeTitle(runId, parsedYaml)
  const summary = makeSummary(parsedYaml)
  const researchQuestion = (parsedYaml.research_question ?? '').trim()

  const intent: Intent = {
    id: intentId,
    schema_version: SCHEMA_VERSION,
    kind: 'nous-campaign',
    declaration: {
      title,
      summary,
      // Nous campaigns don't carry an explicit success criterion in the
      // YAML; leaving empty surfaces the gap honestly. (See gaps.md.)
      success_criterion: '',
    },
    holder: {
      mode: 'jointly-held',
      parties: [DEFAULT_HUMAN_HOLDER, PROJECTOR_AGENT],
    },
    lifetime: {
      kind: 'campaign',
      started_at: startedAt,
    },
    decomposition: {
      // Phase 1 has no children. Phase 2 will populate from ledger.json.
      children: [],
    },
    provenance: {
      declared_by: PROJECTOR_AGENT,
      declared_at: declaredAt,
      motivated_by: [],
      source: 'nous',
    },
    knowledge_refs: [],
    tags: [],
    state_ref: stateId,
    extension: {
      kind: 'nous-campaign',
      research_question:
        researchQuestion.length > 0
          ? researchQuestion
          : `(no research_question recorded for ${runId})`,
      open_hypothesis_bundles: [],
      gate_status: { current_gate: 'none' },
    },
  }

  const status: Status = mapPhaseToStatus(parsedState?.phase)

  const state: IntentState = {
    id: stateId,
    intent_id: intentId,
    schema_version: SCHEMA_VERSION,
    status,
    last_advanced_at: parsedState?.timestamp ?? declaredAt,
    last_advanced_by: PROJECTOR_AGENT,
    history: [],
    external_anchors: [
      {
        kind: 'nous-campaign-dir',
        uri: `${sourceId}/${runId}`,
        read_only: true,
      },
    ],
  }

  return { intent, state }
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function makeIntentId(sourceId: string, runId: string): string {
  // sourceId is opaque per the NousSource contract; we slug-ify by
  // replacing characters that don't compose well in IDs.
  const slug = sourceId.replace(/[^a-zA-Z0-9-]/g, '-').replace(/--+/g, '-')
  return `nous:${slug}:${runId}`
}

function makeTitle(runId: string, parsed: ParsedCampaignYaml): string {
  const fromTarget = parsed.target_system?.name?.trim()
  if (fromTarget) {
    return clampTitle(`${runId} — ${fromTarget}`)
  }
  return clampTitle(runId)
}

function clampTitle(s: string): string {
  // Declaration.title is bounded at 80 chars by the schema.
  if (s.length <= 80) return s
  return s.slice(0, 77) + '…'
}

function makeSummary(parsed: ParsedCampaignYaml): string {
  const desc = parsed.target_system?.description?.trim()
  const rq = parsed.research_question?.trim()
  // Prefer a research_question when present (more specific to the campaign);
  // fall back to the target_system.description. Schema bound: 2000 chars.
  const candidate = rq && rq.length > 0 ? rq : desc ?? ''
  if (candidate.length <= 2000) return candidate
  return candidate.slice(0, 1997) + '…'
}

function mapPhaseToStatus(phase: string | undefined): Status {
  if (!phase) return 'active' // No state.json → assume active by convention
  const normalized = phase.toUpperCase()
  if (normalized === 'DONE' || normalized === 'SATISFIED') return 'satisfied'
  if (normalized === 'ABANDONED') return 'abandoned'
  if (normalized === 'REVOKED') return 'revoked'
  if (normalized === 'DRAFT' || normalized === 'SHAPING') return 'draft'
  if (normalized === 'GATED') return 'gated'
  // DESIGN, EXECUTE_ANALYZE, REVIEW, etc. all map to 'active' for v0.1;
  // the schema doesn't yet model intra-iteration gate phases (see G-N-7).
  return 'active'
}

function safeParseJson<T>(s: string): T | null {
  try {
    return JSON.parse(s) as T
  } catch {
    return null
  }
}

function synthTimestamp(): string {
  return new Date().toISOString().replace(/\.\d+Z$/, 'Z')
}
