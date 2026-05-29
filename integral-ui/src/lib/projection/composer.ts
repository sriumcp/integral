/**
 * LLM Composer — server-side, mock-seamed.
 *
 * The composer is the *only* point in the pipeline that talks to an LLM.
 * It builds a prompt that exposes:
 *  - dataset schemas (column names + types) and ≤6-row samples
 *  - excerpt index (id + ≤120-char preview)
 *  - DSL grammar (concise; LLM emits a JSON ProjectionSpec)
 *  - kind+zoom-aware narrative-arc instruction
 *
 * Crucially, the LLM is NEVER shown:
 *  - bulk numerics from datasets (it sees a sample, not the full data)
 *  - full text of large excerpts (it sees a preview)
 *
 * The LLM emits a `ProjectionSpec` JSON blob; the composer extracts the
 * first balanced JSON object and validates with Zod. On schema violation,
 * one retry with the validation error included in the prompt; on second
 * failure, throw a typed error (the calling plugin returns a fallback
 * projection deterministically).
 *
 * Test seam: `LLMClient` is injected. Tests pass a `vi.fn()` that returns
 * canned strings — never a real network call.
 */

import type { LLMClient } from '../projection'
import {
  ProjectionSpecSchema,
  type ProjectionSpec,
  type TypedDataset,
  type TypedEvidence,
  SPEC_VERSION,
} from './spec'
import type { IntentKind, ZoomLevel } from '../../schema'

export class ComposerError extends Error {
  readonly cause_: unknown
  constructor(message: string, cause_?: unknown) {
    super(message)
    this.name = 'ComposerError'
    this.cause_ = cause_
  }
}

export interface ComposerOptions {
  evidence: TypedEvidence
  zoom: Extract<ZoomLevel, 'structure' | 'detail'>
  kind: IntentKind
  llm: LLMClient
  /** Free-form per-call narrative context the parser pack wants the LLM
   *  to attend to (e.g. "this is iteration 3 of an 8-iteration arc"). */
  intent_summary: string
  /** Seed for deterministic tests (sample row picking). Defaults to 0. */
  seed?: number
}

export async function composeProjectionSpec(
  opts: ComposerOptions
): Promise<ProjectionSpec> {
  const prompt = buildPrompt(opts)
  let raw = await opts.llm.generate(prompt)
  let extracted = extractJsonObject(raw)
  let parsed = extracted
    ? ProjectionSpecSchema.safeParse(extracted)
    : null

  if (!parsed || !parsed.success) {
    // One retry — feed back the validation error so the LLM can correct.
    const issues = parsed && !parsed.success
      ? JSON.stringify(parsed.error.issues, null, 2)
      : 'spec did not parse as a JSON object'
    const retryPrompt = prompt + '\n\n# Previous attempt failed validation\n' +
      'Your previous response did not validate against the spec schema. Specific issues:\n' +
      '```\n' + issues + '\n```\n' +
      'Re-emit the JSON object, addressing each issue. Do not include any text before or after the JSON.'
    raw = await opts.llm.generate(retryPrompt)
    extracted = extractJsonObject(raw)
    parsed = extracted ? ProjectionSpecSchema.safeParse(extracted) : null
    if (!parsed || !parsed.success) {
      const finalIssues = parsed && !parsed.success
        ? JSON.stringify(parsed.error.issues, null, 2)
        : 'spec did not parse as a JSON object after retry'
      throw new ComposerError(
        `LLM produced invalid ProjectionSpec after retry: ${finalIssues}`
      )
    }
  }

  // Pre-execution sanity: verify every figure dataset + every scalar
  // dataset references something present in evidence. Fast-fail before
  // executor explodes; produces a clearer error.
  const known = new Set(opts.evidence.datasets.map((d) => d.name))
  for (const f of parsed.data.figures) {
    if (!known.has(f.dataset)) {
      throw new ComposerError(
        `figure '${f.id}' references unknown dataset '${f.dataset}' (known: ${[...known].join(', ')})`
      )
    }
  }
  for (const s of parsed.data.scalars) {
    if (s.op === 'const_string') continue
    if (!known.has(s.dataset)) {
      throw new ComposerError(
        `scalar '${s.id}' references unknown dataset '${s.dataset}' (known: ${[...known].join(', ')})`
      )
    }
  }

  return parsed.data
}

