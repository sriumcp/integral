/**
 * Spec executor — runs ProjectionSpec deterministically against TypedEvidence.
 *
 * The hallucination guarantee lives in this file: every numeric in the
 * resulting prose is computed here from typed source data, never invented
 * by the LLM. The LLM declared "compute median of column X with these
 * filters"; this code does the math.
 *
 * Pure functions, no I/O, no LLM calls. Throws typed errors on schema
 * violations (column missing, dataset missing) — callers turn those into
 * fallback projections.
 */

import type {
  ExecutedProjection,
  PlotSpec,
  PreparedFigure,
  Predicate,
  ProjectionSpec,
  QuotedNumerics,
  ScalarRequest,
  TransformOp,
  TypedDataset,
  TypedEvidence,
  TypedRow,
  Excerpt,
} from './spec'
import { renderTemplate } from './template'

export class SpecExecutionError extends Error {
  readonly path: string
  constructor(message: string, path: string) {
    super(`${message} (at ${path})`)
    this.name = 'SpecExecutionError'
    this.path = path
  }
}

export interface ExecuteSpecOptions {
  /** Override `generated_at` for deterministic tests. */
  now?: () => string
  /** Override `source`; defaults to 'llm'. Set 'fallback' when the spec
   *  was built deterministically without an LLM round-trip. */
  source?: 'llm' | 'fallback'
  /** Optional model name for round-tripping into ExecutedProjection.model. */
  model?: string
}

export function executeSpec(
  spec: ProjectionSpec,
  evidence: TypedEvidence,
  opts: ExecuteSpecOptions = {}
): ExecutedProjection {
  const now = opts.now ?? (() => new Date().toISOString())

  // Index datasets + excerpts by name/id for O(1) lookup.
  const datasetIdx = new Map<string, TypedDataset>()
  for (const d of evidence.datasets) datasetIdx.set(d.name, d)
  const excerptIdx = new Map<string, Excerpt>()
  for (const e of evidence.excerpts) excerptIdx.set(e.id, e)

  // ── Figures ────────────────────────────────────────────────────────────
  const figures: PreparedFigure[] = []
  for (const fig of spec.figures) {
    const ds = datasetIdx.get(fig.dataset)
    if (!ds) {
      throw new SpecExecutionError(
        `figure '${fig.id}' references unknown dataset '${fig.dataset}'`,
        `figures.${fig.id}.dataset`
      )
    }
    const data = applyTransforms(ds.rows, fig.transform ?? [], `figures.${fig.id}`)
    // Empty post-transform → always drop, regardless of emit_empty.
    // The historical emit_empty=true loophole only made sense for
    // "show empty axes deliberately"; in practice it produced empty
    // figure chrome the user reads as broken. Refuse uniformly.
    if (data.length === 0) continue
    validateEncodings(fig, data)
    // Drop figures that won't produce visible marks. Per-mark rules
    // live in hasPlottableEncoding; line/area additionally require
    // ≥2 numeric points to draw a line (a single point isn't a line).
    if (!hasPlottableEncoding(fig.mark, fig.encodings, data)) {
      continue
    }
    figures.push({
      id: fig.id,
      title: fig.title,
      caption_rendered: fig.caption, // late-substituted by template pass below
      data,
      mark: fig.mark,
      encodings: fig.encodings,
    })
  }

  // ── Scalars ────────────────────────────────────────────────────────────
  const quoted: QuotedNumerics = {}
  for (const sc of spec.scalars) {
    const value = computeScalar(sc, datasetIdx)
    quoted[sc.id] = value
  }

  // Track which excerpt ids the LLM substituted into prose / captions.
  // The lint uses these to build the allowed-digit set: any digit that
  // appears verbatim inside a quoted excerpt has provenance via the
  // excerpt's source_ref. Digits NOT in scalars and NOT in any quoted
  // excerpt are LLM-invented and rejected.
  const excerptsResolved = new Set<string>()

  // ── Caption substitution (figures may reference scalars) ──────────────
  for (const f of figures) {
    if (f.caption_rendered != null) {
      f.caption_rendered = renderTemplate(f.caption_rendered, quoted, excerptIdx, {
        scope: `figures.${f.id}.caption`,
        excerptsResolved,
      })
    }
  }

  // ── Prose ──────────────────────────────────────────────────────────────
  const prose = renderTemplate(spec.prose_template, quoted, excerptIdx, {
    scope: 'prose_template',
    excerptsResolved,
  })

  // ── Citation index (for tooltips / inspector UI) ──────────────────────
  const cite_index: ExecutedProjection['cite_index'] = []
  for (const sc of spec.scalars) {
    const ds = 'dataset' in sc ? datasetIdx.get(sc.dataset) : undefined
    if (ds) {
      cite_index.push({ scalar_id: sc.id, source_ref: ds.source_ref })
    }
  }
  for (const e of evidence.excerpts) {
    cite_index.push({ excerpt_id: e.id, source_ref: e.source_ref })
  }

  return {
    spec_version: spec.spec_version,
    figures,
    quoted_numerics: quoted,
    prose,
    cite_index,
    source: opts.source ?? 'llm',
    generated_at: now(),
    model: opts.model,
    evidence_fingerprint: evidence.fingerprint,
  }
}

