/**
 * Disk persistence for generated projections.
 *
 * Default cache dir: `~/.cache/integral/projections/`. Overridable via
 * `INTEGRAL_CACHE_DIR` env var. Each projection lives in its own JSON file
 * named after the SHA-256 of `(intent_id, zoom, state_timestamp)` — that
 * triple is the natural cache key:
 *  - `intent_id` scopes the cache to one intent
 *  - `zoom` scopes to one matrix cell
 *  - `state_timestamp` invalidates automatically when underlying state
 *    changes (a new iteration appears, h_main resolves, etc.) — old key
 *    no longer matches, fresh LLM call fires
 *
 * The cache file payload includes the projection plus metadata: when it
 * was generated, which model produced it. The chrome can render
 * "generated 12m ago" hints from this metadata.
 *
 * Server-side only — `fs`, `path`, `os`, `crypto` imports. Never reachable
 * from `src/` per the test isolation discipline (CLAUDE.md § Test
 * discipline).
 */

import * as crypto from 'node:crypto'
import { promises as fs } from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import type { Projection } from '../src/lib/projection'

export interface PersistedProjection {
  content: string
  source: 'llm' | 'fallback'
  /** ISO timestamp of when the LLM call completed. */
  generated_at: string
  /** Model name (when source='llm'). Helps debug provider/model issues
   *  visible in the cache without re-running. */
  model?: string
  intent_id: string
  zoom: string
  /** The `state.last_advanced_at` this projection was generated for. */
  state_timestamp: string
}

const DEFAULT_CACHE_DIR = path.join(
  os.homedir(),
  '.cache',
  'integral',
  'projections'
)

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
    .update(`${intentId}::${zoom}::${stateTimestamp}`)
    .digest('hex')
}

function cacheFile(key: string): string {
  return path.join(cacheDir(), `${key}.json`)
}

export async function readPersistedProjection(args: {
  intentId: string
  zoom: string
  stateTimestamp: string
}): Promise<PersistedProjection | null> {
  const key = cacheKey(args.intentId, args.zoom, args.stateTimestamp)
  try {
    const raw = await fs.readFile(cacheFile(key), 'utf-8')
    const parsed = JSON.parse(raw) as PersistedProjection
    // Sanity-check the payload — guards against partial writes / bit-rot.
    if (
      typeof parsed.content !== 'string' ||
      (parsed.source !== 'llm' && parsed.source !== 'fallback')
    ) {
      return null
    }
    return parsed
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
  projection: Projection
  model?: string
}): Promise<PersistedProjection> {
  const dir = cacheDir()
  await fs.mkdir(dir, { recursive: true })
  const key = cacheKey(args.intentId, args.zoom, args.stateTimestamp)
  const payload: PersistedProjection = {
    content: args.projection.content,
    source: args.projection.source,
    generated_at: new Date().toISOString(),
    intent_id: args.intentId,
    zoom: args.zoom,
    state_timestamp: args.stateTimestamp,
    ...(args.model ? { model: args.model } : {}),
  }
  await fs.writeFile(cacheFile(key), JSON.stringify(payload, null, 2), 'utf-8')
  return payload
}

/** Exposed for diagnostics / dev tooling. */
export function projectionCacheDir(): string {
  return cacheDir()
}
