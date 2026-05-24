import { promises as fs, type Dirent } from 'node:fs'
import * as path from 'node:path'
import type { CampaignFiles, NousSource } from '../src/adapters/nous'

/**
 * FilesystemNousSource — reads Nous campaign data from a local directory.
 *
 * Layout it expects (mirrors `~/Documents/Projects/inference-sim/`):
 *
 *   <root>/
 *     campaign-foo.yaml      ← declarations
 *     campaign-bar.yaml
 *     .nous/
 *       foo/
 *         state.json         ← runtime state
 *         ledger.json
 *         principles.json
 *       bar/
 *         …
 *
 * `listRunIds` discovers campaigns from the `.nous/<run>/` directories
 * (since not every campaign-*.yaml has a corresponding `.nous` dir, but
 * an active `.nous/<run>/` always implies a campaign). The interpreter
 * then matches each run to its `campaign-<name>.yaml` if present.
 *
 * Node-only — must not be imported into browser bundles. The Vite
 * plugin is responsible for keeping this off the client side.
 */
export class FilesystemNousSource implements NousSource {
  readonly id: string
  readonly label: string
  private root: string

  constructor(root: string) {
    this.root = path.resolve(root)
    this.id = `fs:${this.root}`
    this.label = this.root
  }

  async listRunIds(): Promise<string[]> {
    // Discover run_ids from BOTH `.nous/<run>/` dirs and standalone
    // `campaign-*.yaml` files, then union and dedupe. A run_id can exist
    // in either or both:
    //  - Existing campaigns Nous has run: have both a campaign-*.yaml
    //    declaration AND a `.nous/<run>/` runtime state dir.
    //  - Newly-written campaigns (e.g., from Integral's writeback): have
    //    a campaign-*.yaml but NO `.nous/<run>/` yet (Nous hasn't run them).
    //  - Stale runtime: a `.nous/<run>/` dir without a matching
    //    campaign-*.yaml (rare; the interpreter skips these).
    //
    // The previous "fallback only when .nous/ is empty" rule made
    // newly-written declarations invisible whenever the source dir
    // had any prior runs.
    const found = new Set<string>()

    const nousDir = path.join(this.root, '.nous')
    try {
      const dirents: Dirent[] = await fs.readdir(nousDir, { withFileTypes: true })
      for (const d of dirents) {
        if (d.isDirectory() && !d.name.startsWith('.')) {
          found.add(d.name)
        }
      }
    } catch {
      // No .nous/ dir — fine, we'll rely on YAML discovery.
    }

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
    const statePath = path.join(this.root, '.nous', runId, 'state.json')
    const ledgerPath = path.join(this.root, '.nous', runId, 'ledger.json')
    const principlesPath = path.join(this.root, '.nous', runId, 'principles.json')

    const [campaignYaml, state, ledger, principles] = await Promise.all([
      readOrEmpty(yamlPath),
      readOrNull(statePath),
      readOrNull(ledgerPath),
      readOrNull(principlesPath),
    ])

    return { campaignYaml, state, ledger, principles }
  }
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
