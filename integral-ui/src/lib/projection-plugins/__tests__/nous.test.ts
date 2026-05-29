/**
 * Nous projection plugins — campaign + iteration, structure + detail.
 *
 * v0.1 ships 4 LLM-driven cells. Each plugin method:
 *   1. Builds a (kind, zoom)-specific prompt with the relevant context.
 *   2. Calls ctx.llm.generate(prompt).
 *   3. Returns the response as a Projection (source: 'llm').
 *
 * Tests verify prompt construction (the plugin's job) without asserting
 * the *exact* prose (that's the LLM's job). Mock LLM records calls so we
 * can inspect what was sent.
 */

import { describe, expect, it } from 'vitest'
import type { Intent, IntentState, Workspace } from '@/schema'
import { generateProjection } from '../../projection'
import { nousCampaignPlugin } from '../nous-campaign'
import { nousIterationPlugin } from '../nous-iteration'

const PROJECTOR = {
  id: 'nous-projector',
  kind: 'agent' as const,
  display_name: 'nous-projector',
}

function makeNousCampaign(opts?: {
  id?: string
  research_question?: string
  children?: string[]
}): { intent: Intent; state: IntentState } {
  const id = opts?.id ?? 'c1'
  return {
    intent: {
      id,
      schema_version: '0.2.0',
      kind: 'nous-campaign',
      declaration: {
        title: 'EA-WFQ scheduling fairness',
        summary:
          'Investigate whether externality-aware WFQ produces fair scheduling under heterogeneous tenant loads.',
        success_criterion: '',
      },
      holder: { mode: 'jointly-held', parties: [PROJECTOR] },
      lifetime: { kind: 'campaign', started_at: '2026-05-23T00:00:00Z' },
      decomposition: { children: opts?.children ?? [] },
      provenance: {
        declared_by: PROJECTOR,
        declared_at: '2026-05-23T00:00:00Z',
        motivated_by: [],
        source: 'nous',
      },
      knowledge_refs: [],
      tags: [],
      state_ref: `${id}-STATE`,
      extension: {
        kind: 'nous-campaign',
        research_question:
          opts?.research_question ??
          'Why does EA-WFQ penalize critical-class tenants on heterogeneous workloads?',
        open_hypothesis_bundles: [],
        gate_status: { current_gate: 'none' },
      },
    },
    state: {
      id: `${id}-STATE`,
      intent_id: id,
      schema_version: '0.2.0',
      status: 'active',
      last_advanced_at: '2026-05-23T00:00:00Z',
      last_advanced_by: PROJECTOR,
      history: [],
      external_anchors: [],
    },
  }
}

function makeNousIteration(opts: {
  id: string
  parentId: string
  iteration_number: number
  family: string
  result?: 'pending' | 'confirmed' | 'refuted' | 'inconclusive'
}): { intent: Intent; state: IntentState } {
  const result = opts.result ?? 'pending'
  return {
    intent: {
      id: opts.id,
      schema_version: '0.2.0',
      kind: 'nous-iteration',
      declaration: {
        title: `iter-${opts.iteration_number} · ${opts.family}`,
        summary: `iteration ${opts.iteration_number} of family ${opts.family}`,
        success_criterion: '',
      },
      holder: { mode: 'jointly-held', parties: [PROJECTOR] },
      lifetime: { kind: 'discrete', started_at: '2026-05-23T00:00:00Z' },
      decomposition: { children: [] },
      provenance: {
        declared_by: PROJECTOR,
        declared_at: '2026-05-23T00:00:00Z',
        motivated_by: [],
        source: 'nous',
      },
      knowledge_refs: [],
      tags: [opts.family],
      state_ref: `${opts.id}-STATE`,
      extension: {
        kind: 'nous-iteration',
        iteration_number: opts.iteration_number,
        hypothesis_bundle: {
          h_main: {
            statement: `Family ${opts.family} addresses the campaign's research question.`,
            prediction: `Iteration ${opts.iteration_number} yields a measurable signal.`,
            conditions: [],
            ...(result !== 'pending' ? { result } : {}),
          },
          h_ablation: [],
        },
      },
    },
    state: {
      id: `${opts.id}-STATE`,
      intent_id: opts.id,
      schema_version: '0.2.0',
      status: result === 'pending' ? 'active' : 'satisfied',
      last_advanced_at: '2026-05-23T00:00:00Z',
      last_advanced_by: PROJECTOR,
      history: [],
      external_anchors: [],
    },
  }
}

