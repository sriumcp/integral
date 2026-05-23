/**
 * Nous adapter — ledger.json parsing + iteration interpretation (Phase 2).
 *
 * Reads `.nous/<run>/ledger.json` and produces typed `nous-iteration`
 * Intents + IntentStates, wired into a parent campaign's
 * `decomposition.children` by `interpreter.ts`.
 *
 * Pure functions only — no filesystem touching, no network. Tests live in
 * `__tests__/ledger.test.ts`.
 *
 * Lossy mappings tracked in `gaps.md`:
 *  - `PARTIALLY_CONFIRMED` → `inconclusive` (G-N-1; no schema option for it).
 *  - `principles_extracted: [{id, action}]` → `Reference[]` with kind=observation
 *    and target=id (G-N-2; principles graph deferred to v0.2).
 *  - `family` → `tags: [family]` (G-N-3; no schema slot for iteration family).
 *  - `ablation_results` / `control_result` / `robustness_result` /
 *    `prediction_accuracy` / `candidate_id` / `frontier_update` are
 *    discarded in v0.1 (no schema home). Documented as G-N-9.
 */

import type {
  HypothesisResult,
  Intent,
  IntentState,
  Reference,
  Status,
} from '../../schema'

// ─── External shape (from ledger.json) ─────────────────────────────────────

export interface LedgerPrincipleRef {
  id: string
  action: string
}

export interface LedgerEntry {
  iteration: number
  family: string
  timestamp: string
  candidate_id?: string
  h_main_result?: string | null
  control_result?: string | null
  robustness_result?: string | null
  ablation_results?: Record<string, string>
  prediction_accuracy?: {
    arms_correct?: number
    arms_total?: number
    accuracy_pct?: number
  } | null
  principles_extracted?: LedgerPrincipleRef[]
  frontier_update?: unknown
}

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

// ─── parseLedger ───────────────────────────────────────────────────────────

/**
 * Parse a ledger.json string into typed `LedgerEntry[]`. Tolerates malformed
 * input by returning `[]` — never throws.
 *
 * Discipline: if the input parses but has the wrong shape (no `iterations`
 * array, non-object entries, etc.), drop the bad parts and keep going. The
 * adapter's job is to surface what the harness produced, not validate it.
 */
export function parseLedger(jsonText: string): LedgerEntry[] {
  let raw: unknown
  try {
    raw = JSON.parse(jsonText)
  } catch {
    return []
  }
  if (!raw || typeof raw !== 'object') return []
  const iterations = (raw as { iterations?: unknown }).iterations
  if (!Array.isArray(iterations)) return []

  const out: LedgerEntry[] = []
  for (const item of iterations) {
    if (!item || typeof item !== 'object') continue
    const obj = item as Record<string, unknown>
    if (typeof obj.iteration !== 'number' || typeof obj.family !== 'string') {
      continue
    }
    const entry: LedgerEntry = {
      iteration: obj.iteration,
      family: obj.family,
      timestamp:
        typeof obj.timestamp === 'string'
          ? obj.timestamp
          : '1970-01-01T00:00:00Z',
    }
    if (typeof obj.candidate_id === 'string') entry.candidate_id = obj.candidate_id
    if (typeof obj.h_main_result === 'string' || obj.h_main_result === null) {
      entry.h_main_result = obj.h_main_result as string | null
    }
    if (typeof obj.control_result === 'string' || obj.control_result === null) {
      entry.control_result = obj.control_result as string | null
    }
    if (
      typeof obj.robustness_result === 'string' ||
      obj.robustness_result === null
    ) {
      entry.robustness_result = obj.robustness_result as string | null
    }
    if (Array.isArray(obj.principles_extracted)) {
      entry.principles_extracted = obj.principles_extracted
        .filter(
          (p): p is LedgerPrincipleRef =>
            typeof p === 'object' &&
            p !== null &&
            typeof (p as { id?: unknown }).id === 'string' &&
            typeof (p as { action?: unknown }).action === 'string'
        )
        .map((p) => ({ id: p.id, action: p.action }))
    }
    out.push(entry)
  }
  return out
}

