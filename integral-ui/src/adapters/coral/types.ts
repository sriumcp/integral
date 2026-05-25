/**
 * Coral adapter — transport/interpreter boundary.
 *
 * Mirrors the Nous adapter's split: `CoralSource` is the abstract transport
 * (returns raw bytes for one run); `buildCoralWorkspace` is the pure
 * interpreter. v0.1 ships only `FilesystemCoralSource` (in
 * `vite-plugin-nous-adapter/coral-filesystem-source.ts`); v0.2+ may add
 * `S3CoralSource` etc. without touching the interpreter.
 *
 * v0.1 reads "Phases 1+2" — declarations + scored attempts. No operations
 * diff (the generic engine in `src/lib/workspace-diff.ts` is adapter-
 * agnostic; Coral can opt in later). No writeback. Per `.plan-b1.md`.
 */

/** Raw file contents for one Coral *run* (one
 *  `<root>/results/<task>/<timestamp>/` directory). Any file may be absent;
 *  the interpreter tolerates partial data per the v0.1 falsification
 *  discipline (record the loss, don't crash). */
export interface RunFiles {
  /** Contents of `<root>/task.yaml` — the campaign declaration. Same
   *  contents for every run of the same task; the transport may share a
   *  cached read. Required (run is skipped if absent). */
  taskYaml: string
  /** ISO mtime of `<root>/results/<task>/<timestamp>/` directory; used as
   *  the `lifetime.started_at` fallback when the dir name doesn't parse to
   *  an RFC3339 timestamp. Optional. */
  runDirMtime?: string
  /** Parsed contents of every `attempts/<sha>.json`. The transport pre-
   *  parses to keep the interpreter free of JSON.parse error handling
   *  (one attempt with bad JSON shouldn't kill the whole run). */
  attempts: ParsedAttempt[]
  /** Relative paths of every `notes/**.md` file under the run, sorted.
   *  Body content is not loaded in v0.1 (the schema can't represent it
   *  faithfully — see G-C-10). The interpreter just emits one
   *  `KnowledgeRef` per path. */
  notes: string[]
  /** Parsed contents of every `roles/agent-N.md` file, keyed by `agent_id`.
   *  v0.1 only uses the agent_id; the rich frontmatter + body are dropped
   *  (G-C-4). */
  roles: Map<string, ParsedRoleFile>
}

/** Transport contract — abstracts over filesystem / S3 / HTTP / etc. */
export interface CoralSource {
  /** Stable identifier for this source — used in IntentIds + diagnostics. */
  readonly id: string
  /** Human-readable label for the chrome (e.g., absolute path). */
  readonly label: string
  /** Discover all runs under this source. Returns run IDs that
   *  `fetchRunFiles` can then read individually. Run IDs are
   *  `<task>/<timestamp>` (e.g., `pi-mc/2026-05-24_194843`); the slash is
   *  significant (the timestamp is per-task). The interpreter slugs
   *  appropriately when constructing IntentIds. */
  listRunIds(): Promise<string[]>
  /** Fetch all files for a given run. Files may be missing; the
   *  interpreter handles partial data gracefully. */
  fetchRunFiles(runId: string): Promise<RunFiles>
}

/** Shape we expect from a `task.yaml` after parsing. Fields that aren't
 *  directly schema-mapped stay as `unknown` so we don't lock the interpreter
 *  to a stricter shape than Coral actually emits. */
export interface ParsedTaskYaml {
  task?: {
    name?: string
    description?: string
    [key: string]: unknown
  }
  grader?: {
    entrypoint?: string
    direction?: 'maximize' | 'minimize' | string
    [key: string]: unknown
  }
  agents?: {
    count?: number
    runtime?: string
    model?: string
    [key: string]: unknown
  }
  workspace?: {
    repo_path?: string
    [key: string]: unknown
  }
  [key: string]: unknown
}

/** Shape of one `attempts/<sha>.json` after JSON.parse. Mirrors what real
 *  Coral writes (verified against `~/Documents/learning/coral/pi-mc/`).
 *  Unknown fields stay as `unknown`. */
export interface ParsedAttempt {
  commit_hash: string
  parent_hash?: string
  agent_id: string
  title: string
  score: number
  status: string
  timestamp: string
  feedback?: string
  shared_state_hash?: string
  metadata?: {
    budget_class?: string
    [key: string]: unknown
  }
  [key: string]: unknown
}

/** Frontmatter + body for one `roles/agent-N.md`. v0.1 reads only `agent_id`;
 *  the rest is preserved on the type for v0.2 promotion (G-C-4). */
export interface ParsedRoleFile {
  agent_id: string
  generation?: number
  last_revised_at?: string
  last_revised_after_eval?: number
  /** Full markdown body (everything after the frontmatter). v0.1 doesn't
   *  use this; v0.2 may surface as a KnowledgeRef. */
  body?: string
}
