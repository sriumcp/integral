import { useMemo } from 'react'
import type { Intent, IntentState, Party, Workspace } from '@/schema'
import { SectionLabel } from '@/components/atoms'
import { isAwaitingMe } from '@/lib/queue'
import {
  applyFilters,
  DEFAULT_VIEW,
  type FilterQuery,
  type GroupBy,
  type MapView,
  type SortBy,
} from '@/lib/filter-query'
import {
  groupIntents,
  groupLabel,
  sortGroups,
  sortIntents,
} from '@/lib/intent-grouping'
import { TreeCard } from './TreeCard/TreeCard'
import { MapControls } from './MapControls/MapControls'
import type { FilterCategory } from './FilterBar/FilterBar'
import styles from './MapSurface.module.css'

export interface MapSurfaceProps {
  workspace: Workspace
  me: Party
  /** Drill-down handler — clicking a TreeCard navigates to the Detail surface. */
  onOpenIntent?: (intent: Intent) => void
  /** Click handler for "+ new nous campaign". */
  onNewNousDraft?: () => void
  /** Current MapView (filter + group + sort). When omitted, defaults
   *  apply (no filters, no grouping, default sort). */
  view?: MapView
  /** Notified when the user changes any filter/group/sort. The parent
   *  is responsible for URL serialization + re-render. */
  onChangeView?: (view: MapView) => void
}

type RootKind =
  | 'nous-campaign'
  | 'coral-optimization'
  | 'feature-campaign'

const ROOT_KINDS: ReadonlySet<RootKind> = new Set([
  'nous-campaign',
  'coral-optimization',
  'feature-campaign',
])

/**
 * MapSurface — overview-zoom forest of root intents.
 *
 * v0.1 + C1 scope:
 *  - Top region (counts + filter chips + group/sort + sources picker)
 *    rendered by MapControls.
 *  - Forest of TreeCards filtered + sorted + (optionally) grouped per
 *    the active MapView.
 *  - "Root" intents = ROOT_KINDS that aren't children of any other
 *    intent in the workspace (handles B2 nested feature-campaign trees;
 *    sub-issues don't surface as top-level cards).
 */
export function MapSurface({
  workspace,
  me,
  onOpenIntent,
  onNewNousDraft,
  view = DEFAULT_VIEW,
  onChangeView,
}: MapSurfaceProps) {
  const stateById = useMemo(
    () => new Map(workspace.states.map((s) => [s.intent_id, s])),
    [workspace.states]
  )

  // True rootness: an Intent is a root iff no other Intent's
  // decomposition.children includes its id. Plus we restrict to the
  // four root-kinds (sub-iterations / sub-attempts / etc. never surface
  // as top-level cards even if they happen to be unparented).
  const rootIntents = useMemo(() => {
    const allChildIds = new Set(
      workspace.intents.flatMap((i) => i.decomposition.children)
    )
    return workspace.intents.filter(
      (i): i is Intent & { kind: RootKind } =>
        ROOT_KINDS.has(i.kind as RootKind) && !allChildIds.has(i.id)
    )
  }, [workspace.intents])

  const rootStates = useMemo(
    () =>
      rootIntents
        .map((i) => stateById.get(i.id))
        .filter((s): s is IntentState => s !== undefined),
    [rootIntents, stateById]
  )

  // Counts (computed before filter application — they describe the
  // workspace, not the filtered view).
  const counts = useMemo(() => {
    const active = rootStates.filter(
      (s) => s.status === 'active' || s.status === 'gated'
    ).length
    const drafts = rootStates.filter((s) => s.status === 'draft').length
    const awaiting = rootIntents.filter((i) => {
      const state = stateById.get(i.id)
      return state ? isAwaitingMe(i, state, me) : false
    }).length
    const working = workspace.intents.filter(
      (i) => i.kind === 'coral-attempt'
    ).length
    return { active, awaiting, working, drafts }
  }, [rootIntents, rootStates, stateById, workspace.intents, me])


  // ─── Apply filter → sort → group ─────────────────────────────────────
  const isAwaitingForMe = useMemo(
    () => (intent: Intent, state: IntentState) =>
      isAwaitingMe(intent, state, me),
    [me]
  )

  const filtered = useMemo(
    () =>
      applyFilters({
        intents: rootIntents,
        states: rootStates,
        filter: view.filter,
        isAwaitingMe: isAwaitingForMe,
      }),
    [rootIntents, rootStates, view.filter, isAwaitingForMe]
  )

  const sorted = useMemo(
    () =>
      sortIntents({
        intents: filtered,
        states: rootStates,
        sortBy: view.sort,
        isAwaitingMe: isAwaitingForMe,
      }),
    [filtered, rootStates, view.sort, isAwaitingForMe]
  )

  const groupedSections = useMemo(() => {
    const groups = groupIntents({
      intents: sorted,
      states: rootStates,
      groupBy: view.group,
    })
    return sortGroups(groups, view.group)
  }, [sorted, rootStates, view.group])

  // ─── Change handlers ─────────────────────────────────────────────────
  function update(next: MapView): void {
    onChangeView?.(next)
  }

  function addFilter(key: FilterCategory, value: string): void {
    const f: FilterQuery = view.filter
    let next: FilterQuery
    switch (key) {
      case 'awaiting':
        next = { ...f, awaitingMe: true }
        break
      case 'kind':
        next = { ...f, kinds: new Set([...f.kinds, value as Intent['kind']]) }
        break
      case 'status':
        next = {
          ...f,
          statuses: new Set([...f.statuses, value as IntentState['status']]),
        }
        break
      case 'holder':
        next = {
          ...f,
          holderModes: new Set([
            ...f.holderModes,
            value as Intent['holder']['mode'],
          ]),
        }
        break
    }
    update({ ...view, filter: next })
  }

  function removeFilter(key: FilterCategory, value: string): void {
    const f: FilterQuery = view.filter
    let next: FilterQuery
    switch (key) {
      case 'awaiting':
        next = { ...f, awaitingMe: false }
        break
      case 'kind': {
        const s = new Set(f.kinds)
        s.delete(value as Intent['kind'])
        next = { ...f, kinds: s }
        break
      }
      case 'status': {
        const s = new Set(f.statuses)
        s.delete(value as IntentState['status'])
        next = { ...f, statuses: s }
        break
      }
      case 'holder': {
        const s = new Set(f.holderModes)
        s.delete(value as Intent['holder']['mode'])
        next = { ...f, holderModes: s }
        break
      }
    }
    update({ ...view, filter: next })
  }

  function clearAllFilters(): void {
    update({ ...view, filter: DEFAULT_VIEW.filter })
  }

  function changeGroup(g: GroupBy): void {
    update({ ...view, group: g })
  }

  function changeSort(s: SortBy): void {
    update({ ...view, sort: s })
  }

  // ─── Render ──────────────────────────────────────────────────────────
  const sectionHint = `${filtered.length} of ${rootIntents.length}`

  return (
    <main className={styles.surface}>
      <MapControls
        view={view}
        counts={counts}
        onAddFilter={addFilter}
        onRemoveFilter={removeFilter}
        onChangeGroup={changeGroup}
        onChangeSort={changeSort}
        {...(onNewNousDraft && { onNewNousDraft })}
      />

      <SectionLabel hint={sectionHint}>forest</SectionLabel>

      {workspace.intents.length === 0 ? (
        <NoSourcesState />
      ) : filtered.length === 0 ? (
        <EmptyState onClearAll={clearAllFilters} />
      ) : view.group === 'none' ? (
        <FlatForest
          intents={sorted}
          stateById={stateById}
          me={me}
          {...(onOpenIntent && { onOpenIntent })}
        />
      ) : (
        <GroupedForest
          sections={groupedSections}
          stateById={stateById}
          me={me}
          groupBy={view.group}
          {...(onOpenIntent && { onOpenIntent })}
        />
      )}
    </main>
  )
}

