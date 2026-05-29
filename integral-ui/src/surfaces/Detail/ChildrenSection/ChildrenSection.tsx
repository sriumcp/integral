import type {
  Intent,
  IntentState,
  TypeExtension,
  Workspace,
  ZoomLevel,
} from '@/schema'
import {
  Chip,
  HMainTimeline,
  HypothesisBars,
  HypothesisGrid,
  KindBadge,
  PrinciplesTempo,
  ScoreGauge,
  SectionLabel,
  StatusDot,
} from '@/components/atoms'
import {
  nousHMainTimeline,
  nousHypothesisGrid,
  nousPrinciplesTempo,
} from '@/lib/nous-projection-data'
import styles from './ChildrenSection.module.css'

export interface ChildrenSectionProps {
  intent: Intent
  workspace: Workspace
  zoom: ZoomLevel
  onOpen: (intent: Intent) => void
}

interface ChildPair {
  intent: Intent
  state: IntentState | undefined
}

/**
 * ChildrenSection — the per-kind specialized body of the Detail surface.
 *
 * Discipline: narrow on `intent.extension.kind` (the discriminator on the
 * `TypeExtension` union), not on `intent.kind`. Both are equal at runtime
 * via the schema's `.refine` invariant, but only the former narrows the
 * extension type for TS.
 *
 * Zoom-aware rendering (resolved decision in CLAUDE.md § Resolved surface
 * decisions): overview = collapsed summary; structure = extension preview
 * plus children list with kind-specialized rows; detail = the same plus
 * full extension data.
 */
export function ChildrenSection({
  intent,
  workspace,
  zoom,
  onOpen,
}: ChildrenSectionProps) {
  const childPairs: ChildPair[] = intent.decomposition.children
    .map((id) => {
      const child = workspace.intents.find((i) => i.id === id)
      if (!child) return undefined
      const state = workspace.states.find((s) => s.intent_id === child.id)
      return { intent: child, state }
    })
    .filter((p): p is ChildPair => p !== undefined)

  if (zoom === 'overview') {
    // Leaf kinds (research-thread today) have no children-by-design and
    // no specialized extension overview. Suppress the section so the
    // chrome doesn't show a misleading "no children" placeholder.
    if (intent.extension.kind === 'research-thread') return null
    return (
      <section className={styles.section} data-kind={intent.kind}>
        <OverviewSummary intent={intent} childCount={childPairs.length} />
      </section>
    )
  }

  // Hide the section entirely when nothing renders for this kind+zoom.
  // Research-thread (and any future leaf kind without typed children +
  // no specialized extension summary + no detail dump) would otherwise
  // surface as an empty box. Test this fail-closed: each fragment below
  // returns null when it has nothing to show; if all four are silent,
  // the chrome should be silent too.
  if (!sectionHasAnything(intent, workspace, zoom, childPairs.length)) {
    return null
  }

  return (
    <section className={styles.section} data-kind={intent.kind}>
      {/* Visual summary atoms sit *first* — adjacent to the projection
          prose summary above (the LLM-generated text in
          ProjectionSection). They're the picture-summary of what the
          campaign found; ExtensionSummary's research-question chip and
          children list follow as orienting context, not as headline. */}
      <NousProgressVisuals intent={intent} workspace={workspace} zoom={zoom} />
      <ExtensionSummary intent={intent} />
      {childPairs.length > 0 && (
        <>
          <SectionLabel hint={`${childPairs.length}`}>children</SectionLabel>
          <ul className={styles.childList}>
            {childPairs.map(({ intent: child, state }) => (
              <li key={child.id}>
                <ChildRow child={child} state={state} onOpen={onOpen} />
              </li>
            ))}
          </ul>
        </>
      )}
      {zoom === 'detail' && <ExtensionDetail intent={intent} />}
    </section>
  )
}

