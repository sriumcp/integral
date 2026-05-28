/**
 * preflight-handler — integration tests for /api/nous/preflight.
 *
 * Tests the handler's wiring: input validation, source resolution,
 * kind enforcement, and the runPreflight call. The actual filesystem
 * + subprocess deps are mocked via the `depsFactory` injection seam,
 * so this test never touches the real disk or PATH.
 *
 * Per `## Test discipline` in CLAUDE.md, this mirrors the pure-tests
 * + injection pattern used everywhere else (LLMClient, NousSource).
 */

import { describe, expect, it, vi } from 'vitest'
import {
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

describe('handlePreflight — input validation', () => {
  it('returns 400 when body is null', async () => {
    const result = await handlePreflight(null as unknown as object, [NOUS_SOURCE], happyDeps())
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.status).toBe(400)
  })

  it('returns 400 when sourceId is missing', async () => {
    const result = await handlePreflight(
      { target_system: { repo_path: '/foo' }, runId: 'r' } as object,
      [NOUS_SOURCE],
      happyDeps(),
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.status).toBe(400)
  })

  it('returns 400 when target_system is missing', async () => {
    const result = await handlePreflight(
      { sourceId: 'nous-test', runId: 'r' } as object,
      [NOUS_SOURCE],
      happyDeps(),
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.status).toBe(400)
  })

  it('accepts an empty repo_path (preflight surfaces the empty as a fail check)', async () => {
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

  it('accepts a missing runId (treats as empty)', async () => {
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
      // Empty runId surfaces as warn, not fail
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

  it('returns 400 when source is not nous-kind', async () => {
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
      expect(repoCheck?.message).toMatch(/nonexistent/)
    }
  })
})
