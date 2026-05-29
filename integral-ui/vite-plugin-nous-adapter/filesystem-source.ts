import { promises as fs, type Dirent } from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import type { CampaignFiles, NousSource } from '../src/adapters/nous'

/**
 * FilesystemNousSource — reads Nous campaign data from a local directory.
 *
 * Two layouts supported in parallel (#239):
 *
 *   Legacy (pre-#239): everything under the target repo.
 *
 *     <root>/
 *       campaign-foo.yaml      ← declarations
 *       campaign-bar.yaml
 *       .nous/
 *         foo/
 *           state.json         ← runtime state
 *           ledger.json
 *           principles.json
 *
 *   Env-var (post-#239): declarations stay at the target repo;
 *   runtime artifacts move to NOUS_CAMPAIGN_PARENT.
 *
 *     <root>/
 *       campaign-foo.yaml      ← declarations stay here
 *     <campaignParent>/
 *       foo/
 *         state.json           ← runtime state moves out
 *         ledger.json
 *         principles.json
 *
 * `listRunIds` discovers from both:
 *   - <root>/.nous/<run>/             — legacy
 *   - <campaignParent>/<run>/         — env-var, when state.json's
 *                                       repo_path matches `root`
 *
 * Multi-source attribution: when two repos share one campaignParent,
 * the source filters by state.json.repo_path. Pre-#239 state.json
 * files (no repo_path) are silently dropped from env-var discovery
 * since we cannot attribute them — the user can either re-run nous
 * (which writes the field on next setup_work_dir) or migrate
 * manually.
 *
 * Per-runId workDir tracking: `listRunIds` populates a private map
 * so `fetchCampaignFiles` knows which directory to read from. Calling
 * `fetchCampaignFiles` without first calling `listRunIds` falls back
 * to the legacy `<root>/.nous/<run>/` layout — preserves existing
 * behavior for any in-process caller that doesn't list first.
 *
 * Env-var location wins on collision: when the same runId exists at
 * both legacy and env-var locations, the env-var copy is read
 * (it's where current nous writes state).
 *
 * Node-only — must not be imported into browser bundles. The Vite
 * plugin is responsible for keeping this off the client side.
 */

export interface FilesystemNousSourceOptions {
  /** When set, also discover campaigns at `<campaignParent>/<run>/`,
   *  filtered by state.json.repo_path === root. Mirrors nous's
   *  `NOUS_CAMPAIGN_PARENT` semantics from #239. The Vite middleware
   *  reads `process.env` per-request via `resolveCampaignParent` and
   *  passes the value here, so source instances themselves stay pure
   *  (deterministic given their constructor args). */
  campaignParent?: string | null
}

export class FilesystemNousSource implements NousSource {
  readonly id: string
  readonly label: string
  private root: string
  private campaignParent: string | null
  /** Per-runId map of which directory holds state/ledger/principles.
   *  Populated during `listRunIds` so `fetchCampaignFiles` doesn't
   *  re-walk to determine the layout. Cleared on every `listRunIds`. */
  private workDirByRunId = new Map<string, string>()

  constructor(root: string, opts: FilesystemNousSourceOptions = {}) {
    this.root = path.resolve(root)
    this.campaignParent =
      opts.campaignParent != null && opts.campaignParent.length > 0
        ? path.resolve(opts.campaignParent)
        : null
    this.id = `fs:${this.root}`
    this.label = this.root
  }

