/**
 * nous-projection-data — pure derivations from a Nous campaign +
 * workspace to atom-input shapes.
 *
 * The atoms (PrinciplesTempo, HypothesisGrid) are surface-agnostic
 * presentational primitives. These helpers do the campaign-shaped
 * aggregation: walk `campaign.decomposition.children`, filter to
 * nous-iteration extension kind, sort by iteration_number, and
 * project the atom-input shape.
 *
 * Pure: no React, no fetch, no DOM. Unit-testable as plain data.
 */

import type {
  Hypothesis,
  Intent,
  NousIterationExtension,
  Workspace,
} from '@/schema'
import type {
  HMainTimelineDatum,
  HypothesisGridDatum,
  HypothesisGridIteration,
  PrinciplesTempoDatum,
} from './visual-data-shapes'

/**
 * Resolve `campaign.decomposition.children` to typed nous-iteration
 * intents, sorted by iteration_number ascending. Two defensive
 * branches:
 *
 *  - **Missing from workspace** — silently dropped. Map / Detail
 *    render partial data rather than blocking on a single bad child;
 *    the canonical gate is schema validation upstream.
 *  - **Wrong extension kind** — `console.warn` once and dropped.
 *    Reaching this branch implies an adapter bug (children kind ↔
 *    parent kind coupling violated) that schema's `WorkspaceSchema`
 *    refine should have caught. Per CLAUDE.md ("adapters MUST
 *    reject objects whose version they don't understand"), silent
 *    drop hides the failure mode adapters are supposed to be loud
 *    about — so we make noise during dev without crashing the render.
 */
function resolveIterations(
  campaign: Intent,
  workspace: Workspace
): Array<{ intent: Intent; ext: NousIterationExtension }> {
  const byId = new Map(workspace.intents.map((i) => [i.id, i]))
  const out: Array<{ intent: Intent; ext: NousIterationExtension }> = []
  for (const childId of campaign.decomposition.children) {
    const child = byId.get(childId)
    if (!child) continue
    if (child.extension.kind !== 'nous-iteration') {
      // Loud-on-anomaly: a nous-campaign should never have a non-
      // iteration child. If we reach this, the adapter or merge
      // produced invalid state.
      // eslint-disable-next-line no-console
      console.warn(
        `[nous-projection-data] campaign ${campaign.id} references child ${child.id} ` +
          `with extension.kind=${child.extension.kind} (expected nous-iteration); skipping.`
      )
      continue
    }
    out.push({ intent: child, ext: child.extension })
  }
  out.sort((a, b) => a.ext.iteration_number - b.ext.iteration_number)
  return out
}

/**
 * Per-iteration principle counts for the PrinciplesTempo atom.
 *
 * Returns one row per child iteration, in iteration_number order.
 * The atom cumulates internally; this helper returns the *delta*
 * per iteration. The schema makes `principles_emitted` optional
 * (zod.ts:268: `Reference[]?`) — when undefined OR an empty array,
 * the helper reports zero, equivalent to "this iteration produced
 * no principles."
 */
export function nousPrinciplesTempo(
  campaign: Intent,
  workspace: Workspace
): PrinciplesTempoDatum[] {
  const iters = resolveIterations(campaign, workspace)
  return iters.map(({ ext }) => ({
    iterationNumber: ext.iteration_number,
    principlesEmitted: ext.principles_emitted?.length ?? 0,
  }))
}

/**
 * Per-iteration hypothesis state for the HypothesisGrid atom.
 *
 * Returns one HypothesisGridIteration per child, with hypotheses
 * labeled by stable position-derived names (`h_main`, `h_ablation[i]`,
 * `h_super_additivity`, `h_control_negative`, `h_robustness[i]`) so
 * the atom can align rows across iterations even when the underlying
 * hypothesis text differs.
 *
 * Hypotheses without a result are emitted with `result: undefined`
 * — the atom interprets that as "position exists but wasn't probed
 * at this iteration" and renders no cell.
 */
export function nousHypothesisGrid(
  campaign: Intent,
  workspace: Workspace
): HypothesisGridIteration[] {
  const iters = resolveIterations(campaign, workspace)
  return iters.map(({ ext }) => {
    const bundle = ext.hypothesis_bundle
    const hypotheses: HypothesisGridDatum[] = []

    hypotheses.push(toGridDatum('h_main', bundle.h_main))
    bundle.h_ablation.forEach((h, i) => {
      hypotheses.push(toGridDatum(`h_ablation[${i}]`, h))
    })
    if (bundle.h_super_additivity) {
      hypotheses.push(toGridDatum('h_super_additivity', bundle.h_super_additivity))
    }
    if (bundle.h_control_negative) {
      hypotheses.push(toGridDatum('h_control_negative', bundle.h_control_negative))
    }
    bundle.h_robustness?.forEach((h, i) => {
      hypotheses.push(toGridDatum(`h_robustness[${i}]`, h))
    })

    return { iterationNumber: ext.iteration_number, hypotheses }
  })
}

function toGridDatum(label: string, hyp: Hypothesis): HypothesisGridDatum {
  if (hyp.result === undefined) return { label }
  return { label, result: hyp.result }
}

/**
 * Per-iteration h_main result for the HMainTimeline atom.
 *
 * Returns one HMainTimelineDatum per child iteration in
 * iteration_number order. The atom expects sorted input — this helper
 * is the only call site that produces it.
 *
 * Iterations whose h_main has no result (the synthetic baseline at
 * iter 0, or an iteration that didn't probe h_main) emit a datum
 * with `result: undefined`; the atom interprets that as "iteration
 * ran but wasn't probed" and skips the cell while keeping the
 * iteration-number label visible. That's load-bearing for the
 * "this iteration ran but we don't know the outcome" story.
 */
export function nousHMainTimeline(
  campaign: Intent,
  workspace: Workspace
): HMainTimelineDatum[] {
  const iters = resolveIterations(campaign, workspace)
  return iters.map(({ ext }) => {
    const result = ext.hypothesis_bundle.h_main.result
    if (result === undefined) return { iterationNumber: ext.iteration_number }
    return { iterationNumber: ext.iteration_number, result }
  })
}
