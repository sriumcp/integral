/**
 * nous-preflight — pure unit tests for the pre-flight check engine.
 *
 * Tests inject a fake `PreflightDeps` so no real filesystem or
 * subprocess is touched. Per `## Test discipline` in CLAUDE.md, this
 * mirrors the LLMClient injection pattern — pure logic + injected I/O.
 *
 * Coverage targets the literal v0.1.5 Nous falsification stop condition
 * from `roadmap.md § Falsification per adapter`:
 *  - repo-path-exists fails when the path is missing OR is a file
 *  - run-id-not-in-use fails when campaign-<runId>.yaml already exists
 *  - nous-cli-available warns (not fails) when the CLI is missing
 *  - writeback-target-writable fails when the source dir isn't writable
 *  - dep throws surface as a typed `fail`/`warn` with the original message
 */

import { describe, expect, it, vi } from 'vitest'
import {
  hasFailingCheck,
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

/** Helper that narrows to the warn|fail branch of the discriminated
 *  union. Throws if the check is `ok` (which has no `message` field
 *  by construction), so tests that assert on messages can't silently
 *  drift to the `ok` branch. */
function assertHasMessage(
  check: PreflightCheck,
): asserts check is { name: PreflightCheck['name']; status: 'warn' | 'fail'; message: string } {
  if (check.status === 'ok') {
    throw new Error(`expected warn|fail, got ok for ${check.name}`)
  }
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
    assertHasMessage(check)
    expect(check.message).toMatch(/directory/i)
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
    assertHasMessage(check)
    expect(check.message.length).toBeGreaterThan(0)
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
    assertHasMessage(check)
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
    assertHasMessage(check)
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
    assertHasMessage(check)
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
  it("reports all failures independently — they don't short-circuit", async () => {
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
  it('surfaces a pathExists throw as a check fail with the original message', async () => {
    const deps: PreflightDeps = {
      ...happyDeps(),
      pathExists: vi.fn(async () => {
        throw new Error('EACCES')
      }),
    }
    const results = await runPreflight(happyInput(), deps)
    const check = findCheck(results, 'repo-path-exists')
    expect(check.status).toBe('fail')
    assertHasMessage(check)
    expect(check.message).toMatch(/EACCES/)
  })

  it('surfaces an isWritable throw as a writeback-target fail with the original message', async () => {
    const deps: PreflightDeps = {
      ...happyDeps(),
      isWritable: vi.fn(async () => {
        throw new Error('EROFS read-only filesystem')
      }),
    }
    const results = await runPreflight(happyInput(), deps)
    const check = findCheck(results, 'writeback-target-writable')
    expect(check.status).toBe('fail')
    assertHasMessage(check)
    expect(check.message).toMatch(/EROFS/)
  })

  it('surfaces a hasNousCli throw as a warn with the original message (not a generic "not on PATH")', async () => {
    const deps: PreflightDeps = {
      ...happyDeps(),
      hasNousCli: vi.fn(async () => {
        throw new Error('subprocess timeout after 3000ms')
      }),
    }
    const results = await runPreflight(happyInput(), deps)
    const check = findCheck(results, 'nous-cli-available')
    expect(check.status).toBe('warn')
    assertHasMessage(check)
    // Critical: the original error message survives — the user can
    // distinguish "timeout" from "not installed."
    expect(check.message).toMatch(/timeout/)
  })

  it('surfaces a campaignFileExists throw as a run-id fail with the original message', async () => {
    const deps: PreflightDeps = {
      ...happyDeps(),
      campaignFileExists: vi.fn(async () => {
        throw new Error('ELOOP too many symbolic links')
      }),
    }
    const results = await runPreflight(happyInput(), deps)
    const check = findCheck(results, 'run-id-not-in-use')
    expect(check.status).toBe('fail')
    assertHasMessage(check)
    expect(check.message).toMatch(/ELOOP/)
  })
})

describe('hasFailingCheck', () => {
  it('returns true when any check is fail', () => {
    expect(
      hasFailingCheck([
        { name: 'repo-path-exists', status: 'ok' },
        {
          name: 'nous-cli-available',
          status: 'fail',
          message: 'broken',
        },
      ]),
    ).toBe(true)
  })

  it('returns false when only warns are present', () => {
    expect(
      hasFailingCheck([
        { name: 'repo-path-exists', status: 'ok' },
        {
          name: 'nous-cli-available',
          status: 'warn',
          message: 'maybe',
        },
      ]),
    ).toBe(false)
  })

  it('returns false on empty', () => {
    expect(hasFailingCheck([])).toBe(false)
  })
})
