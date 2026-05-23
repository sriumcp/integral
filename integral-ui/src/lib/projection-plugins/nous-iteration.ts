/**
 * Nous iteration projection plugin — structure + detail.
 *
 * The iteration's projection talks about *what was hypothesized, what
 * happened, and what was learned* in this single iteration. Structure
 * zoom is a tight one-paragraph rendering; detail zoom widens to a
 * multi-paragraph narrative including the parent campaign's context
 * and how this iteration relates to siblings.
 */

import type { Intent, IntentState, Workspace } from '../../schema'
import type { KindProjectionPlugin, ProjectionContext } from '../projection'

// ─── Helpers ───────────────────────────────────────────────────────────────

function findParentCampaign(
  workspace: Workspace,
  iterationId: string
): Intent | undefined {
  return workspace.intents.find(
    (i) =>
      i.kind === 'nous-campaign' &&
      i.decomposition.children.includes(iterationId)
  )
}

function iterationContextBlock(
  intent: Intent,
  state: IntentState,
  workspace: Workspace,
  zoom: 'structure' | 'detail'
): string {
  const ext = intent.extension
  const hMain =
    ext.kind === 'nous-iteration' ? ext.hypothesis_bundle.h_main : null
  const iterationNumber =
    ext.kind === 'nous-iteration' ? ext.iteration_number : -1
  const family = intent.tags?.[0] ?? 'unknown'

  const parent = findParentCampaign(workspace, intent.id)
  const parentRq =
    parent?.extension.kind === 'nous-campaign'
      ? parent.extension.research_question
      : null

  const lines = [
    `Title: ${intent.declaration.title}`,
    `Iteration number: ${iterationNumber}`,
    `Family: ${family}`,
    `Status: ${state.status}`,
    hMain ? `Hypothesis (h_main): ${hMain.statement}` : '',
    hMain ? `Prediction: ${hMain.prediction}` : '',
    hMain?.result ? `h_main result: ${hMain.result}` : 'h_main result: pending',
  ]

  if (parent && parentRq) {
    lines.push('')
    lines.push(`Parent campaign: ${parent.declaration.title}`)
    lines.push(`Parent research question: ${parentRq}`)
  }

  // Detail zoom adds sibling iterations for cross-iter context.
  if (zoom === 'detail' && parent) {
    const siblings = workspace.intents
      .filter(
        (i) =>
          i.kind === 'nous-iteration' &&
          parent.decomposition.children.includes(i.id) &&
          i.id !== intent.id
      )
      .map((sib) => {
        const sExt = sib.extension
        const sIter =
          sExt.kind === 'nous-iteration' ? sExt.iteration_number : -1
        const sResult =
          sExt.kind === 'nous-iteration'
            ? sExt.hypothesis_bundle.h_main.result ?? 'pending'
            : 'unknown'
        return `iter-${sIter} (${sResult})`
      })
    if (siblings.length > 0) {
      lines.push('')
      lines.push(`Sibling iterations: ${siblings.join(', ')}`)
    }
  }

  return lines.filter(Boolean).join('\n')
}

// ─── Plugin ────────────────────────────────────────────────────────────────

export const nousIterationPlugin: KindProjectionPlugin = {
  kind: 'nous-iteration',

  async structure(ctx: ProjectionContext) {
    const block = iterationContextBlock(
      ctx.intent,
      ctx.state,
      ctx.workspace,
      'structure'
    )
    const prompt = [
      'You are rendering a one-paragraph "structure-zoom" projection of a single Nous iteration.',
      'The reader is a researcher inspecting this iteration; they want to know what was hypothesized, what was measured, and what the outcome implies — in tight prose.',
      '',
      '# Iteration',
      block,
      '',
      '# Output requirements',
      '- ≤800 characters total. Do not exceed this budget.',
      '- One paragraph. No headers, no bullet lists, no markdown.',
      '- Lead with what was hypothesized (h_main) and what would count as confirmation.',
      '- Then state the outcome (confirmed / refuted / inconclusive / pending) and what it implies for the parent campaign\'s research question.',
      '- Refutation is a finished, informative outcome — never describe it as a failure.',
      '- Plain prose. Do not address the reader. Do not start with "This iteration…".',
    ].join('\n')
    const content = await ctx.llm.generate(prompt)
    return { content, source: 'llm' as const }
  },

  async detail(ctx: ProjectionContext) {
    const block = iterationContextBlock(
      ctx.intent,
      ctx.state,
      ctx.workspace,
      'detail'
    )
    const prompt = [
      'You are rendering a "detail-zoom" projection of a single Nous iteration — a multi-paragraph narrative for a researcher who wants to understand this iteration in depth.',
      'The reader wants to see how this iteration relates to its parent campaign and to its sibling iterations, what was tested, and what the outcome implies for the broader research arc.',
      '',
      '# Iteration',
      block,
      '',
      '# Output requirements',
      '- 2 to 3 paragraphs.',
      '- No markdown headers, no bullet lists. Plain prose paragraphs separated by blank lines.',
      '- First paragraph: what this iteration tested (h_main and prediction) and how it fits into the parent campaign\'s arc.',
      '- Second paragraph: what the outcome implies — for the campaign\'s research question, for the relationship to sibling iterations, and for what would be worth testing next.',
      '- Optional third paragraph if there is a meaningful boundary condition or applicability note worth surfacing.',
      '- Refutation is a finished, informative outcome.',
      '- Plain prose. Do not address the reader. Do not start with "This iteration…".',
    ].join('\n')
    const content = await ctx.llm.generate(prompt)
    return { content, source: 'llm' as const }
  },
}
