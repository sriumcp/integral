import { describe, expect, it } from 'vitest'
import { WorkspaceSchema } from '@/schema'
import {
  buildResearchThreadWorkspace,
  intentFromDescriptor,
} from '../interpreter'
import type {
  ResearchThreadDescriptor,
  ResearchThreadSource,
} from '../types'

const ANCHOR_PATH = '/abs/path/to/research-threads/ea-control-stack'

const baseDesc: ResearchThreadDescriptor = {
  name: 'ea-control-stack',
  rootPath: ANCHOR_PATH,
  lastModified: '2026-05-25T09:00:00Z',
}

describe('intentFromDescriptor', () => {
  it('produces an Intent with kind=research-thread + matching extension discriminator', () => {
    const { intent } = intentFromDescriptor(baseDesc, 'research-threads')
    expect(intent.kind).toBe('research-thread')
    expect(intent.extension.kind).toBe('research-thread')
  })

  it('uses the descriptor name as the declaration title', () => {
    const { intent } = intentFromDescriptor(baseDesc, 'research-threads')
    expect(intent.declaration.title).toBe('ea-control-stack')
  })

  it('encodes the source ID into the intent ID and provenance.source', () => {
    const { intent } = intentFromDescriptor(baseDesc, 'research-threads')
    expect(intent.id).toBe('research-thread:research-threads:ea-control-stack')
    expect(intent.provenance.source).toBe('research-threads')
  })

  it('attaches root_anchor as a file:// filesystem-path anchor pointing at the dir', () => {
    const { intent } = intentFromDescriptor(baseDesc, 'research-threads')
    if (intent.extension.kind !== 'research-thread') throw new Error('narrow')
    expect(intent.extension.root_anchor.kind).toBe('filesystem-path')
    expect(intent.extension.root_anchor.uri).toBe(`file://${ANCHOR_PATH}`)
    expect(intent.extension.root_anchor.read_only).toBe(true)
  })

  it('uses lifetime: standing (research threads have no terminal commitment)', () => {
    const { intent } = intentFromDescriptor(baseDesc, 'research-threads')
    expect(intent.lifetime.kind).toBe('standing')
  })

  it('synthesizes UNKNOWN_HUMAN holder (mirrors gaps.md G-N-13 discipline)', () => {
    const { intent } = intentFromDescriptor(baseDesc, 'research-threads')
    expect(intent.holder.parties[0]).toEqual({
      id: 'unknown-human',
      kind: 'human',
      display_name: '(unknown)',
    })
  })

  it('emits an empty decomposition (research-thread is a leaf intent)', () => {
    const { intent } = intentFromDescriptor(baseDesc, 'research-threads')
    expect(intent.decomposition.children).toEqual([])
    expect(intent.decomposition.parent_id).toBeUndefined()
  })

  it('produces a 1:1 IntentState pointing back at the intent via state_ref', () => {
    const { intent, state } = intentFromDescriptor(baseDesc, 'research-threads')
    expect(state.id).toBe(intent.state_ref)
    expect(state.intent_id).toBe(intent.id)
    expect(state.status).toBe('active')
  })

  it('uses the directory mtime for state.last_advanced_at (drives recency sort)', () => {
    const { state } = intentFromDescriptor(baseDesc, 'research-threads')
    expect(state.last_advanced_at).toBe('2026-05-25T09:00:00Z')
  })

  it('exposes the root path as a state-level external_anchor too', () => {
    const { state } = intentFromDescriptor(baseDesc, 'research-threads')
    expect(state.external_anchors[0]?.uri).toBe(`file://${ANCHOR_PATH}`)
    expect(state.external_anchors[0]?.kind).toBe('filesystem-path')
  })
})

// ─── Workspace integration ─────────────────────────────────────────────────

class FakeSource implements ResearchThreadSource {
  readonly id = 'research-threads'
  readonly label = 'research threads'
  readonly path = '/abs/path/to/research-threads'
  private readonly threads: ResearchThreadDescriptor[]
  constructor(threads: ResearchThreadDescriptor[]) {
    this.threads = threads
  }
  async listThreads(): Promise<ResearchThreadDescriptor[]> {
    return this.threads
  }
}

describe('buildResearchThreadWorkspace', () => {
  it('returns an empty workspace when the source has no threads', async () => {
    const ws = await buildResearchThreadWorkspace(new FakeSource([]))
    expect(ws.intents).toEqual([])
    expect(ws.states).toEqual([])
    expect(ws.evidence_links).toEqual([])
    expect(ws.operations).toEqual([])
  })

  it('emits one Intent + one IntentState per thread', async () => {
    const ws = await buildResearchThreadWorkspace(
      new FakeSource([
        baseDesc,
        { ...baseDesc, name: 'plateau-study', rootPath: '/abs/p2' },
      ]),
    )
    expect(ws.intents).toHaveLength(2)
    expect(ws.states).toHaveLength(2)
  })

  it('emitted workspace round-trips through WorkspaceSchema (1:1 bijection holds)', async () => {
    const ws = await buildResearchThreadWorkspace(
      new FakeSource([
        baseDesc,
        { ...baseDesc, name: 'plateau-study', rootPath: '/abs/p2' },
      ]),
    )
    const result = WorkspaceSchema.safeParse(ws)
    if (!result.success) {
      throw new Error(
        'WorkspaceSchema rejected:\n' +
          JSON.stringify(result.error.issues, null, 2),
      )
    }
  })

  it('passes through the source.id as provenance.source on every emitted intent', async () => {
    const source = new FakeSource([baseDesc])
    const ws = await buildResearchThreadWorkspace(source)
    for (const i of ws.intents) {
      expect(i.provenance.source).toBe('research-threads')
    }
  })
})
