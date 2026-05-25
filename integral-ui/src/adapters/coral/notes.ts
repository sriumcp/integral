import type { KnowledgeRef } from '../../schema'

/**
 * Coral `notes/**.md` → campaign-scope `KnowledgeRef[]`.
 *
 * v0.1 emits one ref per file with the file's relative path as the URI's
 * path segment. Body content is NOT loaded (the schema's `KnowledgeRef`
 * has no body field; representing notes faithfully needs a typed `Note`
 * concept — see `gaps.md` G-C-10, sibling of Nous's G-N-2). The role is
 * `'principles'` (closest existing fit; Coral notes are essentially
 * principles by another name) and the version is `'v0.1-lossy'` to mark
 * the dropped structure.
 *
 * Pure: deterministic given inputs, no IO. Sorts paths lexically so the
 * output is stable across calls.
 */
export interface NotesToRefsArgs {
  /** Relative paths under `<run>/.coral/public/notes/`, e.g.
   *  `index.md`, `experiments/eval-1-foo.md`. */
  notes: ReadonlyArray<string>
  /** The CoralSource id (used to compose the URI scheme). */
  sourceId: string
  /** The run-id as stored on disk: `<task>/<timestamp>` (e.g.,
   *  `pi-mc/2026-05-24_194843`). */
  runId: string
}

export function notesToKnowledgeRefs(args: NotesToRefsArgs): KnowledgeRef[] {
  const sourceSlug = args.sourceId.replace(/[^a-zA-Z0-9-]/g, '-').replace(/--+/g, '-')
  return args.notes
    .slice()
    .sort()
    .map((rel) => ({
      uri: `coral-note://${sourceSlug}/${args.runId}/${rel}`,
      role: 'principles' as const,
      version: 'v0.1-lossy',
      scope: 'campaign' as const,
    }))
}
