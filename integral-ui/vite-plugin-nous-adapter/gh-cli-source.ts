/**
 * GhCliIssuesSource — reads GitHub issues for a configured repo by
 * invoking the `gh` CLI as a subprocess.
 *
 * Discipline:
 *  - Argv-based subprocess invocation only (Node's `execFile` family
 *    via `util.promisify` — passes argv directly to the OS, no shell
 *    interpretation, no injection surface).
 *  - The owner/name coordinate is validated against a strict regex
 *    once at source construction; only validated coordinates reach
 *    the argv array. User-controlled fields like issue body never
 *    touch argv — they only appear in JSON output that's parsed.
 *  - Node-only — must not be imported into browser bundles. The Vite
 *    plugin keeps it off the client side (same discipline as
 *    FilesystemNousSource and FilesystemCoralSource).
 */

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type {
  GitHubIssuesSource,
  ParsedAssignee,
  ParsedAuthor,
  ParsedIssue,
  ParsedSubIssueRef,
  RepoCoordinates,
} from '../src/adapters/feature'

const execFileAsync = promisify(execFile)

const REPO_COORDINATE_RE = /^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/
const SUBPROCESS_TIMEOUT_MS = 60_000
const MAX_BUFFER_BYTES = 32 * 1024 * 1024 // 32 MB — enough for ~10K issues' JSON

/** Raw row shape produced by `gh issue list --json ...`. CamelCase
 *  field names per gh's output contract; we normalize at the boundary.
 *
 *  Quirks of `gh issue list --json` (vs. raw REST):
 *   - `stateReason` is the empty string `""` for issues that have no
 *     reason set (rather than `null` or absent).
 *   - `author.is_bot: boolean` — used instead of REST's `author.type`.
 *   - `state` is uppercase ('OPEN' / 'CLOSED').
 *  We normalize all three at `normalizeIssueRow` so the interpreter sees
 *  the canonical `ParsedIssue` shape regardless of transport details. */
interface GhIssueRow {
  number: number
  title: string
  body?: string | null
  state: string
  stateReason?: string | null
  labels: Array<{ name: string }>
  assignees: Array<{ login: string }>
  author: { login: string; is_bot?: boolean; type?: string; name?: string }
  createdAt: string
  updatedAt?: string
  closedAt?: string | null
  url: string
}

/** Raw shape from `gh api repos/.../issues/{n}/sub_issues` (REST). */
interface GhSubIssueApiRow {
  number: number
  repository_url: string
}

export class GhCliIssuesSource implements GitHubIssuesSource {
  readonly id: string
  readonly label: string
  readonly repo: RepoCoordinates
  /** The full coordinate string we pass to `gh --repo` — pre-validated. */
  private readonly coord: string

  constructor(coordinate: string) {
    if (!REPO_COORDINATE_RE.test(coordinate)) {
      throw new Error(
        `invalid GitHub repo coordinate: ${JSON.stringify(coordinate)} — ` +
          `expected '<owner>/<name>' with chars [a-zA-Z0-9._-]`
      )
    }
    const [owner, name] = coordinate.split('/') as [string, string]
    this.repo = { owner, name }
    this.coord = coordinate
    this.id = `github:${coordinate}`
    this.label = coordinate
  }

  async listAllIssues(): Promise<ParsedIssue[]> {
    const fields =
      'number,title,body,state,stateReason,labels,assignees,author,createdAt,updatedAt,closedAt,url'
    const argv = [
      'issue',
      'list',
      '--repo',
      this.coord,
      '--state',
      'all',
      '--limit',
      '1000',
      '--json',
      fields,
    ]
    const { stdout } = await runGh(argv)
    const rows = parseJsonArray<GhIssueRow>(stdout)

    // For each issue, fetch the per-issue REST detail to recover
    // `subIssuesSummary` — `gh issue list --json` doesn't expose that
    // field. We parallelize but cap at a small concurrency so a 1K-issue
    // repo doesn't fan out unbounded subprocesses. v0.2 may switch to a
    // single GraphQL call.
    const summaries = await fetchSubIssueSummaries(this.coord, rows.map((r) => r.number))

    return rows.map((r) => normalizeIssueRow(r, summaries.get(r.number)))
  }

  async fetchSubIssues(parentNumber: number): Promise<ParsedSubIssueRef[]> {
    if (!Number.isInteger(parentNumber) || parentNumber <= 0) {
      throw new Error(`fetchSubIssues: parentNumber must be a positive integer`)
    }
    const argv = [
      'api',
      `repos/${this.coord}/issues/${parentNumber}/sub_issues`,
    ]
    const { stdout } = await runGh(argv)
    const rows = parseJsonArray<GhSubIssueApiRow>(stdout)
    return rows
      .filter((r) => Number.isInteger(r.number) && typeof r.repository_url === 'string')
      .map((r) => ({ number: r.number, repoUrl: r.repository_url }))
  }
}

