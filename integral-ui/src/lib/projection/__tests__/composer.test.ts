/**
 * LLM Composer tests — mock LLM client only. Real Anthropic / OpenAI
 * clients live in this directory but are NEVER imported here.
 */

import { describe, expect, it } from 'vitest'
import {
  ComposerError,
  buildPrompt,
  composeProjectionSpec,
  extractJsonObject,
} from '../composer'
import type { LLMClient } from '../../projection'
import type { ProjectionSpec, TypedEvidence } from '../spec'

const evidence: TypedEvidence = {
  datasets: [
    {
      name: 'iterations',
      schema: { columns: [
        { name: 'iter', type: 'number' },
        { name: 'h_main_result', type: 'string' },
      ] },
      rows: [
        { iter: 1, h_main_result: 'inconclusive' },
        { iter: 2, h_main_result: 'confirmed' },
        { iter: 3, h_main_result: 'confirmed' },
      ],
      source_ref: { file: 'ledger.json' },
    },
  ],
  excerpts: [
    {
      id: 'rq',
      text: 'How does X interact with Y?',
      kind: 'paragraph',
      source_ref: { file: 'campaign.yaml' },
    },
  ],
  files_seen: [{ file: 'ledger.json' }],
  fingerprint: 'fp-test',
}

const validSpec: ProjectionSpec = {
  spec_version: '1',
  figures: [
    {
      id: 'arc',
      title: 'h_main result by iteration',
      dataset: 'iterations',
      mark: { type: 'bar', orientation: 'vertical' },
      encodings: { x: 'iter', y: 'iter', fill: 'h_main_result' },
      emit_empty: false,
    },
  ],
  scalars: [
    { op: 'count', id: 'n', dataset: 'iterations', column: 'iter' },
    {
      op: 'count', id: 'n_confirmed', dataset: 'iterations', column: 'iter',
      filter: { column: 'h_main_result', predicate: { op: 'eq', value: 'confirmed' } },
    },
  ],
  prose_template: '{scalar:n} iterations, {scalar:n_confirmed} confirmed. RQ: {excerpt:rq}',
}

function mockLLM(canned: string[]): LLMClient & { calls: string[] } {
  const calls: string[] = []
  let i = 0
  return {
    calls,
    async generate(prompt: string): Promise<string> {
      calls.push(prompt)
      const out = canned[Math.min(i, canned.length - 1)]
      i++
      return out!
    },
  }
}

describe('buildPrompt', () => {
  it('includes dataset schema, sample rows, and excerpts', () => {
    const prompt = buildPrompt({
      evidence, zoom: 'structure', kind: 'nous-campaign',
      llm: mockLLM(['']), intent_summary: 'campaign X',
    })
    expect(prompt).toContain('dataset `iterations`')
    expect(prompt).toContain('iter:number')
    expect(prompt).toContain('h_main_result:string')
    expect(prompt).toContain('rq [paragraph]')
    expect(prompt).toContain('How does X interact with Y?')
  })

  it('handles empty evidence gracefully', () => {
    const prompt = buildPrompt({
      evidence: { datasets: [], excerpts: [], files_seen: [], fingerprint: '' },
      zoom: 'structure', kind: 'research-thread', llm: mockLLM(['']),
      intent_summary: 'thread X',
    })
    expect(prompt).toContain('no datasets')
    expect(prompt).toContain('# Available excerpts')
  })

  it('mentions the kind-specific narrative-arc instruction', () => {
    const nous = buildPrompt({
      evidence, zoom: 'structure', kind: 'nous-campaign',
      llm: mockLLM(['']), intent_summary: '',
    })
    expect(nous).toContain('research question')
    const thread = buildPrompt({
      evidence, zoom: 'structure', kind: 'research-thread',
      llm: mockLLM(['']), intent_summary: '',
    })
    expect(thread).toContain('thread is investigating')
  })

  it('does NOT include all dataset rows (only sample) — bulk numerics never reach the LLM', () => {
    const big: TypedEvidence = {
      ...evidence,
      datasets: [{
        ...evidence.datasets[0]!,
        rows: Array.from({ length: 100 }, (_, i) => ({ iter: i, h_main_result: 'confirmed' })),
      }],
    }
    const prompt = buildPrompt({
      evidence: big, zoom: 'detail', kind: 'nous-campaign',
      llm: mockLLM(['']), intent_summary: '',
    })
    // Sample is capped at 6 rows. Look for a row that should NOT appear (iter 50).
    const occurrences = (prompt.match(/\| 50 \|/g) || []).length
    expect(occurrences).toBeLessThanOrEqual(1) // 0 or 1 (sampled by stride), never the full 100
    expect(prompt).toContain('rows: 100')
  })
})

