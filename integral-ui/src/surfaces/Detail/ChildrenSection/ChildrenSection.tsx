import type {
  Intent,
  IntentState,
  TypeExtension,
  Workspace,
  ZoomLevel,
} from '@/schema'
import {
  Chip,
  HypothesisBars,
  KindBadge,
  ScoreGauge,
  SectionLabel,
  StatusDot,
} from '@/components/atoms'
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
    return (
      <section className={styles.section} data-kind={intent.kind}>
        <OverviewSummary intent={intent} childCount={childPairs.length} />
      </section>
    )
  }

  return (
    <section className={styles.section} data-kind={intent.kind}>
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
      {ext.kind === 'paper-campaign' && (
        <p className={styles.overviewHint}>
          {ext.sections.length} section{ext.sections.length === 1 ? '' : 's'}
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

  if (ext.kind === 'feature-pr') {
    return (
      <div className={styles.summaryRow}>
        <div className={styles.summaryChips}>
          <Chip
            mono
            tone={ext.ci_status === 'failing' ? 'rose' : ext.ci_status === 'passing' ? 'sage' : 'mute'}
            dot
          >
            ci · {ext.ci_status}
          </Chip>
          <Chip
            mono
            tone={
              ext.review_status === 'changes-requested'
                ? 'amber'
                : ext.review_status === 'approved' || ext.review_status === 'merged'
                ? 'sage'
                : 'mute'
            }
          >
            review · {ext.review_status}
          </Chip>
        </div>
        {ext.diff_summary && (
          <p className={styles.diffSummary}>{ext.diff_summary}</p>
        )}
      </div>
    )
  }

  if (ext.kind === 'paper-campaign') {
    return (
      <div className={styles.summaryRow}>
        <div className={styles.summaryChips}>
          {ext.venue && <Chip mono tone="mute">{ext.venue}</Chip>}
          <Chip mono tone="mute">
            {ext.sections.length} section{ext.sections.length === 1 ? '' : 's'}
          </Chip>
          {ext.submission_deadline && (
            <Chip tone="amber" mono>
              due {ext.submission_deadline.slice(0, 10)}
            </Chip>
          )}
        </div>
      </div>
    )
  }

  if (ext.kind === 'paper-section') {
    return (
      <div className={styles.summaryRow}>
        <div className={styles.summaryChips}>
          <Chip mono tone="mute">§{ext.section_order}</Chip>
          <Chip mono tone="mute">{ext.status}</Chip>
          <Chip mono tone="mute">
            {ext.claims.length} claim{ext.claims.length === 1 ? '' : 's'}
          </Chip>
        </div>
      </div>
    )
  }

  if (ext.kind === 'paper-claim') {
    return (
      <div className={styles.summaryRow}>
        <p className={styles.claimText}>{ext.claim_text}</p>
        <div className={styles.summaryChips}>
          <Chip
            mono
            tone={
              ext.citation_status === 'unsourced' ||
              ext.citation_status === 'unsupported'
                ? 'rose'
                : ext.citation_status === 'citation-attached'
                ? 'sage'
                : 'mute'
            }
          >
            {ext.citation_status}
          </Chip>
        </div>
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

  if (ext.kind === 'feature-pr') {
    // diff_summary lives in ExtensionSummary (visible at structure too); detail
    // zoom only adds the canonical PR anchor that's noisy at structure zoom.
    return (
      <div className={styles.detail}>
        <SectionLabel>pr</SectionLabel>
        <p className={styles.anchorLine}>{ext.github_pr_anchor.uri}</p>
      </div>
    )
  }

  // paper-claim: claim_text and citation_status are already shown by
  // ExtensionSummary; the per-claim evidence chain lives in EvidenceEdges.
  // Nothing extra to surface at detail zoom from this kind alone.
  if (ext.kind === 'paper-claim') {
    return null
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

  if (ext.kind === 'paper-campaign') {
    return (
      <div className={styles.detail}>
        <SectionLabel>anchors</SectionLabel>
        <ul className={styles.anchorList}>
          <li>draft: {ext.draft_anchor.uri}</li>
          <li>citations: {ext.citation_library_anchor.uri}</li>
        </ul>
      </div>
    )
  }

  if (ext.kind === 'paper-section') {
    return (
      <div className={styles.detail}>
        <SectionLabel>draft</SectionLabel>
        <p className={styles.anchorLine}>{ext.draft_anchor.uri}</p>
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
  if (ext.kind === 'feature-pr') {
    return (
      <span className={styles.childFigure}>
        <Chip
          mono
          tone={ext.ci_status === 'failing' ? 'rose' : ext.ci_status === 'passing' ? 'sage' : 'mute'}
        >
          ci · {ext.ci_status}
        </Chip>
        <Chip
          mono
          tone={
            ext.review_status === 'changes-requested'
              ? 'amber'
              : ext.review_status === 'approved'
              ? 'sage'
              : 'mute'
          }
        >
          {ext.review_status}
        </Chip>
      </span>
    )
  }
  if (ext.kind === 'paper-section') {
    return (
      <span className={styles.childFigure}>
        <Chip mono tone="mute">§{ext.section_order}</Chip>
        <Chip mono tone="mute">{ext.status}</Chip>
        <Chip mono tone="mute">
          {ext.claims.length} claim{ext.claims.length === 1 ? '' : 's'}
        </Chip>
      </span>
    )
  }
  if (ext.kind === 'paper-claim') {
    return (
      <span className={styles.childFigure}>
        <Chip mono tone="mute">{ext.citation_status}</Chip>
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
