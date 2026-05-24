/**
 * src/lib/sources.ts — behavioral tests for the source registry +
 * URL parsing + workspace attribution + merging.
 *
 * Discipline: every merge result must round-trip through
 * `WorkspaceSchema.safeParse` — the bijection refine is exactly
 * the kind of cross-record invariant that breaks if two sources
 * drop colliding intent IDs into the same merged workspace.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WorkspaceSchema, type Workspace } from '@/schema'
import { fixtureWorkspace } from '@/fixtures/workspace'
import {
  attributeSource,
  fetchSourceRegistry,
  FIXTURE_SOURCE,
  mergeWorkspaces,
  parseSourcesFromUrl,
  serializeSourcesToUrl,
  type SourceEntry,
} from '../sources'

// Synthetic registry for tests. Mirrors what the runtime resolves from
// /api/sources at app startup.
const REGISTRY: ReadonlyArray<SourceEntry> = [
  FIXTURE_SOURCE,
  { id: 'nous', label: 'nous campaigns', kind: 'adapter' },
]

describe('parseSourcesFromUrl', () => {
  it('returns all known sources when the param is missing', () => {
    const result = parseSourcesFromUrl('', REGISTRY)
    for (const s of REGISTRY) {
      expect(result.has(s.id)).toBe(true)
    }
  })

  it('returns the requested subset', () => {
    expect(parseSourcesFromUrl('?sources=nous', REGISTRY)).toEqual(
      new Set(['nous'])
    )
    expect(parseSourcesFromUrl('?sources=fixture', REGISTRY)).toEqual(
      new Set(['fixture'])
    )
    expect(parseSourcesFromUrl('?sources=fixture,nous', REGISTRY)).toEqual(
      new Set(['fixture', 'nous'])
    )
  })

  it('drops unknown source IDs', () => {
    const result = parseSourcesFromUrl(
      '?sources=nous,bogus,fixture,unknown',
      REGISTRY
    )
    expect(result).toEqual(new Set(['fixture', 'nous']))
  })

  it('returns an empty set for ?sources= (corner case)', () => {
    expect(parseSourcesFromUrl('?sources=', REGISTRY).size).toBe(0)
  })

  it('tolerates whitespace around comma-separated values', () => {
    expect(parseSourcesFromUrl('?sources= nous , fixture ', REGISTRY)).toEqual(
      new Set(['fixture', 'nous'])
    )
  })

  it('honors a multi-Nous registry (more than one adapter source)', () => {
    const multiRegistry: ReadonlyArray<SourceEntry> = [
      FIXTURE_SOURCE,
      { id: 'inference-sim', label: 'inference-sim', kind: 'adapter' },
      { id: 'experiments', label: 'experiments', kind: 'adapter' },
    ]
    const result = parseSourcesFromUrl('', multiRegistry)
    expect(result).toEqual(new Set(['fixture', 'inference-sim', 'experiments']))
  })
})

describe('serializeSourcesToUrl', () => {
  it('renders sources in registry order, comma-separated', () => {
    expect(
      serializeSourcesToUrl(new Set(['nous', 'fixture']), REGISTRY)
    ).toBe('fixture,nous')
  })

  it('renders an empty string for an empty set', () => {
    expect(serializeSourcesToUrl(new Set(), REGISTRY)).toBe('')
  })

  it('drops unknown ids silently', () => {
    expect(
      serializeSourcesToUrl(new Set(['fixture', 'phantom']), REGISTRY)
    ).toBe('fixture')
  })
})

describe('attributeSource', () => {
  it('decorates every intent with provenance.source = sourceId', () => {
    const decorated = attributeSource(fixtureWorkspace, 'fixture')
    expect(decorated.intents.length).toBe(fixtureWorkspace.intents.length)
    for (const i of decorated.intents) {
      expect(i.provenance.source).toBe('fixture')
    }
  })

  it('does not mutate the input workspace', () => {
    const before = fixtureWorkspace.intents[0]!.provenance.source
    attributeSource(fixtureWorkspace, 'fixture')
    expect(fixtureWorkspace.intents[0]!.provenance.source).toBe(before)
  })

  it('the decorated workspace still validates against WorkspaceSchema', () => {
    const decorated = attributeSource(fixtureWorkspace, 'fixture')
    const result = WorkspaceSchema.safeParse(decorated)
    expect(result.success).toBe(true)
  })
})

describe('mergeWorkspaces', () => {
  it('concatenates intents/states/evidence_links/operations', () => {
    const a: Workspace = {
      intents: fixtureWorkspace.intents.slice(0, 2),
      states: fixtureWorkspace.states.slice(0, 2),
      evidence_links: [],
      operations: [],
    }
    const b: Workspace = {
      intents: fixtureWorkspace.intents.slice(2, 4),
      states: fixtureWorkspace.states.slice(2, 4),
      evidence_links: fixtureWorkspace.evidence_links,
      operations: fixtureWorkspace.operations.slice(0, 3),
    }
    const merged = mergeWorkspaces([a, b])
    expect(merged.intents.length).toBe(4)
    expect(merged.states.length).toBe(4)
    expect(merged.evidence_links.length).toBe(b.evidence_links.length)
    expect(merged.operations.length).toBe(3)
  })

  it('returns an empty workspace from empty input', () => {
    const merged = mergeWorkspaces([])
    expect(merged.intents).toEqual([])
    expect(merged.states).toEqual([])
    expect(merged.evidence_links).toEqual([])
    expect(merged.operations).toEqual([])
  })

  it('deduplicates by intent id (first wins)', () => {
    const intentA = fixtureWorkspace.intents[0]!
    const intentACopy = { ...intentA, declaration: { ...intentA.declaration, title: 'second copy' } }
    const a: Workspace = {
      intents: [intentA],
      states: [],
      evidence_links: [],
      operations: [],
    }
    const b: Workspace = {
      intents: [intentACopy],
      states: [],
      evidence_links: [],
      operations: [],
    }
    const merged = mergeWorkspaces([a, b])
    expect(merged.intents.length).toBe(1)
    expect(merged.intents[0]!.declaration.title).toBe(intentA.declaration.title)
  })

  it('produces a workspace that validates against WorkspaceSchema', () => {
    const decorated = attributeSource(fixtureWorkspace, 'fixture')
    const merged = mergeWorkspaces([decorated])
    const result = WorkspaceSchema.safeParse(merged)
    if (!result.success) {
      throw new Error(
        'merged workspace rejected by WorkspaceSchema:\n' +
          JSON.stringify(result.error.issues, null, 2)
      )
    }
  })
})

// ─── fetchSourceRegistry — path retention (A5 dependency) ──────────────────

describe('fetchSourceRegistry', () => {
  let originalFetch: typeof globalThis.fetch
  beforeEach(() => {
    originalFetch = globalThis.fetch
  })
  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('retains the filesystem path on adapter sources from the API response', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          sources: [
            {
              id: 'nous',
              label: 'nous campaigns',
              kind: 'adapter',
              path: '/Users/sri/Documents/Projects/inference-sim',
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    ) as unknown as typeof globalThis.fetch

    const out = await fetchSourceRegistry()
    const nous = out.find((s) => s.id === 'nous')
    expect(nous).toBeDefined()
    expect(nous?.path).toBe('/Users/sri/Documents/Projects/inference-sim')
  })

  it('falls back to the fixture-only registry on a non-OK response', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response('error', { status: 500 })
    ) as unknown as typeof globalThis.fetch

    const out = await fetchSourceRegistry()
    expect(out).toEqual([FIXTURE_SOURCE])
  })

  it('falls back gracefully when fetch throws', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('network down')
    }) as unknown as typeof globalThis.fetch

    const out = await fetchSourceRegistry()
    expect(out).toEqual([FIXTURE_SOURCE])
  })

  it('omits the path when the API response lacks one (graceful)', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          sources: [{ id: 'nous', label: 'nous campaigns', kind: 'adapter' }],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    ) as unknown as typeof globalThis.fetch

    const out = await fetchSourceRegistry()
    const nous = out.find((s) => s.id === 'nous')
    expect(nous).toBeDefined()
    expect(nous?.path).toBeUndefined()
  })
})
