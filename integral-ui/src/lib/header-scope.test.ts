/**
 * header-scope — unit tests for the AppHeader's pure derivations.
 *
 * Coverage targets the gaps the diff's prior tests didn't reach:
 *  - intentScope's three branches (no source / known / unknown to registry)
 *  - mapScope's order-stability promise across toggle order
 *  - intentAncestry's correctness on root, single-parent, and DAG shapes
 *
 * No LLMs touched (per `## Test discipline § LLM isolation` in CLAUDE.md).
 */

import { describe, expect, it } from 'vitest'
import type { Intent, Workspace } from '@/schema'
import { seedWorkspace, sri } from '@/test/seed-workspace'
import type { SourceEntry } from './sources'
import {
  intentAncestry,
  intentScope,
  mapScope,
  mapScopeInteractive,
} from './header-scope'

const REGISTRY: SourceEntry[] = [
  { id: 'demo', label: 'demo', kind: 'adapter' },
  { id: 'nous', label: 'nous', kind: 'adapter' },
  { id: 'github-integral', label: 'github-integral', kind: 'adapter' },
]

/**
 * Minimal test-only Intent. Only the fields header-scope reads (`id`,
 * `provenance.source`, `decomposition.children`) need real values; the
 * rest are placeholders. Cast through `unknown` since the schema's
 * full extension shape is rich and irrelevant to these helpers.
 */
function makeIntent(id: string, source: string | undefined): Intent {
  return {
    id,
    schema_version: '0.3.0',
    kind: 'nous-campaign',
    declaration: { title: id, summary: '', success_criterion: '' },
    holder: { mode: 'human-held', parties: [sri] },
    lifetime: { kind: 'campaign', started_at: '2026-01-01T00:00:00Z' },
    decomposition: { children: [] },
    provenance: {
      declared_by: sri,
      declared_at: '2026-01-01T00:00:00Z',
      motivated_by: [],
      ...(source !== undefined ? { source } : {}),
    },
    knowledge_refs: [],
    tags: [],
    state_ref: id + '-STATE',
    extension: {},
  } as unknown as Intent
}

describe('mapScope', () => {
  it('returns pills for every enabled source, in registry order', () => {
    const enabled = new Set(['github-integral', 'demo', 'nous'])
    expect(mapScope(REGISTRY, enabled)).toEqual([
      { id: 'demo', label: 'demo' },
      { id: 'nous', label: 'nous' },
      { id: 'github-integral', label: 'github-integral' },
    ])
  })

  it('preserves registry order regardless of toggle order', () => {
    // Toggling sources off/on shouldn't shuffle the display. The
    // implementation iterates the registry, not the Set, so this is
    // structurally guaranteed — this test pins the contract.
    const a = mapScope(REGISTRY, new Set(['nous', 'demo']))
    const b = mapScope(REGISTRY, new Set(['demo', 'nous']))
    expect(a).toEqual(b)
    expect(a.map((p) => p.id)).toEqual(['demo', 'nous'])
  })

  it('returns an empty array when no sources are enabled', () => {
    expect(mapScope(REGISTRY, new Set())).toEqual([])
  })

  it('drops enabled ids the registry does not know', () => {
    const enabled = new Set(['nous', 'unknown-source'])
    expect(mapScope(REGISTRY, enabled)).toEqual([
      { id: 'nous', label: 'nous' },
    ])
  })
})

describe('mapScopeInteractive', () => {
  it('emits a pill for EVERY known source (not just enabled), in registry order', () => {
    const enabled = new Set(['nous'])
    const pills = mapScopeInteractive(REGISTRY, enabled, () => {})
    expect(pills.map((p) => p.id)).toEqual(['demo', 'nous', 'github-integral'])
  })

  it('marks each pill enabled or disabled based on the set', () => {
    const enabled = new Set(['nous', 'github-integral'])
    const pills = mapScopeInteractive(REGISTRY, enabled, () => {})
    expect(pills.find((p) => p.id === 'demo')?.enabled).toBe(false)
    expect(pills.find((p) => p.id === 'nous')?.enabled).toBe(true)
    expect(pills.find((p) => p.id === 'github-integral')?.enabled).toBe(true)
  })

  it('each onClick invokes the supplied toggle handler with the pill id', () => {
    const calls: string[] = []
    const onToggle = (id: string) => calls.push(id)
    const pills = mapScopeInteractive(REGISTRY, new Set(['nous']), onToggle)
    pills[0]!.onClick!()
    pills[2]!.onClick!()
    expect(calls).toEqual(['demo', 'github-integral'])
  })

  it('returns an empty array when the registry is empty', () => {
    expect(mapScopeInteractive([], new Set(), () => {})).toEqual([])
  })

  it('preserves registry order even when no sources are enabled', () => {
    // The "all toggled off" state is legitimate — pills stay in their
    // canonical positions so layout doesn't shift as the user toggles.
    const pills = mapScopeInteractive(REGISTRY, new Set(), () => {})
    expect(pills.map((p) => p.id)).toEqual(['demo', 'nous', 'github-integral'])
    for (const p of pills) {
      expect(p.enabled).toBe(false)
    }
  })
})

