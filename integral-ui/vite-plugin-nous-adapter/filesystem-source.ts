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
    const nousDir = path.join(this.root, '.nous')
    let entries: string[] = []
    try {
      const dirents: Dirent[] = await fs.readdir(nousDir, { withFileTypes: true })
      entries = dirents
        .filter((d: Dirent) => d.isDirectory() && !d.name.startsWith('.'))
        .map((d: Dirent) => d.name)
    } catch {
      // No .nous/ dir — return campaigns derived from campaign-*.yaml only.
    }

    if (entries.length === 0) {
      // Fallback: derive run_ids from campaign-*.yaml file names. Strips
      // the "campaign-" prefix and ".yaml" suffix; preserves order.
      try {
        const files: string[] = await fs.readdir(this.root)
        entries = files
          .filter((f: string) => f.startsWith('campaign-') && f.endsWith('.yaml'))
          .map((f: string) => f.slice('campaign-'.length, -'.yaml'.length))
      } catch {
        // Source dir missing — nothing to discover.
      }
    }

    return entries.sort()
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
