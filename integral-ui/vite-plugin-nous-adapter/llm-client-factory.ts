/**
 * LLMClient factory — picks an LLM provider based on env vars.
 *
 * Preference order (the project's environment convention):
 *  1. **OpenAI-compatible** — if `OPENAI_API_KEY` is set, use it. Optional
 *     `OPENAI_BASE_URL` lets the caller point at proxies / alt providers
 *     that expose an OpenAI-shape API.
 *  2. **Anthropic** — if `ANTHROPIC_API_KEY` or `ANTHROPIC_AUTH_TOKEN` is
 *     set, use the Anthropic SDK (which auto-reads `ANTHROPIC_BASE_URL`).
 *  3. **null** — no LLM available. Engine falls back to raw-field render.
 *
 * The model can be overridden via `INTEGRAL_PROJECTION_MODEL`. Defaults
 * are provider-specific (cheap/fast for v0.1 cost discipline).
 */

import type { LLMClient } from '../src/lib/projection'
import { createAnthropicClient } from './anthropic-client'
import { createOpenAIClient } from './openai-client'

export function tryCreateLLMClient(): {
  client: LLMClient | null
  provider: 'openai' | 'anthropic' | null
} {
  // Prefer OpenAI-compatible. Some users have an OpenAI-shape proxy that
  // routes to whichever model they want; we don't second-guess.
  const openaiKey = process.env.OPENAI_API_KEY
  if (openaiKey) {
    const opts: Parameters<typeof createOpenAIClient>[0] = {
      apiKey: openaiKey,
    }
    const baseURL = process.env.OPENAI_BASE_URL
    if (baseURL) opts.baseURL = baseURL
    const model = process.env.INTEGRAL_PROJECTION_MODEL
    if (model) opts.model = model
    return { client: createOpenAIClient(opts), provider: 'openai' }
  }

  // Anthropic SDK auto-reads ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN /
  // ANTHROPIC_BASE_URL from env. We just check whether *any* token is
  // present so we don't construct a client that will throw on first call.
  const anthropicAuth =
    process.env.ANTHROPIC_API_KEY ?? process.env.ANTHROPIC_AUTH_TOKEN
  if (anthropicAuth) {
    const opts: Parameters<typeof createAnthropicClient>[0] = {}
    const model = process.env.INTEGRAL_PROJECTION_MODEL
    if (model) opts.model = model
    return { client: createAnthropicClient(opts), provider: 'anthropic' }
  }

  return { client: null, provider: null }
}
