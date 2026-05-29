/**
 * Research-thread parser pack.
 *
 * Reads markdown files inside the thread root, parses each into an mdast
 * tree, and emits TypedEvidence:
 *  - paragraphs / headings / code blocks / lists → Excerpts (LLM may
 *    quote them via `{excerpt:id}`; lint accepts the verbatim text)
 *  - markdown tables → TypedDatasets (columns type-inferred)
 *  - frontmatter → key/value Excerpts
 *  - sibling JSON / CSV files → TypedDatasets (when present, useful for
 *    threads that ship structured artifacts alongside narrative)
 *
 * Selection heuristic mirrors the previous projection plugin: README →
 * brief → PAPER → reconciliation → synthesis → notes → provenance →
 * alphabetical fill. Capped per zoom budget so a giant thread doesn't
 * dominate the prompt.
 */

import { promises as fs } from 'node:fs'
import * as path from 'node:path'
import { parse as csvParse } from 'csv-parse/sync'
import matter from 'gray-matter'
import type {
  Excerpt,
  SourceCitation,
  TypedDataset,
  TypedEvidence,
  TypedRow,
  ColumnType,
} from '../../src/lib/projection/spec'
import { computeFingerprint, type FingerprintInput } from './util-fingerprint'
import { parseMarkdown } from './util-mdast'
import { isMissing } from './util-errno'

export type ResearchThreadZoom = 'structure' | 'detail'

export interface ResearchThreadParseOptions {
  zoom: ResearchThreadZoom
}

const STRUCTURE_MAX_FILES = 3
const STRUCTURE_MAX_FILE_BYTES = 8 * 1024
const DETAIL_MAX_FILES = 10
const DETAIL_MAX_FILE_BYTES = 16 * 1024

const PRIORITY_PATTERNS: ReadonlyArray<RegExp> = [
  /^README\.md$/i,
  /brief\.md$/i,
  /^PAPER\.md$/i,
  /reconciliation\.md$/i,
  /synthesis\.md$/i,
  /^NOTES\.md$/i,
  /provenance\.md$/i,
]

interface FileEntry {
  name: string
  abspath: string
}

export async function parseResearchThread(
  rootPath: string,
  opts: ResearchThreadParseOptions
): Promise<TypedEvidence> {
  const maxFiles = opts.zoom === 'structure' ? STRUCTURE_MAX_FILES : DETAIL_MAX_FILES
  const maxBytes = opts.zoom === 'structure' ? STRUCTURE_MAX_FILE_BYTES : DETAIL_MAX_FILE_BYTES

  let dirents
  try {
    dirents = await fs.readdir(rootPath, { withFileTypes: true })
  } catch (err) {
    if (isMissing(err)) {
      return emptyEvidence()
    }
    throw err
  }

  const mdFiles: FileEntry[] = []
  const dataFiles: FileEntry[] = [] // CSV / JSON sidecars
  const subdirs: string[] = []
  for (const d of dirents) {
    if (d.name.startsWith('.')) continue
    const abspath = path.join(rootPath, d.name)
    if (d.isDirectory()) {
      subdirs.push(d.name)
      continue
    }
    if (!d.isFile()) continue
    const lower = d.name.toLowerCase()
    if (lower.endsWith('.md') || lower.endsWith('.markdown')) {
      mdFiles.push({ name: d.name, abspath })
    } else if (lower.endsWith('.csv') || lower.endsWith('.tsv') || lower.endsWith('.json')) {
      dataFiles.push({ name: d.name, abspath })
    }
  }

  const picked = selectFiles(mdFiles, maxFiles)

  const excerpts: Excerpt[] = []
  const datasets: TypedDataset[] = []
  const filesSeen: SourceCitation[] = []
  const fpInputs: FingerprintInput[] = []

  // Subdir overview as a frontmatter-style excerpt — useful chrome
  // signal for "what's in this thread."
  if (subdirs.length > 0) {
    excerpts.push({
      id: 'meta:subdirs',
      text: 'Top-level subdirectories: ' + subdirs.sort().join(', '),
      kind: 'frontmatter',
      source_ref: { file: '.' },
    })
  }

  for (const f of picked) {
    let content: string
    try {
      content = await readFileClamped(f.abspath, maxBytes)
    } catch (err) {
      if (isMissing(err)) continue
      throw err
    }
    filesSeen.push({ file: f.name })
    fpInputs.push({ rel: f.name, abs: f.abspath })

    // Frontmatter pass.
    const fm = safeFrontmatter(content)
    if (fm.data && Object.keys(fm.data).length > 0) {
      const text = Object.entries(fm.data)
        .map(([k, v]) => `${k}: ${stringifyShallow(v)}`)
        .join('\n')
      excerpts.push({
        id: `${f.name}:frontmatter`,
        text,
        kind: 'frontmatter',
        source_ref: { file: f.name },
      })
    }
    const body = fm.content ?? content

    const parsed = parseMarkdown(body, f.name, f.name)
    excerpts.push(...parsed.excerpts)
    datasets.push(...parsed.tables)
  }

  // CSV / JSON sidecar parsing.
  for (const f of dataFiles) {
    let raw: string
    try {
      const buf = await fs.readFile(f.abspath, 'utf-8')
      raw = buf.length > 64 * 1024 ? buf.slice(0, 64 * 1024) : buf
    } catch (err) {
      if (isMissing(err)) continue
      throw err
    }
    filesSeen.push({ file: f.name })
    fpInputs.push({ rel: f.name, abs: f.abspath })

    const lower = f.name.toLowerCase()
    if (lower.endsWith('.csv') || lower.endsWith('.tsv')) {
      const ds = parseCsvDataset(raw, f.name, lower.endsWith('.tsv') ? '\t' : ',')
      if (ds) datasets.push(ds)
    } else if (lower.endsWith('.json')) {
      const ds = parseJsonArrayDataset(raw, f.name)
      if (ds) datasets.push(ds)
    }
  }

  const fingerprint = await computeFingerprint(fpInputs)
  return { datasets, excerpts, files_seen: filesSeen, fingerprint }
}

