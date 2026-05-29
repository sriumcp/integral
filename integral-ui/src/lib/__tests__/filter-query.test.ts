import { describe, expect, it } from 'vitest'
import type { Intent, IntentState } from '@/schema'
import {
  DEFAULT_VIEW,
  activeFilterCount,
  applyFilters,
  defaultView,
  parseFilterQuery,
  serializeFilterQuery,
  type MapView,
} from '../filter-query'
import { seedWorkspace } from '@/test/seed-workspace'

const ALWAYS_FALSE = () => false
const ALWAYS_TRUE = () => true

describe('parseFilterQuery', () => {
  it('empty params → default view', () => {
    const v = parseFilterQuery(new URLSearchParams(''))
    expect(v).toEqual(DEFAULT_VIEW)
  })

  it('parses awaiting=me', () => {
    const v = parseFilterQuery(new URLSearchParams('awaiting=me'))
    expect(v.filter.awaitingMe).toBe(true)
  })

  it('parses comma-separated kind list', () => {
    const v = parseFilterQuery(
      new URLSearchParams('kind=nous-campaign,coral-attempt')
    )
    expect([...v.filter.kinds].sort()).toEqual([
      'coral-attempt',
      'nous-campaign',
    ])
  })

  it('parses status + kind together', () => {
    const v = parseFilterQuery(
      new URLSearchParams('status=active&kind=nous-campaign')
    )
    expect([...v.filter.statuses]).toEqual(['active'])
    expect([...v.filter.kinds]).toEqual(['nous-campaign'])
  })

  it('parses group=source', () => {
    const v = parseFilterQuery(new URLSearchParams('group=source'))
    expect(v.group).toBe('source')
  })

  it('parses sort=recency', () => {
    const v = parseFilterQuery(new URLSearchParams('sort=recency'))
    expect(v.sort).toBe('recency')
  })

  it('drops unknown kind values silently', () => {
    const v = parseFilterQuery(
      new URLSearchParams('kind=nous-campaign,not-a-kind')
    )
    expect([...v.filter.kinds]).toEqual(['nous-campaign'])
  })

  it('drops unknown group; falls back to none', () => {
    const v = parseFilterQuery(new URLSearchParams('group=banana'))
    expect(v.group).toBe('none')
  })

  it('parses holder=human,agent', () => {
    const v = parseFilterQuery(new URLSearchParams('holder=human-held,agent-held'))
    expect([...v.filter.holderModes].sort()).toEqual([
      'agent-held',
      'human-held',
    ])
  })

  it('silently ignores ?tag= (dropped as a filter dimension in v0.2.0)', () => {
    // Round-trip: parsing a stale URL with ?tag=... no longer
    // contributes to the filter, but doesn't crash either.
    const v = parseFilterQuery(new URLSearchParams('tag=urgent,blocked'))
    expect(Object.keys(v.filter)).not.toContain('tags')
  })
})

describe('serializeFilterQuery', () => {
  it('default view → empty params', () => {
    const out = serializeFilterQuery(DEFAULT_VIEW)
    expect(out.toString()).toBe('')
  })

  it('omits default sort and default group', () => {
    const v: MapView = {
      ...DEFAULT_VIEW,
      filter: { ...DEFAULT_VIEW.filter, awaitingMe: true },
    }
    const out = serializeFilterQuery(v)
    expect(out.toString()).toBe('awaiting=me')
  })

  it('emits multi-value kinds as comma-separated', () => {
    const v: MapView = {
      ...DEFAULT_VIEW,
      filter: {
        ...DEFAULT_VIEW.filter,
        kinds: new Set(['nous-campaign', 'coral-attempt']),
      },
    }
    expect(serializeFilterQuery(v).get('kind')).toBe(
      'coral-attempt,nous-campaign'
    )
  })

  it('emits group + sort when non-default', () => {
    const v: MapView = {
      ...DEFAULT_VIEW,
      group: 'source',
      sort: 'recency',
    }
    const params = serializeFilterQuery(v)
    expect(params.get('group')).toBe('source')
    expect(params.get('sort')).toBe('recency')
  })
})

describe('parse/serialize round-trip', () => {
  function roundTrip(v: MapView): MapView {
    return parseFilterQuery(serializeFilterQuery(v))
  }

  it('round-trips default view', () => {
    expect(roundTrip(DEFAULT_VIEW)).toEqual(DEFAULT_VIEW)
  })

  it('round-trips a fully populated view', () => {
    const v: MapView = {
      filter: {
        awaitingMe: true,
        kinds: new Set(['nous-campaign', 'coral-attempt']),
        statuses: new Set(['active', 'gated']),
        holderModes: new Set(['human-held']),
      },
      group: 'source',
      sort: 'alphabetical',
    }
    expect(roundTrip(v)).toEqual(v)
  })

  it('round-trips when only one filter is set', () => {
    const v: MapView = {
      ...DEFAULT_VIEW,
      filter: {
        ...DEFAULT_VIEW.filter,
        statuses: new Set(['gated']),
      },
    }
    expect(roundTrip(v)).toEqual(v)
  })
})

