/**
 * Shared errno helpers for parser packs.
 *
 * The discipline (per CLAUDE.md § "Real-I/O deps in server handlers"):
 *  - Expected absence (ENOENT) → return null/empty/false
 *  - Unexpected failure (EACCES, EROFS, ELOOP, EISDIR) → throw
 *
 * Parser packs use these helpers so a missing file degrades gracefully
 * (the parser returns an empty TypedDataset / Excerpt list) but a
 * permission error or ROFS surfaces as a typed error.
 */

export function isErrnoCode(err: unknown, ...codes: string[]): boolean {
  if (typeof err !== 'object' || err === null) return false
  const code = (err as { code?: unknown }).code
  return typeof code === 'string' && codes.includes(code)
}

export function isMissing(err: unknown): boolean {
  return isErrnoCode(err, 'ENOENT')
}
