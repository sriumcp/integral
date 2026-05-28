/**
 * preflight-handler — integration tests for /api/nous/preflight.
 *
 * Two test scopes:
 *  1. `handlePreflight` wiring — input validation (Zod), source
 *     resolution, kind enforcement, runPreflight call. Mocks deps via
 *     the injection seam; never touches real disk.
 *  2. `defaultDeps` real-I/O behavior — exercises Node fs against
 *     real temp directories so we can falsify the directory-only
 *     contract on `pathExists` and the ENOENT-vs-other-errors
 *     distinction. Filesystem-isolated in `os.tmpdir()`.
 *
 * Per `## Test discipline` in CLAUDE.md, no real LLMs are touched.
 */

import { promises as fs } from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  defaultDeps,
  expandHome,
  handlePreflight,
  type PreflightHandlerDeps,
} from './preflight-handler'
import type { ConfiguredSource } from './sources-config'

const NOUS_SOURCE: ConfiguredSource = {
  id: 'nous-test',
  kind: 'nous',
  label: 'nous test',
  path: '/path/to/nous/source',
}

const CORAL_SOURCE: ConfiguredSource = {
  id: 'coral-test',
  kind: 'coral',
  label: 'coral test',
  path: '/path/to/coral/source',
}

function happyDeps(): PreflightHandlerDeps {
  return {
    pathExists: vi.fn(async () => true),
    isWritable: vi.fn(async () => true),
    hasNousCli: vi.fn(async () => true),
    campaignFileExists: vi.fn(async () => false),
  }
}

describe('handlePreflight — input validation (Zod-driven)', () => {
  it('returns 400 when body is null', async () => {
    const result = await handlePreflight(null, [NOUS_SOURCE], happyDeps())
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.status).toBe(400)
  })

  it('returns 400 when body is not an object', async () => {
    const result = await handlePreflight('not an object', [NOUS_SOURCE], happyDeps())
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.status).toBe(400)
  })

  it('returns 400 when sourceId is missing', async () => {
    const result = await handlePreflight(
      { target_system: { repo_path: '/foo' }, runId: 'r' },
      [NOUS_SOURCE],
      happyDeps(),
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.status).toBe(400)
  })

  it('returns 400 when sourceId is the empty string', async () => {
    const result = await handlePreflight(
      { sourceId: '', target_system: { repo_path: '/foo' }, runId: 'r' },
      [NOUS_SOURCE],
      happyDeps(),
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.status).toBe(400)
  })

  it('returns 400 when target_system is missing', async () => {
    const result = await handlePreflight(
      { sourceId: 'nous-test', runId: 'r' },
      [NOUS_SOURCE],
      happyDeps(),
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.status).toBe(400)
  })

  it('accepts an empty repo_path (preflight surfaces it as a fail check)', async () => {
    const result = await handlePreflight(
      {
        sourceId: 'nous-test',
        target_system: { repo_path: '' },
        runId: '',
      },
      [NOUS_SOURCE],
      happyDeps(),
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      const repoCheck = result.checks.find((c) => c.name === 'repo-path-exists')
      expect(repoCheck?.status).toBe('fail')
    }
  })

  it('accepts a missing repo_path (treats as undefined → fail check)', async () => {
    const result = await handlePreflight(
      {
        sourceId: 'nous-test',
        target_system: {},
      },
      [NOUS_SOURCE],
      happyDeps(),
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      const repoCheck = result.checks.find((c) => c.name === 'repo-path-exists')
      expect(repoCheck?.status).toBe('fail')
    }
  })

  it('accepts a missing runId (treats as empty → warn)', async () => {
    const result = await handlePreflight(
      {
        sourceId: 'nous-test',
        target_system: { repo_path: '/x' },
      },
      [NOUS_SOURCE],
      happyDeps(),
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      const runIdCheck = result.checks.find((c) => c.name === 'run-id-not-in-use')
      expect(runIdCheck?.status).toBe('warn')
    }
  })
})

