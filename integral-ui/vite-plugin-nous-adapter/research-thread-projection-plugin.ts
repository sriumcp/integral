/**
 * Research-thread projection plugin — structure + detail.
 *
 * Lives server-side because it does I/O: at projection time it reads
 * selected markdown files + the directory tree from the thread's
 * `root_anchor`. The browser-safe plugins (nous-campaign,
 * nous-iteration) read pre-loaded fields from the workspace; this one
 * pulls fresh content from disk at projection time.
 *
 * The reads are bounded:
 *  - structure: ≤3 markdown files, each clamped to ≤8 kB
 *  - detail:    ≤10 markdown files, each clamped to ≤16 kB
 * Combined with the projection cache (keyed on state.last_advanced_at,
 * which is the directory mtime for a research-thread), repeated reads
 * are free until the user touches the directory.
 *
 * Selection heuristic:
 *  - Always prefer README.md (root)
 *  - Then any *brief*.md (case-insensitive)
 *  - Then PAPER.md
 *  - Then RECONCILIATION.md / SYNTHESIS.md / NOTES.md
 *  - Then alphabetical fill until the budget is exhausted
 *
 * The projection layer encodes "what's important" for the LLM to
 * synthesize. Users with non-conforming filenames still get a
 * reasonable rendering (alphabetical fill catches whatever's there).
 */

import { promises as fs } from 'node:fs'
import * as path from 'node:path'
import type { ProjectionContext } from '../src/lib/projection'
import type { KindProjectionPlugin } from '../src/lib/projection'

// ─── Tunables ─────────────────────────────────────────────────────────────

const STRUCTURE_MAX_FILES = 3
const STRUCTURE_MAX_FILE_BYTES = 8 * 1024
const DETAIL_MAX_FILES = 10
const DETAIL_MAX_FILE_BYTES = 16 * 1024

// ─── Selection heuristic ──────────────────────────────────────────────────

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

function selectFiles(
  files: FileEntry[],
  max: number,
): FileEntry[] {
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
  return PRIORITY_PATTERNS.length // alphabetical fill
}

// ─── Disk reads ───────────────────────────────────────────────────────────

interface ThreadSnapshot {
  /** Top-level files (immediate children of the root). */
  files: FileEntry[]
  /** Top-level subdirectory names (e.g. `runs/`, `drafts/`). */
  subdirs: string[]
}

async function readSnapshot(rootPath: string): Promise<ThreadSnapshot> {
  let dirents
  try {
    dirents = await fs.readdir(rootPath, { withFileTypes: true })
  } catch {
    return { files: [], subdirs: [] }
  }
  const files: FileEntry[] = []
  const subdirs: string[] = []
  for (const d of dirents) {
    if (d.name.startsWith('.')) continue
    const abspath = path.join(rootPath, d.name)
    if (d.isFile() && d.name.toLowerCase().endsWith('.md')) {
      files.push({ name: d.name, abspath })
    } else if (d.isDirectory()) {
      subdirs.push(d.name)
    }
  }
  return { files, subdirs }
}

async function readFileClamped(
  abspath: string,
  maxBytes: number,
): Promise<string> {
  try {
    const buf = await fs.readFile(abspath, 'utf-8')
    if (buf.length <= maxBytes) return buf
    return buf.slice(0, maxBytes) + '\n\n…(truncated)'
  } catch {
    return ''
  }
}

// ─── Anchor unwrap ────────────────────────────────────────────────────────

function rootAnchorPath(intent: ProjectionContext['intent']): string | null {
  const ext = intent.extension
  if (ext.kind !== 'research-thread') return null
  const uri = ext.root_anchor.uri
  // Convention: ExternalAnchor for filesystem-path uses `file://` scheme.
  if (uri.startsWith('file://')) return uri.slice('file://'.length)
  // Tolerate bare paths too, in case earlier callers omitted the scheme.
  if (uri.startsWith('/')) return uri
  return null
}

