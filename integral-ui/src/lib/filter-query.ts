/**
 * Filter / group / sort state for the Map surface.
 *
 * Pure types + parse / serialize / apply. URL state contract:
 *
 *   ?awaiting=me&kind=nous-campaign,coral-attempt
 *      &status=active&holder=human
 *      &group=source&sort=recency
 *
 * Conventions:
 *  - Multi-value params comma-separated (matches existing `?sources=` shape).
 *  - Default values are omitted from URL (`group=none`, `sort=awaiting-recency`,
 *    awaiting=false, all sets empty).
 *  - Unknown values are silently dropped at parse time (forward-compat).
 *  - Round-trip property: parseFilterQuery(serializeFilterQuery(V)) === V
 *    for any view V (within the supported value set).
 *
 * v0.2.0 dropped `tag` as a filter dimension. Adapter-emitted tags are
 * per-intent metadata, not workspace-shared categories — every campaign
 * brings its own tag set, so the picker grew linearly with workspace
 * size while each chip narrowed to 1–3 intents. Tags survive on
 * `intent.tags` (schema unchanged) for adapters + future search; the
 * filter system stops pretending they're a peer of kind/status.
 */

import type {
  HolderMode,
  IntentKind,
  IntentState,
  Status,
} from '@/schema'
import {
  HolderModeSchema,
  IntentKindSchema,
  StatusSchema,
} from '@/schema'

export interface FilterQuery {
  /** awaiting:me — restrict to intents where isAwaitingMe(...) returns true. */
  awaitingMe: boolean
  /** Multi-select within category = OR; across categories = AND. */
  kinds: ReadonlySet<IntentKind>
  statuses: ReadonlySet<Status>
  holderModes: ReadonlySet<HolderMode>
}

export type GroupBy = 'none' | 'source' | 'kind' | 'holder-mode' | 'status'

export type SortBy =
  | 'awaiting-recency'
  | 'recency'
  | 'status'
  | 'alphabetical'

export interface MapView {
  filter: FilterQuery
  group: GroupBy
  sort: SortBy
}

export const DEFAULT_FILTER: FilterQuery = {
  awaitingMe: false,
  kinds: new Set(),
  statuses: new Set(),
  holderModes: new Set(),
}

export const DEFAULT_VIEW: MapView = {
  filter: DEFAULT_FILTER,
  group: 'none',
  sort: 'awaiting-recency',
}

const GROUP_VALUES: ReadonlySet<GroupBy> = new Set([
  'none',
  'source',
  'kind',
  'holder-mode',
  'status',
])

const SORT_VALUES: ReadonlySet<SortBy> = new Set([
  'awaiting-recency',
  'recency',
  'status',
  'alphabetical',
])

// ─── Parse ────────────────────────────────────────────────────────────────

/** Parse a URL-search-params object into a MapView. Unknown values are
 *  silently dropped. Defaults fill in for missing params. The `?tag=`
 *  param is silently ignored (v0.2.0 dropped tag-as-filter). */
export function parseFilterQuery(params: URLSearchParams): MapView {
  const awaiting = params.get('awaiting')
  const awaitingMe = awaiting === 'me'

  const kinds = parseSet(
    params.get('kind'),
    (v): v is IntentKind => IntentKindSchema.safeParse(v).success
  )
  const statuses = parseSet(
    params.get('status'),
    (v): v is Status => StatusSchema.safeParse(v).success
  )
  const holderModes = parseSet(
    params.get('holder'),
    (v): v is HolderMode => HolderModeSchema.safeParse(v).success
  )

  const groupRaw = params.get('group') ?? 'none'
  const group: GroupBy = (GROUP_VALUES.has(groupRaw as GroupBy)
    ? (groupRaw as GroupBy)
    : 'none')

  const sortRaw = params.get('sort') ?? 'awaiting-recency'
  const sort: SortBy = (SORT_VALUES.has(sortRaw as SortBy)
    ? (sortRaw as SortBy)
    : 'awaiting-recency')

  return {
    filter: { awaitingMe, kinds, statuses, holderModes },
    group,
    sort,
  }
}

// ─── Serialize ────────────────────────────────────────────────────────────

/** Serialize a MapView into URL params. Default values are omitted. */
export function serializeFilterQuery(view: MapView): URLSearchParams {
  const out = new URLSearchParams()

  if (view.filter.awaitingMe) out.set('awaiting', 'me')
  if (view.filter.kinds.size > 0) {
    out.set('kind', [...view.filter.kinds].sort().join(','))
  }
  if (view.filter.statuses.size > 0) {
    out.set('status', [...view.filter.statuses].sort().join(','))
  }
  if (view.filter.holderModes.size > 0) {
    out.set('holder', [...view.filter.holderModes].sort().join(','))
  }
  if (view.group !== 'none') out.set('group', view.group)
  if (view.sort !== 'awaiting-recency') out.set('sort', view.sort)

  return out
}

// ─── Apply ────────────────────────────────────────────────────────────────

export interface ApplyFiltersArgs {
  intents: ReadonlyArray<import('@/schema').Intent>
  states: ReadonlyArray<IntentState>
  filter: FilterQuery
  /** Predicate that returns true if the intent is "awaiting" the viewer.
   *  Injected so apply remains pure + testable; production passes a
   *  binding over `isAwaitingMe(intent, state, me)`. */
  isAwaitingMe: (
    intent: import('@/schema').Intent,
    state: IntentState
  ) => boolean
}

/** Apply the filter to a (intents, states) pair, returning the subset that
 *  survives all categories. Within a category: OR. Across categories: AND.
 *  Pure — no IO, deterministic. */
export function applyFilters(
  args: ApplyFiltersArgs
): import('@/schema').Intent[] {
  const stateByIntent = new Map(args.states.map((s) => [s.intent_id, s]))
  return args.intents.filter((intent) => {
    const state = stateByIntent.get(intent.id)
    if (!state) return false

    if (args.filter.awaitingMe && !args.isAwaitingMe(intent, state)) {
      return false
    }
    if (args.filter.kinds.size > 0 && !args.filter.kinds.has(intent.kind)) {
      return false
    }
    if (
      args.filter.statuses.size > 0 &&
      !args.filter.statuses.has(state.status)
    ) {
      return false
    }
    if (
      args.filter.holderModes.size > 0 &&
      !args.filter.holderModes.has(intent.holder.mode)
    ) {
      return false
    }
    return true
  })
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function splitCsv(raw: string | null): string[] {
  if (raw == null || raw.length === 0) return []
  return raw.split(',').map((s) => s.trim())
}

function parseSet<T extends string>(
  raw: string | null,
  validate: (v: string) => v is T
): Set<T> {
  const out = new Set<T>()
  for (const v of splitCsv(raw)) {
    if (validate(v)) out.add(v)
  }
  return out
}

// ─── Convenience: count + utility for chrome ──────────────────────────────

/** Total count of active filter chips a user has applied (used to decide
 *  whether GroupSortControls should be visible). */
export function activeFilterCount(filter: FilterQuery): number {
  return (
    (filter.awaitingMe ? 1 : 0) +
    filter.kinds.size +
    filter.statuses.size +
    filter.holderModes.size
  )
}

/** Convenience: a MapView with no filters and default group/sort. */
export function defaultView(): MapView {
  return {
    filter: {
      awaitingMe: false,
      kinds: new Set(),
      statuses: new Set(),
      holderModes: new Set(),
    },
    group: 'none',
    sort: 'awaiting-recency',
  }
}
