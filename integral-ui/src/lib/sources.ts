import type { Workspace } from '@/schema'
import { fixtureWorkspace } from '@/fixtures/workspace'

/**
 * Source registry — knows about all data sources the v0.1 substrate can
 * load workspaces from. Currently:
 *  - `'fixture'` — the hand-crafted demo data bundled with the app.
 *  - `'nous'` — Nous campaign adapter (Phase 1) reading
 *    `~/Documents/Projects/inference-sim/` via `/api/workspace`.
 *
 * As more adapters land (Coral, Paper, Feature) they slot in here. The
 * URL contract `?sources=a,b` filters; missing param means "all known."
 */

export type SourceKind = 'fixture' | 'adapter'

export interface SourceEntry {
  /** Stable id used in URLs and `intent.provenance.source`. */
  id: string
  /** Human-readable label shown in the picker chip. */
  label: string
  /** `'fixture'` = bundled static data; `'adapter'` = fetched from
   *  the Vite plugin's `/api/workspace?source=<id>` endpoint. */
  kind: SourceKind
}

export const KNOWN_SOURCES: ReadonlyArray<SourceEntry> = [
  { id: 'fixture', label: 'demo fixture', kind: 'fixture' },
  { id: 'nous', label: 'nous campaigns', kind: 'adapter' },
]

const KNOWN_IDS: ReadonlySet<string> = new Set(KNOWN_SOURCES.map((s) => s.id))

/**
 * Parse the `?sources=...` query string. Comma-separated source IDs;
 * unknown IDs are silently dropped. A *missing* param returns the
 * default (all known sources). An *empty* param (`?sources=`) returns
 * an empty set — corner case, surfaces as an empty workspace.
 */
export function parseSourcesFromUrl(search: string): Set<string> {
  const params = new URLSearchParams(search)
  if (!params.has('sources')) {
    return new Set(KNOWN_SOURCES.map((s) => s.id))
  }
  const raw = params.get('sources') ?? ''
  if (raw.length === 0) return new Set()
  return new Set(
    raw
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && KNOWN_IDS.has(s))
  )
}

/**
 * Render a Set<sourceId> back into the URL query value.
 *
 * Used by the picker chip cluster to update history without a reload.
 * Returns the value to assign to the `sources` param (no leading `?`).
 * Empty set returns `''` (corner case representable as `?sources=`).
 */
export function serializeSourcesToUrl(enabled: Set<string>): string {
  return KNOWN_SOURCES.filter((s) => enabled.has(s.id))
    .map((s) => s.id)
    .join(',')
}

/**
 * Decorate every intent in a workspace with `provenance.source = sourceId`.
 * Called by the loader so the in-source fixture file doesn't have to
 * carry the field on every entry, and adapters get default attribution
 * even if they forget to set it themselves.
 */
export function attributeSource(
  workspace: Workspace,
  sourceId: string
): Workspace {
  return {
    ...workspace,
    intents: workspace.intents.map((i) => ({
      ...i,
      provenance: { ...i.provenance, source: sourceId },
    })),
  }
}

/**
 * Combine multiple workspaces into one. Concatenates each collection
 * (intents/states/evidence_links/operations) — IDs across sources stay
 * unique by adapter convention (`nous:fs-…:run-id`, `fixture:…`, etc.).
 *
 * Defensive: if two sources happen to emit the same intent id (a bug),
 * the *first* wins to preserve the bijection refine. v0.2 may add an
 * explicit conflict policy.
 */
export function mergeWorkspaces(workspaces: ReadonlyArray<Workspace>): Workspace {
  const seenIntents = new Set<string>()
  const seenStates = new Set<string>()
  const seenLinks = new Set<string>()
  const seenOps = new Set<string>()

  const intents: Workspace['intents'] = []
  const states: Workspace['states'] = []
  const evidence_links: Workspace['evidence_links'] = []
  const operations: Workspace['operations'] = []

  for (const ws of workspaces) {
    for (const i of ws.intents) {
      if (seenIntents.has(i.id)) continue
      seenIntents.add(i.id)
      intents.push(i)
    }
    for (const s of ws.states) {
      if (seenStates.has(s.id)) continue
      seenStates.add(s.id)
      states.push(s)
    }
    for (const e of ws.evidence_links) {
      if (seenLinks.has(e.id)) continue
      seenLinks.add(e.id)
      evidence_links.push(e)
    }
    for (const o of ws.operations) {
      if (seenOps.has(o.id)) continue
      seenOps.add(o.id)
      operations.push(o)
    }
  }

  return { intents, states, evidence_links, operations }
}

/**
 * Load a single source's workspace. Bundled `'fixture'` is a static
 * import (no network); adapters fetch `/api/workspace?source=<id>`.
 *
 * The returned workspace is decorated with the source ID so callers
 * don't need to remember to attribute themselves.
 */
export async function loadSource(entry: SourceEntry): Promise<Workspace> {
  if (entry.kind === 'fixture' && entry.id === 'fixture') {
    return attributeSource(fixtureWorkspace, 'fixture')
  }
  if (entry.kind === 'adapter') {
    const res = await fetch(`/api/workspace?source=${encodeURIComponent(entry.id)}`)
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(
        `adapter "${entry.id}" returned ${res.status}: ${body.error ?? '(no detail)'}`
      )
    }
    const body = await res.json()
    if (!body || typeof body !== 'object' || !body.workspace) {
      throw new Error(`adapter "${entry.id}" response missing 'workspace' field`)
    }
    return attributeSource(body.workspace as Workspace, entry.id)
  }
  throw new Error(`unsupported source kind: ${entry.kind}`)
}

/**
 * Load all enabled sources and merge them. Sources that fail are skipped
 * with a warning logged — the user shouldn't lose access to fixture data
 * just because the Nous adapter can't find its source directory.
 */
export async function loadEnabledSources(
  enabled: Set<string>
): Promise<{ workspace: Workspace; failures: { sourceId: string; error: string }[] }> {
  const failures: { sourceId: string; error: string }[] = []
  const workspaces: Workspace[] = []
  await Promise.all(
    KNOWN_SOURCES.filter((s) => enabled.has(s.id)).map(async (entry) => {
      try {
        workspaces.push(await loadSource(entry))
      } catch (err) {
        failures.push({
          sourceId: entry.id,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    })
  )
  return { workspace: mergeWorkspaces(workspaces), failures }
}
