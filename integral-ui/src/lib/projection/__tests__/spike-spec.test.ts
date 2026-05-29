/**
 * Phase 0 falsification gate.
 *
 * This test exercises the deterministic spine end-to-end on synthetic
 * data:
 *   1. Fixed TypedEvidence (a tiny ledger + an excerpt)
 *   2. Hand-authored ProjectionSpec (figure, scalars, prose template)
 *   3. executeSpec → ExecutedProjection (figure data, quoted numerics, prose)
 *   4. lintProse → must accept the rendered prose
 *   5. Inject an unsourced numeric → lint must reject
 *   6. Plot must render the figure data without crashing in jsdom
 *   7. Round-trip through JSON must preserve structure
 *
 * If any of these break, the architecture is wrong; STOP and revise.
 */

import * as Plot from '@observablehq/plot'
import { describe, expect, it } from 'vitest'
import { executeSpec } from '../executor'
import { lintProse } from '../lint'
import {
  ExecutedProjectionSchema,
  ProjectionSpecSchema,
  TypedEvidenceSchema,
  type ProjectionSpec,
  type TypedEvidence,
} from '../spec'

const evidence: TypedEvidence = {
  datasets: [
    {
      name: 'ledger',
      schema: {
        columns: [
          { name: 'iter', type: 'number' },
          { name: 'attempt', type: 'string' },
          { name: 'score', type: 'number' },
          { name: 'cost', type: 'number' },
        ],
      },
      rows: [
        { iter: 1, attempt: 'a1', score: 0.12, cost: 100 },
        { iter: 1, attempt: 'a2', score: 0.18, cost: 110 },
        { iter: 2, attempt: 'a3', score: 0.34, cost: 95 },
        { iter: 3, attempt: 'a4', score: 0.41, cost: 88 },
        { iter: 3, attempt: 'a5', score: 0.55, cost: 92 },
      ],
      source_ref: { file: 'ledger.json' },
    },
  ],
  excerpts: [
    {
      id: 'rq',
      text: 'How does cost interact with score across iterations?',
      kind: 'paragraph',
      source_ref: { file: 'README.md', line_start: 3, line_end: 3 },
    },
  ],
  files_seen: [
    { file: 'ledger.json' },
    { file: 'README.md' },
  ],
  fingerprint: 'spike-test-deterministic',
}

const spec: ProjectionSpec = {
  spec_version: '1',
  figures: [
    {
      id: 'score-trend',
      title: 'Best score per iteration',
      caption: 'Best score climbed from {scalar:first_score} to {scalar:best_score}.',
      dataset: 'ledger',
      transform: [
        {
          op: 'group_by',
          columns: ['iter'],
          aggregate: { score: 'max' },
        },
        { op: 'sort', column: 'iter', order: 'asc' },
      ],
      mark: { type: 'line' },
      encodings: { x: 'iter', y: 'score' },
      emit_empty: false,
    },
  ],
  scalars: [
    { op: 'max', id: 'best_score', dataset: 'ledger', column: 'score' },
    {
      op: 'argmax',
      id: 'best_iter',
      dataset: 'ledger',
      rank_by: 'score',
      return: 'iter',
    },
    {
      op: 'first',
      id: 'first_score',
      dataset: 'ledger',
      column: 'score',
      sort_by: 'iter',
      sort_order: 'asc',
    },
    { op: 'count', id: 'n_attempts', dataset: 'ledger', column: 'attempt' },
    {
      op: 'first',
      id: 'first_iter',
      dataset: 'ledger',
      column: 'iter',
      sort_by: 'iter',
      sort_order: 'asc',
    },
  ],
  // Every digit in the rendered prose must come from a quoted_numeric.
  // Even literals like "iteration 1" must be sourced via {scalar:...}.
  prose_template:
    'Across {scalar:n_attempts} attempts, the best score climbed from {scalar:first_score} ' +
    'at iteration {scalar:first_iter} to {scalar:best_score} by iteration {scalar:best_iter}. ' +
    'Research question: {excerpt:rq}',
}

