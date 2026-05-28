/**
 * Pre-flight validation for the Nous shaping → writeback flow.
 *
 * The Shaping surface, when about to commit a `nous-campaign` draft,
 * needs to know whether the campaign references real things — does the
 * `target_system.repo_path` exist, is the `nous` CLI on PATH, will the
 * runId collide with an existing campaign-X.yaml. Failures surface
 * inline before the commit, not after the user runs `nous run` and
 * gets a stack trace.
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
 * import the *types* (PreflightCheck, PreflightStatus). The
 * `runPreflight` function is technically callable in the browser too,
 * but in practice the deps require Node, so it's only ever invoked
 * server-side via `/api/nous/preflight`.
 */

export type PreflightStatus = 'ok' | 'warn' | 'fail'

export interface PreflightCheck {
  /** Stable kebab-case id; used as a UI key + data hook. */
  name: string
  status: PreflightStatus
  /** Human-readable detail; surfaced as tooltip text. */
  message?: string
}

export interface PreflightInput {
  /** From `writeback.target_system.repo_path`. May be empty/undefined
   *  during shaping — pre-flight surfaces that as a fail (the user
   *  hasn't filled the field yet). */
  targetRepoPath: string | undefined
  /** Resolved filesystem path of the writeback source — i.e. where
   *  `campaign-<runId>.yaml` will be written. */
  writebackPath: string
  /** Resolved run id. Empty string when not yet derived; pre-flight
   *  warns rather than fails so the commit isn't blocked while shaping. */
  runId: string
}

export interface PreflightDeps {
  /** Resolves true if `path` is a directory that exists. */
  pathExists: (path: string) => boolean | Promise<boolean>
  /** Resolves true if the process can write into `path`. */
  isWritable: (path: string) => boolean | Promise<boolean>
  /** Resolves true if a `nous` executable is on PATH. */
  hasNousCli: () => boolean | Promise<boolean>
  /** Resolves true if `<writebackPath>/campaign-<runId>.yaml` exists. */
  campaignFileExists: (
    writebackPath: string,
    runId: string,
  ) => boolean | Promise<boolean>
}

/**
 * Run all four canonical checks in parallel; never reject. A dep that
 * throws becomes a `fail` on the corresponding check so the UI gets a
 * uniform "list of statuses" shape regardless of failure mode.
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
  const name = 'repo-path-exists'
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
        message: `path does not exist: ${path}`,
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
  const name = 'nous-cli-available'
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
  const name = 'writeback-target-writable'
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
  const name = 'run-id-not-in-use'
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
