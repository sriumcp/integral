/**
 * Nous adapter — principles.json parsing + KnowledgeRef synthesis (Phase 3).
 *
 * Reads `.nous/<run>/principles.json` and produces typed `KnowledgeRef[]`
 * to attach to:
 *  - the parent campaign intent (one campaign-scoped ref per principle)
 *  - each iteration intent (one iteration-scoped ref per principle whose
 *    `extraction_iteration` matches)
 *
 * Pure functions only — no filesystem touching, no network. Tests live in
 * `__tests__/principles.test.ts`.
 *
 * Lossy mapping per gaps.md G-N-2: the rich structure (confidence/regime/
 * mechanism/applicability_bounds/evidence/contradicts/superseded_by/
 * category/status) is dropped. The KnowledgeRef carries only uri/role/
 * scope/version. Promoting principles to first-class typed objects
 * (possibly even first-class intents) is a v0.2 concern.
 *
 * The `version: 'v0.1-lossy'` marker on every emitted ref doubles as a
 * machine-readable signal that the lossy mapping was applied. v0.2
 * adapters can emit a different version string when the schema gains
 * the structure to carry full principles.
 */

import type { KnowledgeRef } from '../../schema'

// ─── External shape (from principles.json) ─────────────────────────────────

export interface PrincipleEntry {
  id: string
  extraction_iteration: number
  /** Free-form status: 'active' | 'superseded' | 'retracted' | etc.
   *  v0.1 doesn't act on it; future principle-ledger renderers may. */
  status?: string
}

const LOSSY_VERSION = 'v0.1-lossy'

// ─── parsePrinciples ───────────────────────────────────────────────────────

/**
 * Parse a principles.json string into typed `PrincipleEntry[]`. Tolerates
 * malformed input by returning `[]`. Drops entries lacking required fields
 * (`id` string + `extraction_iteration` number) without crashing.
 */
export function parsePrinciples(jsonText: string): PrincipleEntry[] {
  let raw: unknown
  try {
    raw = JSON.parse(jsonText)
  } catch {
    return []
  }
  if (!raw || typeof raw !== 'object') return []
  const principles = (raw as { principles?: unknown }).principles
  if (!Array.isArray(principles)) return []

  const out: PrincipleEntry[] = []
  for (const item of principles) {
    if (!item || typeof item !== 'object') continue
    const obj = item as Record<string, unknown>
    if (typeof obj.id !== 'string') continue
    if (typeof obj.extraction_iteration !== 'number') continue

    const entry: PrincipleEntry = {
      id: obj.id,
      extraction_iteration: obj.extraction_iteration,
    }
    if (typeof obj.status === 'string') entry.status = obj.status
    out.push(entry)
  }
  return out
}

// ─── principleUri ──────────────────────────────────────────────────────────

/**
 * Stable URI for a Nous principle. Used as the `uri` on emitted
 * KnowledgeRefs so the same principle resolves to the same ref across
 * adapter runs. Scheme `nous-principle://` is adapter-namespaced; the
 * runId + id pair scopes the URI to its source campaign.
 */
export function principleUri(runId: string, principleId: string): string {
  return `nous-principle://${runId}/${principleId}`
}

// ─── interpretPrinciplesAsKnowledgeRefs ────────────────────────────────────

export interface PrincipleRefBundle {
  /** All principles, scope='campaign'. Attached to the parent campaign intent. */
  campaignRefs: KnowledgeRef[]
  /** Principles grouped by extraction_iteration, scope='iteration'.
   *  Caller looks up each iteration's iteration_number to find its refs. */
  iterationRefsByIter: Map<number, KnowledgeRef[]>
}

/**
 * Splits a principles list into:
 *  - campaign-scoped refs (one per principle, attached to parent campaign)
 *  - iteration-scoped refs grouped by extraction_iteration
 *
 * Each ref carries `version: 'v0.1-lossy'` to mark that the rich structure
 * was dropped. v0.2 will replace this with full typed `Principle` objects
 * (see gaps.md G-N-2).
 */
export function interpretPrinciplesAsKnowledgeRefs(
  entries: PrincipleEntry[],
  runId: string
): PrincipleRefBundle {
  const campaignRefs: KnowledgeRef[] = []
  const iterationRefsByIter = new Map<number, KnowledgeRef[]>()

  for (const entry of entries) {
    const uri = principleUri(runId, entry.id)
    campaignRefs.push({
      scope: 'campaign',
      role: 'principles',
      uri,
      version: LOSSY_VERSION,
    })
    const iterRef: KnowledgeRef = {
      scope: 'iteration',
      role: 'principles',
      uri,
      version: LOSSY_VERSION,
    }
    const existing = iterationRefsByIter.get(entry.extraction_iteration)
    if (existing) {
      existing.push(iterRef)
    } else {
      iterationRefsByIter.set(entry.extraction_iteration, [iterRef])
    }
  }

  return { campaignRefs, iterationRefsByIter }
}