  async listRunIds(): Promise<string[]> {
    this.workDirByRunId.clear()
    const found = new Set<string>()

    // ─── Legacy: <root>/.nous/<run>/ ──────────────────────────────────
    // Pre-#239 campaigns + environments without NOUS_CAMPAIGN_PARENT.
    const legacyNous = path.join(this.root, '.nous')
    try {
      const dirents: Dirent[] = await fs.readdir(legacyNous, {
        withFileTypes: true,
      })
      for (const d of dirents) {
        if (d.isDirectory() && !d.name.startsWith('.')) {
          found.add(d.name)
          this.workDirByRunId.set(d.name, path.join(legacyNous, d.name))
        }
      }
    } catch {
      // No .nous/ — fine. Common on env-var-only setups.
    }

    // ─── Env-var: <campaignParent>/<run>/ ─────────────────────────────
    // Post-#239. Each campaign's state.json carries the target repo's
    // path; we attribute to this source iff state.json.repo_path
    // matches `root` (after path-resolve normalization). Env-var
    // location wins on collision: the same runId discovered at both
    // legacy and env-var locations gets read from env-var (where
    // current nous writes).
    if (this.campaignParent) {
      try {
        const dirents: Dirent[] = await fs.readdir(this.campaignParent, {
          withFileTypes: true,
        })
        for (const d of dirents) {
          if (!d.isDirectory() || d.name.startsWith('.')) continue
          const candidatePath = path.join(this.campaignParent, d.name)
          const statePath = path.join(candidatePath, 'state.json')
          let belongsToUs = false
          try {
            const raw = await fs.readFile(statePath, 'utf-8')
            const parsed = JSON.parse(raw) as { repo_path?: unknown }
            const recorded = parsed?.repo_path
            if (
              typeof recorded === 'string' &&
              path.resolve(recorded) === this.root
            ) {
              belongsToUs = true
            }
          } catch {
            // Missing/unreadable state.json or no repo_path — drop.
            // Pre-#239 state.json without repo_path is silently
            // dropped per the multi-source attribution rule.
          }
          if (belongsToUs) {
            found.add(d.name)
            // Env-var wins on collision (overwrites legacy mapping).
            this.workDirByRunId.set(d.name, candidatePath)
          }
        }
      } catch {
        // No campaign-parent dir — fine. (User has env var set but
        // no campaigns yet; nous would auto-create on first run.)
      }
    }

    // ─── Yaml-only campaigns at <root>/ ───────────────────────────────
    // Newly-shaped campaigns (e.g., from Integral's writeback) before
    // nous has run them: campaign-*.yaml at root, no runtime dir
    // anywhere. We don't override workDir for these — fetchCampaignFiles
    // will fall back to <root>/.nous/<run>/ and read null state.
    try {
      const files: string[] = await fs.readdir(this.root)
      for (const f of files) {
        if (f.startsWith('campaign-') && f.endsWith('.yaml')) {
          found.add(f.slice('campaign-'.length, -'.yaml'.length))
        }
      }
    } catch {
      // Source dir missing — nothing to discover.
    }

    return [...found].sort()
  }

  async fetchCampaignFiles(runId: string): Promise<CampaignFiles> {
    const yamlPath = path.join(this.root, `campaign-${runId}.yaml`)
    // Use the per-runId workDir from listRunIds when available; fall
    // back to legacy <root>/.nous/<runId>/ otherwise. The fallback
    // preserves existing in-process behavior for callers that
    // skip listRunIds.
    const workDir =
      this.workDirByRunId.get(runId) ??
      path.join(this.root, '.nous', runId)
    const statePath = path.join(workDir, 'state.json')
    const ledgerPath = path.join(workDir, 'ledger.json')
    const principlesPath = path.join(workDir, 'principles.json')

    const [campaignYaml, state, ledger, principles, yamlMtime] =
      await Promise.all([
        readOrEmpty(yamlPath),
        readOrNull(statePath),
        readOrNull(ledgerPath),
        readOrNull(principlesPath),
        statMtimeOrNull(yamlPath),
      ])

    return {
      campaignYaml,
      state,
      ledger,
      principles,
      ...(yamlMtime ? { campaignYamlMtime: yamlMtime } : {}),
      workDir,
    }
  }
}

/**
 * Read NOUS_CAMPAIGN_PARENT from process.env, mirroring nous's
 * `_read_env_var` strictness from #239.
 *
 *   - Unset:                    returns null (caller falls back to
 *                               legacy-only discovery).
 *   - Set to absolute path:     returns the resolved path.
 *   - Set to ~-prefixed path:   expands to home directory.
 *   - Set to empty/whitespace:  THROWS — typically `export
 *                               NOUS_CAMPAIGN_PARENT=$UNSET` typo.
 *                               Silent fallback would mask broken
 *                               env state where nous itself refuses
 *                               to run; surface loudly instead.
 *
 * Called per-request from the Vite plugin so a user export between
 * page loads is picked up without restarting the dev server.
 */
export function resolveCampaignParent(): string | null {
  const raw = process.env.NOUS_CAMPAIGN_PARENT
  if (raw === undefined) return null
  const stripped = raw.trim()
  if (!stripped) {
    throw new Error(
      `NOUS_CAMPAIGN_PARENT is set but empty/whitespace (${JSON.stringify(raw)}). ` +
        `Either unset it to use the legacy <repo>/.nous/<run_id>/ default, ` +
        `or set it to an absolute directory path.`
    )
  }
  if (stripped === '~') return os.homedir()
  if (stripped.startsWith('~/')) {
    return path.join(os.homedir(), stripped.slice(2))
  }
  return path.resolve(stripped)
}

async function readOrEmpty(p: string): Promise<string> {
  try {
    return await fs.readFile(p, 'utf-8')
  } catch {
    return ''
  }
}

async function readOrNull(p: string): Promise<string | null> {
  try {
    return await fs.readFile(p, 'utf-8')
  } catch {
    return null
  }
}

/** ISO mtime of the file at `p`, or null if it doesn't exist. Used to
 *  give the interpreter a *stable* fallback timestamp for campaigns
 *  whose state.json hasn't been written yet — without it,
 *  the projection cache key changes on every adapter read. */
async function statMtimeOrNull(p: string): Promise<string | null> {
  try {
    const st = await fs.stat(p)
    return st.mtime.toISOString()
  } catch {
    return null
  }
}
