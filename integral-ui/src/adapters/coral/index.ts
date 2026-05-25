/**
 * Coral adapter — browser-safe public API.
 *
 * Architecture mirrors `src/adapters/nous/`:
 *  - `CoralSource` (transport) abstracts where bytes come from.
 *  - `buildCoralWorkspace` (interpreter) converts source bytes → typed
 *    `Workspace`. Pure, deterministic, unit-testable.
 *  - `FilesystemCoralSource` is the v0.1 Node-only transport, in
 *    `vite-plugin-nous-adapter/coral-filesystem-source.ts` (outside
 *    `src/`) so Node modules don't leak into the browser bundle.
 */

export type {
  CoralSource,
  RunFiles,
  ParsedAttempt,
  ParsedRoleFile,
  ParsedTaskYaml,
} from './types'
export { buildCoralWorkspace, interpretRun } from './interpreter'
export { notesToKnowledgeRefs } from './notes'
