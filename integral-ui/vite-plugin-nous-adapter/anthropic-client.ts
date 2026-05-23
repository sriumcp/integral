/**
 * Anthropic LLMClient implementation — server-side only.
 *
 * Lives outside `src/` because it imports `@anthropic-ai/sdk` and reads
 * `process.env`. Browser bundle never sees this code.
 *
 * The Anthropic SDK auto-reads `ANTHROPIC_AUTH_TOKEN` and
 * `ANTHROPIC_BASE_URL` from env, so a no-arg constructor picks them up.
 * It also accepts `ANTHROPIC_API_KEY`. We construct with no args and
 * defer to the SDK's env handling.
 */

import Anthropic from '@anthropic-ai/sdk'
import type { LLMClient } from '../src/lib/projection'

/** Default model for v0.1 projections — cheap + fast + sufficient for
 *  prose summaries at the structure/detail budgets. Override via
 *  `INTEGRAL_PROJECTION_MODEL` env var. */
const DEFAULT_MODEL = 'claude-haiku-4-5'

/** Default max tokens for the LLM response. structure budget is 800
 *  chars (~200-250 tokens); detail is unbounded but we cap at 4000
 *  tokens to keep cost predictable. */
const DEFAULT_MAX_TOKENS = 4000

export interface AnthropicLLMClientOpts {
  model?: string
  maxTokens?: number
}

/**
 * Construct a typed LLMClient backed by the Anthropic SDK. The SDK reads
 * `ANTHROPIC_API_KEY` / `ANTHROPIC_AUTH_TOKEN` / `ANTHROPIC_BASE_URL` from
 * env automatically.
 */
export function createAnthropicClient(
  opts: AnthropicLLMClientOpts = {}
): LLMClient {
  const client = new Anthropic()
  const model = opts.model ?? DEFAULT_MODEL
  const maxTokens = opts.maxTokens ?? DEFAULT_MAX_TOKENS

  return {
    async generate(prompt: string): Promise<string> {
      const response = await client.messages.create({
        model,
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }],
      })
      // Aggregate text blocks; response.content is a discriminated array
      // of content blocks (text, tool_use, etc.). v0.1 only handles text.
      const text = response.content
        .map((block) => (block.type === 'text' ? block.text : ''))
        .join('')
      return text
    },
  }
}
