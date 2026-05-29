import type {
  EvidenceLink,
  ExternalAnchor,
  Holder,
  Intent,
  IntentState,
  Operation,
  Party,
  Status,
  Workspace,
} from '../../schema'
import type {
  GitHubIssuesSource,
  ParsedAuthor,
  ParsedIssue,
  RepoCoordinates,
} from './types'
import { reconstructTree } from './tree'

/**
 * Feature adapter interpreter — pure function from a `GitHubIssuesSource`
 * to a typed `Workspace`. v0.1 covers Phases 1+2: issue declarations +
 * sub-issue hierarchy. No PRs, no comments, no writeback. Ops engine is
 * adapter-agnostic and adds in v0.2.
 *
 * Lossy mappings are recorded in `gaps.md` § GitHub-issues
 * (G-F-1..G-F-13). The v0.1 falsification discipline is to read what
 * fits the schema cleanly and record what doesn't.
 */

const SCHEMA_VERSION = '0.2.0' as const

const UNASSIGNED_PARTY: Party = {
  id: 'github-unassigned',
  kind: 'system',
  display_name: '(unassigned)',
}

export interface BuildFeatureWorkspaceOpts {
  /** Reserved for v0.2 — when an `Operation[]` diff lands for the
   *  feature adapter, this will mirror Nous's `prior` opt. v0.1 ignored. */
  prior?: Workspace
  at?: string
  by?: Party
}

export async function buildFeatureWorkspace(
  source: GitHubIssuesSource,
  _opts: BuildFeatureWorkspaceOpts = {}
): Promise<Workspace> {
  const issues = await source.listAllIssues()

  // ─── Build childrenByParent by walking only tracking issues ────────────
  const childrenByParent = new Map<number, number[]>()
  const sourceRepoUrl = repoApiUrl(source.repo)
  for (const i of issues) {
    if ((i.subIssuesSummary?.total ?? 0) > 0) {
      const subs = await source.fetchSubIssues(i.number)
      // Drop cross-repo sub-issues (G-F-9). Compare repo URL prefix.
      const sameRepo = subs.filter((s) => s.repoUrl === sourceRepoUrl)
      const childNumbers = sameRepo
        .map((s) => s.number)
        .filter((n) => issues.some((other) => other.number === n))
      if (childNumbers.length > 0) {
        childrenByParent.set(i.number, childNumbers)
      }
    }
  }

  // ─── Reconstruct the tree (find roots, build parent edges) ─────────────
  const tree = reconstructTree({
    issueNumbers: issues.map((i) => i.number),
    childrenByParent,
  })

  // ─── Emit Intents + States ────────────────────────────────────────────
  const intents: Intent[] = []
  const states: IntentState[] = []
  const evidenceLinks: EvidenceLink[] = []
  const operations: Operation[] = []

  for (const i of issues) {
    const isTracking = (tree.childrenByParent.get(i.number)?.length ?? 0) > 0
    const childIntentIds = (tree.childrenByParent.get(i.number) ?? []).map(
      (n) => makeIntentId(source.id, source.repo, n)
    )
    const result = interpretIssue({
      issue: i,
      sourceId: source.id,
      repo: source.repo,
      isTracking,
      childIntentIds,
    })
    intents.push(result.intent)
    states.push(result.state)
  }

  return {
    intents,
    states,
    evidence_links: evidenceLinks,
    operations,
  }
}

// ─── Per-issue mapping ─────────────────────────────────────────────────────

interface InterpretIssueArgs {
  issue: ParsedIssue
  sourceId: string
  repo: RepoCoordinates
  isTracking: boolean
  childIntentIds: ReadonlyArray<string>
}