// ─── File selection ──────────────────────────────────────────────────────

function selectFiles(files: FileEntry[], max: number): FileEntry[] {
  const ranked = [...files].sort((a, b) => {
    const ai = priorityRank(a.name)
    const bi = priorityRank(b.name)
    if (ai !== bi) return ai - bi
    return a.name.localeCompare(b.name)
  })
  return ranked.slice(0, max)
}

function priorityRank(name: string): number {
  for (let i = 0; i < PRIORITY_PATTERNS.length; i++) {
    if (PRIORITY_PATTERNS[i]!.test(name)) return i
  }
  return PRIORITY_PATTERNS.length
}

async function readFileClamped(abspath: string, maxBytes: number): Promise<string> {
  const buf = await fs.readFile(abspath, 'utf-8')
  return buf.length <= maxBytes ? buf : buf.slice(0, maxBytes) + '\n\n…(truncated)'
}

// ─── Frontmatter + sidecar parsers ───────────────────────────────────────

function safeFrontmatter(text: string): { data: Record<string, unknown>; content: string } {
  try {
    const parsed = matter(text)
    return { data: (parsed.data ?? {}) as Record<string, unknown>, content: parsed.content ?? text }
  } catch {
    return { data: {}, content: text }
  }
}

function stringifyShallow(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  try {
    return JSON.stringify(v)
  } catch {
    return String(v)
  }
}

function parseCsvDataset(
  raw: string,
  fileName: string,
  delimiter: ',' | '\t'
): TypedDataset | null {
  let records: Record<string, string>[]
  try {
    records = csvParse(raw, {
      columns: true,
      skip_empty_lines: true,
      delimiter,
      trim: true,
    }) as Record<string, string>[]
  } catch {
    return null
  }
  if (records.length === 0) return null
  const headers = Object.keys(records[0]!)
  if (headers.length === 0) return null

  const types: ColumnType[] = headers.map((h) => {
    let allNumeric = true
    let anyData = false
    for (const r of records) {
      const cell = r[h] ?? ''
      if (cell === '') continue
      anyData = true
      if (!Number.isFinite(Number(cell))) { allNumeric = false; break }
    }
    return anyData && allNumeric ? 'number' : 'string'
  })

  const rows: TypedRow[] = records.map((r) => {
    const obj: TypedRow = {}
    headers.forEach((h, i) => {
      const cell = r[h] ?? ''
      if (cell === '') obj[h] = null
      else if (types[i] === 'number') obj[h] = Number(cell)
      else obj[h] = cell
    })
    return obj
  })

  return {
    name: datasetNameForFile(fileName),
    schema: { columns: headers.map((h, i) => ({ name: h, type: types[i]! })) },
    rows,
    source_ref: { file: fileName },
  }
}

function parseJsonArrayDataset(raw: string, fileName: string): TypedDataset | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (!Array.isArray(parsed) || parsed.length === 0) return null
  if (typeof parsed[0] !== 'object' || parsed[0] === null) return null

  const headers = Array.from(
    new Set(parsed.flatMap((r) => (typeof r === 'object' && r !== null ? Object.keys(r) : []))),
  )
  if (headers.length === 0) return null

  const records = parsed as Record<string, unknown>[]
  const types: ColumnType[] = headers.map((h) => {
    let allNumeric = true
    let allBool = true
    let anyData = false
    for (const r of records) {
      const v = r[h]
      if (v === null || v === undefined) continue
      anyData = true
      if (typeof v !== 'number' || !Number.isFinite(v)) allNumeric = false
      if (typeof v !== 'boolean') allBool = false
    }
    if (anyData && allNumeric) return 'number'
    if (anyData && allBool) return 'bool'
    return 'string'
  })

  const rows: TypedRow[] = records.map((r) => {
    const obj: TypedRow = {}
    headers.forEach((h, i) => {
      const v = r[h]
      if (v === null || v === undefined) obj[h] = null
      else if (types[i] === 'number' && typeof v === 'number') obj[h] = v
      else if (types[i] === 'bool' && typeof v === 'boolean') obj[h] = v
      else obj[h] = typeof v === 'string' ? v : JSON.stringify(v)
    })
    return obj
  })

  return {
    name: datasetNameForFile(fileName),
    schema: { columns: headers.map((h, i) => ({ name: h, type: types[i]! })) },
    rows,
    source_ref: { file: fileName },
  }
}

function datasetNameForFile(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_]/g, '_')
}

function emptyEvidence(): TypedEvidence {
  return {
    datasets: [],
    excerpts: [],
    files_seen: [],
    fingerprint: 'empty',
  }
}
