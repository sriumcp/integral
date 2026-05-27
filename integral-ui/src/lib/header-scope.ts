/**
 * AppHeader center-cluster derivations.
 *
 * The header's scope + focus chain are pure projections of workspace +
 * registry state. Extracting them here gives them a tested boundary
 * separate from the React render path — App.tsx calls these from
 * inside `useMemo` (mapScope) and a render-path helper (intentScope /
 * intentAncestry).
 *
 * The header itself stays presentational: it renders whatever scope +
 * focus arrays the caller hands it.
 */

import type { Intent, Workspace } from '@/schema'
import type { ScopePill } from '@/components'
import type { SourceEntry } from './sources'

/**
 * Map scope — registry-ordered pills for every currently-enabled source.
 *
 * Order is registry order (not toggle order) so the display stays stable
 * across user toggles; switching a source off then on again keeps the
 * pill in its original position. Callers should treat the result as a
 * pure derivation of (registry, enabled) — a useMemo on those two
 * dependencies is the canonical wiring.
 */
export function mapScope(
  registry: ReadonlyArray<SourceEntry>,
  enabled: ReadonlySet<string>,
): ScopePill[] {
  return registry
    .filter((entry) => enabled.has(entry.id))
    .map((entry) => ({ id: entry.id, label: entry.label }))
}

/**
 * Intent scope — the focused intent's own source as a single pill.
 *
 * Three branches:
 *  1. `provenance.source === undefined` (legacy fixture intents from
 *     before the multi-source plane added `source` provenance): no
 *     pill — return [].
 *  2. `provenance.source` set AND known to the registry: full pill
 *     with the registry's human-readable label.
 *  3. `provenance.source` set but NOT in the registry (e.g. the user
 *     deep-linked to a Detail of an intent whose source was removed
 *     from `integral.config.json`): raw-id pill (label = id) so the
 *     user still sees *which* source it came from.
 *
 * Detail navigation is the source of truth for what intent is in
 * focus, not the registry — so an intent whose source is registry-
 * unknown still surfaces. Dropping the pill silently in branch 3
 * would hide that.
 */
export function intentScope(
  intent: Intent,
  registry: ReadonlyArray<SourceEntry>,
): ScopePill[] {
  const sourceId = intent.provenance.source
  if (!sourceId) return []
  const entry = registry.find((e) => e.id === sourceId)
  return [{ id: sourceId, label: entry?.label ?? sourceId }]
}

/**
 * Walk the intent tree from `intent` up to its root, returning the
 * chain in root → leaf order. Used by AppHeader to render an ancestry
 * breadcrumb so users on a non-root surface (e.g. a `nous-iteration`)
 * see the path they navigated through and can click any ancestor to
 * jump back up.
 *
 * Each intent has at most one parent in v0.1's tree-shaped schemas
 * (Nous campaigns, GitHub feature campaigns). Coral attempts form a
 * DAG via `extension.parent_attempts`, but `decomposition.children`
 * still lists each attempt under one parent in the wire format —
 * first-parent-wins keeps the chain unambiguously linear.
 *
 * Pure: returns a fresh array; never reads beyond `workspace.intents`.
 */
export function intentAncestry(
  intent: Intent,
  workspace: Workspace,
): Intent[] {
  const childToParent = new Map<string, Intent>()
  for (const candidate of workspace.intents) {
    for (const childId of candidate.decomposition.children) {
      // First-parent-wins for DAG edges so the chain stays linear.
      if (!childToParent.has(childId)) childToParent.set(childId, candidate)
    }
  }
  const chain: Intent[] = [intent]
  let current = intent
  // Bound the walk at workspace.intents.length so a (malformed) cycle
  // can't hang the render. The schema doesn't allow cycles, but the
  // adapter layer reads external state so paranoia is cheap.
  for (let i = 0; i < workspace.intents.length; i++) {
    const parent = childToParent.get(current.id)
    if (!parent) break
    chain.unshift(parent)
    current = parent
  }
  return chain
}
