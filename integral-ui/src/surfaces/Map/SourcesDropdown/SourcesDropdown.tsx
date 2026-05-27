import type { SourceEntry } from '@/lib/sources'
import styles from './SourcesDropdown.module.css'

/**
 * SourcesDropdown — multi-select disclosure for the data sources in
 * scope on Map. Replaces the dedicated `SOURCES` row.
 *
 * Pattern matches GroupSortControls (`<details>`/`<summary>` + a panel
 * of menu items) so the trio (sources / group / sort) reads as one
 * family of controls. Differs in two semantic ways:
 *  - Multi-select: options use `role="menuitemcheckbox"` +
 *    `aria-checked` instead of `role="menuitem"` + `aria-current`.
 *  - Always visible whenever sources are wired (no filter-count gate)
 *    — toggling the data plane is a different concern than narrowing
 *    presentation, and the trigger label carries the enabled count
 *    even when collapsed.
 *
 * The wrapper preserves the `data-testid="source-picker"` hook the
 * E2E + visual baselines compose against. Each option carries
 * `data-source=<id>` + `data-enabled="true"` (when on) so existing
 * Playwright selectors continue to work after opening the panel.
 */
export interface SourcesDropdownProps {
  knownSources: ReadonlyArray<SourceEntry>
  enabledSources: ReadonlySet<string>
  onToggleSource: (sourceId: string) => void
}

export function SourcesDropdown({
  knownSources,
  enabledSources,
  onToggleSource,
}: SourcesDropdownProps) {
  if (knownSources.length === 0) return null

  const enabledCount = knownSources.reduce(
    (acc, s) => (enabledSources.has(s.id) ? acc + 1 : acc),
    0
  )

  return (
    <div className={styles.sources} data-testid="source-picker">
      <details className={styles.menu}>
        <summary className={styles.summary} data-testid="sources-summary">
          <span className={styles.label}>sources:</span>
          <span className={styles.current}>
            {enabledCount} of {knownSources.length}
          </span>
        </summary>
        <ul className={styles.list} role="menu">
          {knownSources.map((source) => {
            const enabled = enabledSources.has(source.id)
            return (
              <li key={source.id}>
                <button
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={enabled}
                  className={styles.option}
                  data-source={source.id}
                  data-enabled={enabled ? 'true' : undefined}
                  onClick={() => onToggleSource(source.id)}
                >
                  <span className={styles.optionMarker} aria-hidden="true">
                    {enabled ? '✓' : ''}
                  </span>
                  <span className={styles.optionLabel}>{source.label}</span>
                </button>
              </li>
            )
          })}
        </ul>
      </details>
    </div>
  )
}
