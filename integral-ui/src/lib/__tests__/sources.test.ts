/**
 * src/lib/sources.ts — behavioral tests for the source registry +
 * URL parsing + workspace attribution + merging.
 *
 * Discipline: every merge result must round-trip through
 * `WorkspaceSchema.safeParse` — the bijection refine is exactly
 * the kind of cross-record invariant that breaks if two sources
 * drop colliding intent IDs into the same merged workspace.
 *
 * v0.2.0 dropped the runtime fixture source. All sources are adapters.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WorkspaceSchema, type Workspace } from '@/schema'
import { seedWorkspace } from '@/test/seed-workspace'
import {
  attributeSource,
  fetchSourceRegistry,
  mergeWorkspaces,
  parseSourcesFromUrl,
  serializeSourcesToUrl,
  type SourceEntry,
} from '../sources'

// Synthetic registry for tests. Mirrors what the runtime resolves from
// /api/sources at app startup.
const REGISTRY: ReadonlyArray<SourceEntry> = [
  { id: 'nous', label: 'nous campaigns', kind: 'adapter' },
  { id: 'coral', label: 'coral', kind: 'adapter' },
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
    expect(parseSourcesFromUrl('?sources=coral', REGISTRY)).toEqual(
      new Set(['coral'])
    )
    expect(parseSourcesFromUrl('?sources=nous,coral', REGISTRY)).toEqual(
      new Set(['nous', 'coral'])
    )
  })

  it('drops unknown source IDs', () => {
    const result = parseSourcesFromUrl(
      '?sources=nous,bogus,coral,unknown',
      REGISTRY
    )
    expect(result).toEqual(new Set(['nous', 'coral']))
  })

  it('returns an empty set for ?sources= (corner case)', () => {
    expect(parseSourcesFromUrl('?sources=', REGISTRY).size).toBe(0)
  })

  it('tolerates whitespace around comma-separated values', () => {
    expect(parseSourcesFromUrl('?sources= nous , coral ', REGISTRY)).toEqual(
      new Set(['nous', 'coral'])
    )
  })

  it('honors a multi-Nous registry (more than one adapter source)', () => {
    const multiRegistry: ReadonlyArray<SourceEntry> = [
      { id: 'inference-sim', label: 'inference-sim', kind: 'adapter' },
      { id: 'experiments', label: 'experiments', kind: 'adapter' },
    ]
    const result = parseSourcesFromUrl('', multiRegistry)
    expect(result).toEqual(new Set(['inference-sim', 'experiments']))
  })
})

describe('serializeSourcesToUrl', () => {
  it('renders sources in registry order, comma-separated', () => {
    expect(
      serializeSourcesToUrl(new Set(['coral', 'nous']), REGISTRY)
    ).toBe('nous,coral')
  })

  it('renders an empty string for an empty set', () => {
    expect(serializeSourcesToUrl(new Set(), REGISTRY)).toBe('')
  })

  it('drops unknown ids silently', () => {
    expect(
      serializeSourcesToUrl(new Set(['nous', 'phantom']), REGISTRY)
    ).toBe('nous')
  })
})

describe('attributeSource', () => {
  it('decorates every intent with provenance.source = sourceId', () => {
    const decorated = attributeSource(seedWorkspace, 'nous')
    expect(decorated.intents.length).toBe(seedWorkspace.intents.length)
    for (const i of decorated.intents) {
      expect(i.provenance.source).toBe('nous')
    }
  })

  it('does not mutate the input workspace', () => {
    const before = seedWorkspace.intents[0]!.provenance.source
    attributeSource(seedWorkspace, 'nous')
    expect(seedWorkspace.intents[0]!.provenance.source).toBe(before)
  })

  it('the decorated workspace still validates against WorkspaceSchema', () => {
    const decorated = attributeSource(seedWorkspace, 'nous')
    const result = WorkspaceSchema.safeParse(decorated)
    expect(result.success).toBe(true)
  })
})

describe('mergeWorkspaces', () => {
  it('concatenates intents/states/evidence_links/operations', () => {
    const a: Workspace = {
      intents: seedWorkspace.intents.slice(0, 2),
      states: seedWorkspace.states.slice(0, 2),
      evidence_links: [],
      operations: [],
    }
    const b: Workspace = {
      intents: seedWorkspace.intents.slice(2, 4),
      states: seedWorkspace.states.slice(2, 4),
      evidence_links: seedWorkspace.evidence_links,
      operations: seedWorkspace.operations.slice(0, 3),
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
    const intentA = seedWorkspace.intents[0]!
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
    const decorated = attributeSource(seedWorkspace, 'nous')
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

  it('returns an empty registry on a non-OK response', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response('error', { status: 500 })
    ) as unknown as typeof globalThis.fetch

    const out = await fetchSourceRegistry()
    expect(out).toEqual([])
  })

  it('returns an empty registry when fetch throws', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('network down')
    }) as unknown as typeof globalThis.fetch

    const out = await fetchSourceRegistry()
    expect(out).toEqual([])
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
