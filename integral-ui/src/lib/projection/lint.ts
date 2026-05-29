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
  /** Verbatim digit substrings that don't match any quoted_numeric or
   *  any digit inside an excerpt that was substituted into the prose. */
  offenders: string[]
}
export type LintResult = LintOk | LintFail

const DIGIT_RE = /\b\d+(?:\.\d+)?\b/g

export interface LintOptions {
  /** Texts of excerpts that were substituted into the prose. Every digit
   *  that appears in any of these texts is allowed in the rendered prose,
   *  because the excerpt was quoted verbatim from a source with a
   *  recorded `source_ref` — the digits have provenance.
   *
   *  Without this, ANY research-thread or markdown-derived projection
   *  that quotes a paragraph containing numbers would fall back, because
   *  the LLM would faithfully include "the 6,400 result JSONs" in its
   *  prose template via `{excerpt:foo}` and the substituted text would
   *  contain unsourced-from-the-lint's-perspective digits. */
  substitutedExcerpts?: string[]
}

export function lintProse(
  prose: string,
  scalars: QuotedNumerics,
  options: LintOptions = {}
): LintResult {
  const allowed = new Set<string>()
  for (const v of Object.values(scalars)) {
    const formatted = formatScalar(v)
    for (const m of formatted.matchAll(DIGIT_RE)) {
      allowed.add(m[0])
    }
    if (typeof v === 'number' && Number.isFinite(v)) {
      allowed.add(String(v))
      if (Number.isInteger(v)) allowed.add(String(Math.trunc(v)))
    }
  }
  // Register every digit token that appears in any substituted excerpt.
  // The excerpt was quoted verbatim from disk with a recorded source_ref,
  // so digits inside its text have provenance.
  for (const text of options.substitutedExcerpts ?? []) {
    for (const m of text.matchAll(DIGIT_RE)) {
      allowed.add(m[0])
    }
  }

  const offenders: string[] = []
  for (const m of prose.matchAll(DIGIT_RE)) {
    if (!allowed.has(m[0])) offenders.push(m[0])
  }
  if (offenders.length === 0) return { ok: true }
  const seen = new Set<string>()
  const dedup = offenders.filter((o) => (seen.has(o) ? false : (seen.add(o), true)))
  return { ok: false, offenders: dedup }
}
