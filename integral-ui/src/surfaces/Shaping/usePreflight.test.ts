/**
 * usePreflight — unit tests for the debounced /api/nous/preflight hook.
 *
 * Mocks `globalThis.fetch` per the project pattern (see
 * ProjectionSection.test.tsx). No real network calls.
 *
 * Note on timers: this hook uses setTimeout for debounce, and the tests
 * rely on `vi.useFakeTimers()` so we don't sleep for real. We advance
 * timers with `vi.advanceTimersByTimeAsync` (NOT `waitFor`), because
 * `waitFor` polls on real time and would deadlock with fake timers
 * paused.
 */

import { renderHook, act } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usePreflight, type PreflightHookInput } from './usePreflight'
import type { PreflightCheck } from '@/lib/nous-preflight'

const HEALTHY: PreflightCheck[] = [
  { name: 'repo-path-exists', status: 'ok' },
  { name: 'nous-cli-available', status: 'ok' },
  { name: 'writeback-target-writable', status: 'ok' },
  { name: 'run-id-not-in-use', status: 'ok' },
]

const FAILING: PreflightCheck[] = [
  {
    name: 'repo-path-exists',
    status: 'fail',
    message: 'path does not exist: /nonexistent',
  },
  { name: 'nous-cli-available', status: 'ok' },
  { name: 'writeback-target-writable', status: 'ok' },
  { name: 'run-id-not-in-use', status: 'warn' },
]

function mockFetchSuccess(checks: PreflightCheck[]) {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ checks }),
  } as Response)
}

const HEALTHY_INPUT: PreflightHookInput = {
  sourceId: 'nous-test',
  targetRepoPath: '/repo',
  runId: 'r',
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('usePreflight', () => {
  it('starts with null checks (no fetch fired before debounce elapses)', () => {
    mockFetchSuccess(HEALTHY)
    const { result } = renderHook(() => usePreflight(HEALTHY_INPUT))
    expect(result.current.checks).toBeNull()
    expect(result.current.loading).toBe(false)
  })

  it('fetches and exposes checks after the debounce window elapses', async () => {
    mockFetchSuccess(HEALTHY)
    const { result } = renderHook(() => usePreflight(HEALTHY_INPUT))

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500)
    })

    expect(result.current.checks).toEqual(HEALTHY)
    expect(globalThis.fetch).toHaveBeenCalledTimes(1)
  })

  it('debounces rapid input changes — only one fetch fires within the window', async () => {
    mockFetchSuccess(HEALTHY)
    const { rerender } = renderHook(
      ({ input }: { input: PreflightHookInput }) => usePreflight(input),
      { initialProps: { input: HEALTHY_INPUT } },
    )

    rerender({ input: { ...HEALTHY_INPUT, runId: 'a' } })
    rerender({ input: { ...HEALTHY_INPUT, runId: 'ab' } })
    rerender({ input: { ...HEALTHY_INPUT, runId: 'abc' } })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500)
    })

    expect(globalThis.fetch).toHaveBeenCalledTimes(1)
    const calls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls
    const body = JSON.parse(calls[0]![1].body as string)
    expect(body.runId).toBe('abc')
  })

  it('does not fetch when sourceId is empty', async () => {
    mockFetchSuccess(HEALTHY)
    renderHook(() => usePreflight({ ...HEALTHY_INPUT, sourceId: '' }))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('exposes failing checks when the server reports them', async () => {
    mockFetchSuccess(FAILING)
    const { result } = renderHook(() => usePreflight(HEALTHY_INPUT))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500)
    })
    expect(result.current.checks).toEqual(FAILING)
  })

  it('surfaces network errors via the error field', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('boom'))
    const { result } = renderHook(() => usePreflight(HEALTHY_INPUT))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500)
    })
    expect(result.current.error).toMatch(/boom/i)
  })

  it('refetches when input changes after settling', async () => {
    mockFetchSuccess(HEALTHY)
    const { rerender } = renderHook(
      ({ input }: { input: PreflightHookInput }) => usePreflight(input),
      { initialProps: { input: HEALTHY_INPUT } },
    )
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500)
    })
    rerender({ input: { ...HEALTHY_INPUT, runId: 'changed' } })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500)
    })
    expect(globalThis.fetch).toHaveBeenCalledTimes(2)
  })
})