// ─── h_main_result → HypothesisResult ──────────────────────────────────────

/**
 * Lossy: `PARTIALLY_CONFIRMED` collapses to `inconclusive` per gaps.md G-N-1.
 * Unknown / empty strings → `pending` (treats as in-flight rather than
 * fabricating an outcome).
 */
export function mapHmainResultToHypothesisResult(
  hmain: string | null | undefined
): HypothesisResult {
  if (hmain === null || hmain === undefined) return 'pending'
  const norm = hmain.toUpperCase()
  if (norm === 'CONFIRMED') return 'confirmed'
  if (norm === 'REFUTED') return 'refuted'
  if (norm === 'INCONCLUSIVE') return 'inconclusive'
  if (norm === 'PARTIALLY_CONFIRMED') return 'inconclusive'
  return 'pending'
}

// ─── interpretIteration ────────────────────────────────────────────────────

export interface InterpretIterationArgs {
  runId: string
  parentIntentId: string
  entry: LedgerEntry
  sourceId: string
}

/**
 * Map a single ledger entry → typed Intent + IntentState for a
 * `nous-iteration`. The intent id is stable across runs (parent-scoped via
 * the candidate_id, falling back to `iter-N`) so that
 * `parent.decomposition.children` references survive ledger refreshes.
 */
export function interpretIteration({
  runId: _runId,
  parentIntentId,
  entry,
  sourceId: _sourceId,
}: InterpretIterationArgs): { intent: Intent; state: IntentState } {
  const candidateId = entry.candidate_id ?? `iter-${entry.iteration}`
  const intentId = `${parentIntentId}:${candidateId}`
  const stateId = `${intentId}-STATE`

  const result = mapHmainResultToHypothesisResult(entry.h_main_result)
  const status: Status = result === 'pending' ? 'active' : 'satisfied'

  const principles: Reference[] | undefined =
    entry.principles_extracted && entry.principles_extracted.length > 0
      ? entry.principles_extracted.map((p) => ({
          kind: 'observation' as const,
          target: p.id,
          note: `action=${p.action}`,
        }))
      : undefined

  const title = clampTitle(`${candidateId} · ${entry.family}`)

  const intent: Intent = {
    id: intentId,
    schema_version: SCHEMA_VERSION,
    kind: 'nous-iteration',
    declaration: {
      title,
      summary: `iteration ${entry.iteration} of family ${entry.family}`,
      success_criterion: '',
    },
    holder: {
      mode: 'jointly-held',
      parties: [DEFAULT_HUMAN_HOLDER, PROJECTOR_AGENT],
    },
    lifetime: {
      kind: 'discrete',
      started_at: entry.timestamp,
    },
    decomposition: { children: [] },
    provenance: {
      declared_by: PROJECTOR_AGENT,
      declared_at: entry.timestamp,
      motivated_by: [],
      source: 'nous',
    },
    knowledge_refs: [],
    tags: [entry.family],
    state_ref: stateId,
    extension: {
      kind: 'nous-iteration',
      iteration_number: entry.iteration,
      hypothesis_bundle: {
        h_main: {
          statement: `Family ${entry.family} addresses the campaign's research question.`,
          prediction: `Iteration ${entry.iteration} (${candidateId}) yields a measurable signal on h_main.`,
          conditions: [],
          ...(result !== 'pending' ? { result } : {}),
        },
        h_ablation: [],
      },
      ...(principles ? { principles_emitted: principles } : {}),
    },
  }

  const state: IntentState = {
    id: stateId,
    intent_id: intentId,
    schema_version: SCHEMA_VERSION,
    status,
    last_advanced_at: entry.timestamp,
    last_advanced_by: PROJECTOR_AGENT,
    history: [],
    external_anchors: [],
  }

  return { intent, state }
}

function clampTitle(s: string): string {
  if (s.length <= 80) return s
  return s.slice(0, 77) + '…'
}