describe('Phase 0 spike — spec/executor/lint/render', () => {
  it('schemas accept the synthetic evidence + spec', () => {
    expect(TypedEvidenceSchema.safeParse(evidence).success).toBe(true)
    const parsed = ProjectionSpecSchema.safeParse(spec)
    if (!parsed.success) throw new Error(JSON.stringify(parsed.error.issues, null, 2))
  })

  it('executor produces the expected figure data', () => {
    const executed = executeSpec(spec, evidence, {
      now: () => '2026-05-29T00:00:00Z',
    })
    expect(executed.figures).toHaveLength(1)
    const fig = executed.figures[0]!
    expect(fig.id).toBe('score-trend')
    expect(fig.data).toEqual([
      { iter: 1, score: 0.18 },
      { iter: 2, score: 0.34 },
      { iter: 3, score: 0.55 },
    ])
  })

  it('executor computes scalars from typed data only', () => {
    const executed = executeSpec(spec, evidence, {
      now: () => '2026-05-29T00:00:00Z',
    })
    expect(executed.quoted_numerics.best_score).toBe(0.55)
    expect(executed.quoted_numerics.best_iter).toBe(3)
    expect(executed.quoted_numerics.first_score).toBe(0.12)
    expect(executed.quoted_numerics.n_attempts).toBe(5)
  })

  it('substitutes scalars + excerpts into prose verbatim', () => {
    const executed = executeSpec(spec, evidence, {
      now: () => '2026-05-29T00:00:00Z',
    })
    expect(executed.prose).toContain('5 attempts')
    expect(executed.prose).toContain('0.12')
    expect(executed.prose).toContain('0.55')
    expect(executed.prose).toContain('iteration 3')
    expect(executed.prose).toContain('How does cost interact')
  })

  it('substitutes figure caption with same scalar registry', () => {
    const executed = executeSpec(spec, evidence, {
      now: () => '2026-05-29T00:00:00Z',
    })
    expect(executed.figures[0]!.caption_rendered).toBe(
      'Best score climbed from 0.12 to 0.55.'
    )
  })

  it('lint accepts prose where every digit is a quoted_numeric', () => {
    const executed = executeSpec(spec, evidence, {
      now: () => '2026-05-29T00:00:00Z',
    })
    const result = lintProse(executed.prose, executed.quoted_numerics)
    if (!result.ok) {
      throw new Error(`unexpected lint failure: ${result.offenders.join(', ')}`)
    }
    expect(result.ok).toBe(true)
  })

  it('lint rejects an injected unsourced numeric', () => {
    const executed = executeSpec(spec, evidence, {
      now: () => '2026-05-29T00:00:00Z',
    })
    const tampered = executed.prose.replace('5 attempts', '99 attempts')
    const result = lintProse(tampered, executed.quoted_numerics)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.offenders).toContain('99')
  })

  it('lint rejects a date-like number that wasnt requested as const_string', () => {
    const executed = executeSpec(spec, evidence, {
      now: () => '2026-05-29T00:00:00Z',
    })
    const tampered = executed.prose + ' Generated 2026.'
    const result = lintProse(tampered, executed.quoted_numerics)
    expect(result.ok).toBe(false)
  })

  it('Plot.plot renders the prepared figure in jsdom without crashing', () => {
    const executed = executeSpec(spec, evidence, {
      now: () => '2026-05-29T00:00:00Z',
    })
    const fig = executed.figures[0]!
    const x = fig.encodings.x ?? 'iter'
    const y = fig.encodings.y ?? 'score'
    const svg = Plot.plot({
      marks: [Plot.line(fig.data, { x, y })],
    })
    expect(svg).toBeDefined()
    expect((svg as unknown as Element).tagName.toLowerCase()).toMatch(/svg|figure/)
  })

  it('round-trips through JSON without information loss', () => {
    const executed = executeSpec(spec, evidence, {
      now: () => '2026-05-29T00:00:00Z',
    })
    const round = JSON.parse(JSON.stringify(executed))
    const reparsed = ExecutedProjectionSchema.safeParse(round)
    if (!reparsed.success) {
      throw new Error(JSON.stringify(reparsed.error.issues, null, 2))
    }
    expect(reparsed.data.prose).toBe(executed.prose)
    expect(reparsed.data.quoted_numerics).toEqual(executed.quoted_numerics)
  })

  it('drops empty figures by default and keeps non-empty ones', () => {
    const specWithEmpty: ProjectionSpec = {
      ...spec,
      figures: [
        spec.figures[0]!,
        {
          id: 'never',
          title: 'Empty',
          dataset: 'ledger',
          transform: [
            { op: 'filter', column: 'iter', predicate: { op: 'eq', value: 999 } },
          ],
          mark: { type: 'line' },
          encodings: { x: 'iter', y: 'score' },
          emit_empty: false,
        },
      ],
    }
    const executed = executeSpec(specWithEmpty, evidence, {
      now: () => '2026-05-29T00:00:00Z',
    })
    expect(executed.figures.map((f) => f.id)).toEqual(['score-trend'])
  })
})
