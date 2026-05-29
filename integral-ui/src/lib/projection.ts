/**
 * Projection engine — kind-pluggable, indexed by `(intent.kind, zoom)`.
 *
 * The new pipeline (v0.3.x) replaces "LLM summarises text" with:
 *
 *   1. The plugin's `evidence(ctx)` produces TypedEvidence
 *      (datasets + excerpts + fingerprint). Deterministic; LLM never
 *      involved.
 *   2. `composeProjectionSpec` asks the LLM to author a `ProjectionSpec`
 *      (figures + scalars + prose template) given dataset *schemas* and
 *      sample rows. The LLM never sees raw bulk numerics.
 *   3. `executeSpec` runs the spec deterministically against TypedEvidence,
 *      computing every numeric. The LLM is the analyst; the executor is
 *      the calculator.
 *   4. `lintProse` enforces zero-hallucination — every digit in rendered
 *      prose must come from a quoted_numeric.
 *
 * Discipline:
 *  - Engine is pure: takes plugins + LLMClient as injected deps. No
 *    network, no env reads, no API key handling here. Server-side wiring
 *    (Vite plugin) constructs the LLMClient and passes it in.
 *  - **Tests NEVER call real LLMs.** All projection tests inject a mock
 *    `LLMClient` that returns canned strings. The real Anthropic / OpenAI
 *    clients live in `vite-plugin-nous-adapter/` (outside `src/`) so they
 *    are unreachable from the test runner by construction.
 *  - Fallback is the safety net. Missing plugin OR plugin throw OR composer
 *    failure OR executor failure OR lint rejection → fall back to a
 *    deterministic raw-fields projection. The chrome should never see
 *    undefined.
 */

import type { Intent, IntentKind, IntentState, Workspace, ZoomLevel } from '../schema'
import { composeProjectionSpec } from './projection/composer'
import { executeSpec, SpecExecutionError } from './projection/executor'
import { lintProse } from './projection/lint'
import { TemplateError } from './projection/template'
import {
  SPEC_VERSION,
  type ExecutedProjection,
  type TypedEvidence,
} from './projection/spec'

// ─── Public types ─────────────────────────────────────────────────────────

export interface LLMClient {
  /** Generate text from a prompt. Implementations may be Anthropic, OpenAI,
   *  a local model, or a mock. The engine is provider-agnostic. */
  generate(prompt: string): Promise<string>
}

export interface ProjectionContext {
  intent: Intent
  state: IntentState
  workspace: Workspace
  zoom: ZoomLevel
  llm: LLMClient
}

export interface KindProjectionPlugin {
  kind: IntentKind
  /** Build TypedEvidence for this kind+zoom. May do disk I/O when running
   *  server-side. Should be deterministic on identical inputs. */
  evidence(ctx: ProjectionContext): Promise<TypedEvidence>
  /** Free-form per-call narrative context the LLM should attend to. */
  intentSummary(ctx: ProjectionContext): string
}

export type PluginRegistry = Partial<Record<IntentKind, KindProjectionPlugin>>

// ─── Public API ────────────────────────────────────────────────────────────

export interface GenerateProjectionArgs {
  intent: Intent
  state: IntentState
  workspace: Workspace
  zoom: ZoomLevel
  plugins: PluginRegistry
  llm: LLMClient
  /** Optional model name to record on the ExecutedProjection. */
  model?: string
}

