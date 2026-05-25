/**
 * Feature adapter interpreter — unit tests.
 *
 * Synthetic GitHubIssuesSource fixtures (in-memory, no `gh`). Every
 * produced workspace must round-trip through `WorkspaceSchema.safeParse`
 * — the falsification gate.
 */

import { describe, expect, it } from 'vitest'
import { WorkspaceSchema } from '@/schema'
import type {
  GitHubIssuesSource,
  ParsedIssue,
  ParsedSubIssueRef,
  RepoCoordinates,
} from '../types'
import { buildFeatureWorkspace } from '../interpreter'
import {
  SRIUMCP_INTEGRAL_ISSUES,
  SRIUMCP_INTEGRAL_REPO,
  SRIUMCP_INTEGRAL_SUB_ISSUES,
} from './fixtures/sriumcp-integral'

// ─── Synthetic GitHubIssuesSource ────────────────────────────────────────
function staticSource(args: {
  issues: ReadonlyArray<ParsedIssue>
  subIssues?: ReadonlyMap<number, ReadonlyArray<ParsedSubIssueRef>>
  repo?: RepoCoordinates
  id?: string
}): GitHubIssuesSource {
  const repo = args.repo ?? { owner: 'sriumcp', name: 'integral' }
  const id = args.id ?? `github:${repo.owner}/${repo.name}`
  return {
    id,
    label: `${repo.owner}/${repo.name}`,
    repo,
    listAllIssues: async () => args.issues.slice(),
    fetchSubIssues: async (n: number) =>
      (args.subIssues?.get(n) ?? []).slice(),
  }
}

function issue(overrides: Partial<ParsedIssue> = {}): ParsedIssue {
  const base: ParsedIssue = {
    number: 1,
    title: 'sample issue',
    body: 'some body',
    state: 'OPEN',
    stateReason: null,
    labels: [],
    assignees: [],
    author: { login: 'sriumcp', type: 'User' },
    createdAt: '2026-05-24T19:00:00Z',
    updatedAt: '2026-05-24T19:00:00Z',
    closedAt: null,
    url: 'https://github.com/sriumcp/integral/issues/1',
    subIssuesSummary: { total: 0, completed: 0, percent_completed: 0 },
  }
  return { ...base, ...overrides }
}

describe('buildFeatureWorkspace — empty / degenerate', () => {
  it('zero issues → empty workspace', async () => {
    const ws = await buildFeatureWorkspace(staticSource({ issues: [] }))
    expect(ws.intents).toEqual([])
    expect(ws.states).toEqual([])
    expect(ws.evidence_links).toEqual([])
    expect(ws.operations).toEqual([])
    expect(WorkspaceSchema.safeParse(ws).success).toBe(true)
  })

  it('issue without subIssuesSummary field defaults to leaf', async () => {
    // Strip subIssuesSummary entirely (older API responses).
    const minimal = issue({ number: 7 })
    delete (minimal as { subIssuesSummary?: unknown }).subIssuesSummary
    const ws = await buildFeatureWorkspace(staticSource({ issues: [minimal] }))
    expect(ws.intents).toHaveLength(1)
    expect(ws.intents[0]!.kind).toBe('feature-campaign')
    expect(ws.intents[0]!.decomposition.children).toEqual([])
    expect(ws.intents[0]!.lifetime.kind).toBe('discrete')
    expect(WorkspaceSchema.safeParse(ws).success).toBe(true)
  })
})

