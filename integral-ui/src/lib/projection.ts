/**
 * Projection engine — kind-pluggable, indexed by `(intent.kind, zoom)`.
 *
 * The two axes ask different questions:
 *  - **Kind** dictates *what to talk about* — different prompt templates.
 *  - **Zoom** dictates *how much, and what context* — different prompt
 *    templates AND different context bundles passed to the LLM.
 *
 * v0.1 commits to 4 LLM-driven cells (nous-campaign × {structure, detail},
 * nous-iteration × {structure, detail}); other kinds + overview zoom fall
 * back to raw-field rendering. See `semantics-v0.1.md` S-1 for the matrix
 * framing and v0.2 plans.
 *
 * Discipline:
 *  - Engine is pure: takes plugins + LLMClient as injected deps. No
 *    network, no env reads, no API key handling here. Server-side wiring
 *    (Vite plugin) constructs the LLMClient and passes it in.
 *  - **Tests NEVER call real LLMs.** All projection tests inject a mock
 *    `LLMClient` that returns canned strings. The real Anthropic / OpenAI
 *    clients live in `vite-plugin-nous-adapter/` (outside `src/`) so they
 *    are unreachable from the test runner by construction. If a test ever
 *    needs to assert behavior against a real LLM, it's a *smoke test*,
 *    runs manually outside `npm test*`, and is documented as such.
 *  - Fallback is the safety net. Missing plugin OR missing zoom method OR
 *    plugin throw OR empty LLM response → fall back to raw-field render.
 *    The chrome should never see undefined.
 *  - Char budget enforced post-hoc. Even if the LLM overshoots, content
 *    is clamped to the zoom's budget (with `…` marker).
 */

import type { Intent, IntentKind, IntentState, Workspace, ZoomLevel } from '../schema'

// ─── Types ─────────────────────────────────────────────────────────────────

export interface Projection {
  content: string
  /** Where the content came from. `fallback` = raw fields rendered without
   *  an LLM call (default plugin missing, error path, or overview zoom). */
  source: 'llm' | 'fallback'
}

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
  /** Structure-zoom prose. ≤800 chars budget enforced post-hoc by engine. */
  structure?: (ctx: ProjectionContext) => Promise<Projection>
  /** Detail-zoom prose. Unbounded budget. */
  detail?: (ctx: ProjectionContext) => Promise<Projection>
  // overview is intentionally absent in v0.1 — overview stays structural
  // (TreeCard rendering) across all kinds. Per matrix framing in
  // semantics-v0.1.md S-1.
}

export type PluginRegistry = Partial<Record<IntentKind, KindProjectionPlugin>>

// ─── Char budgets per zoom ─────────────────────────────────────────────────

const STRUCTURE_BUDGET = 800
// detail is unbounded; overview falls back so no budget here.

// ─── Public API ────────────────────────────────────────────────────────────

export interface GenerateProjectionArgs {
  intent: Intent
  state: IntentState
  workspace: Workspace
  zoom: ZoomLevel
  plugins: PluginRegistry
  llm: LLMClient
}

export async function generateProjection(
  args: GenerateProjectionArgs
): Promise<Projection> {
  const { intent, state, workspace, zoom, plugins, llm } = args

  // Overview always falls back — TreeCard is the structural surface.
  if (zoom === 'overview') {
    return fallbackProjection({ intent, state, workspace, zoom })
  }

  const plugin = plugins[intent.kind]
  const method = plugin?.[zoom]
  if (!plugin || !method) {
    return fallbackProjection({ intent, state, workspace, zoom })
  }

  const ctx: ProjectionContext = { intent, state, workspace, zoom, llm }

  let raw: Projection
  try {
    raw = await method(ctx)
  } catch {
    return fallbackProjection({ intent, state, workspace, zoom })
  }

  // Empty content from the LLM = degenerate; treat as fallback.
  if (!raw.content || raw.content.trim().length === 0) {
    return fallbackProjection({ intent, state, workspace, zoom })
  }

  // Clamp by zoom budget. detail is unbounded.
  if (zoom === 'structure' && raw.content.length > STRUCTURE_BUDGET) {
    return {
      ...raw,
      content: raw.content.slice(0, STRUCTURE_BUDGET - 1) + '…',
    }
  }

  return raw
}

// ─── Fallback (raw-field render) ───────────────────────────────────────────

export interface FallbackProjectionArgs {
  intent: Intent
  state: IntentState
  workspace: Workspace
  zoom: ZoomLevel
}

/**
 * Raw-field render — what the chrome shows today (declaration title +
 * summary). The fallback never calls the LLM; it's the safety net for
 * every "no plugin" / "error" / "overview zoom" case so the chrome
 * always has something to display.
 *
 * v0.2 may invest in a richer fallback (e.g., per-kind structural prose
 * generated without LLM); v0.1 stays minimal.
 */
export function fallbackProjection(args: FallbackProjectionArgs): Projection {
  const { intent } = args
  const summary = intent.declaration.summary?.trim() ?? ''
  const content = summary.length > 0
    ? `${intent.declaration.title} — ${summary}`
    : intent.declaration.title
  return { content, source: 'fallback' }
}
