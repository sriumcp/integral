import { Chip } from '@/components/atoms'
import type { GroupBy, MapView, SortBy } from '@/lib/filter-query'
import { activeFilterCount } from '@/lib/filter-query'
import type { SourceEntry } from '@/lib/sources'
import { FilterBar, type FilterCategory } from '../FilterBar/FilterBar'
import { GroupSortControls } from '../GroupSortControls/GroupSortControls'
import styles from './MapControls.module.css'

/**
 * MapControls — the top region of the Map surface.
 *
 * Composes:
 *  - Counts row (active · awaiting · agents · drafts)
 *  - FilterBar (active chips + + filter disclosure)
 *  - GroupSortControls (only visible when ≥1 filter active)
 *  - + new nous campaign button (when handler provided)
 *  - Source picker chip cluster (existing affordance, lifted in)
 *
 * MapControls owns the topRow layout. MapSurface stays a thin wrapper
 * (controls + section label + forest/empty).
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
  /** Tags discovered across all loaded intents — populates TAG autocomplete. */
  availableTags: ReadonlyArray<string>
  onAddFilter: (key: FilterCategory, value: string) => void
  onRemoveFilter: (key: FilterCategory, value: string) => void
  onChangeGroup: (g: GroupBy) => void
  onChangeSort: (s: SortBy) => void
  /** Sources picker. When all three are provided the picker chip
   *  cluster renders on its own row. Omit any to hide. */
  knownSources?: ReadonlyArray<SourceEntry>
  enabledSources?: ReadonlySet<string>
  onToggleSource?: (sourceId: string) => void
  /** Optional + new nous campaign button. */
  onNewNousDraft?: () => void
}

export function MapControls({
  view,
  counts,
  availableTags,
  onAddFilter,
  onRemoveFilter,
  onChangeGroup,
  onChangeSort,
  knownSources,
  enabledSources,
  onToggleSource,
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
            availableTags={availableTags}
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

      {knownSources && enabledSources && onToggleSource && (
        <div
          className={styles.sourcePicker}
          role="group"
          aria-label="data sources"
          data-testid="source-picker"
        >
          <span className={styles.sourcePickerLabel}>sources</span>
          {knownSources.map((source) => {
            const enabled = enabledSources.has(source.id)
            return (
              <button
                key={source.id}
                type="button"
                onClick={() => onToggleSource(source.id)}
                data-source={source.id}
                data-enabled={enabled ? 'true' : undefined}
                className={styles.sourceButton}
                aria-pressed={enabled}
              >
                <Chip mono tone={enabled ? 'sage' : 'mute'} dot={enabled}>
                  {source.label}
                </Chip>
              </button>
            )
          })}
        </div>
      )}
    </header>
  )
}
