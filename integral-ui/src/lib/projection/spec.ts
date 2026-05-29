/**
 * Typed-evidence + spec/execution projection contract.
 *
 * Two design rules govern this module:
 *
 *   1. The LLM is an *analyst*, not a *calculator*. It declares which
 *      aggregations / groupings / windows it wants. The deterministic
 *      executor (executor.ts) computes them against typed evidence.
 *
 *   2. Every numeric that ends up in rendered prose has provenance. The
 *      LLM emits prose with `{scalar:id}` placeholders; the executor
 *      substitutes the (computed) numeric value; the lint rejects any
 *      free-floating digit not in `quoted_numerics`.
 *
 * The schemas live here so they're shared by the browser-safe core
 * (executor / lint / template) and the server-only composer + parser
 * packs. No I/O, no LLM, no env reads in this file.
 */

import { z } from 'zod'

// ─── Evidence (parser output) ─────────────────────────────────────────────

/** Where a value came from. Used for citation tooltips + the cite_index UI. */
export const SourceCitationSchema = z.object({
  /** Filesystem-relative path inside the source. May be empty for
   *  workspace-derived data (sibling iterations, parent campaign). */
  file: z.string(),
  /** 1-indexed inclusive line range, when known. */
  line_start: z.number().int().positive().optional(),
  line_end: z.number().int().positive().optional(),
  /** JSONPath-ish pointer for parsed JSON. e.g. `$.iterations[3].score`. */
  json_path: z.string().optional(),
})
export type SourceCitation = z.infer<typeof SourceCitationSchema>

export const ColumnTypeSchema = z.enum(['number', 'string', 'date', 'bool'])
export type ColumnType = z.infer<typeof ColumnTypeSchema>

export const DatasetSchemaSchema = z.object({
  columns: z.array(
    z.object({
      name: z.string().min(1),
      type: ColumnTypeSchema,
    })
  ),
})
export type DatasetSchema = z.infer<typeof DatasetSchemaSchema>

/** A single typed row. Values may be null for missing cells. */
export const TypedCellSchema = z.union([
  z.number(),
  z.string(),
  z.boolean(),
  z.null(),
])
export type TypedCell = z.infer<typeof TypedCellSchema>
export type TypedRow = Record<string, TypedCell>

export const TypedDatasetSchema = z.object({
  name: z.string().min(1),
  schema: DatasetSchemaSchema,
  rows: z.array(z.record(z.string(), TypedCellSchema)),
  source_ref: SourceCitationSchema,
})
export type TypedDataset = z.infer<typeof TypedDatasetSchema>

export const ExcerptKindSchema = z.enum([
  'paragraph',
  'heading',
  'code',
  'list',
  'frontmatter',
  'quote',
])
export type ExcerptKind = z.infer<typeof ExcerptKindSchema>

export const ExcerptSchema = z.object({
  id: z.string().min(1),
  text: z.string(),
  kind: ExcerptKindSchema,
  source_ref: SourceCitationSchema,
})
export type Excerpt = z.infer<typeof ExcerptSchema>

export const TypedEvidenceSchema = z.object({
  datasets: z.array(TypedDatasetSchema),
  excerpts: z.array(ExcerptSchema),
  files_seen: z.array(SourceCitationSchema),
  /** sha256 of (file paths + mtimes + sizes). For invalidation diagnostics
   *  only — the projection cache key uses state.last_advanced_at. */
  fingerprint: z.string(),
})
export type TypedEvidence = z.infer<typeof TypedEvidenceSchema>

// ─── Spec (LLM output) ────────────────────────────────────────────────────

/** Predicates the LLM may use in filter ops. Only against parsed columns;
 *  no derived expressions to keep the surface narrow. */
export const PredicateSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('eq'), value: z.union([z.number(), z.string(), z.boolean(), z.null()]) }),
  z.object({ op: z.literal('ne'), value: z.union([z.number(), z.string(), z.boolean(), z.null()]) }),
  z.object({ op: z.literal('gt'), value: z.number() }),
  z.object({ op: z.literal('gte'), value: z.number() }),
  z.object({ op: z.literal('lt'), value: z.number() }),
  z.object({ op: z.literal('lte'), value: z.number() }),
  z.object({ op: z.literal('in'), values: z.array(z.union([z.number(), z.string(), z.boolean()])) }),
  z.object({ op: z.literal('not_null') }),
  z.object({ op: z.literal('is_null') }),
])
export type Predicate = z.infer<typeof PredicateSchema>

