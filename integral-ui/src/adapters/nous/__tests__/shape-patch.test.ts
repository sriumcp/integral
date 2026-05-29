/**
 * Shape patch — partial updates the LLM emits during the shaping
 * conversation. The browser merges patches into the in-memory draft
 * Intent + writeback config, so the form auto-fills as the LLM extracts
 * fields from the user's natural-language prompts.
 *
 * Discipline:
 *  - Pure function. No fs, no network, no LLM. Tests prove the merge
 *    semantics independently of the LLM that produces the patches.
 *  - Patches are *additive only* in v0.1 — they fill empty fields and
 *    overwrite existing ones, but never remove fields. Removal would
 *    require explicit user gesture (clicking a field + deleting), not
 *    LLM action, to keep the LLM safe by default.
 *  - The patch shape is constrained: only declaration / extension /
 *    tags fields the user could plausibly want shaped, plus the
 *    writeback config. The LLM cannot patch holder, lifetime,
 *    provenance, schema_version, etc.
 */

import { describe, expect, it } from 'vitest'
import type { Intent } from '@/schema'
import { applyShapePatch, type DraftState } from '../shape-patch'

const PROJECTOR = {
  id: 'nous-projector',
  kind: 'agent' as const,
  display_name: 'nous-projector',
}

function blankNousDraft(): Intent {
  return {
    id: 'draft-test-001',
    schema_version: '0.2.0',
    kind: 'nous-campaign',
    declaration: { title: '', summary: '', success_criterion: '' },
    holder: { mode: 'jointly-held', parties: [PROJECTOR] },
    lifetime: { kind: 'campaign', started_at: '2026-05-23T20:00:00Z' },
    decomposition: { children: [] },
    provenance: {
      declared_by: PROJECTOR,
      declared_at: '2026-05-23T20:00:00Z',
      motivated_by: [],
      source: 'fixture',
    },
    knowledge_refs: [],
    tags: [],
    state_ref: 'draft-test-001-STATE',
    extension: {
      kind: 'nous-campaign',
      research_question: '',
      open_hypothesis_bundles: [],
      gate_status: { current_gate: 'design' },
    },
  }
}

function blankDraftState(): DraftState {
  return {
    intent: blankNousDraft(),
    writeback: {
      max_iterations: 5,
      target_system: { name: '', description: '', repo_path: '' },
    },
  }
}

// ─── Declaration patches ───────────────────────────────────────────────────

describe('applyShapePatch — declaration', () => {
  it('fills declaration.title from a patch', () => {
    const result = applyShapePatch(blankDraftState(), {
      intent: { declaration: { title: 'Plateau study' } },
    })
    expect(result.intent.declaration.title).toBe('Plateau study')
  })

  it('fills declaration.summary', () => {
    const result = applyShapePatch(blankDraftState(), {
      intent: { declaration: { summary: 'A short summary.' } },
    })
    expect(result.intent.declaration.summary).toBe('A short summary.')
  })

  it('fills declaration.success_criterion', () => {
    const result = applyShapePatch(blankDraftState(), {
      intent: { declaration: { success_criterion: 'Document the regimes.' } },
    })
    expect(result.intent.declaration.success_criterion).toBe(
      'Document the regimes.'
    )
  })

  it('preserves existing declaration fields when patch is partial', () => {
    const start = blankDraftState()
    start.intent.declaration.title = 'Already set'
    const result = applyShapePatch(start, {
      intent: { declaration: { summary: 'New summary' } },
    })
    expect(result.intent.declaration.title).toBe('Already set')
    expect(result.intent.declaration.summary).toBe('New summary')
  })

  it('overwrites existing declaration fields when a non-empty patch arrives', () => {
    const start = blankDraftState()
    start.intent.declaration.title = 'Old'
    const result = applyShapePatch(start, {
      intent: { declaration: { title: 'New' } },
    })
    expect(result.intent.declaration.title).toBe('New')
  })

  it('does not overwrite when a patch field is undefined', () => {
    const start = blankDraftState()
    start.intent.declaration.title = 'Keep'
    const result = applyShapePatch(start, {
      intent: { declaration: { summary: 'Set' } },
    })
    expect(result.intent.declaration.title).toBe('Keep')
  })
})

// ─── Extension patches (Nous-specific: research_question) ──────────────────

describe('applyShapePatch — nous-campaign extension', () => {
  it('fills extension.research_question', () => {
    const result = applyShapePatch(blankDraftState(), {
      intent: {
        extension: { research_question: 'Why does X plateau under Y?' },
      },
    })
    if (result.intent.extension.kind === 'nous-campaign') {
      expect(result.intent.extension.research_question).toBe(
        'Why does X plateau under Y?'
      )
    }
  })

  it('preserves other extension fields when the patch is partial', () => {
    const start = blankDraftState()
    if (start.intent.extension.kind === 'nous-campaign') {
      start.intent.extension.research_question = 'Original'
    }
    const result = applyShapePatch(start, {
      intent: { declaration: { title: 'T' } },
    })
    if (result.intent.extension.kind === 'nous-campaign') {
      expect(result.intent.extension.research_question).toBe('Original')
    }
  })
})

