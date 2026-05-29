/**
 * Server-side handler for `POST /api/shape`.
 *
 * Powers the LLM-driven shaping conversation. Takes the current draft +
 * conversation history + the user's new message; prompts the LLM with a
 * Nous-specific system prompt that knows the schema; returns a structured
 * response containing the LLM's natural-language reply, an optional patch
 * to apply to the draft, a status signal (shaping / ready-to-commit /
 * kind-mismatch), and any concerns the LLM wants to flag.
 *
 * Discipline:
 *  - Server-side only — depends on `LLMClient` from the projection module
 *    being constructed via `tryCreateLLMClient` factory.
 *  - **Falls back gracefully** when no LLM provider is configured: returns
 *    a synthetic reply prompting the user to fill the form by hand.
 *  - The schema (Nous campaign field shape, what makes a "good" research
 *    question, kind detection) lives in the system prompt, server-side.
 *    The browser doesn't need schema-aware LLM logic.
 *  - Output is **strict JSON** parsed from the LLM response; if the LLM
 *    returns malformed JSON (rare, but possible), the handler returns a
 *    fallback reply that asks the user to clarify and emits no patch.
 */

import type { LLMClient } from '../src/lib/projection'
import type { ShapePatch } from '../src/adapters/nous/shape-patch'

// ─── Types ─────────────────────────────────────────────────────────────────

export interface ShapeTurn {
  speaker: 'user' | 'shaper'
  body: string
}

export interface ShapeRequest {
  draft: {
    intent: {
      kind: string
      declaration: { title: string; summary: string; success_criterion: string }
      extension: { kind: string; research_question?: string }
      tags?: ReadonlyArray<string>
    }
    writeback: {
      max_iterations: number
      target_system: { name: string; description: string; repo_path: string }
      run_id?: string
    }
  }
  history: ReadonlyArray<ShapeTurn>
  user_message: string
}

export type ShapeStatus = 'shaping' | 'ready-to-commit' | 'kind-mismatch'

export interface ShapeResponse {
  reply: string
  patch: ShapePatch | null
  status: ShapeStatus
  concerns: ReadonlyArray<string>
  /** When status='kind-mismatch', the kind the LLM thinks the user
   *  actually wants. v0.1 doesn't act on this; the chrome can surface
   *  it as a hint. */
  kind_suggestion?: string
}

// ─── System prompt ─────────────────────────────────────────────────────────

const NOUS_SHAPING_SYSTEM_PROMPT = `You are Integral's *Shaper*. You help a researcher articulate a Nous-style research campaign — a typed investigation that will be handed off to the Nous CLI for execution.

Your job:
1. Sharpen vague intent into a precise, testable research question.
2. Detect ambiguity, conflated goals, or kind mismatches (this might be a Coral optimization, not a Nous campaign).
3. Fill the typed draft fields as soon as you have signal — don't wait for explicit instructions.
4. Tell the user honestly when the draft is *ready to commit* — neither too eagerly (vague research_question would produce noisy results) nor too cautiously (don't keep asking when the answer is clear).
5. Be brief. One clarifying question at a time when needed; no preamble.

A *valid Nous campaign* needs:
  - declaration.title         — concise, descriptive (≤80 chars).
  - declaration.summary       — 1–2 sentences of context.
  - declaration.success_criterion — what would count as the campaign being satisfied. Concrete, observable.
  - extension.research_question — *the* question being investigated. Specific, testable. Not "how can we do X better" but "does Y hold under Z?".
  - writeback.max_iterations  — integer cap (typical 3–10).
  - writeback.target_system   — {name, description, repo_path (absolute path)}.

A *good* research_question:
  - States a hypothesis or open question, not a vague desire.
  - Names the regime (when does it apply?).
  - Is testable in finite iterations.

Kinds to watch for (so you can flag mismatch):
  - **nous-campaign**: open research question, hypothesis-driven, principles emerge from iterations.
  - **coral-optimization**: scored search over a population (best-of-n / beam / etc.). If the user says "find the best…" or "optimize…" without a research question, suggest reframing as Coral.
  - **feature-campaign**: ship code. If the user says "implement…" or "ship…", suggest reframing as Feature.

If the user describes paper-writing or PR work, note it in concerns but do not suggest a kind — the substrate does not yet ship adapters for those (returning in a future schema bump).

Each turn, return STRICT JSON ONLY (no markdown, no preamble):
{
  "reply": "your natural-language reply to the user (concise; one question at a time when needed)",
  "patch": { ... fields to fill on the typed draft, or null if no fields to update this turn ... },
  "status": "shaping" | "ready-to-commit" | "kind-mismatch",
  "concerns": [ "short strings flagging issues with the current draft, e.g. 'research_question is too vague' " ],
  "kind_suggestion": "coral-optimization" | "feature-campaign" | null
}

Patch field shape (only these fields are patchable; anything else is ignored):
{
  "intent": {
    "declaration": { "title"?, "summary"?, "success_criterion"? },
    "extension":   { "research_question"? },
    "tags"?: [string]
  },
  "writeback": {
    "max_iterations"?,
    "target_system": { "name"?, "description"?, "repo_path"? },
    "run_id"?
  }
}

Rules:
- Set "status": "ready-to-commit" only when ALL required fields are filled with substantive (non-trivial) values AND the research_question is specific enough that a Nous run could produce a meaningful verdict.
- If you detect a kind mismatch, set "status": "kind-mismatch", set "kind_suggestion" accordingly, and explain in "reply".
- "concerns" is for soft warnings ("research_question is testable but might benefit from a regime"). Use it; don't be silent about quality.
- Refuse to fabricate fields. If you don't know the user's repo_path, ASK. Don't guess.
`