// ─── Transforms ───────────────────────────────────────────────────────────

function applyTransforms(
  initial: TypedRow[],
  ops: TransformOp[],
  scope: string
): TypedRow[] {
  let rows = initial.map((r) => ({ ...r })) // shallow clone — transforms are immutable
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i]!
    rows = applyTransform(rows, op, `${scope}.transform[${i}]`)
  }
  return rows
}

function applyTransform(
  rows: TypedRow[],
  op: TransformOp,
  scope: string
): TypedRow[] {
  switch (op.op) {
    case 'filter':
      requireColumn(rows, op.column, scope)
      return rows.filter((r) => applyPredicate(r[op.column] ?? null, op.predicate))
    case 'sort': {
      requireColumn(rows, op.column, scope)
      const sorted = [...rows].sort((a, b) => {
        const cmp = compareCells(a[op.column] ?? null, b[op.column] ?? null)
        return op.order === 'asc' ? cmp : -cmp
      })
      return sorted
    }
    case 'limit':
      return rows.slice(0, op.n)
    case 'group_by':
      return groupBy(rows, op.columns, op.aggregate, scope)
    case 'count_by':
      return countBy(rows, op.columns, op.output, scope)
    case 'bin':
      return binColumn(rows, op.column, op.bins, op.output, scope)
    case 'window':
      return windowColumn(rows, op, scope)
    case 'derived':
      return rows.map((r) => ({ ...r, [op.output]: applyDerived(r, op.expr) }))
  }
}

function requireColumn(rows: TypedRow[], column: string, scope: string): void {
  if (rows.length === 0) return
  if (!(column in rows[0]!)) {
    throw new SpecExecutionError(`column '${column}' not present`, scope)
  }
}

function applyPredicate(cell: unknown, p: Predicate): boolean {
  switch (p.op) {
    case 'eq': return cell === p.value
    case 'ne': return cell !== p.value
    case 'gt': return typeof cell === 'number' && cell > p.value
    case 'gte': return typeof cell === 'number' && cell >= p.value
    case 'lt': return typeof cell === 'number' && cell < p.value
    case 'lte': return typeof cell === 'number' && cell <= p.value
    case 'in': return p.values.includes(cell as number | string | boolean)
    case 'not_null': return cell !== null && cell !== undefined
    case 'is_null': return cell === null || cell === undefined
  }
}

function compareCells(a: unknown, b: unknown): number {
  if (a === null || a === undefined) return b === null || b === undefined ? 0 : -1
  if (b === null || b === undefined) return 1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a).localeCompare(String(b))
}

