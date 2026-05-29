/**
 * Nous parser pack — pure (no I/O), takes `CampaignFiles` strings + the
 * resolved `Intent`/`IntentState`/`Workspace` and produces TypedEvidence.
 *
 * Two flavours:
 *   parseNousCampaign — for nous-campaign intents (whole-campaign view)
 *   parseNousIteration — for nous-iteration intents (single-iteration view)
 *
 * The runtime artifacts are read by the calling code via
 * `FilesystemNousSource.fetchCampaignFiles()`, which the projection
 * handler already constructs. This file just deserializes the strings
 * and shapes them into TypedDatasets.
 *
 * Datasets emitted (when corresponding artifact present):
 *   `iterations`  — one row per iteration: iter, family, h_main_result,
 *                   robustness_result, n_principles_inserted, accuracy_pct,
 *                   timestamp
 *   `principles`  — one row per principle in principles.json: id,
 *                   confidence, regime, extraction_iteration,
 *                   n_evidence, n_contradicts
 *   `siblings`    — for nous-iteration only: peer iterations of the
 *                   same parent campaign with their h_main_result
 *
 * Excerpts:
 *   `rq` — research_question (from intent.extension or campaign yaml)
 *   `h_main:statement` / `h_main:prediction` / `h_main:result` — for
 *      nous-iteration only
 *   `principle:<id>:statement` / `:mechanism` for the top principles
 */

import * as crypto from 'node:crypto'
import type { Intent, IntentState, Workspace } from '../../src/schema'
import type {
  Excerpt,
  SourceCitation,
  TypedDataset,
  TypedEvidence,
  TypedRow,
} from '../../src/lib/projection/spec'

export interface NousCampaignFilesStrings {
  ledger: string | null
  principles: string | null
  state: string | null
  workDir?: string | undefined
}

export interface NousParseInputs {
  intent: Intent
  state: IntentState
  workspace: Workspace
  files: NousCampaignFilesStrings
}

// ─── Public entry points ─────────────────────────────────────────────────

export function parseNousCampaign(inputs: NousParseInputs): TypedEvidence {
  const datasets: TypedDataset[] = []
  const excerpts: Excerpt[] = []
  const filesSeen: SourceCitation[] = []

  const ledgerDs = parseLedger(inputs.files.ledger, inputs.workspace, inputs.intent)
  if (ledgerDs) {
    datasets.push(ledgerDs)
    filesSeen.push({ file: 'ledger.json' })
  }

  const principlesParsed = parsePrinciples(inputs.files.principles)
  if (principlesParsed.dataset) {
    datasets.push(principlesParsed.dataset)
    filesSeen.push({ file: 'principles.json' })
  }
  excerpts.push(...principlesParsed.excerpts)

  const rq = researchQuestionExcerpt(inputs.intent)
  if (rq) excerpts.push(rq)

  return {
    datasets,
    excerpts,
    files_seen: filesSeen,
    fingerprint: fingerprintFiles(inputs.files),
  }
}

export function parseNousIteration(inputs: NousParseInputs): TypedEvidence {
  const datasets: TypedDataset[] = []
  const excerpts: Excerpt[] = []
  const filesSeen: SourceCitation[] = []

  const parent = findParentCampaign(inputs.workspace, inputs.intent.id)
  const ledgerDs = parseLedger(inputs.files.ledger, inputs.workspace, parent ?? inputs.intent)
  if (ledgerDs) {
    datasets.push(ledgerDs)
    filesSeen.push({ file: 'ledger.json' })
  }

  // Sibling iterations as a typed dataset — each row is a peer iteration
  // with its h_main_result. Useful for "where this iteration sits in the
  // arc" figures.
  const siblingsDs = siblingsDataset(inputs.workspace, inputs.intent.id, parent)
  if (siblingsDs) datasets.push(siblingsDs)

  const principlesParsed = parsePrinciples(inputs.files.principles)
  if (principlesParsed.dataset) {
    datasets.push(principlesParsed.dataset)
    filesSeen.push({ file: 'principles.json' })
  }
  excerpts.push(...principlesParsed.excerpts)

  // Research question (from parent if available).
  const rqIntent = parent ?? inputs.intent
  const rq = researchQuestionExcerpt(rqIntent)
  if (rq) excerpts.push(rq)

  // h_main statement / prediction / result from extension.
  const ext = inputs.intent.extension
  if (ext.kind === 'nous-iteration') {
    const h = ext.hypothesis_bundle.h_main
    excerpts.push({
      id: 'h_main:statement',
      text: h.statement,
      kind: 'paragraph',
      source_ref: { file: 'campaign.yaml' },
    })
    excerpts.push({
      id: 'h_main:prediction',
      text: h.prediction,
      kind: 'paragraph',
      source_ref: { file: 'campaign.yaml' },
    })
    if (h.result) {
      excerpts.push({
        id: 'h_main:result',
        text: h.result,
        kind: 'paragraph',
        source_ref: { file: 'ledger.json' },
      })
    }
  }

  return {
    datasets,
    excerpts,
    files_seen: filesSeen,
    fingerprint: fingerprintFiles(inputs.files),
  }
}