export function interpretIssue(
  args: InterpretIssueArgs
): { intent: Intent; state: IntentState } {
  const { issue, sourceId, repo, isTracking, childIntentIds } = args

  const intentId = makeIntentId(sourceId, repo, issue.number)
  const stateId = `${intentId}-STATE`

  const repoAnchor: ExternalAnchor = {
    kind: 'github-repo',
    uri: `https://github.com/${repo.owner}/${repo.name}`,
    read_only: true,
  }
  const issueAnchor: ExternalAnchor = {
    kind: 'github-repo',
    uri: issue.url,
    read_only: true,
  }

  const tags = issue.labels.map((l) => l.name).filter((n) => n.length > 0)
  const holder = holderForIssue(issue)
  const declaredBy = partyFromAuthor(issue.author)

  const intent: Intent = {
    id: intentId,
    schema_version: SCHEMA_VERSION,
    kind: 'feature-campaign',
    declaration: {
      title: clampTitle(issue.title),
      summary: clampSummary(issue.body),
      success_criterion: '',
    },
    holder,
    lifetime: {
      kind: isTracking ? 'campaign' : 'discrete',
      started_at: issue.createdAt,
    },
    decomposition: {
      children: childIntentIds.slice(),
    },
    provenance: {
      declared_by: declaredBy,
      declared_at: issue.createdAt,
      motivated_by: [],
      source: sourceId,
    },
    knowledge_refs: [],
    ...(tags.length > 0 ? { tags } : {}),
    state_ref: stateId,
    extension: {
      kind: 'feature-campaign',
      repo_anchor: repoAnchor,
      inherited_conventions: [],
      standing_invariants: [],
    },
  }

  const state: IntentState = {
    id: stateId,
    intent_id: intentId,
    schema_version: SCHEMA_VERSION,
    status: mapState(issue.state, issue.stateReason),
    last_advanced_at:
      issue.closedAt ?? issue.updatedAt ?? issue.createdAt,
    last_advanced_by: lastAdvancedBy(issue, declaredBy),
    history: [],
    external_anchors: [issueAnchor],
  }

  return { intent, state }
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function makeIntentId(sourceId: string, repo: RepoCoordinates, number: number): string {
  // sourceId is opaque per the source contract; slug-ify defensively.
  const slugSrc = sourceId.replace(/[^a-zA-Z0-9-]/g, '-').replace(/--+/g, '-')
  const slugRepo = `${repo.owner}-${repo.name}`.replace(/[^a-zA-Z0-9-]/g, '-')
  return `feature:${slugSrc}:${slugRepo}:${number}`
}

function repoApiUrl(repo: RepoCoordinates): string {
  // GitHub's REST API returns `repository_url` as
  // `https://api.github.com/repos/<owner>/<name>` for cross-repo
  // disambiguation in /sub_issues responses.
  return `https://api.github.com/repos/${repo.owner}/${repo.name}`
}

function clampTitle(s: string): string {
  if (s.length <= 80) return s
  return s.slice(0, 77) + '…'
}

function clampSummary(s: string | null): string {
  if (s == null) return ''
  if (s.length <= 2000) return s
  return s.slice(0, 1997) + '…'
}

function holderForIssue(issue: ParsedIssue): Holder {
  if (issue.assignees.length === 0) {
    return { mode: 'jointly-held', parties: [UNASSIGNED_PARTY] }
  }
  const parties: Party[] = issue.assignees.map((a) => ({
    id: `github-user:${a.login}`,
    kind: 'human' as const,
    display_name: a.login,
  }))
  return { mode: 'human-held', parties }
}

function partyFromAuthor(author: ParsedAuthor): Party {
  return {
    id: `github-user:${author.login}`,
    kind: author.type === 'Bot' ? 'agent' : 'human',
    display_name: author.login,
  }
}

function lastAdvancedBy(issue: ParsedIssue, declaredBy: Party): Party {
  // For closed issues, GitHub's `closed_by` would be the right field;
  // we don't capture it in v0.1 (G-F-N). Fall back to assignees, then
  // the issue author. The schema requires *some* Party; this is the
  // best-available signal.
  if (issue.assignees.length > 0) {
    return {
      id: `github-user:${issue.assignees[0]!.login}`,
      kind: 'human',
      display_name: issue.assignees[0]!.login,
    }
  }
  return declaredBy
}

function mapState(
  state: ParsedIssue['state'],
  stateReason: ParsedIssue['stateReason']
): Status {
  const isClosed = state === 'CLOSED' || state === 'closed'
  if (!isClosed) return 'active'
  const reason = stateReason ? String(stateReason).toLowerCase() : null
  if (reason === 'completed') return 'satisfied'
  if (reason === 'not_planned') return 'abandoned'
  if (reason === 'duplicate') return 'abandoned'
  if (reason === 'reopened') return 'active'
  // Legacy issues closed before stateReason existed → satisfied (G-F-5).
  return 'satisfied'
}