export const ReducerSchema = z.enum([
  'count',
  'sum',
  'mean',
  'median',
  'min',
  'max',
  'first',
  'last',
])
export type Reducer = z.infer<typeof ReducerSchema>

export const TransformOpSchema = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('filter'),
    column: z.string(),
    predicate: PredicateSchema,
  }),
  z.object({
    op: z.literal('sort'),
    column: z.string(),
    order: z.enum(['asc', 'desc']),
  }),
  z.object({
    op: z.literal('group_by'),
    columns: z.array(z.string()).min(1),
    /** column-in → reducer applied. Output column name is the input
     *  column name (overwritten); rename via `derived` afterwards. */
    aggregate: z.record(z.string(), ReducerSchema),
  }),
  z.object({
    /** Count rows per group, emit a new count column (preserves the
     *  grouping columns intact). The clean primitive for "frequency by
     *  category" — the most common shape the LLM reaches for. Without
     *  this, group_by aggregate { col: 'count' } overwrites the
     *  grouping column with the count, losing the label. */
    op: z.literal('count_by'),
    columns: z.array(z.string()).min(1),
    output: z.string().min(1),
  }),
  z.object({
    op: z.literal('bin'),
    column: z.string(),
    bins: z.number().int().positive().max(50),
    /** Output column gets the bin midpoint as a number. */
    output: z.string(),
  }),
  z.object({
    op: z.literal('window'),
    /** Window over an existing column (after sorting by `sort_by`). */
    column: z.string(),
    sort_by: z.string(),
    size: z.number().int().positive().max(50),
    reducer: ReducerSchema,
    output: z.string(),
  }),
  z.object({
    op: z.literal('derived'),
    output: z.string(),
    /** Restricted arithmetic: ratio, delta, log, identity (rename). */
    expr: z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('ratio'), num: z.string(), den: z.string() }),
      z.object({ kind: z.literal('delta'), from: z.string(), to: z.string() }),
      z.object({ kind: z.literal('log10'), of: z.string() }),
      z.object({ kind: z.literal('identity'), of: z.string() }),
      z.object({ kind: z.literal('add'), a: z.string(), b: z.string() }),
      z.object({ kind: z.literal('sub'), a: z.string(), b: z.string() }),
      z.object({ kind: z.literal('mul'), a: z.string(), b: z.string() }),
      z.object({ kind: z.literal('div'), num: z.string(), den: z.string() }),
    ]),
  }),
  z.object({
    op: z.literal('limit'),
    n: z.number().int().positive().max(1000),
  }),
])
export type TransformOp = z.infer<typeof TransformOpSchema>

export const MarkSpecSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('line'), curve: z.enum(['linear', 'step', 'monotone-x']).optional() }),
  z.object({ type: z.literal('area'), curve: z.enum(['linear', 'step', 'monotone-x']).optional() }),
  z.object({ type: z.literal('bar'), orientation: z.enum(['vertical', 'horizontal']).default('vertical') }),
  z.object({ type: z.literal('dot'), r: z.number().positive().optional() }),
  z.object({ type: z.literal('rule'), axis: z.enum(['x', 'y']) }),
  z.object({ type: z.literal('text') }),
  z.object({ type: z.literal('tick'), axis: z.enum(['x', 'y']) }),
])
export type MarkSpec = z.infer<typeof MarkSpecSchema>

export const EncodingMapSchema = z.object({
  x: z.string().optional(),
  y: z.string().optional(),
  fill: z.string().optional(),
  stroke: z.string().optional(),
  text: z.string().optional(),
  fx: z.string().optional(),
  fy: z.string().optional(),
})
export type EncodingMap = z.infer<typeof EncodingMapSchema>

export const PlotSpecSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(120),
  caption: z.string().max(280).optional(),
  dataset: z.string().min(1),
  transform: z.array(TransformOpSchema).optional(),
  mark: MarkSpecSchema,
  encodings: EncodingMapSchema,
  /** When emit_empty=false (default), the figure is dropped from the
   *  ExecutedProjection if its post-transform data is empty. The LLM's
   *  prose template should not reference such figures.  */
  emit_empty: z.boolean().default(false),
})
export type PlotSpec = z.infer<typeof PlotSpecSchema>

