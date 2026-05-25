/**
 * Intent grouping + sorting utilities (C1).
 *
 * Pure functions. No IO. Deterministic given inputs. The Map surface
 * uses these to render typographic group separators and ordered
 * sections.
 *
 *  - groupIntents(intents, groupBy) → Map<string, Intent[]>
 *  - sortIntents({ intents, states, sortBy, isAwaitingMe }) → Intent[]
 *  - sortGroups(groups, groupBy) → ordered [groupKey, intents][]
 *
 * The default sort is COMPOUND: `awaiting-recency` puts isAwaitingMe
 * intents first, then orders by last_advanced_at descending. Picked as
 * the default because it's "right for most cases" — matches the
 * "what needs me, then what's recent" intuition.
 */

import type { Intent, IntentState, Status } from '@/schema'
import type { GroupBy, SortBy } from './filter-query'

// ─── Grouping ────────────────────────────────────────────────────────────

export interface GroupIntentsArgs {
  intents: ReadonlyArray<Intent>
  states: ReadonlyArray<IntentState>
  groupBy: GroupBy
}

/** Bucket intents by the chosen group dimension. Returns a Map keyed by
 *  group label; insertion order is the order intents arrive (the caller
 *  is responsible for sorting both intents AND groups beforehand if they
 *  want deterministic output — see `sortGroups`). */
export function groupIntents(args: GroupIntentsArgs): Map<string, Intent[]> {
  const buckets = new Map<string, Intent[]>()
  if (args.groupBy === 'none') {
    buckets.set('', args.intents.slice())
    return buckets
  }

  const stateByIntent = new Map(args.states.map((s) => [s.intent_id, s]))

  for (const intent of args.intents) {
    const key = groupKeyFor(intent, stateByIntent.get(intent.id), args.groupBy)
    const list = buckets.get(key)
    if (list) list.push(intent)
    else buckets.set(key, [intent])
  }
  return buckets
}

function groupKeyFor(
  intent: Intent,
  state: IntentState | undefined,
  groupBy: GroupBy
): string {
  switch (groupBy) {
    case 'none':
      return ''
    case 'source':
      return intent.provenance.source ?? 'fixture'
    case 'kind':
      return intent.kind
    case 'holder-mode':
      return intent.holder.mode
    case 'status':
      return state?.status ?? 'active'
  }
}

/** Order group entries deterministically per group dimension. The
 *  ordering rules are:
 *   - source / kind / holder-mode: alphabetical (locale-aware)
 *   - status: severity order (gated → active → satisfied → abandoned →
 *     revoked → draft) — the order users expect on a triage scan.
 *   - none: trivially one entry. */
export function sortGroups(
  groups: Map<string, Intent[]>,
  groupBy: GroupBy
): Array<[string, Intent[]]> {
  const entries = [...groups.entries()]
  if (groupBy === 'none') return entries
  if (groupBy === 'status') {
    const order = STATUS_SEVERITY
    return entries.sort(
      (a, b) => (order[a[0] as Status] ?? 99) - (order[b[0] as Status] ?? 99)
    )
  }
  // source / kind / holder-mode: alphabetical
  return entries.sort((a, b) => a[0].localeCompare(b[0]))
}

// ─── Sorting ─────────────────────────────────────────────────────────────

export interface SortIntentsArgs {
  intents: ReadonlyArray<Intent>
  states: ReadonlyArray<IntentState>
  sortBy: SortBy
  /** Predicate used by `awaiting-recency` to pull awaiting items first.
   *  Caller wraps the existing isAwaitingMe(intent, state, me) predicate
   *  by binding `me`. Pure / injected so tests stay deterministic. */
  isAwaitingMe: (intent: Intent, state: IntentState) => boolean
}

const STATUS_SEVERITY: Record<Status, number> = {
  gated: 0,
  active: 1,
  satisfied: 2,
  abandoned: 3,
  revoked: 4,
  draft: 5,
}

/** Apply the chosen sort to a list of intents. Returns a new array; the
 *  input is not mutated. Stable sort: equal-key items preserve input
 *  order (TimSort guarantee in V8). */
export function sortIntents(args: SortIntentsArgs): Intent[] {
  const stateByIntent = new Map(args.states.map((s) => [s.intent_id, s]))
  const out = args.intents.slice()

  switch (args.sortBy) {
    case 'recency':
      return out.sort((a, b) => byRecency(stateByIntent, a, b))

    case 'awaiting-recency':
      return out.sort((a, b) => {
        const aw = byAwaiting(stateByIntent, args.isAwaitingMe, a, b)
        if (aw !== 0) return aw
        return byRecency(stateByIntent, a, b)
      })

    case 'status':
      return out.sort((a, b) => {
        const aSt = stateByIntent.get(a.id)?.status
        const bSt = stateByIntent.get(b.id)?.status
        const aw = (aSt && STATUS_SEVERITY[aSt]) ?? 99
        const bw = (bSt && STATUS_SEVERITY[bSt]) ?? 99
        if (aw !== bw) return aw - bw
        return byRecency(stateByIntent, a, b)
      })

    case 'alphabetical':
      return out.sort((a, b) =>
        a.declaration.title.localeCompare(b.declaration.title)
      )
  }
}

function byRecency(
  stateByIntent: Map<string, IntentState>,
  a: Intent,
  b: Intent
): number {
  const aT = stateByIntent.get(a.id)?.last_advanced_at ?? ''
  const bT = stateByIntent.get(b.id)?.last_advanced_at ?? ''
  if (aT === bT) return 0
  return aT < bT ? 1 : -1
}

function byAwaiting(
  stateByIntent: Map<string, IntentState>,
  isAwaitingMe: (i: Intent, s: IntentState) => boolean,
  a: Intent,
  b: Intent
): number {
  const aS = stateByIntent.get(a.id)
  const bS = stateByIntent.get(b.id)
  const aw = aS && isAwaitingMe(a, aS) ? 1 : 0
  const bw = bS && isAwaitingMe(b, bS) ? 1 : 0
  return bw - aw // awaiting (1) sorts before non-awaiting (0)
}

// ─── Display labels for group keys ───────────────────────────────────────

/** Human-readable label for a group key. Kind values render nicely
 *  already (`nous-campaign`); status / holder-mode capitalize naturally;
 *  source IDs render verbatim. */
export function groupLabel(groupBy: GroupBy, key: string): string {
  if (groupBy === 'none') return ''
  // For all current group dimensions the raw key is already a human-
  // friendly token. We uppercase so the typographic separator reads
  // as a section heading.
  return key.toUpperCase()
}
