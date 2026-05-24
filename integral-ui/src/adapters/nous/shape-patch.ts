/**
 * Shape patch — partial updates the LLM emits during the shaping
 * conversation. The browser merges patches into the in-memory draft as
 * the LLM extracts fields from the user's natural-language prompts.
 *
 * Discipline:
 *  - Pure function. No fs, no network, no LLM. Browser-safe.
 *  - **Constrained patch shape.** The LLM can only patch fields the
 *    user could plausibly want shaped: declaration.{title, summary,
 *    success_criterion}, extension.research_question (for nous-campaign),
 *    tags, and the writeback config. It cannot patch holder, lifetime,
 *    provenance, schema_version, kind, or extension.kind — those are
 *    structurally critical and out of bounds for a clarification LLM.
 *  - **Additive merge.** Patches fill empty fields and overwrite existing
 *    ones. A field undefined in the patch leaves the state untouched.
 *    Removal requires explicit user gesture (clicking a field + deleting),
 *    not LLM action — keeps the LLM safe by default.
 *  - **Immutable.** Returns a fresh state object; never mutates the input.
 */

import type { Intent } from '../../schema'
import type { NousWritebackConfig } from './writeback'

export interface DraftState {
  intent: Intent
  writeback: NousWritebackConfig
}

/** The whitelist of fields the LLM can patch. Any other field present
 *  in a payload is silently dropped by the applier. */
export interface ShapePatch {
  intent?: {
    declaration?: {
      title?: string
      summary?: string
      success_criterion?: string
    }
    extension?: {
      // Only nous-campaign-extension fields are LLM-patchable in v0.1.
      research_question?: string
    }
    tags?: ReadonlyArray<string>
  }
  writeback?: {
    max_iterations?: number
    target_system?: {
      name?: string
      description?: string
      repo_path?: string
    }
    run_id?: string
  }
}

export function applyShapePatch(
  state: DraftState,
  patch: ShapePatch | null
): DraftState {
  if (!patch) {
    // Defensive copy so callers can rely on referential identity changes
    // when a non-null patch arrives.
    return { intent: state.intent, writeback: state.writeback }
  }

  let intent = state.intent
  if (patch.intent) {
    intent = applyIntentPatch(intent, patch.intent)
  }

  let writeback = state.writeback
  if (patch.writeback) {
    writeback = applyWritebackPatch(writeback, patch.writeback)
  }

  return { intent, writeback }
}

function applyIntentPatch(
  intent: Intent,
  patch: NonNullable<ShapePatch['intent']>
): Intent {
  let next: Intent = intent

  if (patch.declaration) {
    next = {
      ...next,
      declaration: applyDeclarationPatch(next.declaration, patch.declaration),
    }
  }

  if (patch.extension && next.extension.kind === 'nous-campaign') {
    if (patch.extension.research_question !== undefined) {
      next = {
        ...next,
        extension: {
          ...next.extension,
          research_question: patch.extension.research_question,
        },
      }
    }
  }

  if (patch.tags !== undefined) {
    next = { ...next, tags: [...patch.tags] }
  }

  return next
}

function applyDeclarationPatch(
  declaration: Intent['declaration'],
  patch: NonNullable<NonNullable<ShapePatch['intent']>['declaration']>
): Intent['declaration'] {
  return {
    ...declaration,
    ...(patch.title !== undefined ? { title: patch.title } : {}),
    ...(patch.summary !== undefined ? { summary: patch.summary } : {}),
    ...(patch.success_criterion !== undefined
      ? { success_criterion: patch.success_criterion }
      : {}),
  }
}

function applyWritebackPatch(
  writeback: NousWritebackConfig,
  patch: NonNullable<ShapePatch['writeback']>
): NousWritebackConfig {
  let next: NousWritebackConfig = writeback

  if (patch.max_iterations !== undefined) {
    next = { ...next, max_iterations: patch.max_iterations }
  }

  if (patch.target_system) {
    next = {
      ...next,
      target_system: {
        ...next.target_system,
        ...(patch.target_system.name !== undefined
          ? { name: patch.target_system.name }
          : {}),
        ...(patch.target_system.description !== undefined
          ? { description: patch.target_system.description }
          : {}),
        ...(patch.target_system.repo_path !== undefined
          ? { repo_path: patch.target_system.repo_path }
          : {}),
      },
    }
  }

  if (patch.run_id !== undefined) {
    next = { ...next, run_id: patch.run_id }
  }

  return next
}