export async function generateProjection(
  args: GenerateProjectionArgs
): Promise<ExecutedProjection> {
  const { intent, state, workspace, zoom, plugins, llm, model } = args

  // Overview always falls back — TreeCard is the structural surface.
  if (zoom === 'overview') {
    return fallbackProjection({ intent, state, workspace, zoom })
  }

  const plugin = plugins[intent.kind]
  if (!plugin) {
    return fallbackProjection({ intent, state, workspace, zoom })
  }

  const ctx: ProjectionContext = { intent, state, workspace, zoom, llm }

  // ── Step 1: build evidence ───────────────────────────────────────────
  let evidence: TypedEvidence
  try {
    evidence = await plugin.evidence(ctx)
  } catch (err) {
    const reason = `evidence: ${errMessage(err)}`
    logFallback(intent.id, zoom, 'evidence', err)
    return fallbackProjection({ intent, state, workspace, zoom, reason })
  }

  // ── Step 2: compose spec via LLM ─────────────────────────────────────
  let spec
  try {
    spec = await composeProjectionSpec({
      evidence,
      zoom: zoom === 'detail' ? 'detail' : 'structure',
      kind: intent.kind,
      llm,
      intent_summary: plugin.intentSummary(ctx),
    })
  } catch (err) {
    const reason = `composer: ${errMessage(err)}`
    logFallback(intent.id, zoom, 'composer', err)
    return fallbackProjection({ intent, state, workspace, zoom, evidence, reason })
  }

  // ── Step 3: execute deterministically ────────────────────────────────
  let executed: ExecutedProjection
  try {
    executed = executeSpec(spec, evidence, {
      source: 'llm',
      ...(model ? { model } : {}),
    })
  } catch (err) {
    if (err instanceof SpecExecutionError || err instanceof TemplateError) {
      const reason = `executor: ${errMessage(err)}`
      logFallback(intent.id, zoom, 'executor', err)
      return fallbackProjection({ intent, state, workspace, zoom, evidence, reason })
    }
    const reason = `executor: ${errMessage(err)}`
    logFallback(intent.id, zoom, 'executor (unknown)', err)
    return fallbackProjection({ intent, state, workspace, zoom, evidence, reason })
  }

  // ── Step 4: lint prose ───────────────────────────────────────────────
  // Build the allowed-digit pool from substituted-excerpt texts as well
  // as quoted_numerics. Excerpts substituted via `{excerpt:id}` carry
  // their digits with provenance via the excerpt's source_ref.
  const substitutedExcerpts = collectSubstitutedExcerpts(spec.prose_template, evidence)
  const lint = lintProse(executed.prose, executed.quoted_numerics, { substitutedExcerpts })
  if (!lint.ok) {
    const offenderList = lint.offenders.slice(0, 8).join(', ') +
      (lint.offenders.length > 8 ? `, +${lint.offenders.length - 8} more` : '')
    const reason = `lint: unsourced digits in prose (${offenderList})`
    logFallback(intent.id, zoom, 'lint', `unsourced digits: ${offenderList}`)
    return fallbackProjection({ intent, state, workspace, zoom, evidence, reason })
  }

  return executed
}

function errMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}

const PLACEHOLDER_RE = /\{excerpt:([A-Za-z0-9_.\-:]+)\}/g

function collectSubstitutedExcerpts(
  proseTemplate: string,
  evidence: TypedEvidence
): string[] {
  const ids = new Set<string>()
  for (const m of proseTemplate.matchAll(PLACEHOLDER_RE)) {
    if (m[1]) ids.add(m[1])
  }
  if (ids.size === 0) return []
  const out: string[] = []
  for (const e of evidence.excerpts) {
    if (ids.has(e.id)) out.push(e.text)
  }
  return out
}

function logFallback(
  intentId: string,
  zoom: string,
  reason: string,
  detail: unknown
): void {
  const message = detail instanceof Error
    ? detail.message
    : typeof detail === 'string'
      ? detail
      : String(detail)
  // eslint-disable-next-line no-console
  console.warn(
    `[integral] projection fallback for ${intentId} @ ${zoom} — ${reason}: ${message}`
  )
}

// ─── Fallback (deterministic, no LLM) ─────────────────────────────────────

export interface FallbackProjectionArgs {
  intent: Intent
  state: IntentState
  workspace: Workspace
  zoom: ZoomLevel
  /** When the failure happened *after* evidence was built, surface its
   *  fingerprint so the chrome / cache can still reflect "we saw these
   *  files." */
  evidence?: TypedEvidence
  /** Human-readable reason for the fallback (composer/executor/lint
   *  failure). Surfaced in the chrome as a dev hint. */
  reason?: string
}

/**
 * Raw-field render — what the chrome shows when:
 *  - the plugin is missing for this kind
 *  - evidence-building threw
 *  - the LLM is unavailable / failed validation twice
 *  - the executor or lint rejected the LLM's output
 *
 * The fallback never calls the LLM; it's the safety net. Output uses the
 * `ExecutedProjection` shape (no figures, prose drawn from declaration
 * fields) so consumers don't branch on success/failure.
 */
export function fallbackProjection(args: FallbackProjectionArgs): ExecutedProjection {
  const { intent, evidence, reason } = args
  const summary = intent.declaration.summary?.trim() ?? ''
  const prose = summary.length > 0
    ? `${intent.declaration.title} — ${summary}`
    : intent.declaration.title
  return {
    spec_version: SPEC_VERSION,
    figures: [],
    quoted_numerics: {},
    prose,
    cite_index: [],
    source: 'fallback',
    generated_at: new Date().toISOString(),
    ...(evidence?.fingerprint ? { evidence_fingerprint: evidence.fingerprint } : {}),
    ...(reason ? { fallback_reason: reason } : {}),
  }
}
