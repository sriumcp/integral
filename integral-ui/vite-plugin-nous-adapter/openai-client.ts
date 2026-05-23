/**
 * OpenAI-compatible LLMClient implementation — server-side only.
 *
 * Uses the `openai` SDK with a configurable base URL (env vars
 * `OPENAI_API_KEY` + `OPENAI_BASE_URL`). The SDK supports any
 * OpenAI-compatible endpoint (proxies, local servers, alt providers
 * exposing OpenAI-shape APIs), so this works for the user's preferred
 * env without asserting one specific provider.
 *
 * Lives outside `src/` because it imports `openai` and reads `process.env`.
 * Browser bundle never sees this code.
 */

import OpenAI from 'openai'
import type { LLMClient } from '../src/lib/projection'

/** Default model for v0.1 projections — cheap + fast. Override via
 *  INTEGRAL_PROJECTION_MODEL. The default targets a LiteLLM-style proxy
 *  with the `aws/` prefix; for direct OpenAI use, override to `gpt-5-mini`
 *  or whatever model is appropriate. */
const DEFAULT_MODEL = 'aws/claude-haiku-4-5'
const DEFAULT_MAX_TOKENS = 4000

export interface OpenAILLMClientOpts {
  apiKey: string
  baseURL?: string
  model?: string
  maxTokens?: number
}

export function createOpenAIClient(opts: OpenAILLMClientOpts): LLMClient {
  const clientOpts: { apiKey: string; baseURL?: string } = {
    apiKey: opts.apiKey,
  }
  if (opts.baseURL) clientOpts.baseURL = opts.baseURL
  const client = new OpenAI(clientOpts)
  const model = opts.model ?? DEFAULT_MODEL
  const maxTokens = opts.maxTokens ?? DEFAULT_MAX_TOKENS

  return {
    async generate(prompt: string): Promise<string> {
      const response = await client.chat.completions.create({
        model,
        max_completion_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }],
      })
      const choice = response.choices[0]
      return choice?.message?.content ?? ''
    },
  }
}
