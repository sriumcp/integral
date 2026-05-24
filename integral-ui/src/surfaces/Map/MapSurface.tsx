import { useMemo, useState } from 'react'
import type { Intent, Party, Workspace } from '@/schema'
import { Chip, SectionLabel } from '@/components/atoms'
import { isAwaitingMe } from '@/lib/queue'
import type { SourceEntry } from '@/lib/sources'
import { TreeCard } from './TreeCard/TreeCard'
import styles from './MapSurface.module.css'

export interface MapSurfaceProps {
  workspace: Workspace
  me: Party
  /** Drill-down handler — clicking a TreeCard navigates to the Detail surface. */
  onOpenIntent?: (intent: Intent) => void
  /** Known sources (registry from `src/lib/sources.ts`). When provided
   *  alongside `enabledSources` and `onToggleSource`, the source picker
   *  chip cluster renders in the top row; when omitted, no picker. */
  knownSources?: ReadonlyArray<SourceEntry>
  /** Currently-enabled source IDs. */
  enabledSources?: ReadonlySet<string>
  /** Click handler for a source chip — toggles that source on/off. */
  onToggleSource?: (sourceId: string) => void
  /** Click handler for "+ new nous campaign". When provided, the
   *  topRow renders a "+ new" button that creates a blank Nous draft +
   *  navigates to the Shaping surface. Without it, the button is
   *  hidden — preserves backwards compat for tests / preview where
   *  draft creation isn't wired. */
  onNewNousDraft?: () => void
}

type RootKind =
  | 'nous-campaign'
  | 'coral-optimization'
  | 'feature-campaign'
  | 'paper-campaign'

const ROOT_KINDS: ReadonlySet<RootKind> = new Set([
  'nous-campaign',
  'coral-optimization',
  'feature-campaign',
  'paper-campaign',
])

/**
 * MapSurface — overview-zoom forest of root intents (campaigns).
 *
 * v0.1 scope:
 *  - Renders a 2-column forest of TreeCards for the four root kinds.
 *  - Filter: "awaiting me" toggle (per the resolved decision in CLAUDE.md).
 *  - Click a TreeCard → calls `onOpenIntent` (Detail surface lands later).
 *
 * v0.2:
 *  - Cross-tree EvidenceLink edges rendered between cards.
 *  - Shaping drafts row.
 *  - Backgrounded section.
 *  - Per-kind grouping toggle.
 */
export function MapSurface({
  workspace,
  me,
  onOpenIntent,
  knownSources,
  enabledSources,
  onToggleSource,
  onNewNousDraft,
}: MapSurfaceProps) {
  const [awaitingOnly, setAwaitingOnly] = useState(false)

  // Pair root intents with their states; non-root kinds (iterations, attempts,
  // sections, claims, PRs) are not first-class on the Map surface — they're
  // navigable from the Detail surface of their parent.
  const rootIntentPairs = useMemo(() => {
    const stateById = new Map(workspace.states.map((s) => [s.intent_id, s]))
    return workspace.intents
      .filter((i): i is Intent & { kind: RootKind } =>
        ROOT_KINDS.has(i.kind as RootKind)
      )
      .map((intent) => {
        // Bijection refine guarantees the state exists.
        const state = stateById.get(intent.id)!
        return { intent, state }
      })
  }, [workspace])

  const activePairs = useMemo(
    () =>
      rootIntentPairs.filter(
        ({ state }) => state.status === 'active' || state.status === 'gated'
      ),
    [rootIntentPairs]
  )

  const draftPairs = useMemo(
    () => rootIntentPairs.filter(({ state }) => state.status === 'draft'),
    [rootIntentPairs]
  )

  const filteredPairs = useMemo(() => {
    if (!awaitingOnly) return rootIntentPairs
    return rootIntentPairs.filter(({ intent, state }) =>
      isAwaitingMe(intent, state, me)
    )
  }, [rootIntentPairs, awaitingOnly, me])

  const awaitingCount = useMemo(
    () =>
      rootIntentPairs.filter(({ intent, state }) =>
        isAwaitingMe(intent, state, me)
      ).length,
    [rootIntentPairs, me]
  )

  const workingCount = workspace.intents.filter(
    (i) => i.kind === 'coral-attempt'
  ).length // placeholder until presence is first-class

  return (
    <main className={styles.surface}>
      <header className={styles.topRow}>
        <div>
          <p className={styles.summary}>active trees · zoom = overview</p>
          <h1 className={styles.headline}>
            {activePairs.length} active · {awaitingCount} awaiting you ·{' '}
            {workingCount} agent{workingCount === 1 ? '' : 's'} working
            {draftPairs.length > 0 && (
              <>
                {' · '}
                {draftPairs.length} in shaping
              </>
            )}
          </h1>
        </div>
        <div className={styles.filters} data-testid="map-filters">
          <button
            type="button"
            onClick={() => setAwaitingOnly((v) => !v)}
            data-active={awaitingOnly ? 'true' : undefined}
            style={{ all: 'unset', cursor: 'pointer' }}
          >
            <Chip
              tone={awaitingOnly ? 'amber' : 'mute'}
              mono
              dot={awaitingOnly}
            >
              awaiting me · {awaitingCount}
            </Chip>
          </button>
          <Chip tone="mute" mono>
            all kinds
          </Chip>
          <Chip tone="mute" mono>
            last 24h
          </Chip>
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
      </header>

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
                style={{ all: 'unset', cursor: 'pointer' }}
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

      <SectionLabel hint={`${filteredPairs.length} of ${rootIntentPairs.length}`}>
        forest
      </SectionLabel>

      {filteredPairs.length === 0 ? (
        <div className={styles.empty} role="status">
          {awaitingOnly
            ? 'nothing awaits you right now'
            : 'no active trees in this workspace'}
        </div>
      ) : (
        <div className={styles.forest} data-testid="forest">
          {filteredPairs.map(({ intent, state }) => (
            <TreeCard
              key={intent.id}
              intent={intent}
              state={state}
              me={me}
              {...(onOpenIntent && { onOpen: onOpenIntent })}
            />
          ))}
        </div>
      )}
    </main>
  )
}
