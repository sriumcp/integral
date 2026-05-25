/**
 * Pure tree reconstruction from issue numbers + parent → children edges.
 *
 * The interpreter calls this after fetching all issues + sub-issue refs
 * (and after filtering cross-repo links). This module's job is purely
 * structural: invert the children map to a parent map, identify roots
 * (issues with no parent in the data), and surface both as plain JS
 * collections the interpreter can iterate cheaply.
 *
 * No IO. No knowledge of GitHub specifics. Testable in isolation.
 */

export interface ReconstructTreeArgs {
  /** All issue numbers in the source's repo. */
  readonly issueNumbers: ReadonlyArray<number>
  /** Map: parent issue number → list of child issue numbers. The
   *  interpreter populates this only for tracking issues
   *  (`subIssuesSummary.total > 0`); leaves don't appear as keys. The
   *  interpreter is also responsible for cross-repo filtering before
   *  passing in. */
  readonly childrenByParent: ReadonlyMap<number, ReadonlyArray<number>>
}

export interface ReconstructTreeResult {
  /** Inverted view of the input map: child issue number → parent issue
   *  number. An issue not present in this map has no parent in the data
   *  (i.e., it's a root). */
  readonly parentOf: ReadonlyMap<number, number>
  /** Pass-through of the input, normalized to a regular Map (so callers
   *  don't worry about ReadonlyMap vs Map vs object). Only same-repo
   *  edges; cross-repo were filtered upstream. */
  readonly childrenByParent: ReadonlyMap<number, ReadonlyArray<number>>
  /** Issue numbers that don't appear in any parent's children list.
   *  These are the Map's top-level cards. */
  readonly rootIssueNumbers: ReadonlyArray<number>
}

export function reconstructTree(
  args: ReconstructTreeArgs
): ReconstructTreeResult {
  // Build child → parent map by inverting the input. If a child appears
  // in multiple parents' children lists (shouldn't happen in well-formed
  // GitHub data, but defensive), the *first* parent wins — deterministic
  // by insertion order of childrenByParent.
  const parentOf = new Map<number, number>()
  const knownIssues = new Set(args.issueNumbers)

  for (const [parent, children] of args.childrenByParent) {
    // If the parent itself isn't in the issue list, its children are
    // orphans — treat them as roots (don't record a parent). G-F-N
    // covers this case.
    if (!knownIssues.has(parent)) continue
    for (const child of children) {
      if (!parentOf.has(child)) {
        parentOf.set(child, parent)
      }
    }
  }

  // Roots = issues whose number doesn't appear as a child anywhere.
  const rootIssueNumbers: number[] = []
  for (const n of args.issueNumbers) {
    if (!parentOf.has(n)) rootIssueNumbers.push(n)
  }
  rootIssueNumbers.sort((a, b) => a - b)

  return {
    parentOf,
    childrenByParent: args.childrenByParent,
    rootIssueNumbers,
  }
}