/**
 * Predicate mirroring the conditions under which the four child fragments
 * (NousProgressVisuals, ExtensionSummary, children list, ExtensionDetail)
 * each return null. If all four are silent, the section is empty and
 * shouldn't render its outer chrome. Conservative — when in doubt, render.
 *
 * Today: research-thread is always silent here (no nous visuals, no
 * specialized extension summary, no children, no detail dump). Other
 * kinds always have at least an ExtensionSummary, so they pass.
 */
function sectionHasAnything(
  intent: Intent,
  workspace: Workspace,
  zoom: ZoomLevel,
  childCount: number,
): boolean {
  if (childCount > 0) return true
  if (intent.extension.kind === 'nous-campaign') return true
  if (intent.extension.kind === 'nous-iteration') return true
  if (intent.extension.kind === 'coral-optimization') return true
  if (intent.extension.kind === 'coral-attempt') return true
  if (intent.extension.kind === 'feature-campaign') return true
  // research-thread (and any future leaf kind) — only show if zoom-detail
  // ever surfaces something specialized; v0.3.x has nothing for it.
  void workspace
  void zoom
  return false
}

/**
 * Minimum-viable thresholds for the progress atoms. A plot below its
 * threshold doesn't carry signal — it carries noise. The substrate's
 * "figures conditional on data threshold" commitment lives here.
 *
 * - PrinciplesTempo: needs ≥3 iterations AND ≥2 principles for the
 *   cumulative-step shape to bend visibly. At N=1 the line collapses
 *   to a single dot; at total=1 the line is one step with no slope to
 *   read.
 * - HMainTimeline: needs ≥3 iterations AND ≥2 results on h_main —
 *   a single-cell strip reads as a status badge, not a *trajectory*.
 *   Renders on v0.1 data where HypothesisGrid stays hidden (G-N-9).
 * - HypothesisGrid: needs ≥2 iterations AND ≥2 distinct hypotheses
 *   with results — the matrix story requires at least 2×2. A single
 *   row or column reads as a status strip, not a grid.
 */
const TEMPO_MIN_ITERATIONS = 3
const TEMPO_MIN_PRINCIPLES = 2
const HMAIN_TIMELINE_MIN_ITERATIONS = 3
const HMAIN_TIMELINE_MIN_RESULTS = 2
const GRID_MIN_ITERATIONS = 2
const GRID_MIN_HYPOTHESES = 2

/**
 * NousProgressVisuals — composes the cross-adapter visual atoms for
 * Nous campaigns. PrinciplesTempo at structure + detail zoom (when
 * the cumulative shape carries signal); HypothesisGrid at detail
 * zoom only (when the matrix has at least 2×2 of meaningful content).
 *
 * Gated on *meaningful-rendering* thresholds, not just non-empty data.
 * The atoms' built-in placeholders are reserved for the structurally-
 * empty intrinsic case (length 0); the surface gates on the "do you
 * have enough to actually show?" threshold so degenerate plots (a
 * single dot, a single cell) never reach the user.
 *
 * Other intent kinds render nothing here (early-return). Coral's
 * `BestSoFarLine` and other future per-adapter visuals slot into
 * this same composition pattern. The `current` flag on
 * PrinciplesTempo paints the rightmost cumulative point in `--amber`
 * only when the campaign is in a live status (active or gated) —
 * preserving the substrate's reserved single-amber signal slot.
 */
