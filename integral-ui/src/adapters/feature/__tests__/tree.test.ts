import { describe, expect, it } from 'vitest'
import { reconstructTree } from '../tree'

describe('reconstructTree — pure tree reconstruction', () => {
  it('empty input → empty output', () => {
    const r = reconstructTree({ issueNumbers: [], childrenByParent: new Map() })
    expect(r.parentOf.size).toBe(0)
    expect(r.childrenByParent.size).toBe(0)
    expect(r.rootIssueNumbers).toEqual([])
  })

  it('one leaf issue → one root, no edges', () => {
    const r = reconstructTree({
      issueNumbers: [1],
      childrenByParent: new Map(),
    })
    expect(r.rootIssueNumbers).toEqual([1])
    expect(r.parentOf.size).toBe(0)
  })

  it('two leaf issues → two roots, no edges', () => {
    const r = reconstructTree({
      issueNumbers: [1, 2],
      childrenByParent: new Map(),
    })
    expect([...r.rootIssueNumbers].sort((a, b) => a - b)).toEqual([1, 2])
  })

  it('tracker with two children → tracker is root; children have parent', () => {
    const r = reconstructTree({
      issueNumbers: [1, 2, 3],
      childrenByParent: new Map([[1, [2, 3]]]),
    })
    expect(r.rootIssueNumbers).toEqual([1])
    expect(r.parentOf.get(2)).toBe(1)
    expect(r.parentOf.get(3)).toBe(1)
    expect(r.childrenByParent.get(1)).toEqual([2, 3])
  })

  it('three-deep nesting (A → B → C) → only A is root', () => {
    const r = reconstructTree({
      issueNumbers: [1, 2, 3],
      childrenByParent: new Map([
        [1, [2]],
        [2, [3]],
      ]),
    })
    expect(r.rootIssueNumbers).toEqual([1])
    expect(r.parentOf.get(2)).toBe(1)
    expect(r.parentOf.get(3)).toBe(2)
    expect(r.childrenByParent.get(2)).toEqual([3])
  })

  it('childrenByParent already filtered to same-repo (interpreter strips cross-repo)', () => {
    // tree.ts assumes its inputs are already filtered. The interpreter
    // does the cross-repo filter via the transport. This test confirms
    // the algorithm honors whatever it's given — extra children are not
    // synthesized from elsewhere.
    const r = reconstructTree({
      issueNumbers: [1, 2],
      childrenByParent: new Map([[1, [2]]]),
    })
    expect(r.rootIssueNumbers).toEqual([1])
    expect(r.childrenByParent.get(1)).toEqual([2])
  })

  it('child references a parent not in the issue list → child treated as root', () => {
    // E.g., parent was deleted but a sub-issue link still points at it.
    // Defensive: the algorithm treats orphaned children as roots so the
    // workspace doesn't end up with dangling ids.
    const r = reconstructTree({
      issueNumbers: [2, 3],
      childrenByParent: new Map([[999, [2, 3]]]),
    })
    expect([...r.rootIssueNumbers].sort((a, b) => a - b)).toEqual([2, 3])
    expect(r.parentOf.size).toBe(0)
  })

  it('cycle defense — A→B and B→A → algorithm terminates', () => {
    // GitHub disallows sub-issue cycles structurally, but the algorithm
    // shouldn't trust the data. A cycle should not infinite-loop. We
    // accept that cycle members may end up as non-roots (since each has
    // a parent); the only requirement is termination.
    const r = reconstructTree({
      issueNumbers: [1, 2],
      childrenByParent: new Map([
        [1, [2]],
        [2, [1]],
      ]),
    })
    // Both have a parent → no roots. Workspace is non-empty (both
    // issues exist) but they don't surface as Map top-level cards.
    // That's acceptable; v0.2 may add explicit cycle detection.
    expect(r.parentOf.size).toBe(2)
    expect(r.rootIssueNumbers).toEqual([])
  })
})