describe('buildFeatureWorkspace — single-issue mapping', () => {
  async function singleIssueWorkspace(i: ParsedIssue) {
    return buildFeatureWorkspace(staticSource({ issues: [i] }))
  }

  it('produces 1 feature-campaign intent + 1 IntentState', async () => {
    const ws = await singleIssueWorkspace(issue())
    expect(ws.intents).toHaveLength(1)
    expect(ws.states).toHaveLength(1)
    expect(ws.intents[0]!.kind).toBe('feature-campaign')
    expect(WorkspaceSchema.safeParse(ws).success).toBe(true)
  })

  it('id format: feature:<source-slug>:<owner>-<repo>:<number>', async () => {
    const ws = await singleIssueWorkspace(issue({ number: 42 }))
    expect(ws.intents[0]!.id).toBe('feature:github-sriumcp-integral:sriumcp-integral:42')
  })

  it('state OPEN → status active', async () => {
    const ws = await singleIssueWorkspace(issue({ state: 'OPEN' }))
    expect(ws.states[0]!.status).toBe('active')
  })

  it('state CLOSED + COMPLETED → status satisfied', async () => {
    const ws = await singleIssueWorkspace(
      issue({ state: 'CLOSED', stateReason: 'COMPLETED' })
    )
    expect(ws.states[0]!.status).toBe('satisfied')
  })

  it('state CLOSED + NOT_PLANNED → status abandoned', async () => {
    const ws = await singleIssueWorkspace(
      issue({ state: 'CLOSED', stateReason: 'NOT_PLANNED' })
    )
    expect(ws.states[0]!.status).toBe('abandoned')
  })

  it('state CLOSED + DUPLICATE → status abandoned', async () => {
    const ws = await singleIssueWorkspace(
      issue({ state: 'CLOSED', stateReason: 'DUPLICATE' })
    )
    expect(ws.states[0]!.status).toBe('abandoned')
  })

  it('state CLOSED + null stateReason → status satisfied (legacy)', async () => {
    const ws = await singleIssueWorkspace(
      issue({ state: 'CLOSED', stateReason: null })
    )
    expect(ws.states[0]!.status).toBe('satisfied')
  })

  it('lowercase state forms accepted (state: closed/CLOSED equivalent)', async () => {
    const ws = await singleIssueWorkspace(
      issue({ state: 'closed', stateReason: 'completed' })
    )
    expect(ws.states[0]!.status).toBe('satisfied')
  })

  it('labels[].name → tags', async () => {
    const ws = await singleIssueWorkspace(
      issue({ labels: [{ name: 'bug' }, { name: 'P0' }] })
    )
    expect(ws.intents[0]!.tags ?? []).toEqual(['bug', 'P0'])
  })

  it('issue with assignees → human-held with one party each', async () => {
    const ws = await singleIssueWorkspace(
      issue({ assignees: [{ login: 'alice' }, { login: 'bob' }] })
    )
    expect(ws.intents[0]!.holder.mode).toBe('human-held')
    expect(ws.intents[0]!.holder.parties).toHaveLength(2)
    expect(ws.intents[0]!.holder.parties.map((p) => p.display_name).sort()).toEqual(
      ['alice', 'bob']
    )
    expect(ws.intents[0]!.holder.parties.every((p) => p.kind === 'human')).toBe(true)
  })

  it('unassigned issue → synthetic (unassigned) party, jointly-held', async () => {
    const ws = await singleIssueWorkspace(issue({ assignees: [] }))
    expect(ws.intents[0]!.holder.mode).toBe('jointly-held')
    expect(ws.intents[0]!.holder.parties).toHaveLength(1)
    expect(ws.intents[0]!.holder.parties[0]!.id).toBe('github-unassigned')
    expect(ws.intents[0]!.holder.parties[0]!.kind).toBe('system')
  })

  it('long body clamped to 2000 chars', async () => {
    const longBody = 'x'.repeat(5000)
    const ws = await singleIssueWorkspace(issue({ body: longBody }))
    expect(ws.intents[0]!.declaration.summary.length).toBeLessThanOrEqual(2000)
    expect(ws.intents[0]!.declaration.summary.endsWith('…')).toBe(true)
  })

  it('long title clamped to 80 chars', async () => {
    const longTitle = 'y'.repeat(200)
    const ws = await singleIssueWorkspace(issue({ title: longTitle }))
    expect(ws.intents[0]!.declaration.title.length).toBeLessThanOrEqual(80)
  })

  it('null body → empty summary', async () => {
    const ws = await singleIssueWorkspace(issue({ body: null }))
    expect(ws.intents[0]!.declaration.summary).toBe('')
  })

  it('repo_anchor: github-repo URL', async () => {
    const ws = await singleIssueWorkspace(issue())
    const intent = ws.intents[0]!
    if (intent.extension.kind !== 'feature-campaign') throw new Error('kind')
    expect(intent.extension.repo_anchor.kind).toBe('github-repo')
    expect(intent.extension.repo_anchor.uri).toBe(
      'https://github.com/sriumcp/integral'
    )
  })

  it('inherited_conventions and standing_invariants both empty', async () => {
    const ws = await singleIssueWorkspace(issue())
    const intent = ws.intents[0]!
    if (intent.extension.kind !== 'feature-campaign') throw new Error('kind')
    expect(intent.extension.inherited_conventions).toEqual([])
    expect(intent.extension.standing_invariants).toEqual([])
  })

  it('provenance.declared_by is the issue author Party', async () => {
    const ws = await singleIssueWorkspace(
      issue({ author: { login: 'someone-else', type: 'User' } })
    )
    expect(ws.intents[0]!.provenance.declared_by.display_name).toBe(
      'someone-else'
    )
  })

  it('bot author → kind: agent', async () => {
    const ws = await singleIssueWorkspace(
      issue({ author: { login: 'github-actions[bot]', type: 'Bot' } })
    )
    expect(ws.intents[0]!.provenance.declared_by.kind).toBe('agent')
  })

  it('lifetime.kind = discrete for leaf issues', async () => {
    const ws = await singleIssueWorkspace(issue())
    expect(ws.intents[0]!.lifetime.kind).toBe('discrete')
  })
})

