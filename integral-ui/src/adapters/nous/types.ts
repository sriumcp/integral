/**
 * Nous adapter — transport/interpreter boundary.
 *
 * The interpreter (`buildNousWorkspace`) is pure: takes a `NousSource` and
 * returns a typed `Workspace`. It doesn't know whether the bytes came from
 * the local filesystem, S3, or an HTTP endpoint.
 *
 * Concrete sources implement `NousSource`. v0.1 ships only
 * `FilesystemNousSource`; v0.2+ may add `S3NousSource`, `HTTPNousSource`,
 * etc., without touching the interpreter.
 */

/** Raw file contents for a single campaign. Any file may be absent
 *  (`null`); the interpreter is responsible for tolerating missing data
 *  per the v0.1 falsification discipline. */
export interface CampaignFiles {
  /** The campaign-X.yaml contents — required, this is the declaration. */
  campaignYaml: string
  /** Contents of `.nous/<run_id>/state.json` if present. Drives status. */
  state: string | null
  /** Contents of `.nous/<run_id>/ledger.json` if present. v0.1 Phase 1
   *  reads campaign-only; ledger arrives in Phase 2. */
  ledger: string | null
  /** Contents of `.nous/<run_id>/principles.json` if present. v0.1 maps
   *  principles lossily to KnowledgeRefs (see gaps.md G-N-2). */
  principles: string | null
  /** ISO mtime of the campaign-X.yaml file, when the source can provide
   *  one. Optional. The interpreter uses it as a *stable* fallback for
   *  `last_advanced_at` when state.json is absent — without this, every
   *  adapter read regenerates the timestamp via `new Date()`, which makes
   *  the projection cache key unstable for freshly-shaped campaigns and
   *  triggers a fresh LLM call on every Detail navigation. */
  campaignYamlMtime?: string
}

/** Transport contract — abstracts over filesystem / S3 / HTTP / etc. */
export interface NousSource {
  /** A short identifier for this source — used in IntentIds + diagnostics. */
  readonly id: string
  /** Human-readable label for the chrome (e.g., absolute path). */
  readonly label: string
  /** Discover all campaigns — returns the run_ids the interpreter will then
   *  fetch one at a time. The order is the order they appear on the Map. */
  listRunIds(): Promise<string[]>
  /** Fetch all files for a given campaign. Files may be missing (null);
   *  the interpreter handles partial-data gracefully. */
  fetchCampaignFiles(runId: string): Promise<CampaignFiles>
}

/** Shape we expect from a campaign-X.yaml after parsing. Fields that
 *  aren't directly schema-mapped are kept as `unknown` so we don't lock
 *  the interpreter to a stricter shape than Nous actually emits. */
export interface ParsedCampaignYaml {
  research_question?: string
  run_id?: string
  max_iterations?: number
  target_system?: {
    name?: string
    description?: string
    [key: string]: unknown
  }
  [key: string]: unknown
}

/** Shape we expect from a parsed `.nous/<run>/state.json`. */
export interface ParsedNousState {
  phase?: string
  iteration?: number
  run_id?: string
  family?: string | null
  timestamp?: string
  [key: string]: unknown
}
