/**
 * Seed shaping data — DraftShape for the test seed workspace's draft
 * Nous campaign. Test scaffolding only.
 *
 * v0.2.0 dropped the Coral draft + scripted-dialog turns from v0.1 along
 * with the rest of the runtime fixture; only one draft shape survives,
 * fully resolved (commit-enabled) so the Shaping surface tests can
 * exercise the green-path commit flow.
 */

import type { DraftShape } from '@/lib/draft-shape'
import { sri, nousPlanner, DRAFT_NOUS_ID } from './seed-workspace'

const NOUS_FIELDS = [
  'declaration.title',
  'declaration.summary',
  'declaration.success_criterion',
  'extension.research_question',
  'holder',
  'knowledge_refs',
] as const

export const SEED_SHAPING_BY_ID: Record<string, DraftShape> = {
  [DRAFT_NOUS_ID]: {
    requiredFields: [...NOUS_FIELDS],
    resolvedFields: new Set(NOUS_FIELDS),
    writeback_template: {
      max_iterations: 5,
      target_system: {
        name: 'inference-sim',
        description:
          'Discrete-event LLM inference simulator with multi-tenant scheduling.',
        repo_path: '~/Documents/Projects/inference-sim',
      },
    },
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
    ],
  },
}

export function seedShapingFor(intentId: string): DraftShape | undefined {
  return SEED_SHAPING_BY_ID[intentId]
}
