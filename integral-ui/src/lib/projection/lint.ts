/**
 * Prose lint — enforces zero-hallucination on rendered prose.
 *
 * After the executor substitutes `{scalar:id}` placeholders, the prose
 * may contain digits ONLY if those digits match the formatted form of
 * some quoted_numeric. Anything else → the LLM hallucinated a number,
 * the lint rejects it, the API handler returns a fallback projection.
 *
 * The regex matches integers and decimals (no scientific notation, no
 * thousand separators). Year-like digits (1900-2099) are NOT special-cased
 * — a date that needs to appear in prose must be requested as a
 * `const_string` scalar so its provenance is recorded. This keeps the
 * invariant strict: every digit in prose has a registered source.
 */

import type { QuotedNumerics } from './spec'
import { formatScalar } from './template'

export interface LintOk { ok: true }
export interface LintFail {
  ok: false
  /** Verbatim digit substrings that don't match any quoted_numeric. */
  offenders: string[]
}
export type LintResult = LintOk | LintFail

const DIGIT_RE = /\b\d+(?:\.\d+)?\b/g

export function lintProse(prose: string, scalars: QuotedNumerics): LintResult {
  const allowed = new Set<string>()
  for (const v of Object.values(scalars)) {
    const formatted = formatScalar(v)
    // Register every digit token from the formatted scalar, in case the
    // formatter produces strings like "1.234" — the lint should accept
    // both that whole string and any zero-padded variant.
    for (const m of formatted.matchAll(DIGIT_RE)) {
      allowed.add(m[0])
    }
    // Also allow the raw numeric string (e.g. integer literals).
    if (typeof v === 'number' && Number.isFinite(v)) {
      allowed.add(String(v))
      if (Number.isInteger(v)) allowed.add(String(Math.trunc(v)))
    }
  }

  const offenders: string[] = []
  for (const m of prose.matchAll(DIGIT_RE)) {
    if (!allowed.has(m[0])) offenders.push(m[0])
  }
  if (offenders.length === 0) return { ok: true }
  // Dedup while preserving order.
  const seen = new Set<string>()
  const dedup = offenders.filter((o) => (seen.has(o) ? false : (seen.add(o), true)))
  return { ok: false, offenders: dedup }
}