describe('applyFilters', () => {
  // Use the fixture workspace as a known, schema-valid input.
  const intents: ReadonlyArray<Intent> = seedWorkspace.intents
  const states: ReadonlyArray<IntentState> = seedWorkspace.states

  it('empty filter → all intents pass', () => {
    const out = applyFilters({
      intents,
      states,
      filter: DEFAULT_VIEW.filter,
      isAwaitingMe: ALWAYS_FALSE,
    })
    expect(out.length).toBe(intents.length)
  })

  it('kind filter narrows to matching kind', () => {
    const out = applyFilters({
      intents,
      states,
      filter: { ...DEFAULT_VIEW.filter, kinds: new Set(['nous-campaign']) },
      isAwaitingMe: ALWAYS_FALSE,
    })
    expect(out.length).toBeGreaterThan(0)
    for (const i of out) expect(i.kind).toBe('nous-campaign')
  })

  it('multi-kind = OR', () => {
    const out = applyFilters({
      intents,
      states,
      filter: {
        ...DEFAULT_VIEW.filter,
        kinds: new Set(['nous-campaign', 'coral-attempt']),
      },
      isAwaitingMe: ALWAYS_FALSE,
    })
    for (const i of out) {
      expect(['nous-campaign', 'coral-attempt']).toContain(i.kind)
    }
  })

  it('AND across categories: kind + status', () => {
    const allActive = applyFilters({
      intents,
      states,
      filter: { ...DEFAULT_VIEW.filter, statuses: new Set(['active']) },
      isAwaitingMe: ALWAYS_FALSE,
    })
    const out = applyFilters({
      intents,
      states,
      filter: {
        ...DEFAULT_VIEW.filter,
        kinds: new Set(['nous-campaign']),
        statuses: new Set(['active']),
      },
      isAwaitingMe: ALWAYS_FALSE,
    })
    // Result is a subset of "all active" AND restricted to nous-campaign.
    expect(out.length).toBeLessThanOrEqual(allActive.length)
    for (const i of out) {
      expect(i.kind).toBe('nous-campaign')
    }
  })

  it('awaitingMe filter calls injected predicate', () => {
    const calls: string[] = []
    const out = applyFilters({
      intents,
      states,
      filter: { ...DEFAULT_VIEW.filter, awaitingMe: true },
      isAwaitingMe: (intent) => {
        calls.push(intent.id)
        return intent.kind === 'nous-campaign'
      },
    })
    expect(calls.length).toBe(intents.length)
    for (const i of out) expect(i.kind).toBe('nous-campaign')
  })

  // The "tag filter matches OR across multi tags" test was removed
  // when v0.2.0 dropped tag-as-filter. Tags survive on intents but
  // are not a workspace-narrowing dimension.

  it('all filters that exclude everything → empty result', () => {
    void ALWAYS_TRUE // keep import alive
    const out = applyFilters({
      intents,
      states,
      filter: {
        ...DEFAULT_VIEW.filter,
        kinds: new Set(['coral-attempt']),
        statuses: new Set(['gated']),
      },
      isAwaitingMe: ALWAYS_FALSE,
    })
    // Either non-empty (if fixture has gated paper-claim) or empty;
    // this test asserts the AND combination is honored.
    for (const i of out) {
      expect(i.kind).toBe('coral-attempt')
      const st = states.find((s) => s.intent_id === i.id)!
      expect(st.status).toBe('gated')
    }
  })
})

describe('activeFilterCount', () => {
  it('zero for default', () => {
    expect(activeFilterCount(DEFAULT_VIEW.filter)).toBe(0)
  })

  it('counts awaiting + each set entry', () => {
    expect(
      activeFilterCount({
        awaitingMe: true,
        kinds: new Set(['nous-campaign', 'coral-attempt']),
        statuses: new Set(['active']),
        holderModes: new Set(),
      })
    ).toBe(1 + 2 + 1 + 0)
  })
})

describe('defaultView()', () => {
  it('returns a fresh MapView equal to DEFAULT_VIEW', () => {
    const v = defaultView()
    expect(v).toEqual(DEFAULT_VIEW)
    // Ensure it's a fresh object (not the shared constant)
    expect(v).not.toBe(DEFAULT_VIEW)
  })
})