function countBy(
  rows: TypedRow[],
  groupCols: string[],
  output: string,
  scope: string
): TypedRow[] {
  for (const c of groupCols) requireColumn(rows, c, scope)
  const groupKey = new Map<string, TypedRow>()
  const counts = new Map<string, number>()
  for (const r of rows) {
    const key = groupCols.map((c) => JSON.stringify(r[c] ?? null)).join('|')
    if (!groupKey.has(key)) {
      const k: TypedRow = {}
      for (const c of groupCols) k[c] = r[c] ?? null
      groupKey.set(key, k)
      counts.set(key, 0)
    }
    counts.set(key, counts.get(key)! + 1)
  }
  const out: TypedRow[] = []
  for (const [key, k] of groupKey.entries()) {
    out.push({ ...k, [output]: counts.get(key)! })
  }
  return out
}

function groupBy(
  rows: TypedRow[],
  groupCols: string[],
  aggregate: Record<string, string>,
  scope: string
): TypedRow[] {
  for (const c of groupCols) requireColumn(rows, c, scope)
  for (const c of Object.keys(aggregate)) requireColumn(rows, c, scope)

  const groups = new Map<string, TypedRow[]>()
  const groupKeys = new Map<string, TypedRow>()
  for (const r of rows) {
    const keyParts = groupCols.map((c) => JSON.stringify(r[c] ?? null))
    const key = keyParts.join('|')
    if (!groups.has(key)) {
      groups.set(key, [])
      const k: TypedRow = {}
      for (const c of groupCols) k[c] = r[c] ?? null
      groupKeys.set(key, k)
    }
    groups.get(key)!.push(r)
  }

  const out: TypedRow[] = []
  for (const [key, members] of groups.entries()) {
    const row: TypedRow = { ...groupKeys.get(key)! }
    for (const [col, reducer] of Object.entries(aggregate)) {
      row[col] = reduceColumn(members, col, reducer)
    }
    out.push(row)
  }
  return out
}

function reduceColumn(rows: TypedRow[], col: string, reducer: string): number | string | null {
  const values = rows.map((r) => r[col]).filter((v) => v !== null && v !== undefined)
  switch (reducer) {
    case 'count': return values.length
    case 'sum': return numericValues(values).reduce((a, b) => a + b, 0)
    case 'mean': {
      const ns = numericValues(values)
      return ns.length === 0 ? null : ns.reduce((a, b) => a + b, 0) / ns.length
    }
    case 'median': return percentile(numericValues(values), 50)
    case 'min': {
      const ns = numericValues(values)
      return ns.length === 0 ? null : Math.min(...ns)
    }
    case 'max': {
      const ns = numericValues(values)
      return ns.length === 0 ? null : Math.max(...ns)
    }
    case 'first': return values.length > 0 ? cellToScalar(values[0]) : null
    case 'last': return values.length > 0 ? cellToScalar(values[values.length - 1]) : null
    default: throw new SpecExecutionError(`unknown reducer '${reducer}'`, 'group_by')
  }
}

function numericValues(values: unknown[]): number[] {
  const out: number[] = []
  for (const v of values) if (typeof v === 'number' && Number.isFinite(v)) out.push(v)
  return out
}

function cellToScalar(v: unknown): number | string | null {
  if (typeof v === 'number') return v
  if (typeof v === 'string') return v
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  return null
}

function percentile(values: number[], pct: number): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const idx = ((sorted.length - 1) * pct) / 100
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  if (lo === hi) return sorted[lo]!
  const w = idx - lo
  return sorted[lo]! * (1 - w) + sorted[hi]! * w
}

function binColumn(
  rows: TypedRow[],
  column: string,
  bins: number,
  output: string,
  scope: string
): TypedRow[] {
  requireColumn(rows, column, scope)
  const ns = numericValues(rows.map((r) => r[column]))
  if (ns.length === 0) return rows.map((r) => ({ ...r, [output]: null }))
  const min = Math.min(...ns)
  const max = Math.max(...ns)
  const width = (max - min) / bins || 1
  return rows.map((r) => {
    const v = r[column]
    if (typeof v !== 'number' || !Number.isFinite(v)) return { ...r, [output]: null }
    const bin = Math.min(bins - 1, Math.floor((v - min) / width))
    const midpoint = min + (bin + 0.5) * width
    return { ...r, [output]: midpoint }
  })
}

