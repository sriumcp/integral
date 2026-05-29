/**
 * Shaping companion data — typed shape of a draft Intent's resolved-field
 * set + writeback template. The schema doesn't model "pending" (every
 * required field has a concrete value); `DraftShape.resolvedFields` is
 * the source of truth for whether the dialog has confirmed each field,
 * and commit is gated on its completeness.
 *
 * v0.2.0 collapsed this module from `src/fixtures/shaping.ts` after the
 * fixture file (and the scripted-dialog fixture drafts) were removed.
 * The surviving path is LLM-driven shaping: a user clicks `+ new nous
 * campaign`, the substrate creates a blank draft via
 * `blankNousDraftShape()`, and the conversation with the shaper
 * progressively resolves fields.
 */

import type { Party } from '@/schema'
import type { NousWritebackConfig } from '@/adapters/nous/writeback'

export interface DialogTurn {
  speaker: Party
  body: string
  at: string
}

/**
 * Adapter-private writeback template a Nous draft surfaces in the
 * Shaping form. Pre-fills sensible defaults; the user can override
 * before commit.
 */
export type WritebackTemplate = Partial<NousWritebackConfig>

export interface DraftShape {
  /** Dot-separated field paths the dialog (or LLM shaper) has confirmed.
   *  Anything missing here surfaces in the IntentDraftPane as `⚠ pending`. */
  resolvedFields: ReadonlySet<string>
  /** All fields the surface checks for completeness. Authored per draft
   *  shape so the pane can list pending fields by name without inferring
   *  the schema shape. */
  requiredFields: ReadonlyArray<string>
  dialog: ReadonlyArray<DialogTurn>
  /** Optional pre-fill for the writeback form. Present for kinds that
   *  support writeback (currently nous-campaign). */
  writeback_template?: WritebackTemplate
}

const NOUS_FIELDS = [
  'declaration.title',
  'declaration.summary',
  'declaration.success_criterion',
  'extension.research_question',
  'holder',
  'knowledge_refs',
] as const

/**
 * A "blank" draft shape — used when the user creates a new draft via
 * `+ new nous campaign`. The empty `dialog` field signals to
 * ShapingSurface that LLM-shaping is active (ShapingChat is the only
 * conversational path in v0.2.0). The writeback_template ships sensible
 * defaults the user can override before commit.
 */
export function blankNousDraftShape(): DraftShape {
  return {
    requiredFields: [...NOUS_FIELDS],
    resolvedFields: new Set(),
    dialog: [],
    writeback_template: {
      max_iterations: 5,
      target_system: {
        name: '',
        description: '',
        repo_path: '',
      },
    },
  }
}