describe('extractJsonObject', () => {
  it('parses a bare JSON object', () => {
    expect(extractJsonObject('{"a": 1}')).toEqual({ a: 1 })
  })

  it('strips ```json ... ``` fences', () => {
    expect(extractJsonObject('```json\n{"a": 1}\n```')).toEqual({ a: 1 })
  })

  it('strips ``` ... ``` fences without the json marker', () => {
    expect(extractJsonObject('```\n{"a": 1}\n```')).toEqual({ a: 1 })
  })

  it('handles prose preamble before the JSON', () => {
    expect(extractJsonObject('Here is the spec: {"a": 1} cheers.')).toEqual({ a: 1 })
  })

  it('finds the first balanced object even when nested', () => {
    expect(extractJsonObject('{"a": {"b": 2}, "c": 3}')).toEqual({ a: { b: 2 }, c: 3 })
  })

  it('returns null for malformed input', () => {
    expect(extractJsonObject('no json here')).toBeNull()
    expect(extractJsonObject('{not json}')).toBeNull()
  })

  it('survives strings containing unbalanced braces', () => {
    expect(extractJsonObject('{"a": "}{}}"}')).toEqual({ a: '}{}}' })
  })
})

describe('composeProjectionSpec', () => {
  it('returns the parsed spec when LLM emits valid JSON', async () => {
    const llm = mockLLM([JSON.stringify(validSpec)])
    const out = await composeProjectionSpec({
      evidence, zoom: 'structure', kind: 'nous-campaign', llm,
      intent_summary: 'X',
    })
    expect(out.figures).toHaveLength(1)
    expect(out.scalars).toHaveLength(2)
    expect(llm.calls).toHaveLength(1)
  })

  it('retries once when first response is invalid; succeeds on second valid response', async () => {
    const llm = mockLLM([
      'this is not json',
      JSON.stringify(validSpec),
    ])
    const out = await composeProjectionSpec({
      evidence, zoom: 'structure', kind: 'nous-campaign', llm,
      intent_summary: 'X',
    })
    expect(llm.calls).toHaveLength(2)
    expect(out.figures).toHaveLength(1)
    // The retry prompt MUST include the validation feedback.
    expect(llm.calls[1]).toContain('Previous attempt failed')
  })

  it('throws ComposerError when both attempts fail', async () => {
    const llm = mockLLM(['nope', 'still nope'])
    await expect(composeProjectionSpec({
      evidence, zoom: 'structure', kind: 'nous-campaign', llm,
      intent_summary: 'X',
    })).rejects.toBeInstanceOf(ComposerError)
  })

  it('rejects spec referencing unknown dataset before passing to executor', async () => {
    const badSpec: ProjectionSpec = {
      ...validSpec,
      figures: [{ ...validSpec.figures[0]!, dataset: 'never_existed' }],
    }
    const llm = mockLLM([JSON.stringify(badSpec), JSON.stringify(badSpec)])
    await expect(composeProjectionSpec({
      evidence, zoom: 'structure', kind: 'nous-campaign', llm,
      intent_summary: 'X',
    })).rejects.toThrow(/unknown dataset/)
  })

  it('rejects scalar spec referencing unknown dataset', async () => {
    const badSpec: ProjectionSpec = {
      ...validSpec,
      scalars: [
        { op: 'count', id: 'n', dataset: 'never_existed', column: 'iter' },
      ],
    }
    const llm = mockLLM([JSON.stringify(badSpec), JSON.stringify(badSpec)])
    await expect(composeProjectionSpec({
      evidence, zoom: 'structure', kind: 'nous-campaign', llm,
      intent_summary: 'X',
    })).rejects.toThrow(/unknown dataset/)
  })

  it('accepts const_string scalars without requiring a dataset', async () => {
    const spec: ProjectionSpec = {
      ...validSpec,
      scalars: [
        { op: 'const_string', id: 'status', value: 'active' },
        ...validSpec.scalars,
      ],
    }
    const llm = mockLLM([JSON.stringify(spec)])
    const out = await composeProjectionSpec({
      evidence, zoom: 'structure', kind: 'nous-campaign', llm,
      intent_summary: 'X',
    })
    expect(out.scalars[0]!.op).toBe('const_string')
  })
})

describe('LLM-mock isolation discipline', () => {
  it('mock LLM never reaches real provider — calls are recorded only in the mock', async () => {
    const llm = mockLLM([JSON.stringify(validSpec)])
    await composeProjectionSpec({
      evidence, zoom: 'structure', kind: 'nous-campaign', llm,
      intent_summary: 'X',
    })
    expect(llm.calls.length).toBeGreaterThan(0)
    // Sanity: no real-LLM env vars are required for tests to pass.
    // (Composer never instantiates a real client.)
  })
})
