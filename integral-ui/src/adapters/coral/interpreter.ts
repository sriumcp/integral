import { parse as parseYaml } from 'yaml'
import type {
  EvidenceLink,
  ExternalAnchor,
  Intent,
  IntentState,
  KnowledgeRef,
  Operation,
  Party,
  Status,
  Workspace,
} from '../../schema'
import type {
  CoralSource,
  ParsedAttempt,
  ParsedTaskYaml,
  RunFiles,
} from './types'
import { notesToKnowledgeRefs } from './notes'

/**
 * Coral adapter interpreter — pure function from a `CoralSource` to a
 * typed `Workspace`. v0.1 covers Phases 1+2: declarations + scored
 * attempts. No operations diff (the generic engine is adapter-agnostic;
 * Coral can opt in later). No writeback.
 *
 * Lossy mappings are recorded in `gaps.md` § Coral (G-C-1..G-C-14). The
 * v0.1 falsification discipline is to read what fits the schema cleanly,
 * record what doesn't, and resist patching the schema mid-flight.
 */

const CORAL_ORCHESTRATOR_AGENT: Party = {
  id: 'coral-orchestrator',
  kind: 'agent',
  display_name: 'coral-orchestrator',
}

const SCHEMA_VERSION = '0.1.0' as const

export interface BuildCoralWorkspaceOpts {
  /** Reserved for v0.2 — when an `Operation[]` diff lands for Coral, this
   *  will mirror Nous's `BuildNousWorkspaceOpts.prior`. v0.1: ignored. */
  prior?: Workspace
  at?: string
  by?: Party
}

export async function buildCoralWorkspace(
  source: CoralSource,
  _opts: BuildCoralWorkspaceOpts = {}
): Promise<Workspace> {
  const runIds = await source.listRunIds()
  const intents: Intent[] = []
  const states: IntentState[] = []
  const evidenceLinks: EvidenceLink[] = []
  const operations: Operation[] = []

  for (const runId of runIds) {
    const files = await source.fetchRunFiles(runId)
    if (files.taskYaml.trim().length === 0) continue
    const result = interpretRun(runId, files, source.id)
    if (!result) continue
    intents.push(...result.intents)
    states.push(...result.states)
  }

  return {
    intents,
    states,
    evidence_links: evidenceLinks,
    operations,
  }
}

/** Pure mapping from one Coral run's raw files → typed Intents + IntentStates.
 *  Returns `null` when the run is malformed (e.g., unparseable task.yaml).
 *  Exported for unit tests. */
