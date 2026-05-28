/**
 * nous-preflight — pure unit tests for the pre-flight check engine.
 *
 * Tests inject a fake `PreflightDeps` so no real filesystem or
 * subprocess is touched. Per `## Test discipline` in CLAUDE.md, this
 * mirrors the LLMClient injection pattern — pure logic + injected I/O.
 *
 * Coverage targets the literal v0.1.5 Nous falsification stop condition
 * from `roadmap.md § Falsification per adapter`:
 *  - repo-path-exists fails when the path is missing
 *  - run-id-not-in-use fails when campaign-<runId>.yaml already exists
 *  - nous-cli-available warns (not fails) when the CLI is missing
 *  - writeback-target-writable fails when the source dir isn't writable
 */

import { describe, expect, it, vi } from 'vitest'
import {
  runPreflight,
  type PreflightCheck,
  type PreflightDeps,
  type PreflightInput,
} from './nous-preflight'

function happyDeps(): PreflightDeps {
  return {
    pathExists: vi.fn(async () => true),
    isWritable: vi.fn(async () => true),
    hasNousCli: vi.fn(async () => true),
    campaignFileExists: vi.fn(async () => false),
  }
}

function happyInput(): PreflightInput {
  return {
    targetRepoPath: '/repo/exists',
    writebackPath: '/source/dir',
    runId: 'fresh-run-id',
  }
}

function findCheck(
  results: ReadonlyArray<PreflightCheck>,
  name: string,
): PreflightCheck {
  const found = results.find((c) => c.name === name)
  if (!found) {
    throw new Error(
      `expected check "${name}" in results; got: ${results.map((c) => c.name).join(', ')}`,
    )
  }
  return found
}

describe('runPreflight — happy path', () => {
  it('returns ok for every check when env is healthy', async () => {
    const deps = happyDeps()
    const results = await runPreflight(happyInput(), deps)

    expect(findCheck(results, 'repo-path-exists').status).toBe('ok')
    expect(findCheck(results, 'nous-cli-available').status).toBe('ok')
    expect(findCheck(results, 'writeback-target-writable').status).toBe('ok')
    expect(findCheck(results, 'run-id-not-in-use').status).toBe('ok')
  })

  it('emits exactly the four canonical checks', async () => {
    const results = await runPreflight(happyInput(), happyDeps())
    const names = results.map((c) => c.name).sort()
    expect(names).toEqual([
      'nous-cli-available',
      'repo-path-exists',
      'run-id-not-in-use',
      'writeback-target-writable',
    ])
  })
})

describe('runPreflight — repo-path-exists', () => {
  it('fails when the target repo path does not exist', async () => {
    const deps: PreflightDeps = {
      ...happyDeps(),
      pathExists: vi.fn(async () => false),
    }
    const results = await runPreflight(happyInput(), deps)
    const check = findCheck(results, 'repo-path-exists')
    expect(check.status).toBe('fail')
    expect(check.message).toMatch(/exist/i)
  })

  it('fails when targetRepoPath is empty string', async () => {
    const results = await runPreflight(
      { ...happyInput(), targetRepoPath: '' },
      happyDeps(),
    )
    expect(findCheck(results, 'repo-path-exists').status).toBe('fail')
  })

  it('fails when targetRepoPath is undefined', async () => {
    const results = await runPreflight(
      { ...happyInput(), targetRepoPath: undefined },
      happyDeps(),
    )
    const check = findCheck(results, 'repo-path-exists')
    expect(check.status).toBe('fail')
    expect(check.message).toBeDefined()
  })

  it('does not call pathExists when targetRepoPath is empty', async () => {
    const pathExists = vi.fn(async () => true)
    await runPreflight(
      { ...happyInput(), targetRepoPath: '' },
      { ...happyDeps(), pathExists },
    )
    expect(pathExists).not.toHaveBeenCalled()
  })
})

describe('runPreflight — nous-cli-available', () => {
  it('warns (not fails) when the CLI is missing — user can install it', async () => {
    const deps: PreflightDeps = {
      ...happyDeps(),
      hasNousCli: vi.fn(async () => false),
    }
    const results = await runPreflight(happyInput(), deps)
    const check = findCheck(results, 'nous-cli-available')
    expect(check.status).toBe('warn')
    expect(check.message).toMatch(/nous/i)
  })
})

describe('runPreflight — writeback-target-writable', () => {
  it('fails when the writeback path is not writable', async () => {
    const deps: PreflightDeps = {
      ...happyDeps(),
      isWritable: vi.fn(async () => false),
    }
    const results = await runPreflight(happyInput(), deps)
    const check = findCheck(results, 'writeback-target-writable')
    expect(check.status).toBe('fail')
    expect(check.message).toMatch(/writ/i)
  })
})

describe('runPreflight — run-id-not-in-use', () => {
  it('fails when campaign-<runId>.yaml already exists', async () => {
    const deps: PreflightDeps = {
      ...happyDeps(),
      campaignFileExists: vi.fn(async () => true),
    }
    const results = await runPreflight(happyInput(), deps)
    const check = findCheck(results, 'run-id-not-in-use')
    expect(check.status).toBe('fail')
    expect(check.message).toMatch(/already/i)
  })

  it('passes runId + writebackPath through to the dep', async () => {
    const campaignFileExists = vi.fn(async () => false)
    await runPreflight(
      { ...happyInput(), runId: 'pi-mc', writebackPath: '/abc' },
      { ...happyDeps(), campaignFileExists },
    )
    expect(campaignFileExists).toHaveBeenCalledWith('/abc', 'pi-mc')
  })

  it('skips run-id check when runId is empty (no derivation possible)', async () => {
    const campaignFileExists = vi.fn(async () => true)
    const results = await runPreflight(
      { ...happyInput(), runId: '' },
      { ...happyDeps(), campaignFileExists },
    )
    const check = findCheck(results, 'run-id-not-in-use')
    // Empty runId means we can't actually check; surface as warn so the
    // commit-button gate stays unblocked (the writeback handler derives
    // a runId from the title at commit time).
    expect(check.status).toBe('warn')
    expect(campaignFileExists).not.toHaveBeenCalled()
  })
})

describe('runPreflight — multiple failures compose', () => {
  it('reports all failures independently — they don\'t short-circuit', async () => {
    const deps: PreflightDeps = {
      pathExists: vi.fn(async () => false),
      isWritable: vi.fn(async () => false),
      hasNousCli: vi.fn(async () => false),
      campaignFileExists: vi.fn(async () => true),
    }
    const results = await runPreflight(happyInput(), deps)
    expect(findCheck(results, 'repo-path-exists').status).toBe('fail')
    expect(findCheck(results, 'writeback-target-writable').status).toBe('fail')
    expect(findCheck(results, 'nous-cli-available').status).toBe('warn')
    expect(findCheck(results, 'run-id-not-in-use').status).toBe('fail')
  })
})

describe('runPreflight — dep error containment', () => {
  it('surfaces a dep throw as a check fail rather than rejecting', async () => {
    const deps: PreflightDeps = {
      ...happyDeps(),
      pathExists: vi.fn(async () => {
        throw new Error('EACCES')
      }),
    }
    const results = await runPreflight(happyInput(), deps)
    const check = findCheck(results, 'repo-path-exists')
    expect(check.status).toBe('fail')
    expect(check.message).toMatch(/EACCES/)
  })
})