describe('handlePreflight — source resolution', () => {
  it('returns 404 when sourceId is unknown', async () => {
    const result = await handlePreflight(
      {
        sourceId: 'does-not-exist',
        target_system: { repo_path: '/x' },
        runId: 'r',
      },
      [NOUS_SOURCE],
      happyDeps(),
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.status).toBe(404)
  })

  it('returns 400 when source is not nous-kind, with v0.3+ deferral message', async () => {
    const result = await handlePreflight(
      {
        sourceId: 'coral-test',
        target_system: { repo_path: '/x' },
        runId: 'r',
      },
      [CORAL_SOURCE],
      happyDeps(),
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.status).toBe(400)
      expect(result.error).toMatch(/nous/)
      // The error message must reference the v0.3+ deferral, not the
      // stale "v0.2 with the orchestrator" string.
      expect(result.error).toMatch(/v0\.3\+/)
    }
  })
})

describe('handlePreflight — happy path', () => {
  it('returns the four canonical checks on a healthy nous source', async () => {
    const result = await handlePreflight(
      {
        sourceId: 'nous-test',
        target_system: { repo_path: '/repo/exists' },
        runId: 'fresh',
      },
      [NOUS_SOURCE],
      happyDeps(),
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.checks).toHaveLength(4)
      const names = result.checks.map((c) => c.name).sort()
      expect(names).toEqual([
        'nous-cli-available',
        'repo-path-exists',
        'run-id-not-in-use',
        'writeback-target-writable',
      ])
      expect(result.checks.every((c) => c.status === 'ok')).toBe(true)
    }
  })

  it('uses the resolved source.path for the writebackPath', async () => {
    const isWritable = vi.fn(async () => true)
    await handlePreflight(
      {
        sourceId: 'nous-test',
        target_system: { repo_path: '/repo' },
        runId: 'r',
      },
      [NOUS_SOURCE],
      { ...happyDeps(), isWritable },
    )
    expect(isWritable).toHaveBeenCalledWith('/path/to/nous/source')
  })

  it('passes target_system.repo_path through to the deps', async () => {
    const pathExists = vi.fn(async () => true)
    await handlePreflight(
      {
        sourceId: 'nous-test',
        target_system: { repo_path: '/some/repo' },
        runId: 'r',
      },
      [NOUS_SOURCE],
      { ...happyDeps(), pathExists },
    )
    expect(pathExists).toHaveBeenCalledWith('/some/repo')
  })
})