// ─── Prompt assembly ─────────────────────────────────────────────────────

export function buildPrompt(opts: ComposerOptions): string {
  const lines: string[] = []
  lines.push(systemPreamble())
  lines.push('')
  lines.push('# Subject')
  lines.push(`Kind: ${opts.kind}`)
  lines.push(`Zoom: ${opts.zoom}`)
  lines.push('')
  lines.push('# Intent context')
  lines.push(opts.intent_summary)
  lines.push('')
  lines.push('# Available datasets')
  if (opts.evidence.datasets.length === 0) {
    lines.push('(no datasets — your figures array MUST be empty)')
  } else {
    for (const d of opts.evidence.datasets) {
      lines.push(renderDataset(d, opts.seed ?? 0))
    }
  }
  lines.push('')
  lines.push('# Available excerpts (for {excerpt:id} references)')
  if (opts.evidence.excerpts.length === 0) {
    lines.push('(none)')
  } else {
    for (const e of opts.evidence.excerpts) {
      const preview = e.text.length > 120 ? e.text.slice(0, 117) + '...' : e.text
      lines.push(`- ${e.id} [${e.kind}]: ${preview.replace(/\n/g, ' ')}`)
    }
  }
  lines.push('')
  lines.push('# DSL grammar (emit a JSON object that conforms exactly)')
  lines.push(dslGrammar())
  lines.push('')
  lines.push('# Narrative-arc instruction')
  lines.push(narrativeArcInstruction(opts.kind, opts.zoom))
  lines.push('')
  lines.push('# Output')
  lines.push('Emit a single JSON object. No prose before or after. The object MUST validate against the schema above.')
  return lines.join('\n')
}

function systemPreamble(): string {
  return [
    'You are an analyst-narrator for a research substrate. Your job:',
    '  1. Pick a small number of figures (0–4) that tell the most informative',
    '     story given the available datasets. ZERO figures is fine when there',
    '     are no datasets — many projections are excerpt-only narratives.',
    '  2. Request scalars (named numeric values + a few const-strings) that',
    '     the prose will reference, when they make the story land harder.',
    '  3. Author a `prose_template` that stitches {scalar:id} for computed',
    '     numbers and {excerpt:id} for verbatim source text into a clean',
    '     narrative arc.',
    '',
    'CRITICAL DISCIPLINE — you are an analyst, never a calculator:',
    '  - You MUST NOT write any free-floating digit or numeric value into',
    '    the prose template. Either use {scalar:id} (the substrate computes',
    '    it deterministically) or quote a digit-bearing excerpt via',
    '    {excerpt:foo} (digits inside substituted excerpt text are allowed',
    '    because the excerpt was read verbatim from disk and carries a',
    '    source citation).',
    '  - You MUST NOT invent column values, row counts, or aggregate values.',
    '    Use the scalar DSL to *request* aggregations; the substrate computes',
    '    them.',
    '  - You MUST NOT reference a dataset / excerpt that does not appear in',
    '    the lists below.',
    '  - You MUST NOT include trailing punctuation or commentary outside the',
    '    JSON object. The substrate parses the first balanced { ... } object.',
    '  - If a dataset is empty, do NOT request a figure for it. The substrate',
    '    drops empty figures and your prose would reference dangling figures.',
    '',
    'EXCERPT-FIRST WHEN NO DATASETS — when the evidence has no datasets',
    '(e.g. a research thread with markdown notes only), figures should be',
    '[] and the prose should be composed largely from `{excerpt:id}`',
    'quotations stitched into a clean narrative arc with brief connective',
    'prose between them. Quote sparingly (the strongest 2–4 excerpts) —',
    'do not concatenate every excerpt; choose what tells the story.',
    '',
    'FIGURE QUALITY — refuse to ship a chart that wouldn\'t make sense:',
    '  - For line / area / bar / dot marks the **y** encoding MUST point',
    '    at a column whose schema type is `number` (or whose value becomes',
    '    numeric after a `group_by` aggregate / a `derived` op). A bar',
    '    chart with a string-typed y will render as empty axes; the',
    '    substrate drops it and your prose will reference a dangling figure.',
    '  - Bar charts: keep ≤ 8 categories on the x-axis. If a category column',
    '    has more than 8 distinct values, prefer a `limit: 8` after a sort,',
    '    or drop the figure.',
    '  - When choosing what to plot, prefer columns the dataset schema',
    '    flagged `type: number`. Counts via `group_by + count` are also fine.',
    '  - Don\'t request a figure unless it tells a real story. Two good',
    '    figures > four mediocre ones; zero figures > one figure that the',
    '    substrate has to drop.',
  ].join('\n')
}