// ─── Sub-components ──────────────────────────────────────────────────────

interface FlatForestProps {
  intents: ReadonlyArray<Intent>
  stateById: Map<string, IntentState>
  me: Party
  onOpenIntent?: (intent: Intent) => void
}

function FlatForest({ intents, stateById, me, onOpenIntent }: FlatForestProps) {
  return (
    <div className={styles.forest} data-testid="forest">
      {intents.map((intent) => {
        const state = stateById.get(intent.id)
        if (!state) return null
        return (
          <TreeCard
            key={intent.id}
            intent={intent}
            state={state}
            me={me}
            {...(onOpenIntent && { onOpen: onOpenIntent })}
          />
        )
      })}
    </div>
  )
}

interface GroupedForestProps {
  sections: ReadonlyArray<[string, Intent[]]>
  stateById: Map<string, IntentState>
  me: Party
  groupBy: GroupBy
  onOpenIntent?: (intent: Intent) => void
}

function GroupedForest({
  sections,
  stateById,
  me,
  groupBy,
  onOpenIntent,
}: GroupedForestProps) {
  return (
    <div className={styles.groupedForest} data-testid="grouped-forest">
      {sections.map(([key, intents]) => (
        <section key={key} className={styles.group} data-group-key={key}>
          <header className={styles.groupSeparator}>
            <span className={styles.groupLabel}>
              {groupLabel(groupBy, key)}
            </span>
            <span className={styles.groupCount}>{intents.length}</span>
          </header>
          <div className={styles.forest}>
            {intents.map((intent) => {
              const state = stateById.get(intent.id)
              if (!state) return null
              return (
                <TreeCard
                  key={intent.id}
                  intent={intent}
                  state={state}
                  me={me}
                  {...(onOpenIntent && { onOpen: onOpenIntent })}
                />
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}

interface EmptyStateProps {
  onClearAll: () => void
}

function EmptyState({ onClearAll }: EmptyStateProps) {
  return (
    <div className={styles.empty} role="status" data-testid="empty-results">
      <p className={styles.emptyMessage}>0 intents match the current filter</p>
      <button
        type="button"
        className={styles.clearLink}
        onClick={onClearAll}
      >
        clear filter →
      </button>
    </div>
  )
}

/**
 * Distinct from `EmptyState` — surfaces when the workspace has no
 * intents at all because the user has toggled every source off (or no
 * sources are configured yet). The directive points at the AppHeader's
 * scope pills, the canonical place to bring data back into scope.
 */
function NoSourcesState() {
  return (
    <div
      className={styles.empty}
      role="status"
      data-testid="no-sources-scoped"
    >
      <p className={styles.emptyMessage}>
        no sources scoped — toggle one in the header above ↑
      </p>
    </div>
  )
}