function windowColumn(
  rows: TypedRow[],
  op: Extract<TransformOp, { op: 'window' }>,
  scope: string
): TypedRow[] {
  requireColumn(rows, op.column, scope)
  requireColumn(rows, op.sort_by, scope)
  const sorted = [...rows].sort((a, b) =>
    compareCells(a[op.sort_by] ?? null, b[op.sort_by] ?? null)
  )
  const out: TypedRow[] = []
  for (let i = 0; i < sorted.length; i++) {
    const start = Math.max(0, i - op.size + 1)
    const window = sorted.slice(start, i + 1)
    const reduced = reduceColumn(window, op.column, op.reducer)
    out.push({ ...sorted[i]!, [op.output]: reduced })
  }
  return out
}

function applyDerived(
  row: TypedRow,
  expr: Extract<TransformOp, { op: 'derived' }>['expr']
): number | null {
  const num = (k: string): number | null => {
    const v = row[k]
    return typeof v === 'number' && Number.isFinite(v) ? v : null
  }
  switch (expr.kind) {
    case 'identity': {
      const v = row[expr.of]
      return typeof v === 'number' ? v : null
    }
    case 'ratio':
    case 'div': {
      const den = expr.kind === 'ratio' ? num(expr.den) : num(expr.den)
      const numV = expr.kind === 'ratio' ? num(expr.num) : num(expr.num)
      if (numV === null || den === null || den === 0) return null
      return numV / den
    }
    case 'delta': {
      const f = num(expr.from), t = num(expr.to)
      return f === null || t === null ? null : t - f
    }
    case 'log10': {
      const v = num(expr.of)
      return v === null || v <= 0 ? null : Math.log10(v)
    }
    case 'add': {
      const a = num(expr.a), b = num(expr.b)
      return a === null || b === null ? null : a + b
    }
    case 'sub': {
      const a = num(expr.a), b = num(expr.b)
      return a === null || b === null ? null : a - b
    }
    case 'mul': {
      const a = num(expr.a), b = num(expr.b)
      return a === null || b === null ? null : a * b
    }
  }
}

// ─── Encodings sanity ─────────────────────────────────────────────────────

/**
 * Predicate: this mark+encoding combination CAN produce visible marks
 * given the post-transform data. Used to drop figures that would render
 * as empty axes.
 *
 * Rules:
 *  - line / area / bar / dot / rule(y) / tick(y): require ≥1 finite
 *    numeric value in the y-encoded column. (Bar can be horizontal, in
 *    which case it's the x-encoded column instead.)
 *  - text: requires ≥1 non-null text-encoded value
 *  - rule(x) / tick(x): require ≥1 numeric x value
 *
 * Conservative — we'd rather skip a borderline figure than render an
 * unintelligible one.
 */
function hasPlottableEncoding(
  mark: PlotSpec['mark'],
  encodings: PlotSpec['encodings'],
  data: TypedRow[]
): boolean {
  if (data.length === 0) return false
  const countNumeric = (col: string | undefined): number => {
    if (!col) return 0
    let n = 0
    for (const r of data) {
      const v = r[col]
      if (typeof v === 'number' && Number.isFinite(v)) n++
    }
    return n
  }
  const hasNumeric = (col: string | undefined): boolean => countNumeric(col) >= 1
  const hasNonNull = (col: string | undefined): boolean => {
    if (!col) return false
    for (const r of data) {
      const v = r[col]
      if (v !== null && v !== undefined) return true
    }
    return false
  }
  switch (mark.type) {
    case 'line':
    case 'area':
      // A line/area needs ≥2 numeric points to render anything visible.
      // A single numeric value shows as nothing (Plot draws no segment).
      return countNumeric(encodings.y) >= 2
    case 'dot':
      return hasNumeric(encodings.y)
    case 'bar':
      return mark.orientation === 'horizontal'
        ? hasNumeric(encodings.x)
        : hasNumeric(encodings.y)
    case 'rule':
      return hasNumeric(mark.axis === 'x' ? encodings.x : encodings.y)
    case 'tick':
      return hasNumeric(mark.axis === 'x' ? encodings.x : encodings.y)
    case 'text':
      return hasNonNull(encodings.text ?? encodings.x ?? encodings.y)
  }
}

