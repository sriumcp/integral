/**
 * mdast walk helpers — turn markdown into typed Excerpts + tables that
 * become TypedDatasets. Pure (synchronous over a parsed AST), no I/O.
 *
 * The numeric-harvester is gone deliberately: when a research-thread
 * holds raw narrative numerics inside paragraphs, the LLM should NOT
 * be allowed to lift them into prose without going through a typed
 * dataset / scalar request. We expose the *paragraph text verbatim*
 * via Excerpts (the LLM may reference them with `{excerpt:...}` and
 * the lint trusts the verbatim copy), but we never register raw
 * numerics from prose as scalars — that's how hallucination would creep
 * in via "0.34 was somewhere on README.md so the LLM may quote 0.34
 * as a metric." If a thread wants a number plotted, the parser pack
 * must find it in a typed source (table, JSON, CSV, frontmatter).
 */

import { fromMarkdown } from 'mdast-util-from-markdown'
import { gfmTable } from 'micromark-extension-gfm-table'
import { gfmTableFromMarkdown } from 'mdast-util-gfm-table'
import type {
  Code,
  Heading,
  List,
  Paragraph,
  Root,
  Table,
} from 'mdast'
import type {
  Excerpt,
  ExcerptKind,
  SourceCitation,
  TypedDataset,
  TypedRow,
  ColumnType,
} from '../../src/lib/projection/spec'

export interface ParsedMarkdown {
  excerpts: Excerpt[]
  tables: TypedDataset[]
}

/** A reasonable cap so a single absurdly long file can't dominate the
 *  prompt context. Truncates trailing material; preserves the first
 *  N excerpts in document order. */
const MAX_EXCERPTS_PER_FILE = 60

