/**
 * visual-data-shapes — input shapes for cross-adapter visual atoms.
 *
 * Atoms (`PrinciplesTempo`, `HypothesisGrid`, future `BestSoFarLine`)
 * are surface-agnostic: they take typed structured data and render
 * SVG. This module owns the data-shape contract so:
 *
 *  1. Adapters' projection-data helpers (e.g. `nous-projection-data.ts`)
 *     import shapes from here without depending on the components
 *     layer (atoms are *consumers* of these shapes; libs shouldn't
 *     depend on UI).
 *
 *  2. The schema layer's enums (e.g. `HypothesisResult`) re-export
 *     directly so there's *one* source of truth — the schema — with
 *     this module as the bridge that keeps the atom layer schema-aware
 *     without making atoms import from `@/schema` themselves.
 *
 * Atoms re-export these shapes via their barrel (`@/components/atoms`)
 * for caller convenience; both surfaces (`@/lib/...` and
 * `@/components/atoms`) point at the same source.
 */

// Re-export the schema's HypothesisResult so the atom + the helper +
// the schema are *literally* the same type. Eliminates the drift hazard
// that a duplicated enum would carry.
export type { HypothesisResult } from '@/schema'

import type { HypothesisResult } from '@/schema'

/** PrinciplesTempo — per-iteration principle counts (the atom cumulates
 *  internally). */
export interface PrinciplesTempoDatum {
  /** Iteration index. Should be unique across the input array — duplicates
   *  produce undefined behavior in the cumulative-step layout. */
  iterationNumber: number
  /** Number of principles emitted *during* this iteration (NOT cumulative). */
  principlesEmitted: number
}

/** HypothesisGrid — per-row datum, position-labeled for cross-iteration
 *  alignment. */
export interface HypothesisGridDatum {
  /** Stable label tying this row across iterations. Adapter convention:
   *  `'h_main'`, `'h_ablation[0]'`, `'h_super_additivity'`,
   *  `'h_control_negative'`, `'h_robustness[0]'`, etc. */
  label: string
  /** Optional result. When undefined, no cell is emitted at this
   *  position — the position exists in the iteration but wasn't probed
   *  at that point. */
  result?: HypothesisResult
}

/** HypothesisGrid — one column, with the per-row data for that
 *  iteration. */
export interface HypothesisGridIteration {
  iterationNumber: number
  hypotheses: ReadonlyArray<HypothesisGridDatum>
}

/** HMainTimeline — per-iteration h_main result. The atom renders as a
 *  1×N strip, semantically a degenerate slice of HypothesisGrid (one
 *  row, N columns) that earns its own atom because:
 *    1. It renders on v0.1 data (only h_main lands today; gap G-N-9).
 *    2. The strip metaphor reads differently from a "matrix" — it's a
 *       *trajectory* of the main hypothesis, not a comparison of many.
 *  When G-N-9 promotes, both atoms coexist: HMainTimeline as the
 *  campaign's spine; HypothesisGrid as the full ablation matrix. */
export interface HMainTimelineDatum {
  /** Iteration index. */
  iterationNumber: number
  /** Optional result. When undefined, no cell is emitted at this
   *  position — the iteration ran without probing h_main, or the
   *  iteration is the synthetic baseline (iter 0). */
  result?: HypothesisResult
}
