/**
 * Pre-flight validation for the Nous shaping → writeback flow.
 *
 * The Shaping surface, when about to commit a `nous-campaign` draft,
 * needs to know whether the campaign references real things — does the
 * `target_system.repo_path` exist as a real directory, is the `nous`
 * CLI on PATH, will the runId collide with an existing campaign-X.yaml.
 * Failures surface inline before the commit, not after the user runs
 * `nous run` and gets a stack trace.
 *
 * This is the **literal v0.1.5 Nous falsification stop condition** per
 * `roadmap.md § Falsification per adapter`: shaping a campaign with a
 * non-existent `repo_path` should be gated until the path exists.
 *
 * Architecture: pure logic + injected I/O. The handler in
 * `vite-plugin-nous-adapter/preflight-handler.ts` constructs real
 * `PreflightDeps` from Node's filesystem + subprocess primitives;
 * tests inject mocks. This is the same transport/interpreter split
 * as the rest of the substrate (LLMClient, NousSource).
 *
 * Browser-safe: this file lives under `src/` so the React layer can
 * import the types (PreflightCheck, PreflightStatus, PreflightCheckName).
 * The `runPreflight` function is technically callable in the browser
 * too, but in practice the deps require Node, so it's only ever
 * invoked server-side via `/api/nous/preflight`.
 */

/** Stable kebab-case ids for the four canonical checks. New checks
 *  must extend this union — every consumer that switches on `name`
 *  becomes an exhaustive compile error until acknowledged. */
export type PreflightCheckName =
  | 'repo-path-exists'
  | 'nous-cli-available'
  | 'writeback-target-writable'
  | 'run-id-not-in-use'

export type PreflightStatus = 'ok' | 'warn' | 'fail'

/**
 * Result of one check. Discriminated on `status`:
 *  - `ok` carries no message (nothing to surface).
 *  - `warn` and `fail` MUST carry a message — the UI tooltip relies
 *    on it, and a missing message would render as an empty hover.
 *
 * The runtime invariant ("warn|fail always have a message") is now
 * type-enforced; consumers no longer need to defensive-render
 * `check.message ?? '(no detail)'`.
 */
export type PreflightCheck =
  | { name: PreflightCheckName; status: 'ok' }
  | { name: PreflightCheckName; status: 'warn' | 'fail'; message: string }

export interface PreflightInput {
  /** From `writeback.target_system.repo_path`. May be empty/undefined
   *  during shaping — pre-flight surfaces that as a fail check. */
  targetRepoPath: string | undefined
  /** Resolved filesystem path of the writeback source — i.e. where
   *  `campaign-<runId>.yaml` will be written. */
  writebackPath: string
  /** Resolved run id. Empty string when not yet derived; pre-flight
   *  warns rather than fails so the commit isn't blocked while shaping. */
  runId: string
}

export interface PreflightDeps {
  /** Resolves true if `path` is a directory that exists. Files at
   *  `path` MUST resolve false — `nous run` requires a directory.
   *  ENOENT-style absence resolves false; other errors (permissions,
   *  symlink loops) MUST throw so the caller surfaces them. */
  pathExists: (path: string) => boolean | Promise<boolean>
  /** Resolves true if the process can write into `path`. ENOENT and
   *  EACCES resolve false; other errors MUST throw. */
  isWritable: (path: string) => boolean | Promise<boolean>
  /** Resolves true if a `nous` executable is on PATH. ENOENT-style
   *  "not found" resolves false; ambiguous errors (timeout, EACCES on
   *  a candidate path) MUST throw so the caller surfaces them as a
   *  warn with the original message rather than collapsing into "not
   *  installed." */
  hasNousCli: () => boolean | Promise<boolean>
  /** Resolves true if `<writebackPath>/campaign-<runId>.yaml` exists.
   *  ENOENT resolves false; other errors MUST throw. */
  campaignFileExists: (
    writebackPath: string,
    runId: string,
  ) => boolean | Promise<boolean>
}

