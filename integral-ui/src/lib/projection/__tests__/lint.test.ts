import { describe, expect, it } from 'vitest'
import { lintProse } from '../lint'

describe('lintProse', () => {
  it('accepts prose with no digits', () => {
    expect(lintProse('All words, no numbers here.', {}).ok).toBe(true)
  })

  it('accepts integer digits that match a quoted_numeric', () => {
    expect(lintProse('We ran 5 attempts.', { n: 5 }).ok).toBe(true)
  })

  it('accepts decimal digits that match the formatted form', () => {
    expect(lintProse('Score 0.55 was best.', { best: 0.55 }).ok).toBe(true)
  })

  it('rejects digits not present in any quoted_numeric', () => {
    const r = lintProse('We ran 99 attempts.', { n: 5 })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.offenders).toContain('99')
  })

  it('rejects year-like digits unless requested as a const_string scalar', () => {
    expect(lintProse('Generated 2026.', {}).ok).toBe(false)
    expect(lintProse('Generated 2026.', { y: 2026 }).ok).toBe(true)
  })

  it('dedupes offenders', () => {
    const r = lintProse('99 attempts and 99 errors.', {})
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.offenders).toEqual(['99'])
  })

  it('treats "—" / null-substitutions as digit-free', () => {
    expect(lintProse('Best score: —.', { best: null }).ok).toBe(true)
  })

  it('accepts string scalars without contributing digits', () => {
    expect(lintProse('Status: active.', { st: 'active' }).ok).toBe(true)
  })

  it('rejects digits inside string scalars that arent in the prose itself only when present', () => {
    // A string scalar containing digits *does* register them as allowed.
    expect(lintProse('Started at 2026-05-29.', { d: '2026-05-29' }).ok).toBe(true)
  })

  it('integer literal accepted in either bare or zero-stripped form', () => {
    expect(lintProse('Iteration 3 completed.', { i: 3 }).ok).toBe(true)
  })
})

describe('lintProse — substituted excerpt allow-list', () => {
  it('accepts digits inside a substituted excerpt verbatim', () => {
    const r = lintProse(
      'The repo "does not contain the ~6,400 raw simulator result JSONs (4.7 GB)".',
      {},
      { substitutedExcerpts: ['does not contain the ~6,400 raw simulator result JSONs (4.7 GB)'] }
    )
    expect(r.ok).toBe(true)
  })

  it('still rejects digits NOT in any substituted excerpt', () => {
    const r = lintProse(
      'About 6,400 results — and a 99 hidden in the prose.',
      {},
      { substitutedExcerpts: ['About 6,400 results'] }
    )
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.offenders).toContain('99')
    expect(r.offenders).not.toContain('400')
    expect(r.offenders).not.toContain('6')
  })

  it('union of scalar digits + excerpt digits is allowed', () => {
    const r = lintProse(
      'We ran 5 attempts; the README mentioned 12 prior runs.',
      { n_attempts: 5 },
      { substitutedExcerpts: ['mentioned 12 prior runs in the legacy report'] }
    )
    expect(r.ok).toBe(true)
  })

  it('empty substitutedExcerpts list behaves identically to no list', () => {
    const a = lintProse('5 wins', { n: 5 })
    const b = lintProse('5 wins', { n: 5 }, { substitutedExcerpts: [] })
    expect(a.ok).toBe(true)
    expect(b.ok).toBe(true)
  })
})
