/**
 * Nous adapter — browser-safe public API.
 *
 * Architecture:
 *  - `NousSource` (transport) abstracts where bytes come from. Lives here.
 *  - `buildNousWorkspace` (interpreter) converts source bytes → typed
 *    `Workspace`. Pure, deterministic, unit-testable. Lives here.
 *  - `FilesystemNousSource` is the v0.1 Node-only transport. It lives in
 *    `vite-plugin-nous-adapter/filesystem-source.ts` (outside `src/`)
 *    so Node modules (fs/path) don't leak into the browser bundle.
 */

export type { CampaignFiles, NousSource, ParsedCampaignYaml, ParsedNousState } from './types'
export { buildNousWorkspace, interpretCampaign } from './interpreter'
