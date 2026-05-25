import { describe, expect, it } from 'vitest'
import type { Intent, IntentState } from '@/schema'
import {
  groupIntents,
  groupLabel,
  sortGroups,
  sortIntents,
} from '../intent-grouping'
import { fixtureWorkspace } from '@/fixtures/workspace'

const ALWAYS_FALSE = () => false

const intents: ReadonlyArray<Intent> = fixtureWorkspace.intents
const states: ReadonlyArray<IntentState> = fixtureWorkspace.states

describe('groupIntents', () => {
  it('group=none → single bucket with all intents', () => {
    const buckets = groupIntents({ intents, states, groupBy: 'none' })
    expect(buckets.size).toBe(1)
    expect(buckets.get('')).toHaveLength(intents.length)
  })

  it('group=kind → bucketed by kind', () => {
    const buckets = groupIntents({ intents, states, groupBy: 'kind' })
    expect(buckets.size).toBeGreaterThan(1)
    for (const [key, bucket] of buckets) {
      for (const i of bucket) {
        expect(i.kind).toBe(key)
      }
    }
  })

  it('group=source → fixture intents bucket under "fixture"', () => {
    // Decorate fixture with provenance.source = 'fixture' (matches what
    // the loader does in production).
    const decorated = intents.map((i) => ({
      ...i,
      provenance: { ...i.provenance, source: 'fixture' as const },
    }))
    const buckets = groupIntents({
      intents: decorated,
      states,
      groupBy: 'source',
    })
    expect([...buckets.keys()]).toEqual(['fixture'])
  })

  it('group=source → undefined provenance.source defaults to "fixture"', () => {
    const stripped = intents.map((i) => ({
      ...i,
      provenance: { ...i.provenance, source: undefined },
    }))
    const buckets = groupIntents({
      intents: stripped as Intent[],
      states,
      groupBy: 'source',
    })
    expect(buckets.has('fixture')).toBe(true)
  })

  it('group=holder-mode → bucketed by holder.mode', () => {
    const buckets = groupIntents({ intents, states, groupBy: 'holder-mode' })
    for (const [key, bucket] of buckets) {
      for (const i of bucket) {
        expect(i.holder.mode).toBe(key)
      }
    }
  })

  it('group=status → bucketed by IntentState.status', () => {
    const buckets = groupIntents({ intents, states, groupBy: 'status' })
    const stateMap = new Map(states.map((s) => [s.intent_id, s]))
    for (const [key, bucket] of buckets) {
      for (const i of bucket) {
        expect(stateMap.get(i.id)?.status).toBe(key)
      }
    }
  })
})

describe('sortGroups', () => {
  it('group=none → trivial pass-through', () => {
    const buckets = new Map([['', intents.slice()]])
    const out = sortGroups(buckets, 'none')
    expect(out).toEqual([['', intents.slice()]])
  })

  it('group=kind → alphabetical', () => {
    const buckets = new Map<string, Intent[]>([
      ['nous-campaign', []],
      ['coral-attempt', []],
      ['feature-pr', []],
    ])
    const out = sortGroups(buckets, 'kind')
    expect(out.map(([k]) => k)).toEqual([
      'coral-attempt',
      'feature-pr',
      'nous-campaign',
    ])
  })

  it('group=status → severity order, not alphabetical', () => {
    const buckets = new Map<string, Intent[]>([
      ['satisfied', []],
      ['gated', []],
      ['active', []],
      ['draft', []],
    ])
    const out = sortGroups(buckets, 'status')
    // gated → active → satisfied → ... → draft
    expect(out.map(([k]) => k)).toEqual([
      'gated',
      'active',
      'satisfied',
      'draft',
    ])
  })

  it('group=source → alphabetical', () => {
    const buckets = new Map<string, Intent[]>([
      ['nous', []],
      ['coral-pi-mc', []],
      ['fixture', []],
    ])
    const out = sortGroups(buckets, 'source')
    expect(out.map(([k]) => k)).toEqual(['coral-pi-mc', 'fixture', 'nous'])
  })
})

