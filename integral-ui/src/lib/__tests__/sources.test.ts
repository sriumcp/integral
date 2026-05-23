/**
 * src/lib/sources.ts — behavioral tests for the source registry +
 * URL parsing + workspace attribution + merging.
 *
 * Discipline: every merge result must round-trip through
 * `WorkspaceSchema.safeParse` — the bijection refine is exactly
 * the kind of cross-record invariant that breaks if two sources
 * drop colliding intent IDs into the same merged workspace.
 */

import { describe, expect, it } from 'vitest'
import { WorkspaceSchema, type Workspace } from '@/schema'
import { fixtureWorkspace } from '@/fixtures/workspace'
import {
  KNOWN_SOURCES,
  attributeSource,
  mergeWorkspaces,
  parseSourcesFromUrl,
  serializeSourcesToUrl,
} from '../sources'

describe('parseSourcesFromUrl', () => {
  it('returns all known sources when the param is missing', () => {
    const result = parseSourcesFromUrl('')
    for (const s of KNOWN_SOURCES) {
      expect(result.has(s.id)).toBe(true)
    }
  })

  it('returns the requested subset', () => {
    expect(parseSourcesFromUrl('?sources=nous')).toEqual(new Set(['nous']))
    expect(parseSourcesFromUrl('?sources=fixture')).toEqual(new Set(['fixture']))
    expect(parseSourcesFromUrl('?sources=fixture,nous')).toEqual(
      new Set(['fixture', 'nous'])
    )
  })

  it('drops unknown source IDs', () => {
    const result = parseSourcesFromUrl('?sources=nous,bogus,fixture,unknown')
    expect(result).toEqual(new Set(['fixture', 'nous']))
  })

  it('returns an empty set for ?sources= (corner case)', () => {
    expect(parseSourcesFromUrl('?sources=').size).toBe(0)
  })

  it('tolerates whitespace around comma-separated values', () => {
    expect(parseSourcesFromUrl('?sources= nous , fixture ')).toEqual(
      new Set(['fixture', 'nous'])
    )
  })
})

describe('serializeSourcesToUrl', () => {
  it('renders sources in registry order, comma-separated', () => {
    expect(serializeSourcesToUrl(new Set(['nous', 'fixture']))).toBe(
      'fixture,nous'
    )
  })

  it('renders an empty string for an empty set', () => {
    expect(serializeSourcesToUrl(new Set())).toBe('')
  })

  it('drops unknown ids silently', () => {
    expect(serializeSourcesToUrl(new Set(['fixture', 'phantom']))).toBe(
      'fixture'
    )
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
