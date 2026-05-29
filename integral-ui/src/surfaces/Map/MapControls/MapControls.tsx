import type { GroupBy, MapView, SortBy } from '@/lib/filter-query'
import { activeFilterCount } from '@/lib/filter-query'
import { FilterBar, type FilterCategory } from '../FilterBar/FilterBar'
import { GroupSortControls } from '../GroupSortControls/GroupSortControls'
import styles from './MapControls.module.css'

/**
 * MapControls — the top region of the Map surface.
 *
 * Composes (single row):
 *  - Counts cluster (active · awaiting · agents · drafts)
 *  - FilterBar (active chips + `+ filter` disclosure) — narrows the
 *    *display* of loaded intents
 *  - GroupSortControls (only visible when ≥1 filter active)
 *  - `+ new nous campaign` button (when handler provided)
 *
 * Source control lives in the AppHeader's scope pills (v0.2.0
 * onwards), not here. Filter is presentation-plane (narrows what's
 * shown); source is data-plane (narrows what's loaded). Mixing them
 * in the same cluster confused users — see the v0.1.5 design notes.
 */
export interface MapControlsProps {
  view: MapView
  /** Workspace counts shown in the header summary. */
  counts: {
    active: number
    awaiting: number
    working: number
    drafts: number
  }
  onAddFilter: (key: FilterCategory, value: string) => void
  onRemoveFilter: (key: FilterCategory, value: string) => void
  onChangeGroup: (g: GroupBy) => void
  onChangeSort: (s: SortBy) => void
  /** Optional + new nous campaign button. */
  onNewNousDraft?: () => void
}

export function MapControls({
  view,
  counts,
  onAddFilter,
  onRemoveFilter,
  onChangeGroup,
  onChangeSort,
  onNewNousDraft,
}: MapControlsProps) {
  const filterCount = activeFilterCount(view.filter)
  const showGroupSort = filterCount > 0 || view.group !== 'none' || view.sort !== 'awaiting-recency'

  return (
    <header className={styles.controls} data-testid="map-controls">
      <div className={styles.row}>
        <div className={styles.counts}>
          <p className={styles.summary}>active trees · zoom = overview</p>
          <h1 className={styles.headline}>
            {counts.active} active · {counts.awaiting} awaiting you ·{' '}
            {counts.working} agent{counts.working === 1 ? '' : 's'} working
            {counts.drafts > 0 && (
              <>
                {' · '}
                {counts.drafts} in shaping
              </>
            )}
          </h1>
        </div>

        <div className={styles.filterCluster} data-testid="filter-cluster">
          <FilterBar
            filter={view.filter}
            onAdd={onAddFilter}
            onRemove={onRemoveFilter}
          />
          <GroupSortControls
            group={view.group}
            sort={view.sort}
            visible={showGroupSort}
            onChangeGroup={onChangeGroup}
            onChangeSort={onChangeSort}
          />
          {onNewNousDraft && (
            <button
              type="button"
              className={styles.newDraftButton}
              onClick={onNewNousDraft}
              aria-label="new nous campaign"
            >
              + new nous campaign
            </button>
          )}
        </div>
      </div>
    </header>
  )
}