function NousProgressVisuals({
  intent,
  workspace,
  zoom,
}: {
  intent: Intent
  workspace: Workspace
  zoom: ZoomLevel
}) {
  if (intent.extension.kind !== 'nous-campaign') return null
  if (zoom === 'overview') return null

  const tempoData = nousPrinciplesTempo(intent, workspace)
  const tempoTotal = tempoData.reduce((acc, d) => acc + d.principlesEmitted, 0)
  const showTempo =
    tempoData.length >= TEMPO_MIN_ITERATIONS &&
    tempoTotal >= TEMPO_MIN_PRINCIPLES

  const hMainData = nousHMainTimeline(intent, workspace)
  const hMainResultCount = hMainData.reduce(
    (acc, d) => (d.result !== undefined ? acc + 1 : acc),
    0
  )
  const showHMain =
    hMainData.length >= HMAIN_TIMELINE_MIN_ITERATIONS &&
    hMainResultCount >= HMAIN_TIMELINE_MIN_RESULTS

  const gridData =
    zoom === 'detail' ? nousHypothesisGrid(intent, workspace) : []
  const distinctHypothesesWithResults = new Set<string>()
  for (const iter of gridData) {
    for (const h of iter.hypotheses) {
      if (h.result !== undefined) distinctHypothesesWithResults.add(h.label)
    }
  }
  const showGrid =
    zoom === 'detail' &&
    gridData.length >= GRID_MIN_ITERATIONS &&
    distinctHypothesesWithResults.size >= GRID_MIN_HYPOTHESES

  if (!showTempo && !showHMain && !showGrid) return null

  // Live campaign? Drives whether PrinciplesTempo paints its last
  // point in --amber (active/gated) vs --ink-2 (terminal states).
  const state = workspace.states.find((s) => s.intent_id === intent.id)
  const isLive = state?.status === 'active' || state?.status === 'gated'

  // Show a tiny inline legend whenever a symbol-using atom renders.
  // PrinciplesTempo alone doesn't need a legend (its line + dot are
  // self-evident); HMainTimeline + HypothesisGrid use ✓/−/? cells
  // whose meaning isn't obvious to a fresh reader. The legend is
  // small mono mute text — discoverable but not visually competing
  // with the plots themselves. This is the genre's "annotation >
  // legend" rule with one allowed concession: when a symbol's
  // meaning isn't universal (✓ is; − and ? aren't), naming them
  // once below the plot block is cheaper than per-cell tooltips.
  const showLegend = showHMain || showGrid

  return (
    <div className={styles.progressVisuals} data-progress-visuals="nous">
      {showTempo && (
        <PrinciplesTempo
          data={tempoData}
          title="principles emitted"
          current={isLive}
        />
      )}
      {showHMain && (
        <HMainTimeline data={hMainData} title="h_main timeline" />
      )}
      {showGrid && (
        <HypothesisGrid iterations={gridData} title="hypothesis ledger" />
      )}
      {showLegend && (
        <p className={styles.progressLegend} data-progress-legend="true">
          <span className={styles.legendItem}>
            <span className={styles.legendMarkConfirmed}>✓</span> confirmed
          </span>
          <span aria-hidden="true" className={styles.legendSep}>·</span>
          <span className={styles.legendItem}>
            <span className={styles.legendMarkRefuted}>−</span> refuted
          </span>
          <span aria-hidden="true" className={styles.legendSep}>·</span>
          <span className={styles.legendItem}>
            <span className={styles.legendMarkUnresolved}>?</span> unresolved
          </span>
          <span aria-hidden="true" className={styles.legendSep}>·</span>
          <span className={styles.legendItem}>blank: not probed</span>
        </p>
      )}
    </div>
  )
}

// ─── Overview zoom — collapsed count + one-line extension hint ─────────────
function OverviewSummary({
  intent,
  childCount,
}: {
  intent: Intent
  childCount: number
}) {
  const ext = intent.extension
  return (
    <div className={styles.overview}>
      <p className={styles.overviewLine}>
        {childCount === 0
          ? 'no children'
          : `${childCount} child${childCount === 1 ? '' : 'ren'}`}
      </p>
      {ext.kind === 'nous-campaign' && (
        <p className={styles.overviewHint}>
          {ext.open_hypothesis_bundles.length} open bundle
          {ext.open_hypothesis_bundles.length === 1 ? '' : 's'}
        </p>
      )}
      {ext.kind === 'coral-optimization' && (
        <p className={styles.overviewHint}>
          {ext.search_algorithm} · pop {ext.population_size}
        </p>
      )}
      {ext.kind === 'feature-campaign' && (
        <p className={styles.overviewHint}>
          {ext.standing_invariants.length} invariant
          {ext.standing_invariants.length === 1 ? '' : 's'}
        </p>
      )}
    </div>
  )
}