// ─── Tags patches ──────────────────────────────────────────────────────────

describe('applyShapePatch — tags', () => {
  it('replaces tags with the patch (replace, not merge)', () => {
    const start = blankDraftState()
    start.intent.tags = ['old']
    const result = applyShapePatch(start, {
      intent: { tags: ['new', 'tags'] },
    })
    expect(result.intent.tags).toEqual(['new', 'tags'])
  })

  it('preserves existing tags when patch.tags is undefined', () => {
    const start = blankDraftState()
    start.intent.tags = ['keep']
    const result = applyShapePatch(start, {
      intent: { declaration: { title: 't' } },
    })
    expect(result.intent.tags).toEqual(['keep'])
  })
})

// ─── Writeback config patches ──────────────────────────────────────────────

describe('applyShapePatch — writeback', () => {
  it('fills writeback.max_iterations', () => {
    const result = applyShapePatch(blankDraftState(), {
      writeback: { max_iterations: 8 },
    })
    expect(result.writeback.max_iterations).toBe(8)
  })

  it('fills target_system fields individually', () => {
    const result = applyShapePatch(blankDraftState(), {
      writeback: {
        target_system: { name: 'inference-sim' },
      },
    })
    expect(result.writeback.target_system.name).toBe('inference-sim')
    expect(result.writeback.target_system.description).toBe('') // unchanged
  })

  it('preserves writeback fields when patch.writeback is undefined', () => {
    const start = blankDraftState()
    start.writeback.max_iterations = 7
    const result = applyShapePatch(start, {
      intent: { declaration: { title: 't' } },
    })
    expect(result.writeback.max_iterations).toBe(7)
  })
})

// ─── Patch immutability ────────────────────────────────────────────────────

describe('applyShapePatch — immutability', () => {
  it('returns a new state object (does not mutate input)', () => {
    const start = blankDraftState()
    const result = applyShapePatch(start, {
      intent: { declaration: { title: 'NEW' } },
    })
    expect(result).not.toBe(start)
    expect(start.intent.declaration.title).toBe('') // unchanged
  })

  it('returns a new intent object (does not mutate input.intent)', () => {
    const start = blankDraftState()
    const result = applyShapePatch(start, {
      intent: { declaration: { title: 'NEW' } },
    })
    expect(result.intent).not.toBe(start.intent)
  })

  it('returns a new declaration object', () => {
    const start = blankDraftState()
    const result = applyShapePatch(start, {
      intent: { declaration: { title: 'NEW' } },
    })
    expect(result.intent.declaration).not.toBe(start.intent.declaration)
  })
})

// ─── Empty / null patch ────────────────────────────────────────────────────

describe('applyShapePatch — empty patches', () => {
  it('returns an equivalent state when patch is null', () => {
    const start = blankDraftState()
    const result = applyShapePatch(start, null)
    expect(result.intent.declaration.title).toBe(
      start.intent.declaration.title
    )
    expect(result.writeback).toEqual(start.writeback)
  })

  it('returns an equivalent state when patch is empty object', () => {
    const start = blankDraftState()
    const result = applyShapePatch(start, {})
    expect(result.intent.declaration.title).toBe(
      start.intent.declaration.title
    )
  })
})

// ─── Schema-clean behavior (does not let the LLM mutate forbidden fields) ──

describe('applyShapePatch — forbidden fields', () => {
  it('does not let the LLM patch intent.id', () => {
    const start = blankDraftState()
    const originalId = start.intent.id
    const result = applyShapePatch(
      start,
      // @ts-expect-error — `id` isn't in the patch type, but verify
      // the runtime applier ignores it even if a malformed payload arrives.
      { intent: { id: 'malicious-id' } }
    )
    expect(result.intent.id).toBe(originalId)
  })

  it('does not let the LLM patch intent.holder', () => {
    const start = blankDraftState()
    const result = applyShapePatch(
      start,
      // @ts-expect-error — see above
      { intent: { holder: { mode: 'agent-held', parties: [] } } }
    )
    expect(result.intent.holder).toEqual(start.intent.holder)
  })

  it('does not let the LLM patch intent.schema_version', () => {
    const start = blankDraftState()
    const result = applyShapePatch(
      start,
      // @ts-expect-error
      { intent: { schema_version: '9.9.9' } }
    )
    expect(result.intent.schema_version).toBe('0.2.0')
  })
})