const ScalarFilterSchema = z.object({
  column: z.string(),
  predicate: PredicateSchema,
}).optional()

export const ScalarRequestSchema = z.discriminatedUnion('op', [
  // Reducers over a numeric column.
  z.object({
    op: z.enum(['count', 'sum', 'mean', 'median', 'min', 'max']),
    id: z.string().min(1),
    dataset: z.string(),
    column: z.string(),
    filter: ScalarFilterSchema,
  }),
  z.object({
    op: z.enum(['p25', 'p50', 'p75', 'p95']),
    id: z.string().min(1),
    dataset: z.string(),
    column: z.string(),
    filter: ScalarFilterSchema,
  }),
  // First/last along a sort axis.
  z.object({
    op: z.enum(['first', 'last']),
    id: z.string().min(1),
    dataset: z.string(),
    column: z.string(),
    sort_by: z.string(),
    sort_order: z.enum(['asc', 'desc']).default('asc'),
    filter: ScalarFilterSchema,
  }),
  // Argmax/argmin: rank by one column, return value of another.
  z.object({
    op: z.enum(['argmax', 'argmin']),
    id: z.string().min(1),
    dataset: z.string(),
    rank_by: z.string(),
    return: z.string(),
    filter: ScalarFilterSchema,
  }),
  // Delta: last - first along a sort axis. Numeric only.
  z.object({
    op: z.literal('delta'),
    id: z.string().min(1),
    dataset: z.string(),
    column: z.string(),
    sort_by: z.string(),
    filter: ScalarFilterSchema,
  }),
  // Constant: pre-known string (e.g. status label) lifted into quoted_numerics
  // so prose may reference it. Value MUST appear verbatim in evidence; the
  // executor doesn't validate this — the parser pack is responsible.
  z.object({
    op: z.literal('const_string'),
    id: z.string().min(1),
    value: z.string(),
  }),
])
export type ScalarRequest = z.infer<typeof ScalarRequestSchema>

export const SPEC_VERSION = '1' as const

export const ProjectionSpecSchema = z.object({
  spec_version: z.literal(SPEC_VERSION),
  figures: z.array(PlotSpecSchema),
  scalars: z.array(ScalarRequestSchema),
  /** Markdown-flavoured prose. Placeholders: `{scalar:<id>}`,
   *  `{excerpt:<id>}`. Newlines preserve paragraphs. */
  prose_template: z.string(),
})
export type ProjectionSpec = z.infer<typeof ProjectionSpecSchema>

// ─── Executed projection (executor output) ────────────────────────────────

export const PreparedFigureSchema = z.object({
  id: z.string(),
  title: z.string(),
  caption_rendered: z.string().optional(),
  data: z.array(z.record(z.string(), TypedCellSchema)),
  mark: MarkSpecSchema,
  encodings: EncodingMapSchema,
})
export type PreparedFigure = z.infer<typeof PreparedFigureSchema>

export const QuotedNumericsSchema = z.record(
  z.string(),
  z.union([z.number(), z.string(), z.null()])
)
export type QuotedNumerics = z.infer<typeof QuotedNumericsSchema>

export const CiteIndexEntrySchema = z.object({
  scalar_id: z.string().optional(),
  excerpt_id: z.string().optional(),
  source_ref: SourceCitationSchema,
})
export type CiteIndexEntry = z.infer<typeof CiteIndexEntrySchema>

export const ExecutedProjectionSchema = z.object({
  spec_version: z.literal(SPEC_VERSION),
  figures: z.array(PreparedFigureSchema),
  quoted_numerics: QuotedNumericsSchema,
  prose: z.string(),
  cite_index: z.array(CiteIndexEntrySchema),
  source: z.enum(['llm', 'fallback']),
  generated_at: z.string(),
  model: z.string().optional(),
  /** Diagnostic only — copies through from TypedEvidence.fingerprint. */
  evidence_fingerprint: z.string().optional(),
  /** When source='fallback', a short human-readable reason — surfaced
   *  in the chrome as a dev hint so silent failures are debuggable
   *  without scraping server logs. Empty for source='llm'. */
  fallback_reason: z.string().optional(),
})
export type ExecutedProjection = z.infer<typeof ExecutedProjectionSchema>
