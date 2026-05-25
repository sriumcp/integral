import { promises as fs, type Dirent } from 'node:fs'
import * as path from 'node:path'
import type {
  CoralSource,
  ParsedAttempt,
  ParsedRoleFile,
  RunFiles,
} from '../src/adapters/coral'

/**
 * FilesystemCoralSource — reads a Coral project directory.
 *
 * Layout it expects (verified against `~/Documents/learning/coral/pi-mc/`):
 *
 *   <root>/
 *     task.yaml                                       ← campaign decl
 *     seed/, grader/                                  ← untouched
 *     results/<task-name>/<timestamp>/
 *       .coral/public/
 *         attempts/<commit-sha>.json
 *         notes/index.md + notes/experiments/*.md
 *         roles/agent-N.md
 *
 * Run-id format: `<task-name>/<timestamp>` (the slash is structural — one
 * task can have many timestamps). The interpreter slugs appropriately.
 *
 * Node-only — must not be imported into browser bundles.
 */
export class FilesystemCoralSource implements CoralSource {
  readonly id: string
  readonly label: string
  private root: string

  constructor(root: string) {
    this.root = path.resolve(root)
    this.id = `fs:${this.root}`
    this.label = this.root
  }

  async listRunIds(): Promise<string[]> {
    const resultsDir = path.join(this.root, 'results')
    const found: string[] = []
    let taskDirs: Dirent[]
    try {
      taskDirs = await fs.readdir(resultsDir, { withFileTypes: true })
    } catch {
      return []
    }
    for (const t of taskDirs) {
      if (!t.isDirectory() || t.name.startsWith('.')) continue
      const taskPath = path.join(resultsDir, t.name)
      let runDirs: Dirent[]
      try {
        runDirs = await fs.readdir(taskPath, { withFileTypes: true })
      } catch {
        continue
      }
      for (const r of runDirs) {
        if (!r.isDirectory() || r.name.startsWith('.')) continue
        // Filter to dirs that look like Coral runs (have a .coral/public/
        // subdir). Skips bookkeeping files like `.coral_tmux_session`.
        const publicDir = path.join(taskPath, r.name, '.coral', 'public')
        try {
          const st = await fs.stat(publicDir)
          if (st.isDirectory()) {
            found.push(`${t.name}/${r.name}`)
          }
        } catch {
          // No .coral/public — not a finished run yet; skip.
        }
      }
    }
    return found.sort()
  }

  async fetchRunFiles(runId: string): Promise<RunFiles> {
    const taskYamlPath = path.join(this.root, 'task.yaml')
    const runDir = path.join(this.root, 'results', runId)
    const publicDir = path.join(runDir, '.coral', 'public')
    const attemptsDir = path.join(publicDir, 'attempts')
    const notesDir = path.join(publicDir, 'notes')
    const rolesDir = path.join(publicDir, 'roles')

    const [taskYaml, runDirMtime, attempts, notes, roles] = await Promise.all([
      readOrEmpty(taskYamlPath),
      statMtimeOrNull(runDir),
      readAttempts(attemptsDir),
      listNotes(notesDir),
      readRoles(rolesDir),
    ])

    return {
      taskYaml,
      ...(runDirMtime ? { runDirMtime } : {}),
      attempts,
      notes,
      roles,
    }
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────

async function readOrEmpty(p: string): Promise<string> {
  try {
    return await fs.readFile(p, 'utf-8')
  } catch {
    return ''
  }
}

async function statMtimeOrNull(p: string): Promise<string | null> {
  try {
    const st = await fs.stat(p)
    return st.mtime.toISOString()
  } catch {
    return null
  }
}

async function readAttempts(dir: string): Promise<ParsedAttempt[]> {
  let entries: Dirent[]
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return []
  }
  const out: ParsedAttempt[] = []
  for (const e of entries) {
    if (!e.isFile() || !e.name.endsWith('.json')) continue
    try {
      const raw = await fs.readFile(path.join(dir, e.name), 'utf-8')
      const parsed = JSON.parse(raw) as unknown
      if (
        parsed &&
        typeof parsed === 'object' &&
        typeof (parsed as ParsedAttempt).commit_hash === 'string' &&
        typeof (parsed as ParsedAttempt).agent_id === 'string' &&
        typeof (parsed as ParsedAttempt).title === 'string' &&
        typeof (parsed as ParsedAttempt).score === 'number' &&
        typeof (parsed as ParsedAttempt).status === 'string' &&
        typeof (parsed as ParsedAttempt).timestamp === 'string'
      ) {
        out.push(parsed as ParsedAttempt)
      }
    } catch {
      // Skip malformed JSON. v0.2 may surface a parse-error indicator.
    }
  }
  // Sort deterministically by timestamp then commit_hash. Real Coral
  // writes attempts roughly in time order but we don't depend on filename
  // ordering from `readdir`.
  out.sort((a, b) => {
    if (a.timestamp !== b.timestamp) return a.timestamp < b.timestamp ? -1 : 1
    return a.commit_hash < b.commit_hash ? -1 : 1
  })
  return out
}

async function listNotes(dir: string): Promise<string[]> {
  const out: string[] = []
  await walkMd(dir, '', out)
  return out.sort()
}

async function walkMd(
  baseDir: string,
  relPrefix: string,
  out: string[]
): Promise<void> {
  let entries: Dirent[]
  try {
    entries = await fs.readdir(path.join(baseDir, relPrefix), {
      withFileTypes: true,
    })
  } catch {
    return
  }
  for (const e of entries) {
    if (e.name.startsWith('.')) continue
    const rel = relPrefix ? `${relPrefix}/${e.name}` : e.name
    if (e.isDirectory()) {
      await walkMd(baseDir, rel, out)
    } else if (e.isFile() && e.name.endsWith('.md')) {
      out.push(rel)
    }
  }
}

async function readRoles(dir: string): Promise<Map<string, ParsedRoleFile>> {
  const out = new Map<string, ParsedRoleFile>()
  let entries: Dirent[]
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const e of entries) {
    if (!e.isFile() || !e.name.endsWith('.md')) continue
    try {
      const raw = await fs.readFile(path.join(dir, e.name), 'utf-8')
      const parsed = parseRoleFrontmatter(raw)
      if (parsed?.agent_id) out.set(parsed.agent_id, parsed)
    } catch {
      // Skip
    }
  }
  return out
}

/** Minimal YAML-frontmatter parser for `roles/agent-N.md`. v0.1 only
 *  needs `agent_id`; the rest is preserved on the type for v0.2. */
function parseRoleFrontmatter(raw: string): ParsedRoleFile | null {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  if (!m) return null
  const fm = m[1]
  const body = m[2]
  const obj: Record<string, string> = {}
  for (const line of fm.split('\n')) {
    const kv = line.match(/^([a-z_][a-z0-9_]*):\s*(.*)$/i)
    if (kv) obj[kv[1]] = kv[2].trim()
  }
  if (!obj.agent_id) return null
  const result: ParsedRoleFile = {
    agent_id: obj.agent_id,
    body,
  }
  if (obj.generation) {
    const n = Number(obj.generation)
    if (Number.isFinite(n)) result.generation = n
  }
  if (obj.last_revised_at) result.last_revised_at = obj.last_revised_at
  if (obj.last_revised_after_eval) {
    const n = Number(obj.last_revised_after_eval)
    if (Number.isFinite(n)) result.last_revised_after_eval = n
  }
  return result
}