describe('buildFeatureWorkspace — tree wiring (sub-issue hierarchy)', () => {
  it('tracking issue with two children → campaign with both child IDs', async () => {
    const repo = { owner: 'sriumcp', name: 'integral' }
    const repoUrl = 'https://api.github.com/repos/sriumcp/integral'
    const ws = await buildFeatureWorkspace(
      staticSource({
        repo,
        issues: [
          issue({
            number: 1,
            title: 'tracker',
            subIssuesSummary: { total: 2 },
          }),
          issue({ number: 2, title: 'child A' }),
          issue({ number: 3, title: 'child B' }),
        ],
        subIssues: new Map([
          [
            1,
            [
              { number: 2, repoUrl },
              { number: 3, repoUrl },
            ],
          ],
        ]),
      })
    )

    const tracker = ws.intents.find((i) => i.id.endsWith(':1'))!
    const childA = ws.intents.find((i) => i.id.endsWith(':2'))!
    const childB = ws.intents.find((i) => i.id.endsWith(':3'))!
    expect(tracker.decomposition.children).toEqual([childA.id, childB.id])
    expect(tracker.lifetime.kind).toBe('campaign')
    expect(childA.decomposition.children).toEqual([])
    expect(childB.decomposition.children).toEqual([])
    expect(childA.lifetime.kind).toBe('discrete')
    expect(WorkspaceSchema.safeParse(ws).success).toBe(true)
  })

  it('recursive nesting (parent → child → grandchild)', async () => {
    const repo = { owner: 'sriumcp', name: 'integral' }
    const repoUrl = 'https://api.github.com/repos/sriumcp/integral'
    const ws = await buildFeatureWorkspace(
      staticSource({
        repo,
        issues: [
          issue({ number: 1, subIssuesSummary: { total: 1 } }),
          issue({ number: 2, subIssuesSummary: { total: 1 } }),
          issue({ number: 3 }),
        ],
        subIssues: new Map([
          [1, [{ number: 2, repoUrl }]],
          [2, [{ number: 3, repoUrl }]],
        ]),
      })
    )

    const i1 = ws.intents.find((i) => i.id.endsWith(':1'))!
    const i2 = ws.intents.find((i) => i.id.endsWith(':2'))!
    const i3 = ws.intents.find((i) => i.id.endsWith(':3'))!
    expect(i1.decomposition.children).toEqual([i2.id])
    expect(i2.decomposition.children).toEqual([i3.id])
    expect(i3.decomposition.children).toEqual([])
    expect(i1.lifetime.kind).toBe('campaign')
    expect(i2.lifetime.kind).toBe('campaign')
    expect(i3.lifetime.kind).toBe('discrete')
    expect(WorkspaceSchema.safeParse(ws).success).toBe(true)
  })

  it('cross-repo sub-issue is silently dropped from parent children', async () => {
    const repo = { owner: 'sriumcp', name: 'integral' }
    const repoUrl = 'https://api.github.com/repos/sriumcp/integral'
    const otherUrl = 'https://api.github.com/repos/sriumcp/other'
    const ws = await buildFeatureWorkspace(
      staticSource({
        repo,
        issues: [
          issue({ number: 1, subIssuesSummary: { total: 2 } }),
          issue({ number: 2 }),
        ],
        subIssues: new Map([
          [
            1,
            [
              { number: 2, repoUrl }, // same repo — kept
              { number: 999, repoUrl: otherUrl }, // cross repo — dropped
            ],
          ],
        ]),
      })
    )
    const tracker = ws.intents.find((i) => i.id.endsWith(':1'))!
    expect(tracker.decomposition.children).toHaveLength(1)
    expect(tracker.decomposition.children[0]).toContain(':2')
  })

  it('sriumcp/integral fixture round-trips through WorkspaceSchema', async () => {
    const ws = await buildFeatureWorkspace(
      staticSource({
        repo: SRIUMCP_INTEGRAL_REPO,
        issues: SRIUMCP_INTEGRAL_ISSUES,
        subIssues: SRIUMCP_INTEGRAL_SUB_ISSUES,
      })
    )
    expect(ws.intents).toHaveLength(5)

    // #1 is tracker → campaign + 3 children
    const tracker = ws.intents.find((i) => i.id.endsWith(':1'))!
    expect(tracker.lifetime.kind).toBe('campaign')
    expect(tracker.decomposition.children).toHaveLength(3)

    // #2 closed/COMPLETED → satisfied
    const b1Intent = ws.intents.find((i) => i.id.endsWith(':2'))!
    const b1State = ws.states.find((s) => s.intent_id === b1Intent.id)!
    expect(b1State.status).toBe('satisfied')

    // #3, #4 open + sub-issues of #1 → active
    for (const n of [3, 4]) {
      const intent = ws.intents.find((i) => i.id.endsWith(`:${n}`))!
      expect(ws.states.find((s) => s.intent_id === intent.id)!.status).toBe('active')
    }

    // #5 leaf, top-level
    const leaf = ws.intents.find((i) => i.id.endsWith(':5'))!
    expect(leaf.lifetime.kind).toBe('discrete')
    expect(leaf.decomposition.children).toEqual([])
    // Confirm #5 is NOT in any other intent's children list
    const allChildren = ws.intents.flatMap((i) => i.decomposition.children)
    expect(allChildren).not.toContain(leaf.id)

    expect(WorkspaceSchema.safeParse(ws).success).toBe(true)
  })

  it('full schema round-trip: every child id resolves to an actual intent', async () => {
    const repo = { owner: 'sriumcp', name: 'integral' }
    const repoUrl = 'https://api.github.com/repos/sriumcp/integral'
    const ws = await buildFeatureWorkspace(
      staticSource({
        repo,
        issues: [
          issue({ number: 1, subIssuesSummary: { total: 3 } }),
          issue({ number: 2, state: 'CLOSED', stateReason: 'COMPLETED' }),
          issue({ number: 3 }),
          issue({ number: 4 }),
          issue({ number: 5 }), // unrelated leaf
        ],
        subIssues: new Map([
          [
            1,
            [
              { number: 2, repoUrl },
              { number: 3, repoUrl },
              { number: 4, repoUrl },
            ],
          ],
        ]),
      })
    )
    // Schema-level: every child id in any decomposition.children must
    // appear in workspace.intents.
    const allIntentIds = new Set(ws.intents.map((i) => i.id))
    for (const i of ws.intents) {
      for (const childId of i.decomposition.children) {
        expect(allIntentIds.has(childId)).toBe(true)
      }
    }
    expect(WorkspaceSchema.safeParse(ws).success).toBe(true)
  })
})
