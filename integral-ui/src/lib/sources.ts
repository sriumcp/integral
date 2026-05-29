import type { Workspace } from '@/schema'

/**
 * Source registry — knows about all data sources Integral can load
 * workspaces from. Every source is an adapter discovered dynamically
 * from `/api/sources` at app mount; the v0.1 `'fixture'` source kind
 * was removed in v0.2.0 (see `intent-schema-v0.2.md` § "What v0.2.0
 * removed").
 *
 * The URL contract `?sources=a,b` filters; missing param means "all
 * registered" (every configured adapter source).
 */

export type SourceKind = 'adapter'

export interface SourceEntry {
  /** Stable id used in URLs and `intent.provenance.source`. */
  id: string
  /** Human-readable label shown in the picker chip. */
  label: string
  /** Always `'adapter'` in v0.2.0 — fetched from the Vite plugin's
   *  `/api/workspace?source=<id>` endpoint. */
  kind: SourceKind
  /** Filesystem path of the source on the dev machine. Present for
   *  adapter sources resolved from `integral.config.json`; absent in
   *  offline test environments. Consumed by the A5 `RunCommand` panel
   *  to compose paste-ready `nous run` commands. */
  path?: string
}

/**
 * Fetch the dynamic source registry from `/api/sources`. Returns an
 * empty registry on fetch failure so the app surfaces an actionable
 * empty state rather than crashing in test/preview environments.
 */
export async function fetchSourceRegistry(): Promise<ReadonlyArray<SourceEntry>> {
  try {
    const res = await fetch('/api/sources')
    if (!res.ok) return []
    const body = (await res.json()) as {
      sources?: Array<{
        id: string
        label: string
        kind: SourceKind
        path?: string
      }>
    }
    const adapters: SourceEntry[] = (body.sources ?? [])
      .filter((s) => s && typeof s.id === 'string' && typeof s.label === 'string')
      .map((s) => ({
        id: s.id,
        label: s.label,
        kind: 'adapter' as const,
        ...(typeof s.path === 'string' ? { path: s.path } : {}),
      }))
    return adapters
  } catch {
    return []
  }
}

/**
 * Parse the `?sources=...` query string against a known registry.
 *
 * Comma-separated source IDs; unknown IDs are silently dropped. A
 * *missing* param returns the default (all registered sources). An
 * *empty* param (`?sources=`) returns an empty set — corner case,
 * surfaces as an empty workspace.
 */
export function parseSourcesFromUrl(
  search: string,
  registry: ReadonlyArray<SourceEntry>
): Set<string> {
  const params = new URLSearchParams(search)
  const knownIds = new Set(registry.map((s) => s.id))
  if (!params.has('sources')) {
    return new Set(registry.map((s) => s.id))
  }
  const raw = params.get('sources') ?? ''
  if (raw.length === 0) return new Set()
  return new Set(
    raw
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && knownIds.has(s))
  )
}

/**
 * Render a Set<sourceId> back into the URL query value, in the registry's
 * canonical order.
 */
export function serializeSourcesToUrl(
  enabled: Set<string>,
  registry: ReadonlyArray<SourceEntry>
): string {
  return registry
    .filter((s) => enabled.has(s.id))
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
 * Load a single source's workspace via `/api/workspace?source=<id>`. The
 * returned workspace is decorated with the source ID so callers don't
 * need to remember to attribute themselves.
 */
export async function loadSource(entry: SourceEntry): Promise<Workspace> {
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

/**
 * Load all enabled sources and merge them. Sources that fail are skipped
 * with a warning logged — the user shouldn't lose access to fixture data
 * just because the Nous adapter can't find its source directory.
 */
export async function loadEnabledSources(
  enabled: Set<string>,
  registry: ReadonlyArray<SourceEntry>
): Promise<{ workspace: Workspace; failures: { sourceId: string; error: string }[] }> {
  const failures: { sourceId: string; error: string }[] = []
  const workspaces: Workspace[] = []
  await Promise.all(
    registry
      .filter((s) => enabled.has(s.id))
      .map(async (entry) => {
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
