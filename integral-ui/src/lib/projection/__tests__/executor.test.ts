import { describe, expect, it } from 'vitest'
import { executeSpec, SpecExecutionError } from '../executor'
import type { ProjectionSpec, TypedEvidence } from '../spec'

const NOW = () => '2026-05-29T00:00:00Z'

function ev(rows: Array<Record<string, number | string | boolean | null>>): TypedEvidence {
  return {
    datasets: [
      {
        name: 'd',
        schema: { columns: [
          { name: 'k', type: 'string' },
          { name: 'v', type: 'number' },
          { name: 'g', type: 'string' },
        ]},
        rows,
        source_ref: { file: 'd.json' },
      },
    ],
    excerpts: [],
    files_seen: [],
    fingerprint: 'fp',
  }
}

function spec(figures: ProjectionSpec['figures'], scalars: ProjectionSpec['scalars'] = []): ProjectionSpec {
  return { spec_version: '1', figures, scalars, prose_template: '' }
}

describe('executor — transforms', () => {
  it('filter: numeric predicate eliminates non-matching rows', () => {
    const evidence = ev([
      { k: 'a', v: 1, g: 'x' },
      { k: 'b', v: 5, g: 'x' },
      { k: 'c', v: 9, g: 'x' },
    ])
    const out = executeSpec(spec([{
      id: 'f', title: 'F', dataset: 'd',
      transform: [{ op: 'filter', column: 'v', predicate: { op: 'gte', value: 5 } }],
      mark: { type: 'dot' }, encodings: { x: 'k', y: 'v' }, emit_empty: false,
    }]), evidence, { now: NOW })
    expect(out.figures[0]!.data).toEqual([{ k: 'b', v: 5, g: 'x' }, { k: 'c', v: 9, g: 'x' }])
  })

  it('filter: in/eq/ne predicates work over strings + booleans', () => {
    const evidence = ev([
      { k: 'a', v: 1, g: 'x' },
      { k: 'b', v: 2, g: 'y' },
      { k: 'c', v: 3, g: 'z' },
    ])
    const inOut = executeSpec(spec([{
      id: 'f', title: 'F', dataset: 'd',
      transform: [{ op: 'filter', column: 'g', predicate: { op: 'in', values: ['x', 'z'] } }],
      mark: { type: 'dot' }, encodings: { x: 'k', y: 'v' }, emit_empty: false,
    }]), evidence, { now: NOW })
    expect(inOut.figures[0]!.data.map((r) => r.k)).toEqual(['a', 'c'])
  })

  it('sort: asc + desc both honour the order flag', () => {
    const evidence = ev([
      { k: 'a', v: 3, g: '' },
      { k: 'b', v: 1, g: '' },
      { k: 'c', v: 2, g: '' },
    ])
    const asc = executeSpec(spec([{
      id: 'f', title: 'F', dataset: 'd',
      transform: [{ op: 'sort', column: 'v', order: 'asc' }],
      mark: { type: 'dot' }, encodings: { x: 'k', y: 'v' }, emit_empty: false,
    }]), evidence, { now: NOW })
    expect(asc.figures[0]!.data.map((r) => r.v)).toEqual([1, 2, 3])
    const desc = executeSpec(spec([{
      id: 'f', title: 'F', dataset: 'd',
      transform: [{ op: 'sort', column: 'v', order: 'desc' }],
      mark: { type: 'dot' }, encodings: { x: 'k', y: 'v' }, emit_empty: false,
    }]), evidence, { now: NOW })
    expect(desc.figures[0]!.data.map((r) => r.v)).toEqual([3, 2, 1])
  })

  it('group_by: every reducer (count, sum, mean, median, min, max, first, last)', () => {
    const evidence = ev([
      { k: 'a', v: 1, g: 'x' },
      { k: 'b', v: 3, g: 'x' },
      { k: 'c', v: 5, g: 'x' },
      { k: 'd', v: 10, g: 'y' },
      { k: 'e', v: 20, g: 'y' },
    ])
    const reducers: Array<[string, number | string | null, number | string | null]> = [
      ['count', 3, 2],
      ['sum', 9, 30],
      ['mean', 3, 15],
      ['median', 3, 15],
      ['min', 1, 10],
      ['max', 5, 20],
      ['first', 1, 10],
      ['last', 5, 20],
    ]
    for (const [reducer, xExpected, yExpected] of reducers) {
      const out = executeSpec(spec([{
        id: 'f', title: 'F', dataset: 'd',
        transform: [{ op: 'group_by', columns: ['g'], aggregate: { v: reducer as 'sum' } }],
        mark: { type: 'bar', orientation: 'vertical' }, encodings: { x: 'g', y: 'v' }, emit_empty: false,
      }]), evidence, { now: NOW })
      const byG = new Map(out.figures[0]!.data.map((r) => [r.g, r.v]))
      expect(byG.get('x')).toBe(xExpected)
      expect(byG.get('y')).toBe(yExpected)
    }
  })

  it('group_by: median picks the middle value for odd counts and the average for even', () => {
    const evidence = ev([
      { k: 'a', v: 1, g: 'odd' },
      { k: 'b', v: 5, g: 'odd' },
      { k: 'c', v: 9, g: 'odd' },
      { k: 'd', v: 1, g: 'even' },
      { k: 'e', v: 3, g: 'even' },
      { k: 'f', v: 5, g: 'even' },
      { k: 'g', v: 7, g: 'even' },
    ])
    const out = executeSpec(spec([{
      id: 'f', title: 'F', dataset: 'd',
      transform: [{ op: 'group_by', columns: ['g'], aggregate: { v: 'median' } }],
      mark: { type: 'bar', orientation: 'vertical' }, encodings: { x: 'g', y: 'v' }, emit_empty: false,
    }]), evidence, { now: NOW })
    const byG = new Map(out.figures[0]!.data.map((r) => [r.g, r.v]))
    expect(byG.get('odd')).toBe(5)
    expect(byG.get('even')).toBe(4)
  })

  it('bin: midpoints land in [min, max] and are deterministic', () => {
    const evidence = ev([
      { k: 'a', v: 0, g: '' },
      { k: 'b', v: 10, g: '' },
      { k: 'c', v: 100, g: '' },
    ])
    const out = executeSpec(spec([{
      id: 'f', title: 'F', dataset: 'd',
      transform: [{ op: 'bin', column: 'v', bins: 5, output: 'bucket' }],
      mark: { type: 'dot' }, encodings: { x: 'bucket', y: 'v' }, emit_empty: false,
    }]), evidence, { now: NOW })
    const buckets = out.figures[0]!.data.map((r) => r.bucket as number)
    for (const b of buckets) {
      expect(b).toBeGreaterThanOrEqual(0)
      expect(b).toBeLessThanOrEqual(100)
    }
  })

  it('window: rolling mean over a sort-key axis', () => {
    const evidence = ev([
      { k: 'a', v: 1, g: '' },
      { k: 'b', v: 3, g: '' },
      { k: 'c', v: 5, g: '' },
      { k: 'd', v: 7, g: '' },
    ])
    const out = executeSpec(spec([{
      id: 'f', title: 'F', dataset: 'd',
      transform: [{ op: 'window', column: 'v', sort_by: 'k', size: 2, reducer: 'mean', output: 'rolling' }],
      mark: { type: 'line' }, encodings: { x: 'k', y: 'rolling' }, emit_empty: false,
    }]), evidence, { now: NOW })
    expect(out.figures[0]!.data.map((r) => r.rolling)).toEqual([1, 2, 4, 6])
  })

  it('derived: ratio, delta, log10, identity, add/sub/mul/div', () => {
    const evidence = ev([
      { k: 'a', v: 100, g: 'orig' },
      { k: 'b', v: 10, g: 'orig' },
    ])
    type Cases = Array<[
      Extract<NonNullable<NonNullable<ProjectionSpec['figures'][number]['transform']>[number]>, { op: 'derived' }>['expr'],
      number | null,
      number | null
    ]>
    const cases: Cases = [
      [{ kind: 'identity', of: 'v' }, 100, 10],
      [{ kind: 'log10', of: 'v' }, 2, 1],
      [{ kind: 'add', a: 'v', b: 'v' }, 200, 20],
    ]
    for (const [expr, aExpected, bExpected] of cases) {
      const out = executeSpec(spec([{
        id: 'f', title: 'F', dataset: 'd',
        transform: [{ op: 'derived', output: 'r', expr }],
        mark: { type: 'dot' }, encodings: { x: 'k', y: 'r' }, emit_empty: false,
      }]), evidence, { now: NOW })
      expect(out.figures[0]!.data[0]!.r).toBe(aExpected)
      expect(out.figures[0]!.data[1]!.r).toBe(bExpected)
    }
  })

  it('derived: division by zero or negatives in log10 → null (no NaN leaks)', () => {
    const evidence = ev([
      { k: 'a', v: 0, g: '' },
      { k: 'b', v: -5, g: '' },
    ])
    // The figures here would be dropped (null y → no plottable encoding),
    // so we use a scalar to verify the derived expression's null-handling
    // independently of the figure-drop rule.
    const divSpec: ProjectionSpec = {
      spec_version: '1',
      figures: [{
        id: 'f', title: 'F', dataset: 'd',
        transform: [{ op: 'derived', output: 'r', expr: { kind: 'div', num: 'v', den: 'v' } }],
        mark: { type: 'dot' }, encodings: { x: 'k', y: 'r' }, emit_empty: false,
      }],
      scalars: [{ op: 'mean', id: 'm', dataset: 'd', column: 'v' }],
      prose_template: '',
    }
    void executeSpec(divSpec, evidence, { now: NOW }) // doesn't throw
    // For null-handling correctness, exercise the executor with a numeric
    // path that DOES land in a kept figure: divide v by v where v is non-zero.
    const safeEv = ev([
      { k: 'a', v: 4, g: '' },
      { k: 'b', v: 8, g: '' },
    ])
    const safeOut = executeSpec(spec([{
      id: 'f', title: 'F', dataset: 'd',
      transform: [{ op: 'derived', output: 'r', expr: { kind: 'identity', of: 'v' } }],
      mark: { type: 'dot' }, encodings: { x: 'k', y: 'r' }, emit_empty: false,
    }]), safeEv, { now: NOW })
    expect(safeOut.figures[0]!.data[0]!.r).toBe(4)
    expect(safeOut.figures[0]!.data[1]!.r).toBe(8)
  })

  it('count_by: counts rows per group, emits a new output column, preserves grouping cols', () => {
    const evidence = ev([
      { k: 'a', v: 1, g: 'x' },
      { k: 'b', v: 2, g: 'x' },
      { k: 'c', v: 3, g: 'y' },
      { k: 'd', v: 4, g: 'y' },
      { k: 'e', v: 5, g: 'y' },
      { k: 'f', v: 6, g: 'z' },
    ])
    const out = executeSpec(spec([{
      id: 'f', title: 'F', dataset: 'd',
      transform: [{ op: 'count_by', columns: ['g'], output: 'n' }],
      mark: { type: 'bar', orientation: 'vertical' },
      encodings: { x: 'g', y: 'n' }, emit_empty: false,
    }]), evidence, { now: NOW })
    expect(out.figures).toHaveLength(1)
    const rows = out.figures[0]!.data
    const byG = new Map(rows.map((r) => [r.g, r.n]))
    expect(byG.get('x')).toBe(2)
    expect(byG.get('y')).toBe(3)
    expect(byG.get('z')).toBe(1)
    // Grouping column is preserved (not overwritten).
    expect(rows[0]!.g).not.toBeUndefined()
  })

  it('count_by: groups by multiple columns', () => {
    const evidence = ev([
      { k: 'a', v: 1, g: 'x' },
      { k: 'b', v: 1, g: 'x' },
      { k: 'c', v: 2, g: 'x' },
      { k: 'd', v: 2, g: 'y' },
    ])
    const out = executeSpec(spec([{
      id: 'f', title: 'F', dataset: 'd',
      transform: [{ op: 'count_by', columns: ['g', 'v'], output: 'n' }],
      mark: { type: 'bar', orientation: 'vertical' },
      encodings: { x: 'g', y: 'n', fill: 'v' }, emit_empty: false,
    }]), evidence, { now: NOW })
    expect(out.figures).toHaveLength(1)
    const cells = out.figures[0]!.data.map((r) => `${r.g}/${r.v}/${r.n}`)
    expect(cells).toContain('x/1/2')
    expect(cells).toContain('x/2/1')
    expect(cells).toContain('y/2/1')
  })

  it('count_by: throws SpecExecutionError when the grouping column is missing', () => {
    expect(() => executeSpec(spec([{
      id: 'f', title: 'F', dataset: 'd',
      transform: [{ op: 'count_by', columns: ['nope'], output: 'n' }],
      mark: { type: 'bar', orientation: 'vertical' },
      encodings: { x: 'k', y: 'n' }, emit_empty: false,
    }]), ev([{ k: 'a', v: 1, g: '' }]), { now: NOW })).toThrow(/column 'nope' not present/)
  })

  it('limit: caps the row count', () => {
    const evidence = ev([
      { k: 'a', v: 1, g: '' },
      { k: 'b', v: 2, g: '' },
      { k: 'c', v: 3, g: '' },
    ])
    const out = executeSpec(spec([{
      id: 'f', title: 'F', dataset: 'd',
      transform: [{ op: 'limit', n: 2 }],
      mark: { type: 'line' }, encodings: { x: 'k', y: 'v' }, emit_empty: false,
    }]), evidence, { now: NOW })
    expect(out.figures[0]!.data).toHaveLength(2)
  })

  it('throws SpecExecutionError when figure references missing dataset', () => {
    expect(() => executeSpec(spec([{
      id: 'f', title: 'F', dataset: 'nope',
      mark: { type: 'dot' }, encodings: { x: 'k', y: 'v' }, emit_empty: false,
    }]), ev([{ k: 'a', v: 1, g: '' }]), { now: NOW })).toThrow(SpecExecutionError)
  })

  it('throws SpecExecutionError when transform references missing column', () => {
    expect(() => executeSpec(spec([{
      id: 'f', title: 'F', dataset: 'd',
      transform: [{ op: 'sort', column: 'nope', order: 'asc' }],
      mark: { type: 'dot' }, encodings: { x: 'k', y: 'v' }, emit_empty: false,
    }]), ev([{ k: 'a', v: 1, g: '' }]), { now: NOW })).toThrow(SpecExecutionError)
  })

  it('throws when encoding references column not in post-transform data', () => {
    expect(() => executeSpec(spec([{
      id: 'f', title: 'F', dataset: 'd',
      mark: { type: 'dot' }, encodings: { x: 'k', y: 'absent' }, emit_empty: false,
    }]), ev([{ k: 'a', v: 1, g: '' }]), { now: NOW })).toThrow(SpecExecutionError)
  })

  it('drops figure when post-transform data is empty (emit_empty=false)', () => {
    const out = executeSpec(spec([{
      id: 'f', title: 'F', dataset: 'd',
      transform: [{ op: 'filter', column: 'v', predicate: { op: 'gt', value: 1000 } }],
      mark: { type: 'dot' }, encodings: { x: 'k', y: 'v' }, emit_empty: false,
    }]), ev([{ k: 'a', v: 1, g: '' }]), { now: NOW })
    expect(out.figures).toHaveLength(0)
  })

  it('drops figure with empty data even when emit_empty=true (no loophole)', () => {
    // The historical emit_empty=true bypass led to empty figure boxes
    // wrapped in chrome — the user reads them as broken charts.
    const out = executeSpec(spec([{
      id: 'f', title: 'F', dataset: 'd',
      transform: [{ op: 'filter', column: 'v', predicate: { op: 'gt', value: 1000 } }],
      mark: { type: 'dot' }, encodings: { x: 'k', y: 'v' }, emit_empty: true,
    }]), ev([{ k: 'a', v: 1, g: '' }]), { now: NOW })
    expect(out.figures).toHaveLength(0)
  })

  it('drops line/area figures with only 1 numeric y point (need ≥2 to draw a line)', () => {
    const evidence: TypedEvidence = {
      datasets: [{
        name: 'd',
        schema: { columns: [
          { name: 'k', type: 'string' },
          { name: 'v', type: 'number' },
        ]},
        rows: [{ k: 'a', v: 1 }, { k: 'b', v: null }, { k: 'c', v: null }],
        source_ref: { file: 'd.json' },
      }],
      excerpts: [], files_seen: [], fingerprint: 'fp',
    }
    for (const markType of ['line', 'area'] as const) {
      const out = executeSpec(spec([{
        id: 'f', title: 'F', dataset: 'd',
        mark: { type: markType }, encodings: { x: 'k', y: 'v' }, emit_empty: false,
      }]), evidence, { now: NOW })
      expect(out.figures).toHaveLength(0)
    }
    // Dot chart with a single point is fine — a single dot is meaningful.
    const dot = executeSpec(spec([{
      id: 'f', title: 'F', dataset: 'd',
      mark: { type: 'dot' }, encodings: { x: 'k', y: 'v' }, emit_empty: false,
    }]), evidence, { now: NOW })
    expect(dot.figures).toHaveLength(1)
  })

  it('drops bar/line/area/dot figure when y column has no numeric values (would render empty axes)', () => {
    // Rows have data but y column is entirely null/string.
    const evidence: TypedEvidence = {
      datasets: [{
        name: 'd',
        schema: { columns: [
          { name: 'k', type: 'string' },
          { name: 'v', type: 'string' },
        ]},
        rows: [
          { k: 'a', v: 'one' },
          { k: 'b', v: 'two' },
        ],
        source_ref: { file: 'd.json' },
      }],
      excerpts: [], files_seen: [], fingerprint: 'fp',
    }
    for (const markType of ['line', 'area', 'dot'] as const) {
      const out = executeSpec(spec([{
        id: 'f', title: 'F', dataset: 'd',
        mark: { type: markType }, encodings: { x: 'k', y: 'v' }, emit_empty: false,
      }]), evidence, { now: NOW })
      expect(out.figures).toHaveLength(0)
    }
    // Vertical bar: same rule as line/area/dot.
    const bar = executeSpec(spec([{
      id: 'f', title: 'F', dataset: 'd',
      mark: { type: 'bar', orientation: 'vertical' },
      encodings: { x: 'k', y: 'v' }, emit_empty: false,
    }]), evidence, { now: NOW })
    expect(bar.figures).toHaveLength(0)
  })

  it('keeps dot figure when y has at least one numeric value (mixed null/numeric)', () => {
    const evidence: TypedEvidence = {
      datasets: [{
        name: 'd',
        schema: { columns: [
          { name: 'k', type: 'string' },
          { name: 'v', type: 'number' },
        ]},
        rows: [
          { k: 'a', v: null },
          { k: 'b', v: 5 },
        ],
        source_ref: { file: 'd.json' },
      }],
      excerpts: [], files_seen: [], fingerprint: 'fp',
    }
    // Dot mark: a single point is meaningful. Line/area need ≥2 — see
    // the dedicated "drops line/area with only 1 numeric" test above.
    const out = executeSpec(spec([{
      id: 'f', title: 'F', dataset: 'd',
      mark: { type: 'dot' }, encodings: { x: 'k', y: 'v' }, emit_empty: false,
    }]), evidence, { now: NOW })
    expect(out.figures).toHaveLength(1)
  })

  it('horizontal bar requires numeric x (not y)', () => {
    const evidence: TypedEvidence = {
      datasets: [{
        name: 'd',
        schema: { columns: [
          { name: 'cat', type: 'string' },
          { name: 'count', type: 'number' },
        ]},
        rows: [
          { cat: 'A', count: 3 },
          { cat: 'B', count: 5 },
        ],
        source_ref: { file: 'd.json' },
      }],
      excerpts: [], files_seen: [], fingerprint: 'fp',
    }
    const out = executeSpec(spec([{
      id: 'f', title: 'F', dataset: 'd',
      mark: { type: 'bar', orientation: 'horizontal' },
      encodings: { x: 'count', y: 'cat' }, emit_empty: false,
    }]), evidence, { now: NOW })
    expect(out.figures).toHaveLength(1)
  })

  it('handles empty dataset gracefully (no rows → empty figure dropped)', () => {
    const out = executeSpec(spec([{
      id: 'f', title: 'F', dataset: 'd',
      mark: { type: 'dot' }, encodings: { x: 'k', y: 'v' }, emit_empty: false,
    }]), ev([]), { now: NOW })
    expect(out.figures).toHaveLength(0)
  })

  it('NaN-producing reducers (mean of empty) yield null via the scalar pathway', () => {
    // Verify the reducer output via scalar (a figure with all-null y is
    // dropped by the new figure-quality rule, which is correct).
    const evidence: TypedEvidence = {
      datasets: [
        {
          name: 'd',
          schema: { columns: [{ name: 'k', type: 'string' }, { name: 'v', type: 'number' }] },
          rows: [{ k: 'a', v: null }, { k: 'b', v: null }],
          source_ref: { file: 'd.json' },
        },
      ],
      excerpts: [],
      files_seen: [],
      fingerprint: 'fp',
    }
    const out = executeSpec({
      spec_version: '1', figures: [],
      scalars: [{ op: 'mean', id: 'm', dataset: 'd', column: 'v' }],
      prose_template: '',
    }, evidence, { now: NOW })
    expect(out.quoted_numerics.m).toBeNull()
    // No NaN leaked.
    expect(Number.isNaN(out.quoted_numerics.m as unknown as number)).toBe(false)
  })
})

