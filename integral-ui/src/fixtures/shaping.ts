/**
 * Shaping companion data — dialog turns + resolved-field sets per draft.
 *
 * Lives outside `workspace.ts` because it isn't part of the schema fixture.
 * The schema doesn't model "pending" — every required field has a concrete
 * value. The resolved-field set is the v0.1 source of truth for whether
 * the dialog has confirmed each field; commit is gated on this set being
 * complete (per goals.md Item 4).
 */

import type { Party } from '@/schema'
import {
  DRAFT_CORAL_ID,
  DRAFT_NOUS_ID,
  coralOrch,
  nousPlanner,
  sri,
} from './workspace'

export interface DialogTurn {
  speaker: Party
  body: string
  at: string
}

export interface DraftShape {
  /** Dot-separated field paths the dialog has confirmed. Anything missing
   *  here surfaces in the IntentDraftPane as `⚠ pending`. */
  resolvedFields: ReadonlySet<string>
  /** All fields the surface checks for completeness. Authored per draft so
   *  the pane can list pending fields by name without inferring the schema
   *  shape. v0.2 will replace this with schema introspection. */
  requiredFields: ReadonlyArray<string>
  dialog: ReadonlyArray<DialogTurn>
}

const NOUS_FIELDS = [
  'declaration.title',
  'declaration.summary',
  'declaration.success_criterion',
  'extension.research_question',
  'holder',
  'knowledge_refs',
] as const

const CORAL_FIELDS = [
  'declaration.title',
  'declaration.summary',
  'declaration.success_criterion',
  'extension.scoring_function_ref',
  'extension.search_algorithm',
  'extension.population_size',
] as const

export const SHAPING_BY_ID: Record<string, DraftShape> = {
  // Fully formed Nous draft — every field resolved, commit is enabled.
  [DRAFT_NOUS_ID]: {
    requiredFields: [...NOUS_FIELDS],
    resolvedFields: new Set(NOUS_FIELDS),
    dialog: [
      {
        speaker: sri,
        body: 'I want to look at whether mutations conditioned on evaluator output produce structurally different optimization paths.',
        at: '2026-05-22T16:00:00Z',
      },
      {
        speaker: nousPlanner,
        body: 'To shape this — is the goal to *understand* the mechanism, or to ship a better optimizer?',
        at: '2026-05-22T16:01:00Z',
      },
      {
        speaker: sri,
        body: 'Understand. I want principles for *when* evaluator-conditioning helps, not just a better number.',
        at: '2026-05-22T16:02:00Z',
      },
      {
        speaker: nousPlanner,
        body: 'Good — that confirms nous-campaign, not coral-optimization. Should the methodology ledger come from v3, or do you want a fresh corpus?',
        at: '2026-05-22T16:03:00Z',
      },
      {
        speaker: sri,
        body: 'v3 methodology, plus the principles ledger from the plateau study.',
        at: '2026-05-22T16:04:00Z',
      },
      {
        speaker: nousPlanner,
        body: 'Locked. Ready to commit; iter-1 hypothesis bundle can be drafted as a child once this campaign is active.',
        at: '2026-05-22T16:05:00Z',
      },
    ],
  },
  // Partial Coral draft — scoring_function_ref still pending, commit disabled.
  [DRAFT_CORAL_ID]: {
    requiredFields: [...CORAL_FIELDS],
    resolvedFields: new Set([
      'declaration.title',
      'extension.search_algorithm',
      'extension.population_size',
    ]),
    dialog: [
      {
        speaker: sri,
        body: 'Searching for a candidate scoring function across the v3 evaluator family.',
        at: '2026-05-22T16:30:00Z',
      },
      {
        speaker: coralOrch,
        body: 'Three quick questions: which search algorithm, what population size, and which scoring function reference?',
        at: '2026-05-22T16:31:00Z',
      },
      {
        speaker: sri,
        body: 'Beam search, population 8.',
        at: '2026-05-22T16:32:00Z',
      },
      {
        speaker: coralOrch,
        body: 'Got it. The scoring function reference?',
        at: '2026-05-22T16:33:00Z',
      },
      {
        speaker: sri,
        body: 'Still figuring that out. Let me think on it.',
        at: '2026-05-22T16:34:00Z',
      },
      {
        speaker: coralOrch,
        body: 'Acknowledged — leaving scoring_function_ref pending. Search algorithm + population locked; commit blocked until you nail down the score.',
        at: '2026-05-22T16:35:00Z',
      },
    ],
  },
}

export function shapingFor(intentId: string): DraftShape | undefined {
  return SHAPING_BY_ID[intentId]
}