// ─── Per-self-kind extension preview (visible at structure + detail) ───────
function ExtensionSummary({ intent }: { intent: Intent }) {
  const ext = intent.extension

  if (ext.kind === 'nous-campaign') {
    return (
      <div className={styles.summaryRow}>
        <p className={styles.researchQ}>
          <span className={styles.summaryLabel}>research question</span>{' '}
          {ext.research_question}
        </p>
        <div className={styles.summaryChips}>
          <Chip mono tone="mute">
            {ext.open_hypothesis_bundles.length} open bundle
            {ext.open_hypothesis_bundles.length === 1 ? '' : 's'}
          </Chip>
          {ext.gate_status.current_gate &&
            ext.gate_status.current_gate !== 'none' && (
              <Chip tone="amber" mono>
                gate · {ext.gate_status.current_gate}
              </Chip>
            )}
          {ext.gate_status.awaiting_party && (
            <Chip tone="amber" mono>
              awaiting {ext.gate_status.awaiting_party.display_name}
            </Chip>
          )}
        </div>
      </div>
    )
  }

  if (ext.kind === 'nous-iteration') {
    const counts = hypothesisCounts(ext.hypothesis_bundle)
    return (
      <div className={styles.summaryRow}>
        <div className={styles.summaryChips}>
          <Chip mono tone="mute">
            iteration {ext.iteration_number}
          </Chip>
          <HypothesisBars counts={counts} ariaLabel="hypothesis outcomes" />
        </div>
      </div>
    )
  }

  if (ext.kind === 'coral-optimization') {
    return (
      <div className={styles.summaryRow}>
        <div className={styles.summaryChips}>
          <Chip mono tone="mute">{ext.search_algorithm}</Chip>
          <Chip mono tone="mute">pop {ext.population_size}</Chip>
          {ext.best_score_so_far !== undefined && (
            <Chip tone="sage" mono>
              best {ext.best_score_so_far.toFixed(3)}
            </Chip>
          )}
        </div>
      </div>
    )
  }

  if (ext.kind === 'coral-attempt') {
    return (
      <div className={styles.summaryRow}>
        <div className={styles.summaryChips}>
          <ScoreGauge score={ext.score} />
          <Chip mono tone="mute">
            {ext.parent_attempts.length} parent
            {ext.parent_attempts.length === 1 ? '' : 's'}
          </Chip>
        </div>
      </div>
    )
  }

  if (ext.kind === 'feature-campaign') {
    return (
      <div className={styles.summaryRow}>
        <div className={styles.summaryChips}>
          <Chip mono tone="mute">
            {ext.standing_invariants.length} invariant
            {ext.standing_invariants.length === 1 ? '' : 's'}
          </Chip>
          <Chip mono tone="mute" title={ext.repo_anchor.uri}>
            repo
          </Chip>
        </div>
        {ext.standing_invariants.length > 0 && (
          <ul className={styles.invariantList}>
            {ext.standing_invariants.map((inv, i) => (
              <li key={i} className={styles.invariantItem}>
                {inv.target}
              </li>
            ))}
          </ul>
        )}
      </div>
    )
  }

  return null
}