describe('intentScope', () => {
  it('returns an empty array when the intent has no source provenance', () => {
    // Branch 1: legacy fixture intents from before the multi-source plane.
    const intent = makeIntent('legacy', undefined)
    expect(intentScope(intent, REGISTRY)).toEqual([])
  })

  it('returns a labeled pill when the source is known to the registry', () => {
    // Branch 2: the common case.
    const intent = makeIntent('a', 'nous')
    expect(intentScope(intent, REGISTRY)).toEqual([
      { id: 'nous', label: 'nous' },
    ])
  })

  it('falls back to the raw id when the source is not in the registry', () => {
    // Branch 3: deep-link to an intent whose source was removed from
    // integral.config.json. The pill renders so the user still sees
    // *which* source the intent claims to be from.
    const intent = makeIntent('b', 'mystery')
    expect(intentScope(intent, REGISTRY)).toEqual([
      { id: 'mystery', label: 'mystery' },
    ])
  })

  it('uses the registry label, not the id, when both are present', () => {
    // Confirms "demo" (label) is shown, not "fixture" (id).
    const intent = makeIntent('c', 'demo')
    expect(intentScope(intent, REGISTRY)).toEqual([
      { id: 'demo', label: 'demo' },
    ])
  })
})

describe('intentAncestry', () => {
  // Reuses the fixture so the tree shape is known: nous-campaign
  // (`01HXYZ-NOUS-CAMPAIGN-001`) decomposes into one iteration
  // (`01HXYZ-NOUS-ITER-002`).
  const campaign = seedWorkspace.intents.find(
    (i) => i.id === '01HXYZ-NOUS-CAMPAIGN-001'
  )!
  const iteration = seedWorkspace.intents.find(
    (i) => i.id === '01HXYZ-NOUS-ITER-002'
  )!

  it('returns a single-element chain for a root intent', () => {
    const chain = intentAncestry(campaign, seedWorkspace as Workspace)
    expect(chain).toHaveLength(1)
    expect(chain[0]?.id).toBe(campaign.id)
  })

  it('walks one level up for a child intent (root → leaf order)', () => {
    const chain = intentAncestry(iteration, seedWorkspace as Workspace)
    expect(chain.map((i) => i.id)).toEqual([campaign.id, iteration.id])
  })

  it('returns the leaf as the last element', () => {
    const chain = intentAncestry(iteration, seedWorkspace as Workspace)
    expect(chain[chain.length - 1]?.id).toBe(iteration.id)
  })

  it('does not modify the workspace it walks', () => {
    const before = seedWorkspace.intents.length
    intentAncestry(iteration, seedWorkspace as Workspace)
    expect(seedWorkspace.intents.length).toBe(before)
  })

  it('handles a synthetic DAG by picking the first-listed parent', () => {
    // Two intents both list the same child — first-parent wins so the
    // chain stays linear. (Real DAG case: Coral attempts.)
    const child = makeIntent('child', 'nous')
    const parentA = {
      ...makeIntent('parentA', 'nous'),
      decomposition: { children: ['child'] },
    } as unknown as Intent
    const parentB = {
      ...makeIntent('parentB', 'nous'),
      decomposition: { children: ['child'] },
    } as unknown as Intent
    const ws = {
      ...seedWorkspace,
      intents: [parentA, parentB, child],
    } as unknown as Workspace
    const chain = intentAncestry(child, ws)
    expect(chain.map((i) => i.id)).toEqual(['parentA', 'child'])
  })
})