/**
 * Run all four canonical checks in parallel; never reject. A dep that
 * throws becomes a `fail` (or `warn` for the CLI check) on the
 * corresponding check so the UI gets a uniform "list of statuses"
 * shape regardless of failure mode.
 *
 * Returns checks in a stable order: repo-path-exists, nous-cli-available,
 * writeback-target-writable, run-id-not-in-use. The order is for
 * readability only; UIs key on `name`.
 */
export async function runPreflight(
  input: PreflightInput,
  deps: PreflightDeps,
): Promise<PreflightCheck[]> {
  const [repo, cli, writable, runId] = await Promise.all([
    checkRepoPathExists(input, deps),
    checkNousCliAvailable(deps),
    checkWritebackTargetWritable(input, deps),
    checkRunIdNotInUse(input, deps),
  ])
  return [repo, cli, writable, runId]
}

async function checkRepoPathExists(
  input: PreflightInput,
  deps: PreflightDeps,
): Promise<PreflightCheck> {
  const name: PreflightCheckName = 'repo-path-exists'
  const path = input.targetRepoPath
  if (!path || path.length === 0) {
    return {
      name,
      status: 'fail',
      message: 'target system repo path is empty — fill it before commit',
    }
  }
  try {
    const exists = await deps.pathExists(path)
    if (!exists) {
      return {
        name,
        status: 'fail',
        message: `path is not an existing directory: ${path}`,
      }
    }
    return { name, status: 'ok' }
  } catch (err) {
    return {
      name,
      status: 'fail',
      message: `error checking ${path}: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}

async function checkNousCliAvailable(
  deps: PreflightDeps,
): Promise<PreflightCheck> {
  const name: PreflightCheckName = 'nous-cli-available'
  try {
    const ok = await deps.hasNousCli()
    if (!ok) {
      return {
        name,
        status: 'warn',
        message:
          '`nous` CLI not on PATH — install Nous before running this campaign',
      }
    }
    return { name, status: 'ok' }
  } catch (err) {
    return {
      name,
      status: 'warn',
      message: `error probing nous CLI: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}

async function checkWritebackTargetWritable(
  input: PreflightInput,
  deps: PreflightDeps,
): Promise<PreflightCheck> {
  const name: PreflightCheckName = 'writeback-target-writable'
  try {
    const writable = await deps.isWritable(input.writebackPath)
    if (!writable) {
      return {
        name,
        status: 'fail',
        message: `writeback target is not writable: ${input.writebackPath}`,
      }
    }
    return { name, status: 'ok' }
  } catch (err) {
    return {
      name,
      status: 'fail',
      message: `error checking writability of ${input.writebackPath}: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}

async function checkRunIdNotInUse(
  input: PreflightInput,
  deps: PreflightDeps,
): Promise<PreflightCheck> {
  const name: PreflightCheckName = 'run-id-not-in-use'
  if (input.runId.length === 0) {
    // The writeback handler derives a runId from the title at commit
    // time — so an empty runId during shaping is normal. Don't block
    // commit on something we can't actually check.
    return {
      name,
      status: 'warn',
      message: 'run id will be derived from title at commit time',
    }
  }
  try {
    const exists = await deps.campaignFileExists(
      input.writebackPath,
      input.runId,
    )
    if (exists) {
      return {
        name,
        status: 'fail',
        message: `campaign-${input.runId}.yaml already exists at ${input.writebackPath}; pick a different run id`,
      }
    }
    return { name, status: 'ok' }
  } catch (err) {
    return {
      name,
      status: 'fail',
      message: `error checking run id: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}

/** True iff every check reports `ok`. The commit-button gate uses the
 *  stronger `phase === 'ok' && noFailures` predicate via the hook —
 *  this helper exists for callers that already have the array. */
export function hasFailingCheck(checks: ReadonlyArray<PreflightCheck>): boolean {
  return checks.some((c) => c.status === 'fail')
}
