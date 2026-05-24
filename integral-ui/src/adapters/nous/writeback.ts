/**
 * Nous writeback — serialize a typed `Intent` + adapter-private
 * `NousWritebackConfig` into a `campaign.yaml` consumable by the Nous
 * CLI (https://github.com/AI-native-Systems-Research/agentic-strategy-evolution).
 *
 * Discipline:
 *  - Pure function. No fs, no network. Browser-safe.
 *  - The universal schema stays clean: Nous-specific writeback fields
 *    (max_iterations, target_system) live in `NousWritebackConfig`,
 *    not in `NousCampaignExtension`. Each future writeback-capable
 *    adapter (Coral, Paper, Feature) gets its own writeback config
 *    shape rather than fattening the schema with adapter specifics.
 *  - Refuse-overwrite happens at the file-system layer (see
 *    `vite-plugin-nous-adapter/writeback-handler.ts`); this module
 *    just serializes and validates the *shape* via `safeParse`.
 */

import { stringify as stringifyYaml } from 'yaml'
import { z } from 'zod'
import type { Intent } from '../../schema'

// ─── NousWritebackConfig ───────────────────────────────────────────────────

export const NousWritebackConfigSchema = z.object({
  /** Caps the campaign's iteration loop; the Nous CLI honors this. */
  max_iterations: z.number().int().positive(),
  /** Target system the campaign investigates. The CLI's planner explores
   *  this repo to discover metrics + knobs unless they're specified
   *  explicitly below. */
  target_system: z.object({
    name: z.string().min(1),
    description: z.string().min(1),
    repo_path: z.string().min(1),
  }),
  /** Optional run_id override. When omitted, the serializer derives a
   *  slug from `intent.declaration.title`. */
  run_id: z.string().min(1).optional(),
  /** Optional planner hints. When omitted, Nous discovers them by
   *  exploring the codebase. */
  observable_metrics: z.array(z.string().min(1)).optional(),
  controllable_knobs: z.array(z.string().min(1)).optional(),
})

export type NousWritebackConfig = z.infer<typeof NousWritebackConfigSchema>

// ─── derivedRunId ──────────────────────────────────────────────────────────

const RUN_ID_MAX = 64

/**
 * Slugify a free-form title into a Nous-friendly `run_id`. Lowercase,
 * dashes for whitespace, drops non-alphanumerics-except-dashes, collapses
 * runs of dashes, trims leading/trailing dashes, clamps to 64 chars.
 */
export function derivedRunId(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug.slice(0, RUN_ID_MAX).replace(/-+$/, '')
}

// ─── serializeNousCampaign ─────────────────────────────────────────────────

/**
 * Convert a typed `nous-campaign` Intent + `NousWritebackConfig` into a
 * YAML string the Nous CLI accepts. Throws if the intent isn't a
 * `nous-campaign` — callers should narrow on `intent.extension.kind`
 * before invoking this.
 */
export function serializeNousCampaign(
  intent: Intent,
  config: NousWritebackConfig
): string {
  if (intent.kind !== 'nous-campaign') {
    throw new Error(
      `serializeNousCampaign: expected nous-campaign, got ${intent.kind}`
    )
  }
  if (intent.extension.kind !== 'nous-campaign') {
    throw new Error(
      `serializeNousCampaign: extension.kind mismatch — got ${intent.extension.kind}`
    )
  }

  const runId = config.run_id ?? derivedRunId(intent.declaration.title)
  const research_question = intent.extension.research_question

  // Build the YAML payload. Property order matches the Nous README's
  // example for legibility on disk.
  const payload: Record<string, unknown> = {
    research_question,
    run_id: runId,
    max_iterations: config.max_iterations,
    target_system: {
      name: config.target_system.name,
      description: config.target_system.description,
      repo_path: config.target_system.repo_path,
    },
  }
  if (config.observable_metrics && config.observable_metrics.length > 0) {
    payload.observable_metrics = config.observable_metrics
  }
  if (config.controllable_knobs && config.controllable_knobs.length > 0) {
    payload.controllable_knobs = config.controllable_knobs
  }

  return stringifyYaml(payload, { lineWidth: 100 })
}