// ─── Ledger parsing ──────────────────────────────────────────────────────

interface LedgerIterationRaw {
  iteration?: number
  family?: string | null
  timestamp?: string
  candidate_id?: string
  h_main_result?: string | null
  robustness_result?: string | null
  control_result?: string | null
  prediction_accuracy?:
    | { accuracy_pct?: number; arms_correct?: number; arms_total?: number }
    | null
  principles_extracted?: Array<{ id?: string; action?: string }>
}

function parseLedger(
  raw: string | null,
  workspace: Workspace,
  parent: Intent | undefined
): TypedDataset | null {
  if (!raw) {
    return ledgerFromWorkspace(workspace, parent)
  }
  let parsed: { iterations?: LedgerIterationRaw[] }
  try {
    parsed = JSON.parse(raw)
  } catch {
    return ledgerFromWorkspace(workspace, parent)
  }
  const iters = parsed.iterations ?? []
  if (!Array.isArray(iters) || iters.length === 0) {
    return ledgerFromWorkspace(workspace, parent)
  }

  const rows: TypedRow[] = iters.map((it) => {
    const acc = it.prediction_accuracy ?? null
    const principles = Array.isArray(it.principles_extracted) ? it.principles_extracted : []
    return {
      iter: typeof it.iteration === 'number' ? it.iteration : null,
      family: it.family ?? null,
      timestamp: it.timestamp ?? null,
      candidate_id: it.candidate_id ?? null,
      h_main_result: it.h_main_result ?? null,
      robustness_result: it.robustness_result ?? null,
      control_result: typeof it.control_result === 'string' ? it.control_result : null,
      arms_correct: typeof acc?.arms_correct === 'number' ? acc.arms_correct : null,
      arms_total: typeof acc?.arms_total === 'number' ? acc.arms_total : null,
      accuracy_pct: typeof acc?.accuracy_pct === 'number' ? acc.accuracy_pct : null,
      n_principles_inserted: principles.filter((p) => p.action === 'INSERT').length,
      n_principles_modified: principles.filter((p) => p.action === 'MODIFY').length,
      n_principles_deleted: principles.filter((p) => p.action === 'DELETE').length,
    }
  })

  return {
    name: 'iterations',
    schema: {
      columns: [
        { name: 'iter', type: 'number' },
        { name: 'family', type: 'string' },
        { name: 'timestamp', type: 'string' },
        { name: 'candidate_id', type: 'string' },
        { name: 'h_main_result', type: 'string' },
        { name: 'robustness_result', type: 'string' },
        { name: 'control_result', type: 'string' },
        { name: 'arms_correct', type: 'number' },
        { name: 'arms_total', type: 'number' },
        { name: 'accuracy_pct', type: 'number' },
        { name: 'n_principles_inserted', type: 'number' },
        { name: 'n_principles_modified', type: 'number' },
        { name: 'n_principles_deleted', type: 'number' },
      ],
    },
    rows,
    source_ref: { file: 'ledger.json', json_path: '$.iterations[*]' },
  }
}

/**
 * Fallback when ledger.json isn't available — derive an `iterations`
 * dataset from the workspace's nous-iteration intents under `parent`.
 * Less rich (no accuracy_pct, no principles_extracted counts) but the
 * shape is the same so figures still work.
 */
function ledgerFromWorkspace(
  workspace: Workspace,
  parent: Intent | undefined
): TypedDataset | null {
  if (!parent) return null
  const childIds = new Set(parent.decomposition.children)
  const rows: TypedRow[] = []
  for (const i of workspace.intents) {
    if (!childIds.has(i.id)) continue
    if (i.kind !== 'nous-iteration') continue
    if (i.extension.kind !== 'nous-iteration') continue
    const ext = i.extension
    const state = workspace.states.find((s) => s.intent_id === i.id)
    rows.push({
      iter: ext.iteration_number,
      family: i.tags?.[0] ?? null,
      timestamp: state?.last_advanced_at ?? null,
      candidate_id: null,
      h_main_result: ext.hypothesis_bundle.h_main.result ?? null,
      robustness_result: null,
      control_result: null,
      arms_correct: null,
      arms_total: null,
      accuracy_pct: null,
      n_principles_inserted: ext.principles_emitted?.length ?? 0,
      n_principles_modified: 0,
      n_principles_deleted: 0,
    })
  }
  if (rows.length === 0) return null
  return {
    name: 'iterations',
    schema: {
      columns: [
        { name: 'iter', type: 'number' },
        { name: 'family', type: 'string' },
        { name: 'timestamp', type: 'string' },
        { name: 'candidate_id', type: 'string' },
        { name: 'h_main_result', type: 'string' },
        { name: 'robustness_result', type: 'string' },
        { name: 'control_result', type: 'string' },
        { name: 'arms_correct', type: 'number' },
        { name: 'arms_total', type: 'number' },
        { name: 'accuracy_pct', type: 'number' },
        { name: 'n_principles_inserted', type: 'number' },
        { name: 'n_principles_modified', type: 'number' },
        { name: 'n_principles_deleted', type: 'number' },
      ],
    },
    rows,
    source_ref: { file: '<workspace>' },
  }
}