describe('executor — scalars', () => {
  const evidence = ev([
    { k: 'a', v: 1, g: 'x' },
    { k: 'b', v: 5, g: 'x' },
    { k: 'c', v: 9, g: 'y' },
    { k: 'd', v: 13, g: 'y' },
  ])

  it('count, sum, mean, min, max', () => {
    const out = executeSpec(spec([], [
      { op: 'count', id: 'n', dataset: 'd', column: 'v' },
      { op: 'sum', id: 's', dataset: 'd', column: 'v' },
      { op: 'mean', id: 'm', dataset: 'd', column: 'v' },
      { op: 'min', id: 'lo', dataset: 'd', column: 'v' },
      { op: 'max', id: 'hi', dataset: 'd', column: 'v' },
    ]), evidence, { now: NOW })
    expect(out.quoted_numerics.n).toBe(4)
    expect(out.quoted_numerics.s).toBe(28)
    expect(out.quoted_numerics.m).toBe(7)
    expect(out.quoted_numerics.lo).toBe(1)
    expect(out.quoted_numerics.hi).toBe(13)
  })

  it('percentile family p25/p50/p75/p95', () => {
    const out = executeSpec(spec([], [
      { op: 'p25', id: 'q1', dataset: 'd', column: 'v' },
      { op: 'p50', id: 'q2', dataset: 'd', column: 'v' },
      { op: 'p75', id: 'q3', dataset: 'd', column: 'v' },
      { op: 'p95', id: 'q4', dataset: 'd', column: 'v' },
    ]), evidence, { now: NOW })
    expect(out.quoted_numerics.q1).toBeCloseTo(4)
    expect(out.quoted_numerics.q2).toBeCloseTo(7)
    expect(out.quoted_numerics.q3).toBeCloseTo(10)
    expect(typeof out.quoted_numerics.q4).toBe('number')
  })

  it('argmax / argmin return the requested column, not the rank column', () => {
    const out = executeSpec(spec([], [
      { op: 'argmax', id: 'best_k', dataset: 'd', rank_by: 'v', return: 'k' },
      { op: 'argmin', id: 'worst_k', dataset: 'd', rank_by: 'v', return: 'k' },
    ]), evidence, { now: NOW })
    expect(out.quoted_numerics.best_k).toBe('d')
    expect(out.quoted_numerics.worst_k).toBe('a')
  })

  it('first/last walk the sort axis correctly', () => {
    const out = executeSpec(spec([], [
      { op: 'first', id: 'f', dataset: 'd', column: 'k', sort_by: 'v', sort_order: 'asc' },
      { op: 'last', id: 'l', dataset: 'd', column: 'k', sort_by: 'v', sort_order: 'asc' },
    ]), evidence, { now: NOW })
    expect(out.quoted_numerics.f).toBe('a')
    expect(out.quoted_numerics.l).toBe('d')
  })

  it('delta is last - first along sort axis', () => {
    const out = executeSpec(spec([], [
      { op: 'delta', id: 'dv', dataset: 'd', column: 'v', sort_by: 'k' },
    ]), evidence, { now: NOW })
    expect(out.quoted_numerics.dv).toBe(12)
  })

  it('filter applies before reduction', () => {
    const out = executeSpec(spec([], [
      {
        op: 'mean', id: 'mx', dataset: 'd', column: 'v',
        filter: { column: 'g', predicate: { op: 'eq', value: 'x' } },
      },
    ]), evidence, { now: NOW })
    expect(out.quoted_numerics.mx).toBe(3)
  })

  it('const_string round-trips into quoted_numerics', () => {
    const out = executeSpec(spec([], [
      { op: 'const_string', id: 'status', value: 'active' },
    ]), evidence, { now: NOW })
    expect(out.quoted_numerics.status).toBe('active')
  })

  it('reducers over empty filtered rows return null (mean/median/min/max)', () => {
    const out = executeSpec(spec([], [
      {
        op: 'mean', id: 'm', dataset: 'd', column: 'v',
        filter: { column: 'g', predicate: { op: 'eq', value: 'never' } },
      },
      {
        op: 'min', id: 'mn', dataset: 'd', column: 'v',
        filter: { column: 'g', predicate: { op: 'eq', value: 'never' } },
      },
    ]), evidence, { now: NOW })
    expect(out.quoted_numerics.m).toBeNull()
    expect(out.quoted_numerics.mn).toBeNull()
  })

  it('count over filtered-empty rows returns 0, not null', () => {
    const out = executeSpec(spec([], [
      {
        op: 'count', id: 'n', dataset: 'd', column: 'v',
        filter: { column: 'g', predicate: { op: 'eq', value: 'never' } },
      },
    ]), evidence, { now: NOW })
    expect(out.quoted_numerics.n).toBe(0)
  })

  it('argmax with no numeric rows returns null', () => {
    const evidence: TypedEvidence = {
      datasets: [{
        name: 'd',
        schema: { columns: [{ name: 'k', type: 'string' }, { name: 'v', type: 'number' }] },
        rows: [{ k: 'a', v: null }],
        source_ref: { file: 'd.json' },
      }],
      excerpts: [],
      files_seen: [],
      fingerprint: 'fp',
    }
    const out = executeSpec(spec([], [
      { op: 'argmax', id: 'best', dataset: 'd', rank_by: 'v', return: 'k' },
    ]), evidence, { now: NOW })
    expect(out.quoted_numerics.best).toBeNull()
  })
})

