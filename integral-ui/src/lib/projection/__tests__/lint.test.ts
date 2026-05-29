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
