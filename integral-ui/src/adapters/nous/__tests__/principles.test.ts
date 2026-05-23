/**
 * Nous adapter — principles.json parsing + KnowledgeRef synthesis (Phase 3).
 *
 * Reads `.nous/<run>/principles.json` and produces typed `KnowledgeRef[]`
 * attached to the campaign + each iteration that emitted them.
 *
 * Discipline: synthetic JSON only. v0.1 lossy mapping per gaps.md G-N-2:
 * the rich principle structure (confidence/regime/mechanism/applicability_bounds/
 * evidence/contradicts/superseded_by/category/status) collapses to a
 * `KnowledgeRef` carrying only `uri/role/scope`. The structure is a v0.2
 * promotion candidate.
 */

import { describe, expect, it } from 'vitest'
import { KnowledgeRefSchema } from '@/schema'
import {
  interpretPrinciplesAsKnowledgeRefs,
  parsePrinciples,
  principleUri,
  type PrincipleEntry,
} from '../principles'

const SAMPLE_JSON = JSON.stringify({
  principles: [
    {
      id: 'RP-1',
      statement: 'a principle',
      confidence: 'high',
      extraction_iteration: 1,
      status: 'active',
    },
    {
      id: 'RP-2',
      statement: 'another principle',
      confidence: 'medium',
      extraction_iteration: 2,
      status: 'active',
    },
    {
      id: 'RP-3',
      statement: 'third principle',
      confidence: 'low',
      extraction_iteration: 2,
      status: 'superseded',
    },
  ],
})

// ─── parsePrinciples ───────────────────────────────────────────────────────
describe('parsePrinciples', () => {
  it('returns the principles array from a well-formed file', () => {
    const entries = parsePrinciples(SAMPLE_JSON)
    expect(entries.length).toBe(3)
    expect(entries[0]?.id).toBe('RP-1')
    expect(entries[1]?.extraction_iteration).toBe(2)
  })

  it('returns [] when JSON is malformed', () => {
    expect(parsePrinciples('@@ not json @@')).toEqual([])
  })

  it('returns [] when the parsed value is not an object', () => {
    expect(parsePrinciples('null')).toEqual([])
    expect(parsePrinciples('"a string"')).toEqual([])
    expect(parsePrinciples('42')).toEqual([])
  })

  it('returns [] when there is no principles array', () => {
    expect(parsePrinciples(JSON.stringify({}))).toEqual([])
    expect(parsePrinciples(JSON.stringify({ principles: 'oops' }))).toEqual([])
  })

  it('skips entries that are not objects', () => {
    const json = JSON.stringify({
      principles: [
        { id: 'RP-1', extraction_iteration: 1 },
        null,
        'not an entry',
        42,
        { id: 'RP-2', extraction_iteration: 2 },
      ],
    })
    const entries = parsePrinciples(json)
    expect(entries.length).toBe(2)
    expect(entries.map((e) => e.id)).toEqual(['RP-1', 'RP-2'])
  })

  it('drops entries with missing or malformed required fields', () => {
    const json = JSON.stringify({
      principles: [
        { /* no id */ extraction_iteration: 1 },
        { id: 'RP-2' /* no extraction_iteration */ },
        { id: 'RP-3', extraction_iteration: 'not-a-number' },
        { id: 'RP-4', extraction_iteration: 1 }, // valid
      ],
    })
    const entries = parsePrinciples(json)
    expect(entries.length).toBe(1)
    expect(entries[0]?.id).toBe('RP-4')
  })

  it('preserves status when present', () => {
    const entries = parsePrinciples(SAMPLE_JSON)
    expect(entries[2]?.status).toBe('superseded')
  })
})

// ─── principleUri ──────────────────────────────────────────────────────────
describe('principleUri', () => {
  it('produces a stable scheme:run/id URI', () => {
    expect(principleUri('best-of-field', 'RP-4')).toBe(
      'nous-principle://best-of-field/RP-4'
    )
  })

  it('handles run ids with dashes and slashes-safe characters', () => {
    expect(principleUri('run-with-dashes', 'RP-12')).toBe(
      'nous-principle://run-with-dashes/RP-12'
    )
  })
})

