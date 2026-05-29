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

export type AdapterKind = 'nous' | 'coral' | 'github-issues' | 'research-thread'

export interface ConfiguredSource {
  id: string
  kind: AdapterKind
  label: string
  /** For filesystem-backed adapters (`'nous'`, `'coral'`,
   *  `'research-thread'`): a resolved absolute filesystem path (with
   *  `~` and relatives expanded). For `'research-thread'`, the path is
   *  the *parent* directory containing one subdirectory per thread.
   *  For `'github-issues'`: an `<owner>/<name>` repo coordinate, NOT
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

const DEFAULT_RESEARCH_THREAD_PATH = path.join(
  os.homedir(),
  'Documents',
  'Projects',
  'research-threads'
)

// Default sources used when no integral.config.json is present. v0.3.0
// adds a `research-thread` default at ~/Documents/Projects/research-threads/
// — analogous to the Nous default. Users who configure their own sources
// override these entirely.
const DEFAULT_SOURCES: ConfiguredSource[] = [
  {
    id: 'nous',
    kind: 'nous',
    label: 'nous campaigns',
    path: DEFAULT_NOUS_PATH,
  },
  {
    id: 'research-threads',
    kind: 'research-thread',
    label: 'research threads',
    path: DEFAULT_RESEARCH_THREAD_PATH,
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

// ─── Me identity ───────────────────────────────────────────────────────────

/** Narrow shape carried over the wire by `/api/me`. The browser lifts it
 *  to a full `Party` at the boundary by baking in `kind: 'human'` (v0.1
 *  has no agent-as-self use case — see App.tsx). */
export interface MeConfig {
  id: string
  display_name: string
}

/**
 * Resolve the current user's identity. Reads `integral.config.json`'s
 * optional `me: { id, display_name }` field; falls back to the OS
 * username from `os.userInfo()` when the field is absent, malformed, or
 * the file is missing/unreadable.
 *
 * The fallback path is deliberate — a fresh checkout on any machine
 * should "just work" without forcing the user to write a config file
 * just to get their handle into the right-cluster me chip.
 */
export async function loadMeConfig(cwd: string): Promise<MeConfig> {
  const configPath = path.join(cwd, CONFIG_FILENAME)
  let raw: string
  try {
    raw = await fs.readFile(configPath, 'utf-8')
  } catch {
    return osFallback()
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return osFallback()
  }

  if (!parsed || typeof parsed !== 'object') return osFallback()
  const me = (parsed as { me?: unknown }).me
  if (!me || typeof me !== 'object') return osFallback()
  const obj = me as Record<string, unknown>
  if (typeof obj.id !== 'string' || obj.id.length === 0) return osFallback()
  if (typeof obj.display_name !== 'string' || obj.display_name.length === 0) {
    return osFallback()
  }
  return { id: obj.id, display_name: obj.display_name }
}

function osFallback(): MeConfig {
  try {
    const username = os.userInfo().username
    if (typeof username === 'string' && username.length > 0) {
      return { id: username, display_name: username }
    }
  } catch {
    /* fall through */
  }
  return { id: 'user', display_name: 'user' }
}

function validateEntry(raw: unknown, cwd: string): ConfiguredSource | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>
  if (typeof obj.id !== 'string' || obj.id.length === 0) return null
  const SUPPORTED_KINDS: ReadonlyArray<AdapterKind> = [
    'nous',
    'coral',
    'github-issues',
    'research-thread',
  ]
  if (!SUPPORTED_KINDS.includes(obj.kind as AdapterKind)) {
    // eslint-disable-next-line no-console
    console.warn(
      `[integral] source "${obj.id}" has unsupported kind "${String(obj.kind)}" — supported kinds: ${SUPPORTED_KINDS.map((k) => `"${k}"`).join(', ')}`
    )
    return null
  }
  if (typeof obj.label !== 'string' || obj.label.length === 0) return null
  if (typeof obj.path !== 'string' || obj.path.length === 0) return null
  // For github-issues, `path` is a repo coordinate (`owner/name`) and
  // must NOT be filesystem-expanded — the gh-cli-source validates the
  // shape on its own. All other kinds get filesystem path expansion.
  const resolvedPath = obj.kind === 'github-issues' ? obj.path : expandPath(obj.path, cwd)
  return {
    id: obj.id,
    kind: obj.kind as AdapterKind,
    label: obj.label,
    path: resolvedPath,
  }
}
