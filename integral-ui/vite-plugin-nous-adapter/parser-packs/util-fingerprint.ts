/**
 * Fingerprint helper — derives a deterministic sha256 over a set of
 * input files' (relative path + mtime in ns + size in bytes) tuples.
 *
 * Used as a diagnostic-only signal that travels into ExecutedProjection
 * so a researcher can confirm "this projection was generated against
 * these inputs at these mtimes." Cache invalidation itself uses
 * `state.last_advanced_at`; the fingerprint is a sanity check.
 *
 * Stat failures (ENOENT) are tolerated — the file simply contributes
 * `(path|missing|0)` to the hash. Anything else throws (EACCES /
 * permission errors).
 */

import * as crypto from 'node:crypto'
import { promises as fs } from 'node:fs'
import { isMissing } from './util-errno'

export interface FingerprintInput {
  /** A label to include in the hash. Use the path relative to the
   *  source root so renames are detected. */
  rel: string
  /** Absolute path to stat. */
  abs: string
}

export async function computeFingerprint(
  inputs: FingerprintInput[]
): Promise<string> {
  const sorted = [...inputs].sort((a, b) => a.rel.localeCompare(b.rel))
  const hasher = crypto.createHash('sha256')
  for (const { rel, abs } of sorted) {
    let mtimeNs: string = 'missing'
    let size: string = '0'
    try {
      const st = await fs.stat(abs)
      mtimeNs = String(st.mtimeMs * 1_000_000)
      size = String(st.size)
    } catch (err) {
      if (!isMissing(err)) throw err
    }
    hasher.update(`${rel}|${mtimeNs}|${size}\n`)
  }
  return hasher.digest('hex')
}
