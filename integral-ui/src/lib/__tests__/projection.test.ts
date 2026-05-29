/**
 * Projection engine — kind-pluggable, indexed by (kind, zoom).
 *
 * v0.3.x ships a typed-evidence pipeline:
 *   plugin.evidence(ctx) → composer (LLM) → executor → lint → ExecutedProjection
 *
 * Discipline:
 *  - Engine is pure: takes plugins + LLMClient as injected deps. No
 *    network, no env reads, no API key handling here.
 *  - Fallback is the safety net. If a plugin is missing, evidence-building
 *    throws, the LLM round-trip fails twice, the executor errors, OR lint
 *    rejects the prose → fall back to a deterministic raw-fields projection.
 *  - Tests never call real LLMs. Mock LLMs are injected via ProjectionContext.
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
import type { ProjectionSpec, TypedEvidence } from '../projection/spec'

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

const TINY_EVIDENCE: TypedEvidence = {
  datasets: [
    {
      name: 'iters',
      schema: { columns: [{ name: 'i', type: 'number' }] },
      rows: [{ i: 1 }, { i: 2 }, { i: 3 }],
      source_ref: { file: 'test' },
    },
  ],
  excerpts: [
    { id: 'rq', text: 'Test question', kind: 'paragraph', source_ref: { file: 'test' } },
  ],
  files_seen: [],
  fingerprint: 'test-fp',
}

const VALID_SPEC: ProjectionSpec = {
  spec_version: '1',
  figures: [],
  scalars: [{ op: 'count', id: 'n', dataset: 'iters', column: 'i' }],
  prose_template: '{scalar:n} iterations. RQ: {excerpt:rq}',
}

// Mock LLM that returns the given JSON string verbatim.
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

function makeEvidencePlugin(opts: {
  evidence?: TypedEvidence | (() => TypedEvidence | Promise<TypedEvidence>)
  evidenceThrows?: boolean
} = {}): KindProjectionPlugin {
  return {
    kind: 'nous-campaign',
    async evidence(_ctx: ProjectionContext): Promise<TypedEvidence> {
      if (opts.evidenceThrows) throw new Error('boom')
      const e = opts.evidence ?? TINY_EVIDENCE
      return typeof e === 'function' ? await e() : e
    },
    intentSummary() {
      return 'Nous campaign: Test'
    },
  }
}

// ─── Fallback ──────────────────────────────────────────────────────────────

describe('fallbackProjection', () => {
  it('returns ExecutedProjection shape with empty figures + raw-field prose', () => {
    const { intent, state } = makeNousCampaign({ id: 'c1' })
    const ws = makeWorkspace([{ intent, state }])
    const p = fallbackProjection({ intent, state, workspace: ws, zoom: 'structure' })
    expect(p.source).toBe('fallback')
    expect(p.figures).toEqual([])
    expect(p.prose).toContain('Test campaign')
    expect(p.spec_version).toBe('1')
  })
})

// ─── generateProjection ────────────────────────────────────────────────────

describe('generateProjection — happy path', () => {
  it('runs plugin.evidence → composer → executor → lint and returns ExecutedProjection', async () => {
    const { intent, state } = makeNousCampaign({ id: 'c1' })
    const ws = makeWorkspace([{ intent, state }])
    const llm = makeMockLLM(JSON.stringify(VALID_SPEC))
    const plugin = makeEvidencePlugin()
    const p = await generateProjection({
      intent, state, workspace: ws, zoom: 'structure',
      plugins: { 'nous-campaign': plugin }, llm,
    })
    expect(p.source).toBe('llm')
    expect(p.quoted_numerics.n).toBe(3)
    expect(p.prose).toContain('3 iterations')
    expect(p.prose).toContain('Test question')
    expect(llm.calls.length).toBe(1)
  })

  it('returns fallback at overview zoom even with a plugin registered', async () => {
    const { intent, state } = makeNousCampaign({ id: 'c1' })
    const ws = makeWorkspace([{ intent, state }])
    const llm = makeMockLLM('SHOULD NOT BE CALLED')
    const plugin = makeEvidencePlugin()
    const p = await generateProjection({
      intent, state, workspace: ws, zoom: 'overview',
      plugins: { 'nous-campaign': plugin }, llm,
    })
    expect(p.source).toBe('fallback')
    expect(llm.calls.length).toBe(0)
  })

  it('falls back when no plugin registered for kind (no LLM call)', async () => {
    const { intent, state } = makeNousCampaign({ id: 'c1' })
    const ws = makeWorkspace([{ intent, state }])
    const llm = makeMockLLM('SHOULD NOT BE CALLED')
    const p = await generateProjection({
      intent, state, workspace: ws, zoom: 'structure',
      plugins: {}, llm,
    })
    expect(p.source).toBe('fallback')
    expect(llm.calls.length).toBe(0)
  })
})

describe('generateProjection — error paths', () => {
  it('falls back when evidence() throws', async () => {
    const { intent, state } = makeNousCampaign({ id: 'c1' })
    const ws = makeWorkspace([{ intent, state }])
    const plugin = makeEvidencePlugin({ evidenceThrows: true })
    const p = await generateProjection({
      intent, state, workspace: ws, zoom: 'structure',
      plugins: { 'nous-campaign': plugin },
      llm: makeMockLLM(JSON.stringify(VALID_SPEC)),
    })
    expect(p.source).toBe('fallback')
  })

  it('falls back when LLM returns malformed JSON twice (composer retry exhausted)', async () => {
    const { intent, state } = makeNousCampaign({ id: 'c1' })
    const ws = makeWorkspace([{ intent, state }])
    const llm = makeMockLLM('not json at all')
    const plugin = makeEvidencePlugin()
    const p = await generateProjection({
      intent, state, workspace: ws, zoom: 'structure',
      plugins: { 'nous-campaign': plugin }, llm,
    })
    expect(p.source).toBe('fallback')
  })

  it('falls back when prose has unsourced digits (lint reject)', async () => {
    const { intent, state } = makeNousCampaign({ id: 'c1' })
    const ws = makeWorkspace([{ intent, state }])
    // LLM emits a spec whose prose template hardcodes a number not in scalars.
    const sneakySpec: ProjectionSpec = {
      spec_version: '1',
      figures: [],
      scalars: [{ op: 'count', id: 'n', dataset: 'iters', column: 'i' }],
      prose_template: '{scalar:n} iterations completed in 2025.',
    }
    const llm = makeMockLLM(JSON.stringify(sneakySpec))
    const plugin = makeEvidencePlugin()
    const p = await generateProjection({
      intent, state, workspace: ws, zoom: 'structure',
      plugins: { 'nous-campaign': plugin }, llm,
    })
    expect(p.source).toBe('fallback')
  })

  it('accepts digits that came from substituted excerpt text (provenance via excerpt)', async () => {
    const { intent, state } = makeNousCampaign({ id: 'c1' })
    const ws = makeWorkspace([{ intent, state }])
    // Evidence: a single excerpt containing a digit ("6,400 result JSONs").
    const evidenceWithDigitExcerpt: TypedEvidence = {
      ...TINY_EVIDENCE,
      excerpts: [
        { id: 'overview', text: 'Repo holds the 6,400 result JSONs from the run.', kind: 'paragraph', source_ref: { file: 'README.md' } },
      ],
    }
    const plugin: KindProjectionPlugin = {
      kind: 'nous-campaign',
      async evidence() { return evidenceWithDigitExcerpt },
      intentSummary() { return 'X' },
    }
    const spec: ProjectionSpec = {
      spec_version: '1',
      figures: [],
      scalars: [],
      // The literal "6,400" in the rendered prose came from the
      // substituted excerpt; the lint should accept it.
      prose_template: 'Per the README: {excerpt:overview}',
    }
    const llm = makeMockLLM(JSON.stringify(spec))
    const p = await generateProjection({
      intent, state, workspace: ws, zoom: 'structure',
      plugins: { 'nous-campaign': plugin }, llm,
    })
    expect(p.source).toBe('llm')
    expect(p.prose).toContain('6,400')
  })

  it('falls back when executor cannot find a referenced dataset', async () => {
    const { intent, state } = makeNousCampaign({ id: 'c1' })
    const ws = makeWorkspace([{ intent, state }])
    const badSpec: ProjectionSpec = {
      spec_version: '1',
      figures: [],
      // composer pre-execution check should catch this before executor;
      // either way, we should fall back without throwing.
      scalars: [{ op: 'count', id: 'n', dataset: 'phantom', column: 'x' }],
      prose_template: '{scalar:n}.',
    }
    const llm = makeMockLLM(JSON.stringify(badSpec))
    const plugin = makeEvidencePlugin()
    const p = await generateProjection({
      intent, state, workspace: ws, zoom: 'structure',
      plugins: { 'nous-campaign': plugin }, llm,
    })
    expect(p.source).toBe('fallback')
  })
})

describe('generateProjection — pipeline contract', () => {
  it('records the model name passed in', async () => {
    const { intent, state } = makeNousCampaign({ id: 'c1' })
    const ws = makeWorkspace([{ intent, state }])
    const p = await generateProjection({
      intent, state, workspace: ws, zoom: 'structure',
      plugins: { 'nous-campaign': makeEvidencePlugin() },
      llm: makeMockLLM(JSON.stringify(VALID_SPEC)),
      model: 'mock-model-1',
    })
    expect(p.model).toBe('mock-model-1')
  })

  it('passes the typed evidence fingerprint through to the executed projection', async () => {
    const { intent, state } = makeNousCampaign({ id: 'c1' })
    const ws = makeWorkspace([{ intent, state }])
    const p = await generateProjection({
      intent, state, workspace: ws, zoom: 'structure',
      plugins: { 'nous-campaign': makeEvidencePlugin() },
      llm: makeMockLLM(JSON.stringify(VALID_SPEC)),
    })
    expect(p.evidence_fingerprint).toBe('test-fp')
  })
})
