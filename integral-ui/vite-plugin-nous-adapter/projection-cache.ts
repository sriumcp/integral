/**
 * Disk persistence for generated projections.
 *
 * v0.3.x payload bump: cache now stores `ExecutedProjection`, not the
 * old `{content, source}` prose payload. The cache *namespace* moves
 * from `projections/` to `projections-v2/` so the old prose cache files
 * become orphans (harmless — they take a few MB; the user can rm if
 * they care).
 *
 * Cache dir: `~/.cache/integral/projections-v2/` (overridable via
 * `INTEGRAL_CACHE_DIR`). Each projection lives in its own JSON file
 * named after the SHA-256 of `(intent_id, zoom, state_timestamp)`. The
 * triple is the cache key:
 *  - `intent_id` scopes to one intent
 *  - `zoom` scopes to one matrix cell
 *  - `state_timestamp` invalidates automatically when underlying state
 *    changes (a new iteration appears, h_main resolves, a markdown file
 *    is touched) — old key no longer matches, fresh LLM call fires
 *
 * Server-side only — `fs`, `path`, `os`, `crypto` imports.
 */

import * as crypto from 'node:crypto'
import { promises as fs } from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {
  ExecutedProjectionSchema,
  type ExecutedProjection,
} from '../src/lib/projection/spec'

const DEFAULT_CACHE_DIR = path.join(
  os.homedir(),
  '.cache',
  'integral',
  'projections-v2'
)

/**
 * Bumped whenever projection BEHAVIOR changes (composer prompt, executor
 * rules, parser pack output, lint discipline) in a way that would render
 * existing cached projections stale even though their schema is still
 * valid. Including this in the cache key means a code change that ships
 * a behavior bump automatically invalidates every cache entry on the
 * user's machine — no manual regenerate clicks, no `rm -rf` needed.
 *
 * History:
 *  - '1' — initial typed-evidence pipeline (2026-05-29)
 *  - '2' — figure-drop rule + heading-marker strip + excerpt-allow lint
 *          (2026-05-29 PM)
 *  - '3' — stricter figure-drop (no emit_empty loophole; line/area need
 *          ≥2 numeric points) + fallback_reason field on
 *          ExecutedProjection (2026-05-29 PM)
 *  - '4' — added count_by TransformOp + composer prompt update so the
 *          LLM has a clean primitive for "count rows per category"
 *          (2026-05-29 PM)
 *  - '5' — slugify markdown table + CSV column names so the LLM sees
 *          safe identifiers instead of "What's there"-style headers
 *          (2026-05-29 PM)
 */
const PIPELINE_VERSION = '5'

function cacheDir(): string {
  return process.env.INTEGRAL_CACHE_DIR ?? DEFAULT_CACHE_DIR
}

function cacheKey(
  intentId: string,
  zoom: string,
  stateTimestamp: string
): string {
  return crypto
    .createHash('sha256')
    .update(`${PIPELINE_VERSION}::${intentId}::${zoom}::${stateTimestamp}`)
    .digest('hex')
}

function cacheFile(key: string): string {
  return path.join(cacheDir(), `${key}.json`)
}

export async function readPersistedProjection(args: {
  intentId: string
  zoom: string
  stateTimestamp: string
}): Promise<ExecutedProjection | null> {
  const key = cacheKey(args.intentId, args.zoom, args.stateTimestamp)
  try {
    const raw = await fs.readFile(cacheFile(key), 'utf-8')
    const parsed = JSON.parse(raw) as unknown
    const result = ExecutedProjectionSchema.safeParse(parsed)
    // Stale schema (e.g. from a prior spec_version) → treat as miss so
    // we regenerate against the new shape. Cache file gets overwritten.
    if (!result.success) return null
    return result.data
  } catch (err) {
    // ENOENT = cache miss. Other errors are also treated as miss for
    // resilience — a corrupt cache file shouldn't break projection
    // serving; the next call regenerates and overwrites.
    void err
    return null
  }
}

export async function writePersistedProjection(args: {
  intentId: string
  zoom: string
  stateTimestamp: string
  projection: ExecutedProjection
}): Promise<ExecutedProjection> {
  const dir = cacheDir()
  await fs.mkdir(dir, { recursive: true })
  const key = cacheKey(args.intentId, args.zoom, args.stateTimestamp)
  await fs.writeFile(
    cacheFile(key),
    JSON.stringify(args.projection, null, 2),
    'utf-8'
  )
  return args.projection
}

/** Exposed for diagnostics / dev tooling. */
export function projectionCacheDir(): string {
  return cacheDir()
}