function makeWorkspace(
  pairs: { intent: Intent; state: IntentState }[]
): Workspace {
  return {
    intents: pairs.map((p) => p.intent),
    states: pairs.map((p) => p.state),
    evidence_links: [],
    operations: [],
  }
}

function recordingLLM(canned: string) {
  const calls: string[] = []
  return {
    calls,
    async generate(prompt: string) {
      calls.push(prompt)
      return canned
    },
  }
}

// ─── nousCampaignPlugin ────────────────────────────────────────────────────

describe('nousCampaignPlugin — structure', () => {
  it('returns an LLM-source Projection', async () => {
    const camp = makeNousCampaign()
    const ws = makeWorkspace([camp])
    const llm = recordingLLM('rendered structure prose')
    const p = await generateProjection({
      intent: camp.intent,
      state: camp.state,
      workspace: ws,
      zoom: 'structure',
      plugins: { 'nous-campaign': nousCampaignPlugin },
      llm,
    })
    expect(p.source).toBe('llm')
    expect(p.content).toBe('rendered structure prose')
  })

  it('embeds the campaign title and research_question in the prompt', async () => {
    const camp = makeNousCampaign({
      research_question: 'Does X cause Y under regime Z?',
    })
    const ws = makeWorkspace([camp])
    const llm = recordingLLM('p')
    await generateProjection({
      intent: camp.intent,
      state: camp.state,
      workspace: ws,
      zoom: 'structure',
      plugins: { 'nous-campaign': nousCampaignPlugin },
      llm,
    })
    expect(llm.calls[0]).toContain('EA-WFQ scheduling fairness')
    expect(llm.calls[0]).toContain('Does X cause Y under regime Z?')
  })

  it('mentions the structure char budget (≤800) in the prompt', async () => {
    const camp = makeNousCampaign()
    const ws = makeWorkspace([camp])
    const llm = recordingLLM('p')
    await generateProjection({
      intent: camp.intent,
      state: camp.state,
      workspace: ws,
      zoom: 'structure',
      plugins: { 'nous-campaign': nousCampaignPlugin },
      llm,
    })
    expect(llm.calls[0]).toMatch(/800/)
  })

  it('includes child iterations in the structure context', async () => {
    const camp = makeNousCampaign({ children: ['c1:iter-1', 'c1:iter-2'] })
    const iter1 = makeNousIteration({
      id: 'c1:iter-1',
      parentId: 'c1',
      iteration_number: 1,
      family: 'pilot',
      result: 'inconclusive',
    })
    const iter2 = makeNousIteration({
      id: 'c1:iter-2',
      parentId: 'c1',
      iteration_number: 2,
      family: 'refined',
      result: 'confirmed',
    })
    const ws = makeWorkspace([camp, iter1, iter2])
    const llm = recordingLLM('p')
    await generateProjection({
      intent: camp.intent,
      state: camp.state,
      workspace: ws,
      zoom: 'structure',
      plugins: { 'nous-campaign': nousCampaignPlugin },
      llm,
    })
    // Both iterations should appear in the prompt context.
    expect(llm.calls[0]).toContain('iter-1')
    expect(llm.calls[0]).toContain('iter-2')
    expect(llm.calls[0]).toContain('confirmed')
  })
})

describe('nousCampaignPlugin — detail', () => {
  it('builds a different (richer) prompt than structure', async () => {
    const camp = makeNousCampaign({ children: ['c1:iter-1'] })
    const iter = makeNousIteration({
      id: 'c1:iter-1',
      parentId: 'c1',
      iteration_number: 1,
      family: 'pilot',
      result: 'confirmed',
    })
    const ws = makeWorkspace([camp, iter])
    const llmStruct = recordingLLM('s')
    const llmDetail = recordingLLM('d')
    await generateProjection({
      intent: camp.intent,
      state: camp.state,
      workspace: ws,
      zoom: 'structure',
      plugins: { 'nous-campaign': nousCampaignPlugin },
      llm: llmStruct,
    })
    await generateProjection({
      intent: camp.intent,
      state: camp.state,
      workspace: ws,
      zoom: 'detail',
      plugins: { 'nous-campaign': nousCampaignPlugin },
      llm: llmDetail,
    })
    expect(llmStruct.calls[0]).not.toBe(llmDetail.calls[0])
    // Detail asks for narrative — should be longer/different framing.
    expect((llmDetail.calls[0] ?? '').length).toBeGreaterThan(
      (llmStruct.calls[0] ?? '').length
    )
  })

  it('detail prompt does not impose the 800-char structure budget', async () => {
    const camp = makeNousCampaign()
    const ws = makeWorkspace([camp])
    const llm = recordingLLM('p')
    await generateProjection({
      intent: camp.intent,
      state: camp.state,
      workspace: ws,
      zoom: 'detail',
      plugins: { 'nous-campaign': nousCampaignPlugin },
      llm,
    })
    expect(llm.calls[0]).not.toMatch(/800 characters/)
  })
})