describe('handlePreflight — `~` expansion at the I/O boundary', () => {
  it('expands a leading ~/ in target_system.repo_path before probing', async () => {
    const pathExists = vi.fn(async () => true)
    await handlePreflight(
      {
        sourceId: 'nous-test',
        target_system: { repo_path: '~/Documents/Projects/inference-sim' },
        runId: 'r',
      },
      [NOUS_SOURCE],
      { ...happyDeps(), pathExists },
    )
    // `fs.stat` doesn't expand `~`, so the handler must do it
    // before calling the dep. The expanded path must NOT contain `~`.
    expect(pathExists).toHaveBeenCalledTimes(1)
    const probedPath = (pathExists as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string
    expect(probedPath).not.toMatch(/^~/)
    expect(probedPath).toContain('Documents/Projects/inference-sim')
  })

  it('passes absolute paths through unchanged', async () => {
    const pathExists = vi.fn(async () => true)
    await handlePreflight(
      {
        sourceId: 'nous-test',
        target_system: { repo_path: '/tmp/abs' },
        runId: 'r',
      },
      [NOUS_SOURCE],
      { ...happyDeps(), pathExists },
    )
    expect(pathExists).toHaveBeenCalledWith('/tmp/abs')
  })
})

describe('expandHome', () => {
  it('returns input unchanged for absolute paths', () => {
    expect(expandHome('/abs/path')).toBe('/abs/path')
  })

  it('returns input unchanged for relative paths without ~', () => {
    expect(expandHome('relative/path')).toBe('relative/path')
  })

  it('returns input unchanged for empty string', () => {
    expect(expandHome('')).toBe('')
  })

  it('returns input unchanged for undefined', () => {
    expect(expandHome(undefined)).toBeUndefined()
  })

  it('expands a leading ~/', () => {
    const result = expandHome('~/foo/bar')
    expect(result).not.toMatch(/^~/)
    expect(result).toMatch(/foo\/bar$/)
  })

  it('expands a bare ~ to the home directory', () => {
    const result = expandHome('~')
    expect(result).not.toMatch(/^~/)
    expect(typeof result).toBe('string')
    expect((result as string).length).toBeGreaterThan(0)
  })

  it('does NOT expand a ~ in the middle of a path', () => {
    expect(expandHome('/foo/~bar')).toBe('/foo/~bar')
  })
})

describe('handlePreflight — falsification (the v0.1.5 stop condition)', () => {
  it('reports repo-path-exists fail when the repo path does not exist', async () => {
    const deps: PreflightHandlerDeps = {
      ...happyDeps(),
      pathExists: vi.fn(async (p: string) => p !== '/nonexistent'),
    }
    const result = await handlePreflight(
      {
        sourceId: 'nous-test',
        target_system: { repo_path: '/nonexistent' },
        runId: 'r',
      },
      [NOUS_SOURCE],
      deps,
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      const repoCheck = result.checks.find((c) => c.name === 'repo-path-exists')
      expect(repoCheck?.status).toBe('fail')
      if (repoCheck && repoCheck.status !== 'ok') {
        expect(repoCheck.message).toMatch(/nonexistent/)
      }
    }
  })
})

// ─── defaultDeps real-I/O probes ─────────────────────────────────────────
//
// These tests exercise the Node fs+execFile dispatch directly against
// real temp paths. They verify the error-handling discipline that the
// PR review identified: pathExists must be directory-only (a file at
// the path is NOT a valid `nous run` target), and the various
// exception paths must distinguish "expected absence" (ENOENT → false)
// from "unexpected" (EACCES etc → throw).

describe('defaultDeps — real filesystem probes', () => {
  let tmpRoot: string

  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'integral-preflight-'))
  })

  afterEach(async () => {
    await fs.rm(tmpRoot, { recursive: true, force: true })
  })

  describe('pathExists', () => {
    it('returns true for a real directory', async () => {
      const deps = defaultDeps()
      expect(await deps.pathExists(tmpRoot)).toBe(true)
    })

    it('returns false for a non-existent path', async () => {
      const deps = defaultDeps()
      expect(await deps.pathExists(path.join(tmpRoot, 'nope'))).toBe(false)
    })

    it('returns false for a regular file (directory-only contract)', async () => {
      const filePath = path.join(tmpRoot, 'a-file.txt')
      await fs.writeFile(filePath, 'hello', 'utf-8')
      const deps = defaultDeps()
      // /etc/passwd-style "file at the path" must not pass pre-flight
      // — `nous run` requires a directory. Code review CRITICAL #2.
      expect(await deps.pathExists(filePath)).toBe(false)
    })
  })

  describe('isWritable', () => {
    it('returns true for a writable directory', async () => {
      const deps = defaultDeps()
      expect(await deps.isWritable(tmpRoot)).toBe(true)
    })

    it('returns false for a non-existent path (ENOENT)', async () => {
      const deps = defaultDeps()
      expect(await deps.isWritable(path.join(tmpRoot, 'nope'))).toBe(false)
    })
  })

  describe('campaignFileExists', () => {
    it('returns false when no campaign-<runId>.yaml is present', async () => {
      const deps = defaultDeps()
      expect(await deps.campaignFileExists(tmpRoot, 'fresh-id')).toBe(false)
    })

    it('returns true when the campaign file already exists', async () => {
      const filePath = path.join(tmpRoot, 'campaign-collision.yaml')
      await fs.writeFile(filePath, 'fixture', 'utf-8')
      const deps = defaultDeps()
      expect(await deps.campaignFileExists(tmpRoot, 'collision')).toBe(true)
    })

    it('handles trailing slash on the writeback path', async () => {
      const filePath = path.join(tmpRoot, 'campaign-trail.yaml')
      await fs.writeFile(filePath, 'fixture', 'utf-8')
      const deps = defaultDeps()
      expect(await deps.campaignFileExists(`${tmpRoot}/`, 'trail')).toBe(true)
    })
  })

  describe('hasNousCli', () => {
    // We can't reliably assert the presence/absence of `nous` on the
    // test box, but we CAN assert that the dep doesn't throw and
    // returns a boolean — i.e., the catch-block discipline works.
    it('returns a boolean without throwing', async () => {
      const deps = defaultDeps()
      const result = await deps.hasNousCli()
      expect(typeof result).toBe('boolean')
    })
  })
})
