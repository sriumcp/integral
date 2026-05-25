/**
 * Feature adapter — browser-safe public API.
 *
 * Architecture mirrors `src/adapters/{nous,coral}/`:
 *  - `GitHubIssuesSource` (transport) abstracts where bytes come from.
 *  - `buildFeatureWorkspace` (interpreter) converts source bytes → typed
 *    `Workspace`. Pure, deterministic, unit-testable.
 *  - `GhCliIssuesSource` is the v0.1 Node-only transport, in
 *    `vite-plugin-nous-adapter/gh-cli-source.ts` (outside `src/`) so
 *    Node modules don't leak into the browser bundle.
 */

export type {
  GitHubIssuesSource,
  ParsedIssue,
  ParsedSubIssueRef,
  ParsedAssignee,
  ParsedAuthor,
  RepoCoordinates,
} from './types'
export { buildFeatureWorkspace, interpretIssue } from './interpreter'
export { reconstructTree } from './tree'
