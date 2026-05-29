/**
 * Projection engine — kind-pluggable, indexed by (kind, zoom).
 *
 * v0.1 ships LLM-driven prose for Nous kinds at structure + detail zooms;
 * other kinds + overview zoom fall back to raw-field rendering. The matrix
 * framing lives in semantics-v0.1.md S-1.
 *
 * Discipline:
 *  - Engine is pure: takes plugins + LLMClient as injected deps. No
 *    network, no env reads, no API key handling here.
 *  - Fallback is the safety net. If a plugin is missing for the kind, or
 *    the requested zoom isn't implemented, fall back to raw-field render.
 *    The chrome should never see undefined.
 *  - Char budget enforced post-hoc. Even if the LLM overshoots, the
 *    Projection's content is clamped to the zoom's budget.
 */

import { describe, expect, it } from 'vitest'
import type { Intent, IntentState, Workspace } from '@/schema'
import {
  fallbackProjection,
  generateProjection,
  type KindProjectionPlugin,
  type LLMClient,
  type ProjectionContext,
} from '../projection'

// ─── Test fixtures ─────────────────────────────────────────────────────────

const PROJECTOR = {
  id: 'nous-projector',
  kind: 'agent' as const,
  display_name: 'nous-projector',
}

function makeNousCampaign(opts: { id: string }): {
  intent: Intent
  state: IntentState
} {
  const id = opts.id
  return {
    intent: {
      id,
      schema_version: '0.3.0',
      kind: 'nous-campaign',
      declaration: {
        title: 'Test campaign',
        summary: 'a research campaign',
        success_criterion: '',
      },
      holder: { mode: 'jointly-held', parties: [PROJECTOR] },
      lifetime: { kind: 'campaign', started_at: '2026-05-23T00:00:00Z' },
      decomposition: { children: [] },
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
        research_question: 'Why does X plateau?',
        open_hypothesis_bundles: [],
        gate_status: { current_gate: 'none' },
      },
    },
    state: {
      id: `${id}-STATE`,
      intent_id: id,
      schema_version: '0.3.0',
      status: 'active',
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

// Mock LLM client that records calls and returns canned responses.
function makeMockLLM(canned: string): LLMClient & { calls: string[] } {
  const calls: string[] = []
  return {
    calls,
    async generate(prompt: string) {
      calls.push(prompt)
      return canned
    },
  }
}

// ─── Fallback projection (raw-field render) ────────────────────────────────

describe('fallbackProjection', () => {
  it('returns the intent declaration title + summary as content', () => {
    const { intent, state } = makeNousCampaign({ id: 'c1' })
    const ws = makeWorkspace([{ intent, state }])
    const p = fallbackProjection({
      intent,
      state,
      workspace: ws,
      zoom: 'structure',
    })
    expect(p.content).toContain('Test campaign')
    expect(p.source).toBe('fallback')
  })

  it('marks source as fallback (not llm)', () => {
    const { intent, state } = makeNousCampaign({ id: 'c1' })
    const ws = makeWorkspace([{ intent, state }])
    const p = fallbackProjection({
      intent,
      state,
      workspace: ws,
      zoom: 'overview',
    })
    expect(p.source).toBe('fallback')
  })
})

// ─── generateProjection (engine) ───────────────────────────────────────────

describe('generateProjection — plugin selection', () => {
  it('falls back when no plugin is registered for the kind', async () => {
    const { intent, state } = makeNousCampaign({ id: 'c1' })
    const ws = makeWorkspace([{ intent, state }])
    const llm = makeMockLLM('SHOULD NOT BE CALLED')
    const p = await generateProjection({
      intent,
      state,
      workspace: ws,
      zoom: 'structure',
      plugins: {}, // empty registry
      llm,
    })
    expect(p.source).toBe('fallback')
    expect(llm.calls.length).toBe(0)
  })

  it('falls back when the plugin lacks a method for the requested zoom', async () => {
    const { intent, state } = makeNousCampaign({ id: 'c1' })
    const ws = makeWorkspace([{ intent, state }])
    const llm = makeMockLLM('SHOULD NOT BE CALLED')
    const onlyStructurePlugin: KindProjectionPlugin = {
      kind: 'nous-campaign',
      structure: async (_ctx) => ({
        content: 'structure-zoom prose',
        source: 'llm',
      }),
      // detail intentionally missing
    }
    const p = await generateProjection({
      intent,
      state,
      workspace: ws,
      zoom: 'detail',
      plugins: { 'nous-campaign': onlyStructurePlugin },
      llm,
    })
    expect(p.source).toBe('fallback')
    expect(llm.calls.length).toBe(0)
  })

  it('falls back at overview zoom even when a plugin is registered (overview is structural)', async () => {
    // Per the matrix framing: overview is the Map scan surface; LLM at
    // overview slows first paint without changing scan semantics. The
    // engine doesn't dispatch overview to plugins in v0.1.
    const { intent, state } = makeNousCampaign({ id: 'c1' })
    const ws = makeWorkspace([{ intent, state }])
    const llm = makeMockLLM('SHOULD NOT BE CALLED')
    const plugin: KindProjectionPlugin = {
      kind: 'nous-campaign',
      structure: async () => ({ content: 's', source: 'llm' }),
      detail: async () => ({ content: 'd', source: 'llm' }),
    }
    const p = await generateProjection({
      intent,
      state,
      workspace: ws,
      zoom: 'overview',
      plugins: { 'nous-campaign': plugin },
      llm,
    })
    expect(p.source).toBe('fallback')
    expect(llm.calls.length).toBe(0)
  })

  it('dispatches to the structure plugin method when available', async () => {
    const { intent, state } = makeNousCampaign({ id: 'c1' })
    const ws = makeWorkspace([{ intent, state }])
    const llm = makeMockLLM('campaign structure prose')
    const plugin: KindProjectionPlugin = {
      kind: 'nous-campaign',
      structure: async (ctx) => {
        const content = await ctx.llm.generate('test prompt')
        return { content, source: 'llm' }
      },
    }
    const p = await generateProjection({
      intent,
      state,
      workspace: ws,
      zoom: 'structure',
      plugins: { 'nous-campaign': plugin },
      llm,
    })
    expect(p.source).toBe('llm')
    expect(p.content).toBe('campaign structure prose')
    expect(llm.calls.length).toBe(1)
  })
})

// ─── Char budget enforcement ───────────────────────────────────────────────

describe('generateProjection — char budgets', () => {
  it('clamps structure projection to ≤800 chars even if plugin overshoots', async () => {
    const { intent, state } = makeNousCampaign({ id: 'c1' })
    const ws = makeWorkspace([{ intent, state }])
    const longText = 'x'.repeat(2000)
    const plugin: KindProjectionPlugin = {
      kind: 'nous-campaign',
      structure: async () => ({ content: longText, source: 'llm' }),
    }
    const p = await generateProjection({
      intent,
      state,
      workspace: ws,
      zoom: 'structure',
      plugins: { 'nous-campaign': plugin },
      llm: makeMockLLM(''),
    })
    expect(p.content.length).toBeLessThanOrEqual(800)
  })

  it('does not clamp detail projection (unbounded)', async () => {
    const { intent, state } = makeNousCampaign({ id: 'c1' })
    const ws = makeWorkspace([{ intent, state }])
    const longText = 'x'.repeat(5000)
    const plugin: KindProjectionPlugin = {
      kind: 'nous-campaign',
      detail: async () => ({ content: longText, source: 'llm' }),
    }
    const p = await generateProjection({
      intent,
      state,
      workspace: ws,
      zoom: 'detail',
      plugins: { 'nous-campaign': plugin },
      llm: makeMockLLM(''),
    })
    expect(p.content.length).toBe(5000)
  })

  it('appends an ellipsis when clamping for the user to see truncation', async () => {
    const { intent, state } = makeNousCampaign({ id: 'c1' })
    const ws = makeWorkspace([{ intent, state }])
    const plugin: KindProjectionPlugin = {
      kind: 'nous-campaign',
      structure: async () => ({ content: 'x'.repeat(2000), source: 'llm' }),
    }
    const p = await generateProjection({
      intent,
      state,
      workspace: ws,
      zoom: 'structure',
      plugins: { 'nous-campaign': plugin },
      llm: makeMockLLM(''),
    })
    expect(p.content.endsWith('…')).toBe(true)
  })
})

// ─── ProjectionContext bundle ──────────────────────────────────────────────

describe('ProjectionContext', () => {
  it('passes the intent, state, workspace, and llm to the plugin method', async () => {
    const { intent, state } = makeNousCampaign({ id: 'c1' })
    const ws = makeWorkspace([{ intent, state }])
    const llm = makeMockLLM('p')
    let captured: ProjectionContext | undefined
    const plugin: KindProjectionPlugin = {
      kind: 'nous-campaign',
      structure: async (ctx) => {
        captured = ctx
        return { content: 'x', source: 'llm' }
      },
    }
    await generateProjection({
      intent,
      state,
      workspace: ws,
      zoom: 'structure',
      plugins: { 'nous-campaign': plugin },
      llm,
    })
    expect(captured?.intent.id).toBe('c1')
    expect(captured?.state.intent_id).toBe('c1')
    expect(captured?.workspace).toBe(ws)
    expect(captured?.llm).toBe(llm)
  })
})

// ─── Error handling ────────────────────────────────────────────────────────

describe('generateProjection — errors', () => {
  it('falls back when the plugin throws', async () => {
    const { intent, state } = makeNousCampaign({ id: 'c1' })
    const ws = makeWorkspace([{ intent, state }])
    const plugin: KindProjectionPlugin = {
      kind: 'nous-campaign',
      structure: async () => {
        throw new Error('LLM call failed')
      },
    }
    const p = await generateProjection({
      intent,
      state,
      workspace: ws,
      zoom: 'structure',
      plugins: { 'nous-campaign': plugin },
      llm: makeMockLLM(''),
    })
    expect(p.source).toBe('fallback')
    // Errors don't propagate — chrome always renders something.
  })

  it('falls back when the LLM returns an empty string', async () => {
    const { intent, state } = makeNousCampaign({ id: 'c1' })
    const ws = makeWorkspace([{ intent, state }])
    const plugin: KindProjectionPlugin = {
      kind: 'nous-campaign',
      structure: async (ctx) => {
        const content = await ctx.llm.generate('p')
        return { content, source: 'llm' }
      },
    }
    const p = await generateProjection({
      intent,
      state,
      workspace: ws,
      zoom: 'structure',
      plugins: { 'nous-campaign': plugin },
      llm: makeMockLLM(''), // empty response
    })
    expect(p.source).toBe('fallback')
  })
})