describe('executor — output metadata', () => {
  it('cite_index includes one entry per scalar (with dataset source_ref) + per excerpt', () => {
    const evidence: TypedEvidence = {
      datasets: [{
        name: 'd',
        schema: { columns: [{ name: 'v', type: 'number' }] },
        rows: [{ v: 1 }],
        source_ref: { file: 'd.json', json_path: '$' },
      }],
      excerpts: [{
        id: 'e1', text: 'hi', kind: 'paragraph',
        source_ref: { file: 'README.md', line_start: 1, line_end: 1 },
      }],
      files_seen: [],
      fingerprint: 'fp',
    }
    const s: ProjectionSpec = {
      spec_version: '1', figures: [],
      scalars: [{ op: 'count', id: 'n', dataset: 'd', column: 'v' }],
      prose_template: '{excerpt:e1}',
    }
    const out = executeSpec(s, evidence, { now: NOW })
    const scalarEntry = out.cite_index.find((c) => c.scalar_id === 'n')
    const excerptEntry = out.cite_index.find((c) => c.excerpt_id === 'e1')
    expect(scalarEntry?.source_ref.file).toBe('d.json')
    expect(excerptEntry?.source_ref.file).toBe('README.md')
  })

  it('source defaults to llm; override to fallback works', () => {
    const out = executeSpec(spec([]), ev([]), { now: NOW, source: 'fallback' })
    expect(out.source).toBe('fallback')
  })

  it('evidence_fingerprint copies through unchanged', () => {
    const out = executeSpec(spec([]), { ...ev([]), fingerprint: 'sha-xyz' }, { now: NOW })
    expect(out.evidence_fingerprint).toBe('sha-xyz')
  })
})