// ─── Prompt assembly ──────────────────────────────────────────────────────

interface PromptBlock {
  threadName: string
  subdirs: string[]
  fileBlocks: { name: string; content: string }[]
}

function renderBlock(block: PromptBlock): string {
  const lines: string[] = []
  lines.push(`Thread: ${block.threadName}`)
  if (block.subdirs.length > 0) {
    lines.push(`Top-level subdirectories: ${block.subdirs.sort().join(', ')}`)
  }
  for (const f of block.fileBlocks) {
    lines.push('')
    lines.push(`# ${f.name}`)
    lines.push(f.content)
  }
  return lines.join('\n')
}

// ─── Plugin ───────────────────────────────────────────────────────────────

export const researchThreadPlugin: KindProjectionPlugin = {
  kind: 'research-thread',

  async structure(ctx: ProjectionContext) {
    const root = rootAnchorPath(ctx.intent)
    if (!root) {
      return { content: '', source: 'llm' as const }
    }
    const snapshot = await readSnapshot(root)
    const picked = selectFiles(snapshot.files, STRUCTURE_MAX_FILES)
    const fileBlocks = await Promise.all(
      picked.map(async (f) => ({
        name: f.name,
        content: await readFileClamped(f.abspath, STRUCTURE_MAX_FILE_BYTES),
      })),
    )
    const block = renderBlock({
      threadName: ctx.intent.declaration.title,
      subdirs: snapshot.subdirs,
      fileBlocks,
    })
    const prompt = [
      'You are rendering a one-paragraph "structure-zoom" projection of a research thread.',
      'A research thread is a loose-shaped folder of work-in-progress: markdown briefs, run dirs, paper drafts, reconciliation notes. The reader is a researcher scanning their workspace; they want to know, at a glance, what this thread is about and where it stands.',
      '',
      '# Thread content',
      block,
      '',
      '# Output requirements',
      '- ≤800 characters total. Do not exceed this budget.',
      '- One paragraph. No headers, no bullet lists, no markdown.',
      '- Lead with what the thread is investigating; follow with what has been done so far and where it stands today.',
      '- Plain prose. Do not address the reader. Do not start with "This thread…" — start with the substance.',
    ].join('\n')
    const content = await ctx.llm.generate(prompt)
    return { content, source: 'llm' as const }
  },

  async detail(ctx: ProjectionContext) {
    const root = rootAnchorPath(ctx.intent)
    if (!root) {
      return { content: '', source: 'llm' as const }
    }
    const snapshot = await readSnapshot(root)
    const picked = selectFiles(snapshot.files, DETAIL_MAX_FILES)
    const fileBlocks = await Promise.all(
      picked.map(async (f) => ({
        name: f.name,
        content: await readFileClamped(f.abspath, DETAIL_MAX_FILE_BYTES),
      })),
    )
    const block = renderBlock({
      threadName: ctx.intent.declaration.title,
      subdirs: snapshot.subdirs,
      fileBlocks,
    })
    const prompt = [
      'You are rendering a "detail-zoom" projection of a research thread — a multi-paragraph synthesis for a researcher who wants to dig in.',
      'The reader is reviewing this thread in depth; they want to understand what is being investigated, what iterations or experiments have been done, what has been learned, and where the work stands now.',
      '',
      '# Thread content',
      block,
      '',
      '# Output requirements',
      '- 3 to 5 paragraphs.',
      '- No markdown headers, no bullet lists. Plain prose paragraphs separated by blank lines.',
      '- First paragraph: what the thread investigates and why it exists.',
      '- Middle paragraphs: the actual research arc — what each iteration / experiment / draft contributed; be specific about findings, including null and inconclusive results.',
      '- Final paragraph: where the work stands today and what is open.',
      '- Plain prose. Do not address the reader. Do not start with "This thread…".',
    ].join('\n')
    const content = await ctx.llm.generate(prompt)
    return { content, source: 'llm' as const }
  },
}
