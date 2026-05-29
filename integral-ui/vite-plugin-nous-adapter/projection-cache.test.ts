/**
 * Projection-cache tests — real tmpdir, no LLM.
 */

import { promises as fs } from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  readPersistedProjection,
  writePersistedProjection,
  projectionCacheDir,
} from './projection-cache'
import type { ExecutedProjection } from '../src/lib/projection/spec'

let dir: string
const ORIGINAL_ENV = process.env.INTEGRAL_CACHE_DIR

function makeProjection(): ExecutedProjection {
  return {
    spec_version: '1',
    figures: [],
    quoted_numerics: { n: 5 },
    prose: '5 things.',
    cite_index: [],
    source: 'llm',
    generated_at: '2026-05-29T00:00:00Z',
  }
}

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'integral-cache-'))
  process.env.INTEGRAL_CACHE_DIR = dir
})

afterEach(async () => {
  if (ORIGINAL_ENV === undefined) delete process.env.INTEGRAL_CACHE_DIR
  else process.env.INTEGRAL_CACHE_DIR = ORIGINAL_ENV
  await fs.rm(dir, { recursive: true, force: true })
})

describe('projection-cache', () => {
  it('write+read round-trips an ExecutedProjection', async () => {
    const proj = makeProjection()
    await writePersistedProjection({
      intentId: 'i1', zoom: 'structure', stateTimestamp: 'ts1', projection: proj,
    })
    const read = await readPersistedProjection({
      intentId: 'i1', zoom: 'structure', stateTimestamp: 'ts1',
    })
    expect(read?.prose).toBe('5 things.')
    expect(read?.quoted_numerics).toEqual({ n: 5 })
  })

  it('returns null on cache miss (different intent_id)', async () => {
    await writePersistedProjection({
      intentId: 'i1', zoom: 'structure', stateTimestamp: 'ts1', projection: makeProjection(),
    })
    const read = await readPersistedProjection({
      intentId: 'i2', zoom: 'structure', stateTimestamp: 'ts1',
    })
    expect(read).toBeNull()
  })

  it('returns null on cache miss (different state_timestamp)', async () => {
    await writePersistedProjection({
      intentId: 'i1', zoom: 'structure', stateTimestamp: 'ts1', projection: makeProjection(),
    })
    const read = await readPersistedProjection({
      intentId: 'i1', zoom: 'structure', stateTimestamp: 'ts2',
    })
    expect(read).toBeNull()
  })

  it('returns null on cache miss (different zoom)', async () => {
    await writePersistedProjection({
      intentId: 'i1', zoom: 'structure', stateTimestamp: 'ts1', projection: makeProjection(),
    })
    const read = await readPersistedProjection({
      intentId: 'i1', zoom: 'detail', stateTimestamp: 'ts1',
    })
    expect(read).toBeNull()
  })

  it('returns null on a corrupt cache file (treats as miss + regenerates next call)', async () => {
    await writePersistedProjection({
      intentId: 'i1', zoom: 'structure', stateTimestamp: 'ts1', projection: makeProjection(),
    })
    // Replace one cache file with garbage.
    const files = await fs.readdir(dir)
    const cacheFile = files.find((f) => f.endsWith('.json'))
    expect(cacheFile).toBeDefined()
    await fs.writeFile(path.join(dir, cacheFile!), 'NOT JSON', 'utf-8')
    const read = await readPersistedProjection({
      intentId: 'i1', zoom: 'structure', stateTimestamp: 'ts1',
    })
    expect(read).toBeNull()
  })

  it('returns null on a stale-schema cache file (different spec_version)', async () => {
    await writePersistedProjection({
      intentId: 'i1', zoom: 'structure', stateTimestamp: 'ts1', projection: makeProjection(),
    })
    const files = await fs.readdir(dir)
    const cacheFile = files.find((f) => f.endsWith('.json'))!
    // Tamper: change spec_version to a value the schema rejects.
    const raw = await fs.readFile(path.join(dir, cacheFile), 'utf-8')
    const parsed = JSON.parse(raw)
    parsed.spec_version = '99'
    await fs.writeFile(path.join(dir, cacheFile), JSON.stringify(parsed), 'utf-8')
    const read = await readPersistedProjection({
      intentId: 'i1', zoom: 'structure', stateTimestamp: 'ts1',
    })
    expect(read).toBeNull()
  })

  it('exposes the cache dir for diagnostics', () => {
    expect(projectionCacheDir()).toBe(dir)
  })

  it('default cache dir lives at ~/.cache/integral/projections-v2/', () => {
    delete process.env.INTEGRAL_CACHE_DIR
    expect(projectionCacheDir()).toBe(
      path.join(os.homedir(), '.cache', 'integral', 'projections-v2')
    )
    process.env.INTEGRAL_CACHE_DIR = dir
  })
})