// ─── nousIterationPlugin ───────────────────────────────────────────────────

describe('nousIterationPlugin — structure', () => {
  it('embeds hypothesis statement and prediction in the prompt', async () => {
    const camp = makeNousCampaign({ children: ['c1:iter-1'] })
    const iter = makeNousIteration({
      id: 'c1:iter-1',
      parentId: 'c1',
      iteration_number: 1,
      family: 'pilot',
      result: 'refuted',
    })
    const ws = makeWorkspace([camp, iter])
    const llm = recordingLLM('p')
    await generateProjection({
      intent: iter.intent,
      state: iter.state,
      workspace: ws,
      zoom: 'structure',
      plugins: { 'nous-iteration': nousIterationPlugin },
      llm,
    })
    expect(llm.calls[0]).toContain('Family pilot addresses')
    expect(llm.calls[0]).toContain('measurable signal')
    expect(llm.calls[0]).toContain('refuted')
  })

  it('includes the parent campaign context for situational awareness', async () => {
    const camp = makeNousCampaign({
      id: 'c1',
      children: ['c1:iter-1'],
      research_question: 'Why does X plateau?',
    })
    const iter = makeNousIteration({
      id: 'c1:iter-1',
      parentId: 'c1',
      iteration_number: 1,
      family: 'pilot',
      result: 'inconclusive',
    })
    const ws = makeWorkspace([camp, iter])
    const llm = recordingLLM('p')
    await generateProjection({
      intent: iter.intent,
      state: iter.state,
      workspace: ws,
      zoom: 'structure',
      plugins: { 'nous-iteration': nousIterationPlugin },
      llm,
    })
    // Parent's research question should surface in the iteration's
    // context so the LLM can frame what this iter is testing.
    expect(llm.calls[0]).toMatch(/Why does X plateau\?/)
  })
})

describe('nousIterationPlugin — detail', () => {
  it('detail prompt is richer than structure', async () => {
    const camp = makeNousCampaign({ children: ['c1:iter-1'] })
    const iter = makeNousIteration({
      id: 'c1:iter-1',
      parentId: 'c1',
      iteration_number: 1,
      family: 'pilot',
      result: 'confirmed',
    })
    const ws = makeWorkspace([camp, iter])
    const llmS = recordingLLM('s')
    const llmD = recordingLLM('d')
    await generateProjection({
      intent: iter.intent,
      state: iter.state,
      workspace: ws,
      zoom: 'structure',
      plugins: { 'nous-iteration': nousIterationPlugin },
      llm: llmS,
    })
    await generateProjection({
      intent: iter.intent,
      state: iter.state,
      workspace: ws,
      zoom: 'detail',
      plugins: { 'nous-iteration': nousIterationPlugin },
      llm: llmD,
    })
    expect((llmD.calls[0] ?? '').length).toBeGreaterThan(
      (llmS.calls[0] ?? '').length
    )
  })
})

// ─── Plugin registry ───────────────────────────────────────────────────────

describe('plugin registry shape', () => {
  it('campaign plugin declares its kind', () => {
    expect(nousCampaignPlugin.kind).toBe('nous-campaign')
  })

  it('iteration plugin declares its kind', () => {
    expect(nousIterationPlugin.kind).toBe('nous-iteration')
  })

  it('campaign plugin implements both structure and detail', () => {
    expect(typeof nousCampaignPlugin.structure).toBe('function')
    expect(typeof nousCampaignPlugin.detail).toBe('function')
  })

  it('iteration plugin implements both structure and detail', () => {
    expect(typeof nousIterationPlugin.structure).toBe('function')
    expect(typeof nousIterationPlugin.detail).toBe('function')
  })
})
