/**
 * Prose-template substitution.
 *
 * Templates use two placeholder forms:
 *
 *   {scalar:<id>}    → quoted_numerics[id]   (number | string | null)
 *   {excerpt:<id>}   → excerpt.text          (verbatim)
 *
 * Numbers are formatted by `formatScalar` — sensible decimals only;
 * scientific-notation falls back to a fixed-precision representation so
 * the lint regex (`\b\d+(?:\.\d+)?\b`) can match it.
 *
 * Throws on unknown ids — the spec is invalid and the executor turns
 * that into a fallback projection.
 */

import type { Excerpt, QuotedNumerics } from './spec'

export class TemplateError extends Error {
  readonly scope: string
  constructor(message: string, scope: string) {
    super(`${message} (in ${scope})`)
    this.name = 'TemplateError'
    this.scope = scope
  }
}

export interface RenderTemplateOptions {
  scope: string
  /** Optional collector — if provided, every excerpt id resolved during
   *  rendering is added. Used by the executor to build the excerpt-digit
   *  allow-set the lint consults (excerpt-quoted digits have provenance
   *  via excerpt.source_ref, so they should pass lint). */
  excerptsResolved?: Set<string>
}

const PLACEHOLDER_RE = /\{(scalar|excerpt):([A-Za-z0-9_.\-:]+)\}/g

export function renderTemplate(
  template: string,
  scalars: QuotedNumerics,
  excerpts: Map<string, Excerpt>,
  opts: RenderTemplateOptions
): string {
  return template.replace(PLACEHOLDER_RE, (_match, kind: string, id: string) => {
    if (kind === 'scalar') {
      if (!(id in scalars)) {
        throw new TemplateError(`unknown scalar id '${id}'`, opts.scope)
      }
      return formatScalar(scalars[id])
    }
    if (kind === 'excerpt') {
      const e = excerpts.get(id)
      if (!e) throw new TemplateError(`unknown excerpt id '${id}'`, opts.scope)
      opts.excerptsResolved?.add(id)
      return e.text
    }
    return _match
  })
}

/**
 * Number formatting tuned for narrative prose:
 *  - integers render as integers
 *  - floats render with up to 4 significant digits
 *  - very small / very large numbers fall back to fixed-decimal notation
 *    so the lint regex can match (no scientific notation in prose)
 *  - null becomes the literal string '—' (em dash) — lint allows non-digit
 *    fallback content
 */
export function formatScalar(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'string') return value
  if (!Number.isFinite(value)) return '—'
  if (Number.isInteger(value)) return String(value)
  const abs = Math.abs(value)
  let fixed: string
  if (abs >= 100) fixed = value.toFixed(1)
  else if (abs >= 10) fixed = value.toFixed(2)
  else if (abs >= 1) fixed = value.toFixed(3)
  else if (abs >= 0.0001) fixed = value.toFixed(4)
  else fixed = value.toFixed(8)
  // Strip trailing zeros — '0.5500' → '0.55'. Never scientific notation;
  // the lint regex cannot match `1e-7`.
  return fixed.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '')
}