describe('sortIntents', () => {
  it('empty input → empty output', () => {
    const out = sortIntents({
      intents: [],
      states: [],
      sortBy: 'recency',
      isAwaitingMe: ALWAYS_FALSE,
    })
    expect(out).toEqual([])
  })

  it('sortBy=recency → last_advanced_at descending', () => {
    const out = sortIntents({
      intents,
      states,
      sortBy: 'recency',
      isAwaitingMe: ALWAYS_FALSE,
    })
    const stateMap = new Map(states.map((s) => [s.intent_id, s]))
    const timestamps = out.map(
      (i) => stateMap.get(i.id)?.last_advanced_at ?? ''
    )
    for (let i = 1; i < timestamps.length; i++) {
      expect(timestamps[i - 1]! >= timestamps[i]!).toBe(true)
    }
  })

  it('sortBy=alphabetical → title ascending', () => {
    const out = sortIntents({
      intents,
      states,
      sortBy: 'alphabetical',
      isAwaitingMe: ALWAYS_FALSE,
    })
    const titles = out.map((i) => i.declaration.title)
    const sorted = [...titles].sort((a, b) => a.localeCompare(b))
    expect(titles).toEqual(sorted)
  })

  it('sortBy=status → severity order; equal-status fall back to recency', () => {
    const out = sortIntents({
      intents,
      states,
      sortBy: 'status',
      isAwaitingMe: ALWAYS_FALSE,
    })
    const stateMap = new Map(states.map((s) => [s.intent_id, s]))
    const severities = out.map((i) => stateMap.get(i.id)?.status)
    const order: Record<string, number> = {
      gated: 0,
      active: 1,
      satisfied: 2,
      abandoned: 3,
      revoked: 4,
      draft: 5,
    }
    for (let i = 1; i < severities.length; i++) {
      const a = severities[i - 1]
      const b = severities[i]
      if (!a || !b) continue
      expect(order[a]! <= order[b]!).toBe(true)
    }
  })

  it('sortBy=awaiting-recency → awaiting items first, then recency', () => {
    // Mark first intent as awaiting (deterministic injection)
    const firstId = intents[0]!.id
    const isAwaiting = (i: Intent) => i.id === firstId
    const out = sortIntents({
      intents,
      states,
      sortBy: 'awaiting-recency',
      isAwaitingMe: isAwaiting,
    })
    expect(out[0]!.id).toBe(firstId)
  })

  it('awaiting-recency with no awaiting items behaves like recency', () => {
    const out = sortIntents({
      intents,
      states,
      sortBy: 'awaiting-recency',
      isAwaitingMe: ALWAYS_FALSE,
    })
    const recencyOut = sortIntents({
      intents,
      states,
      sortBy: 'recency',
      isAwaitingMe: ALWAYS_FALSE,
    })
    expect(out.map((i) => i.id)).toEqual(recencyOut.map((i) => i.id))
  })

  it('does not mutate input', () => {
    const before = intents.slice()
    sortIntents({
      intents,
      states,
      sortBy: 'recency',
      isAwaitingMe: ALWAYS_FALSE,
    })
    expect(intents).toEqual(before)
  })

  it('stable sort: equal-status items preserve input order', () => {
    // Two synthetic intents with same status; order preserved.
    const synth: Intent[] = [
      { ...intents[0]!, id: 'synth-A' },
      { ...intents[0]!, id: 'synth-B' },
    ]
    const synthStates: IntentState[] = [
      { ...states.find((s) => s.intent_id === intents[0]!.id)!, id: 'synth-A-S', intent_id: 'synth-A' },
      { ...states.find((s) => s.intent_id === intents[0]!.id)!, id: 'synth-B-S', intent_id: 'synth-B' },
    ]
    const out = sortIntents({
      intents: synth,
      states: synthStates,
      sortBy: 'status',
      isAwaitingMe: ALWAYS_FALSE,
    })
    expect(out.map((i) => i.id)).toEqual(['synth-A', 'synth-B'])
  })

  it('awaiting-recency invokes the predicate per intent', () => {
    const calls: string[] = []
    sortIntents({
      intents,
      states,
      sortBy: 'awaiting-recency',
      isAwaitingMe: (i) => {
        calls.push(i.id)
        return false
      },
    })
    // Sorting visits each intent at least once
    expect(calls.length).toBeGreaterThanOrEqual(intents.length)
  })
})

describe('groupLabel', () => {
  it('group=none → empty', () => {
    expect(groupLabel('none', '')).toBe('')
  })
  it('uppercases the key for display', () => {
    expect(groupLabel('kind', 'nous-campaign')).toBe('NOUS-CAMPAIGN')
    expect(groupLabel('source', 'coral-pi-mc')).toBe('CORAL-PI-MC')
    expect(groupLabel('status', 'gated')).toBe('GATED')
  })
})
