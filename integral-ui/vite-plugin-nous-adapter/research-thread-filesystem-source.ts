/**
 * FilesystemResearchThreadSource — discovers research-thread intents
 * by scanning a parent directory for subdirectories.
 *
 * Convention: each immediate subdirectory of the source's `path` is
 * one research-thread. The thread's name is the subdirectory name.
 * The thread's "content" — markdown briefs, run dirs, paper drafts,
 * reconciliation docs, etc. — is whatever's inside that directory;
 * the projection plugin reads selectively at each zoom level.
 *
 * Discovery is loose by design: no required brief.md, no required
 * runs/iter-N/ structure. The user moves an existing folder into the
 * source's parent dir; Integral surfaces it without restructuring. See
 * `intent-schema-v0.3.md` § research-thread.
 *
 * Server-side only — `node:fs` import. The transport/interpreter split
 * matches the other adapters: this transport returns thread descriptors;
 * the pure interpreter in `src/adapters/research-thread/` shapes them
 * into typed Intents.
 */

import { promises as fs } from 'node:fs'
import * as path from 'node:path'

export interface ResearchThreadDescriptor {
  /** Subdirectory name; becomes the thread's user-visible label. */
  name: string
  /** Absolute filesystem path to the thread's directory. */
  rootPath: string
  /** Last-modified timestamp of the directory itself, in ISO 8601.
   *  Used to populate IntentState.last_advanced_at so newly-touched
   *  threads sort to the top under the default `awaiting-recency`
   *  sort. */
  lastModified: string
}

/**
 * Abstract transport — defined as an interface so a v0.4+ S3- or HTTP-
 * shaped variant can be swapped in without touching the interpreter.
 */
export interface ResearchThreadSource {
  readonly id: string
  readonly label: string
  /** Filesystem path where threads live (the parent dir). Surfaced
   *  to the browser via `/api/sources` so chrome features like the
   *  RunCommand panel could (later) compose paths against it. */
  readonly path: string
  listThreads(): Promise<ResearchThreadDescriptor[]>
}

export class FilesystemResearchThreadSource implements ResearchThreadSource {
  readonly id: string
  readonly label: string
  readonly path: string
  private readonly root: string

  /**
   * @param root  Absolute path to the parent directory containing
   *              one subdirectory per research-thread. May not exist
   *              on disk; `listThreads()` returns [] gracefully.
   */
  constructor(root: string, opts?: { id?: string; label?: string }) {
    this.root = path.resolve(root)
    this.path = this.root
    this.id = opts?.id ?? `fs-research-thread:${this.root}`
    this.label = opts?.label ?? this.root
  }

  async listThreads(): Promise<ResearchThreadDescriptor[]> {
    let dirents
    try {
      dirents = await fs.readdir(this.root, { withFileTypes: true })
    } catch {
      // Parent dir doesn't exist — fine. Return empty list; the user
      // either hasn't created the dir yet or has overridden the path.
      return []
    }

    const out: ResearchThreadDescriptor[] = []
    for (const d of dirents) {
      // Skip dotfiles + hidden dirs (.DS_Store, .git, etc.) — they're
      // not threads. Skip non-directory entries.
      if (!d.isDirectory() || d.name.startsWith('.')) continue
      const rootPath = path.join(this.root, d.name)
      let lastModified: string
      try {
        const st = await fs.stat(rootPath)
        lastModified = st.mtime.toISOString()
      } catch {
        // Race / permission issue — fall back to "now" so the thread
        // surfaces but doesn't sort artificially old.
        lastModified = new Date().toISOString()
      }
      out.push({ name: d.name, rootPath, lastModified })
    }
    // Sort by name for stable order — the actual intent-list sort is
    // applied at the chrome layer (Map's `awaiting-recency` etc.).
    out.sort((a, b) => a.name.localeCompare(b.name))
    return out
  }
}