function renderDataset(d: TypedDataset, seed: number): string {
  const sample = sampleRows(d.rows, 6, seed)
  const cols = d.schema.columns.map((c) => `${c.name}:${c.type}`).join(', ')
  const lines: string[] = []
  lines.push(`## dataset \`${d.name}\``)
  lines.push(`columns: ${cols}`)
  lines.push(`rows: ${d.rows.length}`)
  lines.push('sample (head + random):')
  if (sample.length === 0) {
    lines.push('  (empty)')
  } else {
    const headerCols = d.schema.columns.map((c) => c.name)
    lines.push('  | ' + headerCols.join(' | ') + ' |')
    for (const r of sample) {
      lines.push('  | ' + headerCols.map((c) => formatCell(r[c])).join(' | ') + ' |')
    }
  }
  return lines.join('\n')
}

function sampleRows<T>(rows: T[], n: number, seed: number): T[] {
  if (rows.length <= n) return rows
  const headN = Math.min(3, n)
  const out: T[] = rows.slice(0, headN)
  // Pick remaining `n - headN` rows by deterministic stride starting at
  // an offset derived from `seed`. Avoids RNG, stays reproducible.
  const remaining = n - headN
  const startIdx = headN + (Math.abs(seed) % Math.max(1, rows.length - headN))
  const stride = Math.max(1, Math.floor((rows.length - headN) / Math.max(1, remaining)))
  for (let i = 0; i < remaining; i++) {
    const idx = ((startIdx - headN + i * stride) % (rows.length - headN)) + headN
    out.push(rows[idx]!)
  }
  return out
}

function formatCell(v: unknown): string {
  if (v === null || v === undefined) return 'null'
  if (typeof v === 'string') return v.length > 24 ? v.slice(0, 21) + '...' : v
  return String(v)
}

function dslGrammar(): string {
  return [
    '```jsonschema',
    `{`,
    `  "spec_version": "${SPEC_VERSION}",`,
    `  "figures": [PlotSpec ...],`,
    `  "scalars": [ScalarRequest ...],`,
    `  "prose_template": "markdown with {scalar:id} and {excerpt:id} placeholders"`,
    `}`,
    `PlotSpec = {`,
    `  id: string  // unique within figures`,
    `  title: string  // ≤120 chars`,
    `  caption?: string  // ≤280 chars; may use {scalar:id} refs`,
    `  dataset: string  // must match a dataset.name above`,
    `  transform?: TransformOp[]  // applied in order`,
    `  mark: { type: 'line'|'area'|'bar'|'dot'|'rule'|'text'|'tick', ... }`,
    `  encodings: { x?: string; y?: string; fill?: string; stroke?: string; text?: string; fx?: string; fy?: string }`,
    `  emit_empty?: boolean  // default false; true keeps figure even with 0 rows`,
    `}`,
    `TransformOp =`,
    `  | { op: 'filter'; column; predicate: Predicate }`,
    `  | { op: 'sort'; column; order: 'asc'|'desc' }`,
    `  | { op: 'group_by'; columns: string[]; aggregate: { col: 'count'|'sum'|'mean'|'median'|'min'|'max'|'first'|'last' } }`,
    `       // Note: aggregate's keys are columns to AGGREGATE; the output column name is the same as the input. To produce a NEW count column without overwriting the grouping label, use 'count_by' instead.`,
    `  | { op: 'count_by'; columns: string[]; output: string }`,
    `       // Count rows per (columns) group. Preserves grouping cols intact. Use this for "frequency per category" charts. Example:`,
    `       //   transform: [{ op: 'count_by', columns: ['type'], output: 'n' }]`,
    `       //   encodings: { x: 'type', y: 'n' }   ← x is the category, y is the count`,
    `  | { op: 'bin'; column; bins: int (≤50); output: string }`,
    `  | { op: 'window'; column; sort_by; size: int (≤50); reducer: same as group_by; output: string }`,
    `  | { op: 'derived'; output: string; expr: { kind: 'ratio'|'delta'|'log10'|'identity'|'add'|'sub'|'mul'|'div', ... } }`,
    `  | { op: 'limit'; n: int }`,
    `Predicate =`,
    `  | { op: 'eq'|'ne'; value: any }`,
    `  | { op: 'gt'|'gte'|'lt'|'lte'; value: number }`,
    `  | { op: 'in'; values: any[] }`,
    `  | { op: 'not_null' } | { op: 'is_null' }`,
    `ScalarRequest =`,
    `  | { op: 'count'|'sum'|'mean'|'median'|'min'|'max'; id; dataset; column; filter? }`,
    `  | { op: 'p25'|'p50'|'p75'|'p95'; id; dataset; column; filter? }`,
    `  | { op: 'first'|'last'; id; dataset; column; sort_by; sort_order?: 'asc'|'desc'; filter? }`,
    `  | { op: 'argmax'|'argmin'; id; dataset; rank_by; return; filter? }`,
    `  | { op: 'delta'; id; dataset; column; sort_by; filter? }`,
    `  | { op: 'const_string'; id; value: string }`,
    `Predicate filter shape: { column: string; predicate: Predicate }`,
    '```',
  ].join('\n')
}

