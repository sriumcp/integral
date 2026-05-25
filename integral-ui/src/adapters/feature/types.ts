/**
 * Feature adapter — transport/interpreter boundary.
 *
 * Mirrors Nous + Coral. `GitHubIssuesSource` is the abstract transport
 * (returns parsed issues + parent→children edges). `GhCliIssuesSource`
 * is the v0.1 Node-only impl shelling out to `gh` CLI; lives in
 * `vite-plugin-nous-adapter/gh-cli-source.ts`.
 *
 * v0.1 reads "Phases 1+2" — issue declarations + sub-issue hierarchy.
 * No PRs, no CI, no comments, no writeback. Per `.plan-b2.md`.
 */

/** Coordinates that uniquely name a GitHub repository. */
export interface RepoCoordinates {
  owner: string
  name: string
}

/** Transport contract — abstracts over `gh` CLI / REST / GraphQL / etc. */
export interface GitHubIssuesSource {
  /** Stable identifier for this source — used in IntentIds + diagnostics. */
  readonly id: string
  /** Human-readable label for the chrome (e.g., `owner/name`). */
  readonly label: string
  /** Repo coordinates this source reads from. The interpreter uses these
   *  to compose `repo_anchor` URIs and to filter cross-repo sub-issues. */
  readonly repo: RepoCoordinates

  /** Fetch all issues in the repo (any state). The transport is
   *  responsible for pagination. Order is implementation-defined; the
   *  interpreter sorts deterministically. */
  listAllIssues(): Promise<ParsedIssue[]>

  /** Fetch the formal sub-issues of a given parent issue (GitHub's 2024
   *  sub-issues feature). Returns child issue refs — `repoUrl` allows the
   *  interpreter to filter cross-repo links. The transport MUST only call
   *  this for issues whose `subIssuesSummary.total > 0`; for leaf issues
   *  the interpreter never calls this. */
  fetchSubIssues(parentNumber: number): Promise<ParsedSubIssueRef[]>
}

/** Shape of one issue after parsing. Fields not directly schema-mapped
 *  stay `unknown` so we don't lock the interpreter to a stricter shape
 *  than GitHub actually emits. The fields here are the v0.1 minimum the
 *  interpreter needs. */
export interface ParsedIssue {
  number: number
  title: string
  /** Issue body (markdown). May be null/empty. */
  body: string | null
  /** GitHub state. The `gh issue list --json` API returns these in upper
   *  case; the REST API returns them lower. We accept both at the type
   *  level and normalize at the interpreter boundary. */
  state: 'OPEN' | 'CLOSED' | 'open' | 'closed'
  /** GitHub state_reason. May be null for issues closed before the
   *  state_reason field existed (legacy). */
  stateReason:
    | 'COMPLETED'
    | 'NOT_PLANNED'
    | 'DUPLICATE'
    | 'REOPENED'
    | 'completed'
    | 'not_planned'
    | 'duplicate'
    | 'reopened'
    | null
    | undefined
  labels: ReadonlyArray<{ name: string }>
  assignees: ReadonlyArray<ParsedAssignee>
  author: ParsedAuthor
  createdAt: string
  updatedAt?: string
  closedAt?: string | null
  /** Issue URL on GitHub (`html_url` in the REST API; `url` in `gh
   *  issue list --json`). Used to build per-issue `external_anchors`. */
  url: string
  /** GitHub's 2024 sub-issues summary. Absent on older API responses;
   *  the interpreter defaults to `{total: 0}`. */
  subIssuesSummary?: {
    total: number
    completed?: number
    percent_completed?: number
  }
}

/** A reference to a child issue from a tracking issue's `/sub_issues`
 *  endpoint. Includes the repository URL so the interpreter can filter
 *  cross-repo links per G-F-9. */
export interface ParsedSubIssueRef {
  number: number
  /** The full GitHub URL of the child issue's repo (e.g.,
   *  `https://api.github.com/repos/owner/name`). The interpreter compares
   *  this against the source's repo to drop cross-repo children. */
  repoUrl: string
}

export interface ParsedAssignee {
  login: string
}

export interface ParsedAuthor {
  login: string
  /** GitHub user `type` — present on REST responses. `'Bot'` is the
   *  signal we use to map `kind: 'agent'` instead of `'human'`. */
  type?: 'User' | 'Bot' | 'Organization' | 'Mannequin' | string
}