// ─── Per-self-kind full extension dump (detail zoom only) ──────────────────
function ExtensionDetail({ intent }: { intent: Intent }) {
  const ext = intent.extension

  if (ext.kind === 'nous-iteration') {
    const all = [ext.hypothesis_bundle.h_main, ...ext.hypothesis_bundle.h_ablation]
    return (
      <div className={styles.detail}>
        <SectionLabel>hypotheses</SectionLabel>
        <ul className={styles.hypothesisList}>
          {all.map((h, i) => (
            <li key={i} className={styles.hypothesisRow}>
              <p className={styles.hypothesisStatement}>{h.statement}</p>
              <p className={styles.hypothesisPrediction}>predicts: {h.prediction}</p>
              {h.result && (
                <Chip mono tone={resultTone(h.result)}>
                  {h.result}
                </Chip>
              )}
            </li>
          ))}
        </ul>
      </div>
    )
  }

  if (ext.kind === 'coral-attempt') {
    return (
      <div className={styles.detail}>
        <SectionLabel>anchors</SectionLabel>
        <ul className={styles.anchorList}>
          <li>worktree: {ext.worktree_anchor.uri}</li>
          {ext.artifact_uri && <li>artifact: {ext.artifact_uri}</li>}
          {ext.evaluator_log_uri && <li>log: {ext.evaluator_log_uri}</li>}
        </ul>
      </div>
    )
  }

  if (ext.kind === 'nous-campaign') {
    return (
      <div className={styles.detail}>
        <SectionLabel>gate</SectionLabel>
        <ul className={styles.anchorList}>
          <li>current: {ext.gate_status.current_gate ?? 'none'}</li>
          {ext.gate_status.awaiting_party && (
            <li>awaiting: {ext.gate_status.awaiting_party.display_name}</li>
          )}
          {ext.gate_status.awaiting_since && (
            <li>since: {ext.gate_status.awaiting_since}</li>
          )}
        </ul>
      </div>
    )
  }

  if (ext.kind === 'coral-optimization') {
    return (
      <div className={styles.detail}>
        <SectionLabel>anchors</SectionLabel>
        <ul className={styles.anchorList}>
          <li>scoring: {ext.scoring_function_ref}</li>
          <li>attempts-db: {ext.attempts_db_anchor.uri}</li>
          <li>shared-skills: {ext.shared_skills_anchor.uri}</li>
        </ul>
      </div>
    )
  }

  if (ext.kind === 'feature-campaign') {
    return (
      <div className={styles.detail}>
        <SectionLabel>repo</SectionLabel>
        <p className={styles.anchorLine}>{ext.repo_anchor.uri}</p>
      </div>
    )
  }

  return null
}

// ─── Per-child-kind row ────────────────────────────────────────────────────
function ChildRow({
  child,
  state,
  onOpen,
}: {
  child: Intent
  state: IntentState | undefined
  onOpen: (intent: Intent) => void
}) {
  const ext = child.extension
  return (
    <button
      type="button"
      className={styles.childRow}
      data-kind={child.kind}
      onClick={() => onOpen(child)}
      aria-label={`open ${child.declaration.title}`}
    >
      <span className={styles.childRowHeader}>
        {state && (
          <StatusDot status={state.status} ariaLabel={`status ${state.status}`} />
        )}
        <KindBadge kind={child.kind} label={child.kind} />
        <span className={styles.childTitle}>{child.declaration.title}</span>
        {state && (
          <Chip status={state.status} mono>
            {state.status}
          </Chip>
        )}
      </span>
      <ChildRowFigure ext={ext} />
    </button>
  )
}

function ChildRowFigure({ ext }: { ext: TypeExtension }) {
  if (ext.kind === 'nous-iteration') {
    const counts = hypothesisCounts(ext.hypothesis_bundle)
    return (
      <span className={styles.childFigure}>
        <HypothesisBars counts={counts} ariaLabel="hypothesis outcomes" />
      </span>
    )
  }
  if (ext.kind === 'coral-attempt') {
    return (
      <span className={styles.childFigure}>
        <ScoreGauge score={ext.score} ariaLabel="attempt score" />
      </span>
    )
  }
  return null
}

// ─── Helpers ───────────────────────────────────────────────────────────────
function hypothesisCounts(
  bundle: Extract<TypeExtension, { kind: 'nous-iteration' }>['hypothesis_bundle']
) {
  const all = [bundle.h_main, ...bundle.h_ablation]
  return {
    confirmed: all.filter((h) => h.result === 'confirmed').length,
    refuted: all.filter((h) => h.result === 'refuted').length,
    pending: all.filter((h) => h.result === 'pending' || !h.result).length,
  }
}

function resultTone(
  result: 'pending' | 'confirmed' | 'refuted' | 'inconclusive'
): 'mute' | 'sage' | 'rose' | 'amber' {
  if (result === 'confirmed') return 'sage'
  if (result === 'refuted') return 'rose'
  if (result === 'inconclusive') return 'amber'
  return 'mute'
}