function narrativeArcInstruction(kind: IntentKind, zoom: 'structure' | 'detail'): string {
  const common = [
    'Tell the *story* the data shows. The reader is a researcher scanning their workspace.',
    'A great projection has:',
    '  - 1–2 figures (structure) or 2–4 figures (detail), each making one clean point.',
    '  - A short prose arc that leads with what was investigated, then what was learned, then what is open.',
    '  - Every claim grounded in a {scalar:id} or {excerpt:id} reference.',
    '  - No filler, no salutation, no "this campaign...", no addressing the reader.',
  ]
  const perKind: Partial<Record<IntentKind, string[]>> = {
    'nous-campaign': [
      'Lead with the research question (excerpt:rq if present).',
      'Use the `iterations` dataset to show progress: best / median / final h_main_result by iteration.',
      'Surface principles confidence distribution if `principles` is present.',
      zoom === 'detail'
        ? 'Walk the iteration arc: what each family tested and what it found. Use h_main_result counts to motivate the narrative.'
        : 'One paragraph: what was investigated, where the campaign sits, what is open.',
    ],
    'nous-iteration': [
      'Lead with the iteration\'s h_main:statement excerpt.',
      'Show how this iteration sits relative to siblings (siblings dataset).',
      zoom === 'detail'
        ? 'Walk: what was hypothesized, what was measured, what the result implies.'
        : 'One paragraph linking hypothesis → measurement → result.',
    ],
    'research-thread': [
      'Lead with what the thread is investigating (use the most relevant heading or paragraph excerpt).',
      'If a table or sidecar dataset is present, show it as a figure.',
      zoom === 'detail'
        ? 'Walk the arc: what was studied, what landed, what is open. Quote concrete excerpts where they sharpen the story.'
        : 'One paragraph: what is being investigated and where the work stands.',
    ],
  }
  const tail = perKind[kind] ?? []
  return [...common, ...tail].join('\n')
}

// ─── JSON extraction ─────────────────────────────────────────────────────

/**
 * Find the first balanced `{...}` JSON object in a string. Tolerates the
 * LLM wrapping it in ```json fences, prose, or trailing commentary.
 * Returns the parsed value, or null if no balanced object found / parse
 * fails.
 */
export function extractJsonObject(raw: string): unknown {
  // Strip a leading code-fence if present.
  let s = raw.trim()
  const fenceMatch = s.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/)
  if (fenceMatch) s = fenceMatch[1]!.trim()

  // Find first '{' and walk for balance.
  const start = s.indexOf('{')
  if (start < 0) return null
  let depth = 0
  let inString = false
  let escape = false
  for (let i = start; i < s.length; i++) {
    const ch = s[i]
    if (inString) {
      if (escape) escape = false
      else if (ch === '\\') escape = true
      else if (ch === '"') inString = false
    } else {
      if (ch === '"') inString = true
      else if (ch === '{') depth++
      else if (ch === '}') {
        depth--
        if (depth === 0) {
          const candidate = s.slice(start, i + 1)
          try {
            return JSON.parse(candidate)
          } catch {
            return null
          }
        }
      }
    }
  }
  return null
}