// ─── Principles parsing ──────────────────────────────────────────────────

interface PrincipleRaw {
  id?: string
  statement?: string
  confidence?: string
  regime?: string
  evidence?: unknown[]
  contradicts?: unknown[]
  extraction_iteration?: number
  mechanism?: string
}

function parsePrinciples(raw: string | null): {
  dataset: TypedDataset | null
  excerpts: Excerpt[]
} {
  if (!raw) return { dataset: null, excerpts: [] }
  let parsed: { principles?: PrincipleRaw[] }
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { dataset: null, excerpts: [] }
  }
  const list = Array.isArray(parsed.principles) ? parsed.principles : []
  if (list.length === 0) return { dataset: null, excerpts: [] }

  const rows: TypedRow[] = list.map((p, idx) => ({
    id: p.id ?? `RP-${idx + 1}`,
    confidence: p.confidence ?? null,
    regime: p.regime ?? null,
    extraction_iteration: typeof p.extraction_iteration === 'number' ? p.extraction_iteration : null,
    n_evidence: Array.isArray(p.evidence) ? p.evidence.length : 0,
    n_contradicts: Array.isArray(p.contradicts) ? p.contradicts.length : 0,
  }))

  // Surface the first few principles' statements as excerpts so the LLM
  // can quote them verbatim. Cap to keep the prompt tight.
  const PRINCIPLE_EXCERPT_CAP = 5
  const excerpts: Excerpt[] = []
  for (const p of list.slice(0, PRINCIPLE_EXCERPT_CAP)) {
    if (typeof p.id !== 'string') continue
    if (typeof p.statement === 'string' && p.statement.length > 0) {
      excerpts.push({
        id: `principle:${p.id}:statement`,
        text: p.statement,
        kind: 'paragraph',
        source_ref: { file: 'principles.json', json_path: `$.principles[?(@.id=='${p.id}')].statement` },
      })
    }
    if (typeof p.mechanism === 'string' && p.mechanism.length > 0) {
      excerpts.push({
        id: `principle:${p.id}:mechanism`,
        text: p.mechanism,
        kind: 'paragraph',
        source_ref: { file: 'principles.json', json_path: `$.principles[?(@.id=='${p.id}')].mechanism` },
      })
    }
  }

  return {
    dataset: {
      name: 'principles',
      schema: {
        columns: [
          { name: 'id', type: 'string' },
          { name: 'confidence', type: 'string' },
          { name: 'regime', type: 'string' },
          { name: 'extraction_iteration', type: 'number' },
          { name: 'n_evidence', type: 'number' },
          { name: 'n_contradicts', type: 'number' },
        ],
      },
      rows,
      source_ref: { file: 'principles.json', json_path: '$.principles[*]' },
    },
    excerpts,
  }
}

// ─── Sibling iterations dataset ──────────────────────────────────────────

function siblingsDataset(
  workspace: Workspace,
  selfId: string,
  parent: Intent | undefined
): TypedDataset | null {
  if (!parent) return null
  const childIds = new Set(parent.decomposition.children)
  const rows: TypedRow[] = []
  for (const i of workspace.intents) {
    if (!childIds.has(i.id) || i.id === selfId) continue
    if (i.kind !== 'nous-iteration' || i.extension.kind !== 'nous-iteration') continue
    rows.push({
      iter: i.extension.iteration_number,
      family: i.tags?.[0] ?? null,
      h_main_result: i.extension.hypothesis_bundle.h_main.result ?? null,
    })
  }
  if (rows.length === 0) return null
  return {
    name: 'siblings',
    schema: {
      columns: [
        { name: 'iter', type: 'number' },
        { name: 'family', type: 'string' },
        { name: 'h_main_result', type: 'string' },
      ],
    },
    rows,
    source_ref: { file: '<workspace>' },
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function findParentCampaign(workspace: Workspace, iterationId: string): Intent | undefined {
  return workspace.intents.find(
    (i) => i.kind === 'nous-campaign' && i.decomposition.children.includes(iterationId)
  )
}

function researchQuestionExcerpt(intent: Intent): Excerpt | null {
  if (intent.extension.kind !== 'nous-campaign') return null
  const rq = intent.extension.research_question
  if (!rq) return null
  return {
    id: 'rq',
    text: rq,
    kind: 'paragraph',
    source_ref: { file: 'campaign.yaml', json_path: '$.research_question' },
  }
}

function fingerprintFiles(files: NousCampaignFilesStrings): string {
  const h = crypto.createHash('sha256')
  h.update('ledger:' + (files.ledger ?? '') + '\n')
  h.update('principles:' + (files.principles ?? '') + '\n')
  h.update('state:' + (files.state ?? '') + '\n')
  return h.digest('hex')
}
