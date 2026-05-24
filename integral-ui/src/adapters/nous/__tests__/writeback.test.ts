/**
 * Nous writeback — serialize a typed Intent + adapter-private writeback
 * config into a `campaign.yaml` consumable by the Nous CLI.
 *
 * The writeback is the inverse of the Phase 1 read: read consumed YAML →
 * Intent (with lossy mappings recorded in gaps.md); write consumes Intent
 * + adapter-private fields → YAML. The `WritebackConfig` carries Nous
 * specifics (max_iterations, target_system) that the universal schema
 * doesn't model — keeping the schema clean while serving the harness.
 *
 * Discipline:
 *  - Pure function. No fs, no network. Tests serialize + parse the
 *    output back via the same `yaml` lib the read adapter uses, so a
 *    serializer regression that produces invalid YAML would surface.
 *  - Schema-validated config. NousWritebackConfigSchema rejects malformed
 *    input at the boundary (browser form → server endpoint).
 *  - Refuses overwrite at the file-system layer (covered by
 *    writeback-handler tests / smoke).
 */

import { describe, expect, it } from 'vitest'
import { parse as parseYaml } from 'yaml'
import type { Intent } from '@/schema'
import {
  NousWritebackConfigSchema,
  derivedRunId,
  serializeNousCampaign,
  type NousWritebackConfig,
} from '../writeback'

const PROJECTOR = {
  id: 'nous-projector',
  kind: 'agent' as const,
  display_name: 'nous-projector',
}

function makeNousDraft(opts?: {
  id?: string
  title?: string
  research_question?: string
}): Intent {
  return {
    id: opts?.id ?? '01HXYZ-DRAFT-NOUS-CAMPAIGN-001',
    schema_version: '0.1.0',
    kind: 'nous-campaign',
    declaration: {
      title: opts?.title ?? 'Evaluator-conditioning structural study',
      summary:
        'Investigate whether evaluator-conditioned mutations produce structurally different optimization paths than unconditioned ones.',
      success_criterion:
        'A documented set of regimes where evaluator-conditioning helps + corresponding refuted regimes.',
    },
    holder: { mode: 'jointly-held', parties: [PROJECTOR] },
    lifetime: { kind: 'campaign', started_at: '2026-05-22T16:00:00Z' },
    decomposition: { children: [] },
    provenance: {
      declared_by: PROJECTOR,
      declared_at: '2026-05-22T16:00:00Z',
      motivated_by: [],
      source: 'fixture',
    },
    knowledge_refs: [],
    tags: ['evaluator-conditioning'],
    state_ref: '01HXYZ-DRAFT-NOUS-CAMPAIGN-001-STATE',
    extension: {
      kind: 'nous-campaign',
      research_question:
        opts?.research_question ??
        'Do evaluator-conditioned mutations produce structurally different optimization trajectories?',
      open_hypothesis_bundles: [],
      gate_status: { current_gate: 'design' },
    },
  }
}

const VALID_CONFIG: NousWritebackConfig = {
  max_iterations: 5,
  target_system: {
    name: 'inference-sim',
    description:
      'Discrete-event LLM inference simulator with multi-tenant scheduling.',
    repo_path: '/Users/sri/Documents/Projects/inference-sim',
  },
}

// ─── NousWritebackConfigSchema ─────────────────────────────────────────────

describe('NousWritebackConfigSchema', () => {
  it('accepts a complete config', () => {
    const r = NousWritebackConfigSchema.safeParse(VALID_CONFIG)
    expect(r.success).toBe(true)
  })

  it('rejects missing max_iterations', () => {
    const { max_iterations: _drop, ...rest } = VALID_CONFIG
    void _drop
    const r = NousWritebackConfigSchema.safeParse(rest)
    expect(r.success).toBe(false)
  })

  it('rejects max_iterations <= 0', () => {
    const r = NousWritebackConfigSchema.safeParse({
      ...VALID_CONFIG,
      max_iterations: 0,
    })
    expect(r.success).toBe(false)
  })

  it('rejects missing target_system', () => {
    const { target_system: _drop, ...rest } = VALID_CONFIG
    void _drop
    const r = NousWritebackConfigSchema.safeParse(rest)
    expect(r.success).toBe(false)
  })

  it('rejects target_system with empty repo_path', () => {
    const r = NousWritebackConfigSchema.safeParse({
      ...VALID_CONFIG,
      target_system: { ...VALID_CONFIG.target_system, repo_path: '' },
    })
    expect(r.success).toBe(false)
  })

  it('rejects target_system with empty name', () => {
    const r = NousWritebackConfigSchema.safeParse({
      ...VALID_CONFIG,
      target_system: { ...VALID_CONFIG.target_system, name: '' },
    })
    expect(r.success).toBe(false)
  })
})

// ─── derivedRunId ──────────────────────────────────────────────────────────