function validateEncodings(fig: PlotSpec, data: TypedRow[]): void {
  if (data.length === 0) return
  const present = new Set(Object.keys(data[0]!))
  for (const [channel, col] of Object.entries(fig.encodings)) {
    if (col && !present.has(col)) {
      throw new SpecExecutionError(
        `figure '${fig.id}' encoding '${channel}' references missing column '${col}'`,
        `figures.${fig.id}.encodings.${channel}`
      )
    }
  }
}

// ─── Scalars ──────────────────────────────────────────────────────────────

function computeScalar(
  req: ScalarRequest,
  datasets: Map<string, TypedDataset>
): number | string | null {
  if (req.op === 'const_string') return req.value
  const ds = datasets.get(req.dataset)
  if (!ds) throw new SpecExecutionError(`scalar '${req.id}' references unknown dataset '${req.dataset}'`, `scalars.${req.id}`)

  let rows = ds.rows
  if (req.filter) {
    rows = rows.filter((r) => applyPredicate(r[req.filter!.column] ?? null, req.filter!.predicate))
  }

  switch (req.op) {
    case 'count':
      return rows.length
    case 'sum':
    case 'mean':
    case 'median':
    case 'min':
    case 'max': {
      const ns = numericValues(rows.map((r) => r[req.column]))
      switch (req.op) {
        case 'sum': return ns.reduce((a, b) => a + b, 0)
        case 'mean': return ns.length === 0 ? null : ns.reduce((a, b) => a + b, 0) / ns.length
        case 'median': return percentile(ns, 50)
        case 'min': return ns.length === 0 ? null : Math.min(...ns)
        case 'max': return ns.length === 0 ? null : Math.max(...ns)
      }
    }
    /* eslint-disable-next-line no-fallthrough */
    case 'p25':
    case 'p50':
    case 'p75':
    case 'p95': {
      const ns = numericValues(rows.map((r) => r[req.column]))
      const p = req.op === 'p25' ? 25 : req.op === 'p50' ? 50 : req.op === 'p75' ? 75 : 95
      return percentile(ns, p)
    }
    case 'first':
    case 'last': {
      const sorted = [...rows].sort((a, b) =>
        compareCells(a[req.sort_by] ?? null, b[req.sort_by] ?? null)
      )
      const ordered = req.sort_order === 'desc' ? sorted.reverse() : sorted
      const target = req.op === 'first' ? ordered[0] : ordered[ordered.length - 1]
      return target ? cellToScalar(target[req.column] ?? null) : null
    }
    case 'argmax':
    case 'argmin': {
      const ns = rows
        .map((r, i) => ({ i, v: r[req.rank_by] }))
        .filter((x) => typeof x.v === 'number' && Number.isFinite(x.v))
        .sort((a, b) => (a.v as number) - (b.v as number))
      const pick = req.op === 'argmax' ? ns[ns.length - 1] : ns[0]
      if (!pick) return null
      return cellToScalar(rows[pick.i]![req.return] ?? null)
    }
    case 'delta': {
      const sorted = [...rows].sort((a, b) =>
        compareCells(a[req.sort_by] ?? null, b[req.sort_by] ?? null)
      )
      const ns = numericValues(sorted.map((r) => r[req.column]))
      if (ns.length < 2) return null
      return ns[ns.length - 1]! - ns[0]!
    }
  }
}
