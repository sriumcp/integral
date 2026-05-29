import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchMe, FALLBACK_ME, meAsParty } from '@/lib/me'

describe('meAsParty', () => {
  it('lifts a narrow MeIdentity to a full human Party', () => {
    expect(meAsParty({ id: 'alice', display_name: 'Alice' })).toEqual({
      id: 'alice',
      kind: 'human',
      display_name: 'Alice',
    })
  })

  it('fallback identity round-trips to a Party with kind=human', () => {
    expect(meAsParty(FALLBACK_ME)).toEqual({
      id: 'user',
      kind: 'human',
      display_name: 'user',
    })
  })
})

describe('fetchMe', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns the parsed identity on a 200 with valid body', async () => {
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 'alice', display_name: 'Alice Liddell' }),
    })
    const me = await fetchMe()
    expect(me).toEqual({ id: 'alice', display_name: 'Alice Liddell' })
  })

  it('falls back when /api/me returns non-OK', async () => {
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
    })
    const me = await fetchMe()
    expect(me).toEqual(FALLBACK_ME)
  })

  it('falls back when body is missing id', async () => {
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ display_name: 'Alice' }),
    })
    const me = await fetchMe()
    expect(me).toEqual(FALLBACK_ME)
  })

  it('falls back when fields are empty strings', async () => {
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: '', display_name: 'Alice' }),
    })
    const me = await fetchMe()
    expect(me).toEqual(FALLBACK_ME)
  })

  it('falls back when fetch throws (network error)', async () => {
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('network down')
    )
    const me = await fetchMe()
    expect(me).toEqual(FALLBACK_ME)
  })
})