describe('derivedRunId', () => {
  it('slugifies the title', () => {
    expect(derivedRunId('Evaluator-Conditioning Structural Study')).toBe(
      'evaluator-conditioning-structural-study'
    )
  })

  it('strips non-alphanumeric except dashes', () => {
    expect(derivedRunId("Plateau @ 71%! (deep dive)")).toBe(
      'plateau-71-deep-dive'
    )
  })

  it('collapses repeated dashes', () => {
    expect(derivedRunId('a -- b -- c')).toBe('a-b-c')
  })

  it('trims leading and trailing dashes', () => {
    expect(derivedRunId('--hello world--')).toBe('hello-world')
  })

  it('clamps to 64 chars', () => {
    const long = 'x'.repeat(200)
    const out = derivedRunId(long)
    expect(out.length).toBeLessThanOrEqual(64)
  })
})

// ─── serializeNousCampaign ─────────────────────────────────────────────────

describe('serializeNousCampaign', () => {
  it('produces YAML that round-trips through the parser', () => {
    const intent = makeNousDraft()
    const yaml = serializeNousCampaign(intent, VALID_CONFIG)
    const parsed = parseYaml(yaml)
    expect(parsed.research_question).toBeDefined()
    expect(parsed.max_iterations).toBe(5)
    expect(parsed.target_system).toBeDefined()
    expect(parsed.target_system.name).toBe('inference-sim')
  })

  it('embeds research_question from intent.extension', () => {
    const intent = makeNousDraft({
      research_question: 'Why does X plateau under Y?',
    })
    const yaml = serializeNousCampaign(intent, VALID_CONFIG)
    const parsed = parseYaml(yaml)
    expect(parsed.research_question).toBe('Why does X plateau under Y?')
  })

  it('embeds max_iterations from config', () => {
    const intent = makeNousDraft()
    const yaml = serializeNousCampaign(intent, {
      ...VALID_CONFIG,
      max_iterations: 12,
    })
    const parsed = parseYaml(yaml)
    expect(parsed.max_iterations).toBe(12)
  })

  it('embeds target_system block from config', () => {
    const intent = makeNousDraft()
    const yaml = serializeNousCampaign(intent, VALID_CONFIG)
    const parsed = parseYaml(yaml)
    expect(parsed.target_system.name).toBe('inference-sim')
    expect(parsed.target_system.description).toMatch(
      /Discrete-event LLM inference/
    )
    expect(parsed.target_system.repo_path).toBe(
      '/Users/sri/Documents/Projects/inference-sim'
    )
  })

  it('embeds run_id derived from intent title by default', () => {
    const intent = makeNousDraft({ title: 'Evaluator Conditioning Study' })
    const yaml = serializeNousCampaign(intent, VALID_CONFIG)
    const parsed = parseYaml(yaml)
    expect(parsed.run_id).toBe('evaluator-conditioning-study')
  })

  it('honors explicit run_id when provided in config', () => {
    const intent = makeNousDraft({ title: 'Evaluator Conditioning Study' })
    const yaml = serializeNousCampaign(intent, {
      ...VALID_CONFIG,
      run_id: 'custom-id',
    })
    const parsed = parseYaml(yaml)
    expect(parsed.run_id).toBe('custom-id')
  })

  it('throws when intent.kind is not nous-campaign', () => {
    const wrongKind = { ...makeNousDraft(), kind: 'coral-optimization' as const }
    expect(() =>
      serializeNousCampaign(wrongKind as unknown as Intent, VALID_CONFIG)
    ).toThrow(/nous-campaign/)
  })

  it('does not include observable_metrics or controllable_knobs by default (planner discovers)', () => {
    const intent = makeNousDraft()
    const yaml = serializeNousCampaign(intent, VALID_CONFIG)
    const parsed = parseYaml(yaml)
    expect(parsed.observable_metrics).toBeUndefined()
    expect(parsed.controllable_knobs).toBeUndefined()
  })

  it('includes observable_metrics when provided in config', () => {
    const intent = makeNousDraft()
    const yaml = serializeNousCampaign(intent, {
      ...VALID_CONFIG,
      observable_metrics: ['ttft_p99', 'completion_rate_critical'],
    })
    const parsed = parseYaml(yaml)
    expect(parsed.observable_metrics).toEqual([
      'ttft_p99',
      'completion_rate_critical',
    ])
  })

  it('includes controllable_knobs when provided in config', () => {
    const intent = makeNousDraft()
    const yaml = serializeNousCampaign(intent, {
      ...VALID_CONFIG,
      controllable_knobs: ['scheduler_policy', 'admission_threshold'],
    })
    const parsed = parseYaml(yaml)
    expect(parsed.controllable_knobs).toEqual([
      'scheduler_policy',
      'admission_threshold',
    ])
  })

  it('preserves the research_question intact (no truncation, no reformatting)', () => {
    const long = 'A'.repeat(500) + ' a longer question with details'
    const intent = makeNousDraft({ research_question: long })
    const yaml = serializeNousCampaign(intent, VALID_CONFIG)
    const parsed = parseYaml(yaml)
    expect(parsed.research_question).toBe(long)
  })
})