// ─── interpretPrinciplesAsKnowledgeRefs ────────────────────────────────────
const PARSED_PRINCIPLES: PrincipleEntry[] = [
  { id: 'RP-1', extraction_iteration: 1 },
  { id: 'RP-2', extraction_iteration: 2 },
  { id: 'RP-3', extraction_iteration: 2 },
  { id: 'RP-4', extraction_iteration: 0 }, // synthetic: no iteration owns iter-0
]

describe('interpretPrinciplesAsKnowledgeRefs', () => {
  it('emits one campaign-scoped KnowledgeRef per principle', () => {
    const result = interpretPrinciplesAsKnowledgeRefs(
      PARSED_PRINCIPLES,
      'best-of-field'
    )
    expect(result.campaignRefs.length).toBe(4)
    for (const ref of result.campaignRefs) {
      const parsed = KnowledgeRefSchema.safeParse(ref)
      if (!parsed.success) {
        throw new Error(
          'campaign ref rejected: ' +
            JSON.stringify(parsed.error.issues, null, 2)
        )
      }
      expect(ref.scope).toBe('campaign')
      expect(ref.role).toBe('principles')
    }
  })

  it('groups iteration-scoped refs by extraction_iteration', () => {
    const result = interpretPrinciplesAsKnowledgeRefs(
      PARSED_PRINCIPLES,
      'best-of-field'
    )
    expect(result.iterationRefsByIter.get(1)?.length).toBe(1)
    expect(result.iterationRefsByIter.get(2)?.length).toBe(2)
    // Iteration 0 is the synthetic baseline, so its principles still get
    // grouped — the interpreter is the one that decides whether to attach
    // them to anything (it filters baseline iterations upstream).
    expect(result.iterationRefsByIter.get(0)?.length).toBe(1)
  })

  it('iteration-scoped refs validate against KnowledgeRefSchema', () => {
    const result = interpretPrinciplesAsKnowledgeRefs(
      PARSED_PRINCIPLES,
      'best-of-field'
    )
    for (const refs of result.iterationRefsByIter.values()) {
      for (const ref of refs) {
        const parsed = KnowledgeRefSchema.safeParse(ref)
        if (!parsed.success) {
          throw new Error(
            'iteration ref rejected: ' +
              JSON.stringify(parsed.error.issues, null, 2)
          )
        }
        expect(ref.scope).toBe('iteration')
        expect(ref.role).toBe('principles')
      }
    }
  })

  it('produces stable URIs that match principleUri output', () => {
    const result = interpretPrinciplesAsKnowledgeRefs(
      PARSED_PRINCIPLES,
      'best-of-field'
    )
    const uris = new Set(result.campaignRefs.map((r) => r.uri))
    expect(uris.has(principleUri('best-of-field', 'RP-1'))).toBe(true)
    expect(uris.has(principleUri('best-of-field', 'RP-4'))).toBe(true)
  })

  it('handles an empty principles list without crashing', () => {
    const result = interpretPrinciplesAsKnowledgeRefs([], 'best-of-field')
    expect(result.campaignRefs).toEqual([])
    expect(result.iterationRefsByIter.size).toBe(0)
  })

  it('every emitted ref has version="v0.1-lossy" so future ingestions can tell the lossy mapping was applied', () => {
    // This is the marker that records "we dropped the rich structure"
    // mechanically — the version field doubles as the lossy-mapping signal
    // until G-N-2 is promoted. If a future v0.2 adapter emits richer
    // KnowledgeRefs, it can use a different version string.
    const result = interpretPrinciplesAsKnowledgeRefs(
      PARSED_PRINCIPLES,
      'best-of-field'
    )
    for (const ref of result.campaignRefs) {
      expect(ref.version).toBe('v0.1-lossy')
    }
  })
})