export function interpretRun(
  runId: string,
  files: RunFiles,
  sourceId: string
): { intents: Intent[]; states: IntentState[] } | null {
  let parsedTask: ParsedTaskYaml = {}
  try {
    const raw = parseYaml(files.taskYaml) as unknown
    if (raw && typeof raw === 'object') {
      parsedTask = raw as ParsedTaskYaml
    } else {
      return null
    }
  } catch {
    return null
  }

  const taskName = (parsedTask.task?.name ?? extractTaskFromRunId(runId) ?? 'unnamed').trim()
  const timestamp = extractTimestampFromRunId(runId)
  const startedAt = parseTimestampLabel(timestamp) ?? files.runDirMtime ?? synthTimestamp()

  const campaignId = makeCampaignId(sourceId, taskName, timestamp)
  const stateId = `${campaignId}-STATE`

  // Build the campaign's external anchor + extension anchors. URIs are
  // synthesized from the source's logical layout — the interpreter doesn't
  // verify file existence; that's the transport's job.
  const runRel = `${taskName}/${timestamp}`
  const attemptsAnchor: ExternalAnchor = {
    kind: 'coral-shared-dir',
    uri: `file://results/${runRel}/.coral/public/attempts/`,
    read_only: true,
  }
  const skillsAnchor: ExternalAnchor = {
    kind: 'coral-shared-dir',
    uri: `file://results/${runRel}/.coral/public/skills/`,
    read_only: true,
  }
  const runDirAnchor: ExternalAnchor = {
    kind: 'coral-shared-dir',
    uri: `file://results/${runRel}/.coral/public/`,
    read_only: true,
  }

  const direction = parsedTask.grader?.direction === 'minimize' ? 'minimize' : 'maximize'
  const populationSize = sanitizePopulationSize(parsedTask.agents?.count)

  const tags: string[] = [`direction:${direction}`]

  // ─── Attempt mapping (single-pass; DAG resolution after parsing) ───────
  const byCommit = new Map<string, string>()
  for (const a of files.attempts) {
    byCommit.set(a.commit_hash, makeAttemptId(campaignId, a.commit_hash))
  }

  const childrenOf = new Map<string, string[]>()
  const rootAttemptIds: string[] = []
  const attemptIntents: Intent[] = []
  const attemptStates: IntentState[] = []

  for (const a of files.attempts) {
    const myId = byCommit.get(a.commit_hash)!
    const parentId = a.parent_hash ? byCommit.get(a.parent_hash) : undefined
    if (parentId) {
      const list = childrenOf.get(parentId) ?? []
      list.push(myId)
      childrenOf.set(parentId, list)
    } else {
      rootAttemptIds.push(myId)
    }
  }

  for (const a of files.attempts) {
    const myId = byCommit.get(a.commit_hash)!
    const parentId = a.parent_hash ? byCommit.get(a.parent_hash) : undefined
    const myChildren = childrenOf.get(myId) ?? []
    const { intent, state } = makeAttempt({
      attempt: a,
      attemptId: myId,
      campaignId,
      sourceId,
      taskName,
      timestamp,
      runRel,
      parentAttemptId: parentId,
      childAttemptIds: myChildren,
    })
    attemptIntents.push(intent)
    attemptStates.push(state)
  }

  // ─── best_score_so_far ─────────────────────────────────────────────────
  const scores = files.attempts
    .map((a) => a.score)
    .filter((s): s is number => typeof s === 'number' && Number.isFinite(s))
  let bestScoreSoFar: number | undefined
  if (scores.length > 0) {
    bestScoreSoFar = direction === 'minimize' ? Math.min(...scores) : Math.max(...scores)
  }

  // ─── KnowledgeRefs from notes/ ─────────────────────────────────────────
  const noteRefs: KnowledgeRef[] = notesToKnowledgeRefs({
    notes: files.notes,
    sourceId,
    runId: `${taskName}/${timestamp}`,
  })

  const summary = clampString(parsedTask.task?.description?.trim() ?? '', 2000)
  const title = clampTitle(`${taskName} — ${timestamp}`)

  const campaign: Intent = {
    id: campaignId,
    schema_version: SCHEMA_VERSION,
    kind: 'coral-optimization',
    declaration: {
      title,
      summary,
      success_criterion: '',
    },
    holder: {
      mode: 'hierarchically-held',
      parties: [CORAL_ORCHESTRATOR_AGENT],
    },
    lifetime: {
      kind: 'campaign',
      started_at: startedAt,
    },
    decomposition: {
      children: rootAttemptIds,
    },
    provenance: {
      declared_by: CORAL_ORCHESTRATOR_AGENT,
      declared_at: startedAt,
      motivated_by: [],
      source: sourceId,
    },
    knowledge_refs: noteRefs,
    tags,
    state_ref: stateId,
    extension: {
      kind: 'coral-optimization',
      scoring_function_ref: `coral-grader://${slugSourceId(sourceId)}/${taskName}`,
      search_algorithm: 'other',
      population_size: populationSize,
      attempts_db_anchor: attemptsAnchor,
      shared_skills_anchor: skillsAnchor,
      ...(bestScoreSoFar !== undefined ? { best_score_so_far: bestScoreSoFar } : {}),
    },
  }

  const campaignState: IntentState = {
    id: stateId,
    intent_id: campaignId,
    schema_version: SCHEMA_VERSION,
    status: 'active',
    last_advanced_at: startedAt,
    last_advanced_by: CORAL_ORCHESTRATOR_AGENT,
    history: [],
    external_anchors: [runDirAnchor],
  }

  return {
    intents: [campaign, ...attemptIntents],
    states: [campaignState, ...attemptStates],
  }
}

// ─── Attempt construction ──────────────────────────────────────────────────

interface MakeAttemptArgs {
  attempt: ParsedAttempt
  attemptId: string
  campaignId: string
  sourceId: string
  taskName: string
  timestamp: string
  runRel: string
  parentAttemptId: string | undefined
  childAttemptIds: string[]
}

