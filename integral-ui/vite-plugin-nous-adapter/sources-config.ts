/**
 * Source configuration loader — reads `integral.config.json` from the
 * project root and produces the typed source list the Vite plugin uses.
 *
 * Format:
 *   {
 *     "sources": [
 *       {
 *         "id": "inference-sim",
 *         "kind": "nous",
 *         "label": "inference-sim",
 *         "path": "~/Documents/Projects/inference-sim"
 *       }
 *     ]
 *   }
 *
 * - `id`: unique identifier used in URLs + `intent.provenance.source`.
 *   Browser-visible. Should be slug-safe.
 * - `kind`: adapter kind. v0.1 supports only `"nous"`. v0.2 will add
 *   `"coral"`, `"feature"`, etc.
 * - `label`: human-readable display in the source picker chip cluster.
 * - `path`: filesystem path. `~` is expanded to the user's home dir.
 *
 * If the config file is missing or unparseable, falls back to a single
 * default source (`inference-sim` pointing at `~/Documents/Projects/
 * inference-sim`) so existing dev environments keep working.
 *
 * Server-side only — `fs`, `path`, `os` imports.
 */

import { promises as fs } from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

export type AdapterKind = 'nous' | 'coral' | 'github-issues'

export interface ConfiguredSource {
  id: string
  kind: AdapterKind
  label: string
  /** For filesystem-backed adapters (`'nous'`, `'coral'`): a resolved
   *  absolute filesystem path (with `~` and relatives expanded). For
   *  `'github-issues'`: an `<owner>/<name>` repo coordinate, NOT
   *  filesystem-expanded. The dispatcher in `index.ts` interprets this
   *  field according to `kind`. */
  path: string
}

const DEFAULT_NOUS_PATH = path.join(
  os.homedir(),
  'Documents',
  'Projects',
  'inference-sim'
)

// Default keeps id='nous' + label='nous campaigns' to preserve the URL
// contract (`?sources=fixture,nous`) and visual baselines from the
// pre-config-file era. Users who rename their source via
// integral.config.json get whatever id/label they choose.
const DEFAULT_SOURCES: ConfiguredSource[] = [
  {
    id: 'nous',
    kind: 'nous',
    label: 'nous campaigns',
    path: DEFAULT_NOUS_PATH,
  },
]

const CONFIG_FILENAME = 'integral.config.json'

function expandPath(p: string, baseDir: string): string {
  if (p.startsWith('~/') || p === '~') {
    return path.join(os.homedir(), p.slice(1))
  }
  if (path.isAbsolute(p)) return p
  return path.resolve(baseDir, p)
}

/**
 * Load the source configuration. `cwd` is the directory the config file
 * is expected in (the Vite plugin passes its working dir).
 *
 * Returns the default single-Nous source if:
 *  - the config file doesn't exist
 *  - the file is malformed JSON
 *  - the parsed object has no `sources` array
 *  - every entry in `sources` fails validation
 *
 * Entries that fail validation individually are dropped with a console
 * warning; the rest survive.
 */
export async function loadSourcesConfig(cwd: string): Promise<ConfiguredSource[]> {
  const configPath = path.join(cwd, CONFIG_FILENAME)
  let raw: string
  try {
    raw = await fs.readFile(configPath, 'utf-8')
  } catch {
    return DEFAULT_SOURCES
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(
      `[integral] failed to parse ${CONFIG_FILENAME}: ${err instanceof Error ? err.message : String(err)} — falling back to default sources`
    )
    return DEFAULT_SOURCES
  }

  if (!parsed || typeof parsed !== 'object') return DEFAULT_SOURCES
  const sources = (parsed as { sources?: unknown }).sources
  if (!Array.isArray(sources)) return DEFAULT_SOURCES

  const result: ConfiguredSource[] = []
  for (const entry of sources) {
    const validated = validateEntry(entry, cwd)
    if (validated) result.push(validated)
  }

  if (result.length === 0) {
    // eslint-disable-next-line no-console
    console.warn(
      `[integral] ${CONFIG_FILENAME} contained no valid source entries — falling back to default sources`
    )
    return DEFAULT_SOURCES
  }

  return result
}

function validateEntry(raw: unknown, cwd: string): ConfiguredSource | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>
  if (typeof obj.id !== 'string' || obj.id.length === 0) return null
  if (obj.kind !== 'nous' && obj.kind !== 'coral' && obj.kind !== 'github-issues') {
    // eslint-disable-next-line no-console
    console.warn(
      `[integral] source "${obj.id}" has unsupported kind "${String(obj.kind)}" — supported kinds: "nous", "coral", "github-issues"`
    )
    return null
  }
  if (typeof obj.label !== 'string' || obj.label.length === 0) return null
  if (typeof obj.path !== 'string' || obj.path.length === 0) return null
  // For github-issues, `path` is a repo coordinate (`owner/name`) and
  // must NOT be filesystem-expanded — the gh-cli-source validates the
  // shape on its own. Filesystem-backed kinds do path expansion.
  const resolvedPath = obj.kind === 'github-issues' ? obj.path : expandPath(obj.path, cwd)
  return {
    id: obj.id,
    kind: obj.kind,
    label: obj.label,
    path: resolvedPath,
  }
}