export function parseMarkdown(
  text: string,
  citationFile: string,
  excerptIdPrefix: string
): ParsedMarkdown {
  let tree: Root
  try {
    tree = fromMarkdown(text, {
      extensions: [gfmTable()],
      mdastExtensions: [gfmTableFromMarkdown()],
    })
  } catch {
    // Malformed markdown should not blow up the projection. Treat the
    // whole file as a single paragraph excerpt.
    return {
      excerpts: [{
        id: `${excerptIdPrefix}:raw`,
        text,
        kind: 'paragraph',
        source_ref: { file: citationFile },
      }],
      tables: [],
    }
  }

  const excerpts: Excerpt[] = []
  const tables: TypedDataset[] = []
  let tableCounter = 0
  let headingCounter = 0
  let paragraphCounter = 0
  let codeCounter = 0
  let listCounter = 0

  for (const node of tree.children) {
    if (excerpts.length >= MAX_EXCERPTS_PER_FILE) break
    const lineStart = node.position?.start.line
    const lineEnd = node.position?.end.line
    const ref: SourceCitation = {
      file: citationFile,
      ...(lineStart ? { line_start: lineStart } : {}),
      ...(lineEnd ? { line_end: lineEnd } : {}),
    }

    switch (node.type) {
      case 'heading': {
        const text = headingText(node as Heading)
        if (text.length === 0) break
        const slug = slugify(text)
        excerpts.push({
          // The kind tag ('heading') tells the LLM and chrome it's a
          // heading; we keep the text clean (no `##` prefix) so prose
          // substitutions don't leak markdown markers mid-sentence.
          id: `${excerptIdPrefix}:h:${slug || ++headingCounter}`,
          text,
          kind: 'heading' satisfies ExcerptKind,
          source_ref: ref,
        })
        break
      }
      case 'paragraph': {
        const text = paragraphText(node as Paragraph).trim()
        if (text.length === 0) break
        excerpts.push({
          id: `${excerptIdPrefix}:p:${++paragraphCounter}`,
          text,
          kind: 'paragraph' satisfies ExcerptKind,
          source_ref: ref,
        })
        break
      }
      case 'code': {
        const code = node as Code
        // Cap code excerpts so a giant code block doesn't dominate the
        // prompt; first 800 chars is the hint.
        const content = code.value.length > 800
          ? code.value.slice(0, 800) + '\n...'
          : code.value
        excerpts.push({
          id: `${excerptIdPrefix}:code:${++codeCounter}`,
          text: '```' + (code.lang ?? '') + '\n' + content + '\n```',
          kind: 'code' satisfies ExcerptKind,
          source_ref: ref,
        })
        break
      }
      case 'list': {
        const items = listItems(node as List)
        if (items.length === 0) break
        excerpts.push({
          id: `${excerptIdPrefix}:list:${++listCounter}`,
          text: items.map((i) => `- ${i}`).join('\n'),
          kind: 'list' satisfies ExcerptKind,
          source_ref: ref,
        })
        break
      }
      case 'table': {
        const ds = parseTable(node as Table, ref, `${excerptIdPrefix}:table:${++tableCounter}`)
        if (ds) tables.push(ds)
        break
      }
      default:
        break
    }
  }

  return { excerpts, tables }
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function headingText(node: Heading): string {
  return inlineText(node.children).trim()
}

function paragraphText(node: Paragraph): string {
  return inlineText(node.children)
}

interface InlineNode {
  type?: string
  value?: string
  children?: InlineNode[]
}

function inlineText(children: InlineNode[]): string {
  const out: string[] = []
  for (const c of children) {
    if (typeof c.value === 'string') out.push(c.value)
    else if (Array.isArray(c.children)) out.push(inlineText(c.children))
  }
  return out.join('')
}

function listItems(node: List): string[] {
  const out: string[] = []
  for (const item of node.children) {
    if (item.type !== 'listItem') continue
    const lines: string[] = []
    for (const c of item.children) {
      if (c.type === 'paragraph') lines.push(paragraphText(c as Paragraph))
    }
    const joined = lines.join(' ').trim()
    if (joined) out.push(joined)
  }
  return out
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}

/**
 * Turn an mdast `table` into a TypedDataset.
 *
 * Column type inference: numeric column iff every non-empty cell parses
 * as a finite number; otherwise string. (We do not infer dates; if a
 * column is a date the parser pack should normalise upstream.)
 */
function parseTable(
  node: Table,
  ref: SourceCitation,
  datasetName: string
): TypedDataset | null {
  if (node.children.length < 2) return null // need header + ≥1 data row
  const headerRow = node.children[0]!
  const rawHeaders: string[] = []
  for (const cell of headerRow.children) {
    rawHeaders.push(inlineText(cell.children).trim() || `col_${rawHeaders.length}`)
  }
  if (rawHeaders.length === 0) return null
  // Slugify so columns become safe identifiers (no spaces, no quotes, no
  // unicode quirks). The LLM sees the clean identifiers in the prompt
  // schema and references them consistently in its spec — without this
  // a header like "What's there" produces all sorts of round-trip bugs.
  const headers = uniqueSlugs(rawHeaders)

  const rawRows: string[][] = []
  for (let i = 1; i < node.children.length; i++) {
    const row: string[] = []
    const tr = node.children[i]!
    for (const cell of tr.children) {
      row.push(inlineText(cell.children).trim())
    }
    while (row.length < headers.length) row.push('')
    rawRows.push(row)
  }

  // Per-column type inference.
  const types: ColumnType[] = headers.map((_, ci) => {
    let allNumeric = true
    let anyData = false
    for (const r of rawRows) {
      const cell = r[ci] ?? ''
      if (cell === '') continue
      anyData = true
      if (!isFiniteNumeric(cell)) { allNumeric = false; break }
    }
    return anyData && allNumeric ? 'number' : 'string'
  })

  const rows: TypedRow[] = rawRows.map((r) => {
    const obj: TypedRow = {}
    headers.forEach((h, i) => {
      const cell = r[i] ?? ''
      if (cell === '') {
        obj[h] = null
      } else if (types[i] === 'number') {
        obj[h] = Number(cell)
      } else {
        obj[h] = cell
      }
    })
    return obj
  })

  return {
    name: datasetName,
    schema: { columns: headers.map((h, i) => ({ name: h, type: types[i]! })) },
    rows,
    source_ref: ref,
  }
}

function isFiniteNumeric(s: string): boolean {
  if (s.trim() === '') return false
  const n = Number(s)
  return Number.isFinite(n)
}

/**
 * Turn an arbitrary header string into a safe identifier:
 *  - lowercase
 *  - drop smart-quotes / curly quotes / apostrophes
 *  - non-[a-z0-9_] runs → single underscore
 *  - trim leading/trailing underscores
 *  - empty → 'col'
 *
 * Exported so CSV/JSON/etc. parsers can use the same rule.
 */
export function slugifyColumnName(s: string): string {
  const cleaned = s
    .normalize('NFKD')
    .replace(/[‘’“”'`]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_')
  return cleaned || 'col'
}

/**
 * Slugify each name and append `_2`, `_3`, … to disambiguate collisions.
 * Preserves order. Used so a table whose two headers slug to the same
 * identifier still produces distinct columns.
 */
export function uniqueSlugs(names: string[]): string[] {
  const seen = new Map<string, number>()
  const out: string[] = []
  for (const n of names) {
    const slug = slugifyColumnName(n)
    const count = (seen.get(slug) ?? 0) + 1
    seen.set(slug, count)
    out.push(count === 1 ? slug : `${slug}_${count}`)
  }
  return out
}