function makeAttempt(
  args: MakeAttemptArgs
): { intent: Intent; state: IntentState } {
  const { attempt, attemptId, campaignId, sourceId, taskName, runRel } = args
  const stateId = `${attemptId}-STATE`

  const agentParty: Party = {
    id: `${campaignId}:agent:${attempt.agent_id}`,
    kind: 'agent',
    display_name: attempt.agent_id,
  }

  const worktreeAnchor: ExternalAnchor = {
    kind: 'coral-shared-dir',
    uri: `file://results/${runRel}/agents/${attempt.agent_id}/`,
    read_only: true,
  }

  const tags: string[] = []
  if (attempt.metadata?.budget_class) {
    tags.push(`budget-class:${attempt.metadata.budget_class}`)
  }

  const intent: Intent = {
    id: attemptId,
    schema_version: SCHEMA_VERSION,
    kind: 'coral-attempt',
    declaration: {
      title: clampTitle(attempt.title || `attempt ${attempt.commit_hash.slice(0, 8)}`),
      summary: '',
      success_criterion: '',
    },
    holder: {
      mode: 'agent-held',
      parties: [agentParty],
    },
    lifetime: {
      kind: 'discrete',
      started_at: attempt.timestamp,
    },
    decomposition: {
      children: args.childAttemptIds,
    },
    provenance: {
      declared_by: agentParty,
      declared_at: attempt.timestamp,
      motivated_by: [],
      source: sourceId,
    },
    knowledge_refs: [],
    tags,
    state_ref: stateId,
    extension: {
      kind: 'coral-attempt',
      worktree_anchor: worktreeAnchor,
      score: attempt.score,
      artifact_uri: `file://results/${runRel}/agents/${attempt.agent_id}/solution.py`,
      parent_attempts: args.parentAttemptId ? [args.parentAttemptId] : [],
      evaluator_log_uri: `file://results/${runRel}/.coral/public/eval_logs/${attempt.commit_hash}.log`,
    },
  }
  // Suppress 'taskName' unused — kept in case future synthesizers need it.
  void taskName

  const state: IntentState = {
    id: stateId,
    intent_id: attemptId,
    schema_version: SCHEMA_VERSION,
    status: mapAttemptStatus(attempt.status),
    last_advanced_at: attempt.timestamp,
    last_advanced_by: agentParty,
    history: [],
    external_anchors: [
      {
        kind: 'coral-shared-dir',
        uri: `file://results/${runRel}/.coral/public/attempts/${attempt.commit_hash}.json`,
        read_only: true,
      },
    ],
  }

  return { intent, state }
}

// ─── ID + timestamp helpers ────────────────────────────────────────────────

function makeCampaignId(sourceId: string, taskName: string, timestamp: string): string {
  return `coral:${slugSourceId(sourceId)}:${taskName}:${timestamp}`
}

function makeAttemptId(campaignId: string, commitHash: string): string {
  // Lowercase to normalize: real Coral commit hashes are lowercase hex,
  // but defensive lowercasing protects against transports that hand over
  // uppercase hex (e.g., test fixtures, external mirrors).
  return `${campaignId}:attempt:${commitHash.slice(0, 8).toLowerCase()}`
}

function slugSourceId(sourceId: string): string {
  return sourceId.replace(/[^a-zA-Z0-9-]/g, '-').replace(/--+/g, '-')
}

function extractTaskFromRunId(runId: string): string | null {
  const idx = runId.indexOf('/')
  return idx > 0 ? runId.slice(0, idx) : null
}

function extractTimestampFromRunId(runId: string): string {
  const idx = runId.indexOf('/')
  return idx >= 0 ? runId.slice(idx + 1) : runId
}

/** Coral writes timestamps as `YYYY-MM-DD_HHMMSS` directory names. We
 *  parse this into RFC3339 (UTC, no offset implied — the directory name
 *  carries no timezone info; we conventionally treat it as UTC). Returns
 *  null if the format doesn't match. */
function parseTimestampLabel(label: string): string | null {
  const m = label.match(/^(\d{4})-(\d{2})-(\d{2})_(\d{2})(\d{2})(\d{2})$/)
  if (!m) return null
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`
}

function synthTimestamp(): string {
  return new Date().toISOString().replace(/\.\d+Z$/, 'Z')
}

function mapAttemptStatus(status: string): Status {
  // v0.1 sees only 'improved'. G-C-6 records that the full Coral status
  // enum is unknown; default to 'active' so unknown-but-existing attempts
  // remain visible in the chrome.
  if (status === 'improved') return 'satisfied'
  return 'active'
}

function sanitizePopulationSize(n: unknown): number {
  if (typeof n === 'number' && Number.isInteger(n) && n > 0) return n
  return 1
}

function clampTitle(s: string): string {
  if (s.length <= 80) return s
  return s.slice(0, 77) + '…'
}

function clampString(s: string, max: number): string {
  if (s.length <= max) return s
  return s.slice(0, max - 1) + '…'
}
