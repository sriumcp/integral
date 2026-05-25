/**
 * Real fixture from `github.com/sriumcp/integral` — captured 2026-05-25
 * via `gh issue list --repo sriumcp/integral --state all --json ...`.
 *
 * Five issues:
 *   #1 v0.1 expansion roadmap (tracking) — open, has 3 sub-issues
 *   #2 B1: Coral adapter — closed/COMPLETED (sub-issue of #1)
 *   #3 B2: GitHub-issues adapter (in flight) — open (sub-issue of #1)
 *   #4 C1: Filter / group / sort on Map — open (sub-issue of #1)
 *   #5 Visual baseline regen tracker — open, leaf
 *
 * Anchors B2's falsification — round-tripping this through the
 * interpreter produces 5 feature-campaign Intents with #1's
 * decomposition.children = [#2, #3, #4] and #5 a top-level leaf.
 */

import type { ParsedIssue, ParsedSubIssueRef } from '../../types'

const SRIUMCP: ParsedIssue['author'] = {
  login: 'sriumcp',
  type: 'User',
}

export const SRIUMCP_INTEGRAL_ISSUES: ParsedIssue[] = [
  {
    number: 1,
    title: 'v0.1 expansion roadmap (tracking)',
    body:
      'Tracking issue for the v0.1 expansion. See `roadmap.md` in this repo.',
    state: 'OPEN',
    stateReason: null,
    labels: [],
    assignees: [],
    author: SRIUMCP,
    createdAt: '2026-05-25T03:24:53Z',
    updatedAt: '2026-05-25T03:24:53Z',
    closedAt: null,
    url: 'https://github.com/sriumcp/integral/issues/1',
    subIssuesSummary: { total: 3, completed: 1, percent_completed: 33 },
  },
  {
    number: 2,
    title: 'B1: Coral adapter (Phases 1+2)',
    body:
      'Read-only Coral optimization adapter. Reads task.yaml + ' +
      'results/<task>/<timestamp>/.coral/public/{attempts,notes,roles}/.',
    state: 'CLOSED',
    stateReason: 'COMPLETED',
    labels: [],
    assignees: [],
    author: SRIUMCP,
    createdAt: '2026-05-25T03:40:38Z',
    updatedAt: '2026-05-25T03:41:25Z',
    closedAt: '2026-05-25T03:41:25Z',
    url: 'https://github.com/sriumcp/integral/issues/2',
    subIssuesSummary: { total: 0, completed: 0, percent_completed: 0 },
  },
  {
    number: 3,
    title: 'B2: GitHub-issues adapter (in flight)',
    body:
      'Read GitHub issues for a configured repo and produce typed ' +
      'feature-campaign Intents preserving sub-issue hierarchy.',
    state: 'OPEN',
    stateReason: null,
    labels: [],
    assignees: [],
    author: SRIUMCP,
    createdAt: '2026-05-25T03:40:39Z',
    updatedAt: '2026-05-25T03:40:39Z',
    closedAt: null,
    url: 'https://github.com/sriumcp/integral/issues/3',
    subIssuesSummary: { total: 0, completed: 0, percent_completed: 0 },
  },
  {
    number: 4,
    title: 'C1: Filter / group / sort on Map',
    body: 'Beyond awaiting-me, add filters and group/sort toggles.',
    state: 'OPEN',
    stateReason: null,
    labels: [],
    assignees: [],
    author: SRIUMCP,
    createdAt: '2026-05-25T03:40:40Z',
    updatedAt: '2026-05-25T03:40:40Z',
    closedAt: null,
    url: 'https://github.com/sriumcp/integral/issues/4',
    subIssuesSummary: { total: 0, completed: 0, percent_completed: 0 },
  },
  {
    number: 5,
    title: 'Visual baseline regen tracker',
    body:
      'Top-level leaf issue. Tracks visual regression baseline regeneration.',
    state: 'OPEN',
    stateReason: null,
    labels: [],
    assignees: [],
    author: SRIUMCP,
    createdAt: '2026-05-25T03:40:41Z',
    updatedAt: '2026-05-25T03:40:41Z',
    closedAt: null,
    url: 'https://github.com/sriumcp/integral/issues/5',
    subIssuesSummary: { total: 0, completed: 0, percent_completed: 0 },
  },
]

export const SRIUMCP_INTEGRAL_SUB_ISSUES: Map<
  number,
  ParsedSubIssueRef[]
> = new Map([
  [
    1,
    [
      {
        number: 2,
        repoUrl: 'https://api.github.com/repos/sriumcp/integral',
      },
      {
        number: 3,
        repoUrl: 'https://api.github.com/repos/sriumcp/integral',
      },
      {
        number: 4,
        repoUrl: 'https://api.github.com/repos/sriumcp/integral',
      },
    ],
  ],
])

export const SRIUMCP_INTEGRAL_REPO = {
  owner: 'sriumcp',
  name: 'integral',
} as const