// ─── Public handler ────────────────────────────────────────────────────────

export async function handleShape(
  body: ShapeRequest,
  llm: LLMClient | null
): Promise<ShapeResponse> {
  if (!llm) {
    return {
      reply:
        'No LLM provider is configured (set ANTHROPIC_API_KEY or OPENAI_API_KEY). You can still shape this draft by editing the form fields directly.',
      patch: null,
      status: 'shaping',
      concerns: ['No LLM available — manual editing only.'],
    }
  }

  const userPayload = buildUserPrompt(body)
  // The LLMClient interface only takes a single `prompt` string today.
  // We build a single concatenated message: system prompt + the user
  // payload (current draft + history + new message). This works for
  // both Anthropic and OpenAI-compatible backends.
  const fullPrompt = `${NOUS_SHAPING_SYSTEM_PROMPT}\n\n---\n\n${userPayload}`

  let raw: string
  try {
    raw = await llm.generate(fullPrompt)
  } catch (err) {
    return {
      reply: `LLM call failed: ${err instanceof Error ? err.message : String(err)}. You can edit the form fields directly.`,
      patch: null,
      status: 'shaping',
      concerns: ['LLM error — try again or edit manually.'],
    }
  }

  return parseShapeResponse(raw)
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function buildUserPrompt(body: ShapeRequest): string {
  const draftSummary = JSON.stringify(body.draft, null, 2)
  const history = body.history.length === 0
    ? '(no turns yet)'
    : body.history
        .map((t) => `${t.speaker === 'user' ? '> User' : '> Shaper'}: ${t.body}`)
        .join('\n')

  return [
    '# Current draft',
    '```json',
    draftSummary,
    '```',
    '',
    '# Conversation so far',
    history,
    '',
    '# User message (most recent)',
    body.user_message,
    '',
    'Now respond with STRICT JSON only as instructed above.',
  ].join('\n')
}

/**
 * Parse the LLM's response. Tolerates surrounding markdown (some models
 * wrap JSON in ```json fences despite instructions). Falls back to a
 * synthetic "I couldn't parse that — please clarify" reply on failure
 * so the user always sees a coherent message.
 */
export function parseShapeResponse(raw: string): ShapeResponse {
  const trimmed = stripMarkdownFences(raw.trim())
  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    return {
      reply:
        "I couldn't parse my own response. Could you rephrase your last message?",
      patch: null,
      status: 'shaping',
      concerns: ['LLM returned malformed JSON.'],
    }
  }

  if (!parsed || typeof parsed !== 'object') {
    return {
      reply:
        "I couldn't structure my response correctly. Could you say that again?",
      patch: null,
      status: 'shaping',
      concerns: ['LLM returned non-object response.'],
    }
  }

  const obj = parsed as Record<string, unknown>
  const reply = typeof obj.reply === 'string' ? obj.reply : '(no reply)'
  const status: ShapeStatus =
    obj.status === 'ready-to-commit' || obj.status === 'kind-mismatch'
      ? obj.status
      : 'shaping'
  const concerns = Array.isArray(obj.concerns)
    ? obj.concerns.filter((c: unknown): c is string => typeof c === 'string')
    : []
  const kind_suggestion =
    typeof obj.kind_suggestion === 'string'
      ? obj.kind_suggestion
      : undefined
  const patch =
    obj.patch && typeof obj.patch === 'object'
      ? (obj.patch as ShapePatch)
      : null

  return {
    reply,
    patch,
    status,
    concerns,
    ...(kind_suggestion ? { kind_suggestion } : {}),
  }
}

function stripMarkdownFences(s: string): string {
  // Some models wrap JSON in ```json ... ``` despite "STRICT JSON ONLY".
  const fence = /^```(?:json)?\s*([\s\S]*?)\s*```$/
  const m = s.match(fence)
  if (m) return m[1]?.trim() ?? s
  return s
}
