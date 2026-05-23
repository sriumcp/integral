/**
 * Nous campaign projection plugin — structure + detail.
 *
 * The campaign's projection talks about the *research arc*: what's being
 * investigated, how it's been decomposed across iterations, and what's
 * been learned (status of each iteration's h_main). The structure-zoom
 * prose stays close ("what's happening now"); the detail-zoom prose
 * widens to the full narrative.
 *
 * Discipline: prompts include the explicit char budget for structure;
 * the engine clamps post-hoc as a safety net. v0.1 builds prompts from
 * raw template strings — v0.2 may move to typed prompt builders.
 */

import type { Intent, IntentState, Workspace } from '../../schema'
import type { KindProjectionPlugin, ProjectionContext } from '../projection'

// ─── Helpers ───────────────────────────────────────────────────────────────

interface IterationRow {
  title: string
  iterationNumber: number
  family: string
  status: string
  hMainResult: string | null
}

function gatherIterations(
  workspace: Workspace,
  parent: Intent
): IterationRow[] {
  const childIds = new Set(parent.decomposition.children)
  return workspace.intents
    .filter((i) => childIds.has(i.id) && i.kind === 'nous-iteration')
    .map((iter) => {
      const state = workspace.states.find((s) => s.intent_id === iter.id)
      const ext = iter.extension
      const hMain =
        ext.kind === 'nous-iteration' ? ext.hypothesis_bundle.h_main : null
      return {
        title: iter.declaration.title,
        iterationNumber: ext.kind === 'nous-iteration' ? ext.iteration_number : -1,
        family: iter.tags?.[0] ?? 'unknown',
        status: state?.status ?? 'unknown',
        hMainResult: hMain?.result ?? null,
      }
    })
    .sort((a, b) => a.iterationNumber - b.iterationNumber)
}

function renderIterationLines(rows: IterationRow[]): string {
  if (rows.length === 0) return '(no iterations yet)'
  return rows
    .map(
      (r) =>
        `  - iter-${r.iterationNumber} (family=${r.family}, status=${r.status}, h_main=${r.hMainResult ?? 'pending'})`
    )
    .join('\n')
}

function campaignContextBlock(
  intent: Intent,
  state: IntentState,
  workspace: Workspace
): string {
  const ext = intent.extension
  const rq =
    ext.kind === 'nous-campaign'
      ? ext.research_question
      : '(no research question)'
  const iters = gatherIterations(workspace, intent)
  return [
    `Title: ${intent.declaration.title}`,
    `Status: ${state.status}`,
    `Research question: ${rq}`,
    intent.declaration.summary
      ? `Summary: ${intent.declaration.summary}`
      : '',
    `Iterations:\n${renderIterationLines(iters)}`,
    intent.tags && intent.tags.length > 0
      ? `Tags: ${intent.tags.join(', ')}`
      : '',
  ]
    .filter(Boolean)
    .join('\n')
}

// ─── Plugin ────────────────────────────────────────────────────────────────

export const nousCampaignPlugin: KindProjectionPlugin = {
  kind: 'nous-campaign',

  async structure(ctx: ProjectionContext) {
    const block = campaignContextBlock(ctx.intent, ctx.state, ctx.workspace)
    const prompt = [
      'You are rendering a one-paragraph "structure-zoom" projection of a Nous research campaign.',
      'The reader is a researcher scanning their workspace; they want to know, at a glance, what this campaign is investigating and where it stands today.',
      '',
      '# Campaign',
      block,
      '',
      '# Output requirements',
      '- ≤800 characters total. Do not exceed this budget.',
      '- One paragraph. No headers, no bullet lists, no markdown.',
      '- Lead with what is being investigated; follow with where it stands and what (if anything) has been learned.',
      '- Plain prose. Do not address the reader. Do not add a preamble like "This campaign is investigating…" — start with the substance.',
    ].join('\n')
    const content = await ctx.llm.generate(prompt)
    return { content, source: 'llm' as const }
  },

  async detail(ctx: ProjectionContext) {
    const block = campaignContextBlock(ctx.intent, ctx.state, ctx.workspace)
    const prompt = [
      'You are rendering a "detail-zoom" projection of a Nous research campaign — a multi-paragraph narrative for a researcher who wants to dig in.',
      'The reader is reviewing this campaign in depth; they want to understand the research arc, what each iteration tested, what was learned, and where the work stands.',
      '',
      '# Campaign',
      block,
      '',
      '# Output requirements',
      '- 2 to 4 paragraphs.',
      '- No markdown headers, no bullet lists. Plain prose paragraphs separated by blank lines.',
      '- First paragraph: the research question and what motivated this campaign.',
      '- Middle paragraph(s): what each iteration tested, in order, and what its h_main outcome implies. Be specific about confirmed vs refuted vs inconclusive — refutation is a finished outcome of doing science, not a failure.',
      '- Final paragraph: where the campaign stands today and what (if anything) is open.',
      '- Plain prose. Do not address the reader. Do not start with "This campaign…".',
    ].join('\n')
    const content = await ctx.llm.generate(prompt)
    return { content, source: 'llm' as const }
  },
}