// ─── Subprocess helpers ───────────────────────────────────────────────────

async function runGh(argv: string[]): Promise<{ stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await execFileAsync('gh', argv, {
      timeout: SUBPROCESS_TIMEOUT_MS,
      maxBuffer: MAX_BUFFER_BYTES,
      env: { ...process.env },
    })
    return { stdout, stderr }
  } catch (err) {
    if (err && typeof err === 'object') {
      const e = err as NodeJS.ErrnoException & {
        stdout?: string
        stderr?: string
        signal?: string | null
      }
      if (e.code === 'ENOENT') {
        throw new Error(
          'gh CLI not installed — install via https://cli.github.com or use a non-github source kind'
        )
      }
      if (e.signal === 'SIGTERM') {
        throw new Error(
          `gh subprocess timed out after ${SUBPROCESS_TIMEOUT_MS}ms — repo may be too large or network slow`
        )
      }
      const stderr = (e.stderr ?? '').toString().trim()
      throw new Error(
        `gh ${argv[0] ?? '?'} failed${stderr ? `: ${stderr}` : ''}`
      )
    }
    throw err
  }
}

function parseJsonArray<T>(s: string): T[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(s)
  } catch (err) {
    throw new Error(
      `gh returned invalid JSON: ${err instanceof Error ? err.message : String(err)}`
    )
  }
  if (!Array.isArray(parsed)) {
    throw new Error(`gh returned non-array JSON: ${typeof parsed}`)
  }
  return parsed as T[]
}

async function fetchSubIssueSummaries(
  coord: string,
  numbers: ReadonlyArray<number>
): Promise<Map<number, { total: number; completed?: number; percent_completed?: number }>> {
  const out = new Map<
    number,
    { total: number; completed?: number; percent_completed?: number }
  >()
  // Modest concurrency — 4 in flight is a safe default; gh handles
  // rate-limit retry under the hood, so we don't aggressively parallel.
  const concurrency = 4
  let cursor = 0
  async function worker(): Promise<void> {
    while (true) {
      const i = cursor++
      if (i >= numbers.length) return
      const n = numbers[i]!
      try {
        const { stdout } = await runGh([
          'api',
          `repos/${coord}/issues/${n}`,
          '--jq',
          '.sub_issues_summary',
        ])
        const trimmed = stdout.trim()
        if (trimmed.length === 0 || trimmed === 'null') continue
        const parsed = JSON.parse(trimmed) as {
          total?: number
          completed?: number
          percent_completed?: number
        }
        if (typeof parsed.total === 'number') {
          out.set(n, {
            total: parsed.total,
            ...(typeof parsed.completed === 'number'
              ? { completed: parsed.completed }
              : {}),
            ...(typeof parsed.percent_completed === 'number'
              ? { percent_completed: parsed.percent_completed }
              : {}),
          })
        }
      } catch {
        // Per-issue summary fetch failed — treat as no summary; the
        // interpreter defaults to total=0.
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()))
  return out
}

// ─── Normalizers ──────────────────────────────────────────────────────────

function normalizeIssueRow(
  row: GhIssueRow,
  summary: { total: number; completed?: number; percent_completed?: number } | undefined
): ParsedIssue {
  const labels: ReadonlyArray<{ name: string }> = (row.labels ?? [])
    .filter((l) => l && typeof l.name === 'string')
    .map((l) => ({ name: l.name }))

  const assignees: ReadonlyArray<ParsedAssignee> = (row.assignees ?? [])
    .filter((a) => a && typeof a.login === 'string')
    .map((a) => ({ login: a.login }))

  // `gh issue list --json author` emits `is_bot: boolean`; raw REST
  // emits `type: 'User' | 'Bot' | ...`. Normalize to canonical `type`.
  const isBot = row.author?.is_bot === true || row.author?.type === 'Bot'
  const author: ParsedAuthor = {
    login: row.author?.login ?? '(unknown)',
    type: isBot ? 'Bot' : 'User',
  }

  // `gh issue list --json stateReason` emits empty string for no
  // reason; the interpreter expects null/undefined or one of the
  // enum values. Coerce empty → null.
  const reason =
    typeof row.stateReason === 'string' && row.stateReason.length > 0
      ? row.stateReason
      : null

  const result: ParsedIssue = {
    number: row.number,
    title: row.title,
    body: row.body ?? null,
    state: (row.state as ParsedIssue['state']) ?? 'OPEN',
    stateReason: reason as ParsedIssue['stateReason'],
    labels,
    assignees,
    author,
    createdAt: row.createdAt,
    url: row.url,
    ...(row.updatedAt ? { updatedAt: row.updatedAt } : {}),
    ...(row.closedAt !== undefined ? { closedAt: row.closedAt } : {}),
    ...(summary ? { subIssuesSummary: summary } : {}),
  }
  return result
}
