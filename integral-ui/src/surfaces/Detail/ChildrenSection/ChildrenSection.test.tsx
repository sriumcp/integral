/**
 * ChildrenSection — behavioral tests.
 *
 * The structural body is the only place per-kind specialization lives in
 * the Detail surface chrome. Tests verify:
 *   - Each kind renders without crashing.
 *   - The children list reflects fixture decomposition for parent kinds.
 *   - Clicking a child fires onOpen with the child Intent.
 *   - Zoom toggles body content (overview / structure / detail).
 */

import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import {
  IntentKindSchema,
  type Intent,
  type IntentState,
  type Workspace,
} from '@/schema'
import { seedWorkspace, sri } from '@/test/seed-workspace'
import { ChildrenSection } from './ChildrenSection'

const KINDS = IntentKindSchema.options

function intentFor(kind: (typeof KINDS)[number]): Intent {
  const found = seedWorkspace.intents.find((i) => i.kind === kind)
  if (!found) throw new Error(`fixture missing intent for ${kind}`)
  return found
}

describe('ChildrenSection', () => {
  it.each(KINDS)('renders without crashing for kind %s at structure zoom', (kind) => {
    const intent = intentFor(kind)
    const { container } = render(
      <ChildrenSection
        intent={intent}
        workspace={seedWorkspace}
        zoom="structure"
        onOpen={() => {}}
      />
    )
    // The data-kind hook anchors any per-kind CSS the surface adds later.
    expect(container.firstElementChild?.getAttribute('data-kind')).toBe(kind)
  })

  it.each(KINDS)('renders without crashing for kind %s at detail zoom', (kind) => {
    const intent = intentFor(kind)
    render(
      <ChildrenSection
        intent={intent}
        workspace={seedWorkspace}
        zoom="detail"
        onOpen={() => {}}
      />
    )
  })

  it('lists children of nous-campaign with iteration rows', () => {
    const nousCampaign = intentFor('nous-campaign')
    render(
      <ChildrenSection
        intent={nousCampaign}
        workspace={seedWorkspace}
        zoom="structure"
        onOpen={() => {}}
      />
    )
    // The fixture's iter-2 child surfaces with its title.
    expect(screen.getByText(/iter-2/i)).toBeInTheDocument()
  })

  it('lists children of coral-optimization with attempt rows', () => {
    const coral = intentFor('coral-optimization')
    render(
      <ChildrenSection
        intent={coral}
        workspace={seedWorkspace}
        zoom="structure"
        onOpen={() => {}}
      />
    )
    expect(screen.getByText(/attempt-042/i)).toBeInTheDocument()
  })

  // The "feature-campaign with PR rows" test was removed in v0.2.0
  // along with the feature-pr kind. Returns when the full feature-dev
  // adapter ships and feature-campaigns get PR children again.

  // The "paper-campaign children" test was removed with the paper kinds
  // in v0.2.0; returns when the paper adapter ships.

  it('clicking a child fires onOpen with that intent', () => {
    const nousCampaign = intentFor('nous-campaign')
    const onOpen = vi.fn()
    render(
      <ChildrenSection
        intent={nousCampaign}
        workspace={seedWorkspace}
        zoom="structure"
        onOpen={onOpen}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /iter-2/i }))
    expect(onOpen).toHaveBeenCalled()
    expect(onOpen.mock.calls[0]?.[0]?.kind).toBe('nous-iteration')
  })

  it('overview zoom collapses children list to a count summary', () => {
    const nousCampaign = intentFor('nous-campaign')
    render(
      <ChildrenSection
        intent={nousCampaign}
        workspace={seedWorkspace}
        zoom="overview"
        onOpen={() => {}}
      />
    )
    // No child detail rows visible; just a count.
    expect(screen.queryByText(/iter-2/i)).not.toBeInTheDocument()
    expect(screen.getByText(/1 child/i)).toBeInTheDocument()
  })

  it('detail zoom shows extension data for nous-iteration (hypothesis statements)', () => {
    const iter = intentFor('nous-iteration')
    render(
      <ChildrenSection
        intent={iter}
        workspace={seedWorkspace}
        zoom="detail"
        onOpen={() => {}}
      />
    )
    expect(
      screen.getByText(/Reward curvature induces premature convergence/)
    ).toBeInTheDocument()
  })

  // The "feature-pr diff_summary" and "paper-claim claim_text" detail-
  // zoom tests were deleted along with their kinds in v0.2.0; return
  // when the v0.3+ feature-dev / paper adapters ship.

  it('structure zoom on coral-attempt shows ScoreGauge slot', () => {
    const attempt = intentFor('coral-attempt')
    const { container } = render(
      <ChildrenSection
        intent={attempt}
        workspace={seedWorkspace}
        zoom="structure"
        onOpen={() => {}}
      />
    )
    // ScoreGauge with null score renders a placeholder dash; either surfacing
    // through aria-label "no score yet" or the data-score="" attribute is fine.
    const gauge = container.querySelector('[data-score]')
    expect(gauge).not.toBeNull()
  })

  /**
   * NousProgressVisuals — the cross-adapter atom composition site.
   *
   * The fixture's nous-campaign has 1 iteration with sparse data, so it
   * sits BELOW the meaningful-rendering thresholds for both atoms. The
   * tests below construct synthetic multi-iteration nous campaigns that
   * land on either side of the threshold, so the gate logic itself is
   * exercised — not just the happy path.
   */
  describe('NousProgressVisuals — gate logic', () => {
    function makeIter(opts: {
      id: string
      iterationNumber: number
      principles?: number
      hMain?: 'pending' | 'confirmed' | 'refuted' | 'inconclusive'
      hAblation?: ReadonlyArray<
        'pending' | 'confirmed' | 'refuted' | 'inconclusive'
      >
    }): Intent {
      return {
        id: opts.id,
        schema_version: '0.2.0',
        kind: 'nous-iteration',
        declaration: {
          title: `iter-${opts.iterationNumber}`,
          summary: '',
          success_criterion: '',
        },
        holder: { mode: 'human-held', parties: [sri] },
        lifetime: { kind: 'discrete', started_at: '2026-01-01T00:00:00Z' },
        decomposition: { children: [] },
        provenance: {
          declared_by: sri,
          declared_at: '2026-01-01T00:00:00Z',
          motivated_by: [],
        },
        knowledge_refs: [],
        tags: [],
        state_ref: opts.id + '-STATE',
        extension: {
          kind: 'nous-iteration',
          iteration_number: opts.iterationNumber,
          hypothesis_bundle: {
            h_main: {
              statement: 'main',
              prediction: 'p',
              conditions: [],
              ...(opts.hMain ? { result: opts.hMain } : {}),
            },
            h_ablation: (opts.hAblation ?? []).map((r, i) => ({
              statement: `ab-${i}`,
              prediction: 'p',
              conditions: [],
              result: r,
            })),
          },
          principles_emitted: opts.principles
            ? Array.from({ length: opts.principles }, (_, i) => ({
                kind: 'observation',
                observation: `principle-${i}`,
              }))
            : [],
        },
      } as unknown as Intent
    }

    function makeNousCampaign(childIds: string[], status: IntentState['status'] = 'active'): {
      campaign: Intent
      state: IntentState
    } {
      const campaign = {
        id: 'CAMP-X',
        schema_version: '0.2.0',
        kind: 'nous-campaign',
        declaration: {
          title: 'synth campaign',
          summary: '',
          success_criterion: '',
        },
        holder: { mode: 'human-held', parties: [sri] },
        lifetime: { kind: 'campaign', started_at: '2026-01-01T00:00:00Z' },
        decomposition: { children: childIds },
        provenance: {
          declared_by: sri,
          declared_at: '2026-01-01T00:00:00Z',
          motivated_by: [],
        },
        knowledge_refs: [],
        tags: [],
        state_ref: 'CAMP-X-STATE',
        extension: {
          kind: 'nous-campaign',
          research_question: 'q',
          open_hypothesis_bundles: [],
          gate_status: {},
        },
      } as unknown as Intent
      const state = {
        intent_id: 'CAMP-X',
        schema_version: '0.2.0',
        status,
        last_advanced_at: '2026-01-01T00:00:00Z',
        history: [],
      } as unknown as IntentState
      return { campaign, state }
    }

    function makeWs(intents: Intent[], states: IntentState[] = []): Workspace {
      return {
        schema_version: '0.2.0',
        intents,
        states,
        evidence_links: [],
        operations: [],
      } as unknown as Workspace
    }

    it('renders no progress visuals when below tempo + grid thresholds (sparse 1-iter)', () => {
      // 1 iteration with 1 principle + h_main pending — the screenshot
      // case. Both atoms below threshold; whole wrapper should be absent.
      const i1 = makeIter({
        id: 'I1',
        iterationNumber: 1,
        principles: 1,
        hMain: 'pending',
      })
      const { campaign, state } = makeNousCampaign(['I1'])
      const ws = makeWs([campaign, i1], [state])

      const { container } = render(
        <ChildrenSection
          intent={campaign}
          workspace={ws}
          zoom="detail"
          onOpen={() => {}}
        />
      )
      expect(
        container.querySelector('[data-progress-visuals]')
      ).toBeNull()
    })

    it('renders progress visuals + tempo when ≥3 iterations + ≥2 principles', () => {
      const iters = [
        makeIter({ id: 'I1', iterationNumber: 1, principles: 1 }),
        makeIter({ id: 'I2', iterationNumber: 2, principles: 0 }),
        makeIter({ id: 'I3', iterationNumber: 3, principles: 1 }),
      ]
      const { campaign, state } = makeNousCampaign(['I1', 'I2', 'I3'])
      const ws = makeWs([campaign, ...iters], [state])

      const { container } = render(
        <ChildrenSection
          intent={campaign}
          workspace={ws}
          zoom="structure"
          onOpen={() => {}}
        />
      )
      expect(
        container.querySelector('[data-progress-visuals="nous"]')
      ).not.toBeNull()
      expect(
        container.querySelector('[data-atom="principles-tempo"]')
      ).not.toBeNull()
    })

    it('omits the grid at structure zoom even when grid threshold is met', () => {
      // Grid is detail-zoom-only. At structure zoom, only tempo
      // renders (when above its own threshold).
      const iters = [
        makeIter({
          id: 'I1',
          iterationNumber: 1,
          principles: 1,
          hMain: 'confirmed',
          hAblation: ['pending'],
        }),
        makeIter({
          id: 'I2',
          iterationNumber: 2,
          principles: 1,
          hMain: 'confirmed',
          hAblation: ['refuted'],
        }),
        makeIter({
          id: 'I3',
          iterationNumber: 3,
          principles: 0,
          hMain: 'confirmed',
          hAblation: ['confirmed'],
        }),
      ]
      const { campaign, state } = makeNousCampaign(['I1', 'I2', 'I3'])
      const ws = makeWs([campaign, ...iters], [state])

      const { container } = render(
        <ChildrenSection
          intent={campaign}
          workspace={ws}
          zoom="structure"
          onOpen={() => {}}
        />
      )
      expect(
        container.querySelector('[data-atom="principles-tempo"]')
      ).not.toBeNull()
      expect(
        container.querySelector('[data-atom="hypothesis-grid"]')
      ).toBeNull()
    })

    it('renders the grid at detail zoom when ≥2 iterations + ≥2 distinct hypotheses with results', () => {
      const iters = [
        makeIter({
          id: 'I1',
          iterationNumber: 1,
          hMain: 'confirmed',
          hAblation: ['pending'],
        }),
        makeIter({
          id: 'I2',
          iterationNumber: 2,
          hMain: 'confirmed',
          hAblation: ['refuted'],
        }),
      ]
      const { campaign, state } = makeNousCampaign(['I1', 'I2'])
      const ws = makeWs([campaign, ...iters], [state])

      const { container } = render(
        <ChildrenSection
          intent={campaign}
          workspace={ws}
          zoom="detail"
          onOpen={() => {}}
        />
      )
      expect(
        container.querySelector('[data-atom="hypothesis-grid"]')
      ).not.toBeNull()
    })

    it('omits the grid when only ONE distinct hypothesis has results across iterations', () => {
      // Two iterations, h_main probed in both — one *distinct* hypothesis,
      // not 2×2. Below the grid's structural-meaning threshold.
      const iters = [
        makeIter({ id: 'I1', iterationNumber: 1, hMain: 'pending' }),
        makeIter({ id: 'I2', iterationNumber: 2, hMain: 'confirmed' }),
      ]
      const { campaign, state } = makeNousCampaign(['I1', 'I2'])
      const ws = makeWs([campaign, ...iters], [state])

      const { container } = render(
        <ChildrenSection
          intent={campaign}
          workspace={ws}
          zoom="detail"
          onOpen={() => {}}
        />
      )
      expect(
        container.querySelector('[data-atom="hypothesis-grid"]')
      ).toBeNull()
    })

    it('omits all progress visuals at overview zoom regardless of data', () => {
      const iters = [
        makeIter({ id: 'I1', iterationNumber: 1, principles: 2, hMain: 'confirmed', hAblation: ['confirmed'] }),
        makeIter({ id: 'I2', iterationNumber: 2, principles: 1, hMain: 'refuted', hAblation: ['confirmed'] }),
        makeIter({ id: 'I3', iterationNumber: 3, principles: 1, hMain: 'confirmed', hAblation: ['refuted'] }),
      ]
      const { campaign, state } = makeNousCampaign(['I1', 'I2', 'I3'])
      const ws = makeWs([campaign, ...iters], [state])

      const { container } = render(
        <ChildrenSection
          intent={campaign}
          workspace={ws}
          zoom="overview"
          onOpen={() => {}}
        />
      )
      expect(
        container.querySelector('[data-progress-visuals]')
      ).toBeNull()
    })

    it('omits all progress visuals for non-Nous kinds (e.g. coral-optimization)', () => {
      // Wire the gate: coral-optimization should NEVER render the
      // Nous-shaped progress visuals.
      const coral = intentFor('coral-optimization')
      const { container } = render(
        <ChildrenSection
          intent={coral}
          workspace={seedWorkspace}
          zoom="detail"
          onOpen={() => {}}
        />
      )
      expect(
        container.querySelector('[data-progress-visuals]')
      ).toBeNull()
    })

    it('paints the tempo last point in --amber when campaign is active (live)', () => {
      const iters = [
        makeIter({ id: 'I1', iterationNumber: 1, principles: 1 }),
        makeIter({ id: 'I2', iterationNumber: 2, principles: 1 }),
        makeIter({ id: 'I3', iterationNumber: 3, principles: 1 }),
      ]
      const { campaign, state } = makeNousCampaign(['I1', 'I2', 'I3'], 'active')
      const ws = makeWs([campaign, ...iters], [state])

      const { container } = render(
        <ChildrenSection
          intent={campaign}
          workspace={ws}
          zoom="structure"
          onOpen={() => {}}
        />
      )
      const lastPoint = container.querySelector('[data-last-point="true"]')
      expect(lastPoint?.getAttribute('data-current')).toBe('true')
    })

    it('renders HMainTimeline when ≥3 iterations probe h_main with ≥2 results', () => {
      const iters = [
        makeIter({ id: 'I1', iterationNumber: 1, hMain: 'confirmed' }),
        makeIter({ id: 'I2', iterationNumber: 2, hMain: 'confirmed' }),
        makeIter({ id: 'I3', iterationNumber: 3, hMain: 'refuted' }),
      ]
      const { campaign, state } = makeNousCampaign(['I1', 'I2', 'I3'])
      const ws = makeWs([campaign, ...iters], [state])
      const { container } = render(
        <ChildrenSection
          intent={campaign}
          workspace={ws}
          zoom="structure"
          onOpen={() => {}}
        />
      )
      expect(
        container.querySelector('[data-atom="h-main-timeline"]')
      ).not.toBeNull()
    })

    it('omits HMainTimeline below threshold (only 1 h_main result across 3 iterations)', () => {
      const iters = [
        makeIter({ id: 'I1', iterationNumber: 1, hMain: 'confirmed' }),
        makeIter({ id: 'I2', iterationNumber: 2 }), // no h_main
        makeIter({ id: 'I3', iterationNumber: 3 }), // no h_main
      ]
      const { campaign, state } = makeNousCampaign(['I1', 'I2', 'I3'])
      const ws = makeWs([campaign, ...iters], [state])
      const { container } = render(
        <ChildrenSection
          intent={campaign}
          workspace={ws}
          zoom="structure"
          onOpen={() => {}}
        />
      )
      expect(
        container.querySelector('[data-atom="h-main-timeline"]')
      ).toBeNull()
    })

    it('renders the symbol legend when HMainTimeline shows', () => {
      const iters = [
        makeIter({ id: 'I1', iterationNumber: 1, hMain: 'confirmed' }),
        makeIter({ id: 'I2', iterationNumber: 2, hMain: 'confirmed' }),
        makeIter({ id: 'I3', iterationNumber: 3, hMain: 'refuted' }),
      ]
      const { campaign, state } = makeNousCampaign(['I1', 'I2', 'I3'])
      const ws = makeWs([campaign, ...iters], [state])
      const { container } = render(
        <ChildrenSection
          intent={campaign}
          workspace={ws}
          zoom="structure"
          onOpen={() => {}}
        />
      )
      const legend = container.querySelector('[data-progress-legend="true"]')
      expect(legend).not.toBeNull()
      expect(legend?.textContent).toMatch(/confirmed/i)
      expect(legend?.textContent).toMatch(/refuted/i)
      expect(legend?.textContent).toMatch(/unresolved/i)
    })

    it('omits the legend when only PrinciplesTempo renders (no symbol cells)', () => {
      // Tempo uses a line + dot — no ✓/−/? cells, so the legend
      // would explain symbols the user can't see.
      const iters = [
        makeIter({ id: 'I1', iterationNumber: 1, principles: 1 }),
        makeIter({ id: 'I2', iterationNumber: 2, principles: 1 }),
        makeIter({ id: 'I3', iterationNumber: 3, principles: 1 }),
      ]
      const { campaign, state } = makeNousCampaign(['I1', 'I2', 'I3'])
      const ws = makeWs([campaign, ...iters], [state])
      const { container } = render(
        <ChildrenSection
          intent={campaign}
          workspace={ws}
          zoom="structure"
          onOpen={() => {}}
        />
      )
      expect(
        container.querySelector('[data-progress-legend="true"]')
      ).toBeNull()
    })

    it('renders HMainTimeline at structure AND detail zoom (it is not detail-only)', () => {
      const iters = [
        makeIter({ id: 'I1', iterationNumber: 1, hMain: 'confirmed' }),
        makeIter({ id: 'I2', iterationNumber: 2, hMain: 'confirmed' }),
        makeIter({ id: 'I3', iterationNumber: 3, hMain: 'confirmed' }),
      ]
      const { campaign, state } = makeNousCampaign(['I1', 'I2', 'I3'])
      const ws = makeWs([campaign, ...iters], [state])

      const { container: structureContainer } = render(
        <ChildrenSection
          intent={campaign}
          workspace={ws}
          zoom="structure"
          onOpen={() => {}}
        />
      )
      expect(
        structureContainer.querySelector('[data-atom="h-main-timeline"]')
      ).not.toBeNull()
    })

    it('falls back from --amber on terminal-state campaigns (satisfied)', () => {
      // Single-amber commitment: the rightmost point loses its amber
      // signal once the campaign is no longer live. Otherwise --amber
      // would mean "this campaign is awaiting" + "this campaign is done"
      // simultaneously — diluting the substrate's reserved signal slot.
      const iters = [
        makeIter({ id: 'I1', iterationNumber: 1, principles: 1 }),
        makeIter({ id: 'I2', iterationNumber: 2, principles: 1 }),
        makeIter({ id: 'I3', iterationNumber: 3, principles: 1 }),
      ]
      const { campaign, state } = makeNousCampaign(
        ['I1', 'I2', 'I3'],
        'satisfied'
      )
      const ws = makeWs([campaign, ...iters], [state])

      const { container } = render(
        <ChildrenSection
          intent={campaign}
          workspace={ws}
          zoom="structure"
          onOpen={() => {}}
        />
      )
      const lastPoint = container.querySelector('[data-last-point="true"]')
      expect(lastPoint?.getAttribute('data-current')).toBe('false')
    })
  })
})
