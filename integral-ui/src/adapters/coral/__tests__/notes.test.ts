import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { KnowledgeRefSchema } from '@/schema'
import { notesToKnowledgeRefs } from '../notes'

describe('notesToKnowledgeRefs', () => {
  it('returns [] for empty notes', () => {
    const refs = notesToKnowledgeRefs({
      notes: [],
      sourceId: 'fs:/coral/pi-mc',
      runId: 'pi-mc/2026-05-24_194843',
    })
    expect(refs).toEqual([])
  })

  it('emits one campaign-scope ref per note with v0.1-lossy version', () => {
    const refs = notesToKnowledgeRefs({
      notes: ['index.md'],
      sourceId: 'coral-pi-mc',
      runId: 'pi-mc/2026-05-24_194843',
    })
    expect(refs).toHaveLength(1)
    const ref = refs[0]!
    expect(ref.scope).toBe('campaign')
    expect(ref.role).toBe('principles')
    expect(ref.version).toBe('v0.1-lossy')
    expect(ref.uri).toBe('coral-note://coral-pi-mc/pi-mc/2026-05-24_194843/index.md')
  })

  it('multiple notes are sorted lexically (deterministic order)', () => {
    const refs = notesToKnowledgeRefs({
      notes: [
        'experiments/eval-1-math-pi-optimal.md',
        'index.md',
      ],
      sourceId: 'coral-pi-mc',
      runId: 'pi-mc/2026-05-24_194843',
    })
    expect(refs.map((r) => r.uri)).toEqual([
      'coral-note://coral-pi-mc/pi-mc/2026-05-24_194843/experiments/eval-1-math-pi-optimal.md',
      'coral-note://coral-pi-mc/pi-mc/2026-05-24_194843/index.md',
    ])
  })

  it('output is stable across repeated calls', () => {
    const args = {
      notes: ['b.md', 'a.md'],
      sourceId: 'src',
      runId: 'task/ts',
    }
    expect(notesToKnowledgeRefs(args)).toEqual(notesToKnowledgeRefs(args))
  })

  it('refs validate against KnowledgeRefSchema', () => {
    const refs = notesToKnowledgeRefs({
      notes: ['index.md', 'experiments/eval-1.md'],
      sourceId: 'coral-pi-mc',
      runId: 'pi-mc/2026-05-24_194843',
    })
    const result = z.array(KnowledgeRefSchema).safeParse(refs)
    expect(result.success).toBe(true)
  })

  it('source ids with non-slug-safe chars are slugified into the URI', () => {
    const refs = notesToKnowledgeRefs({
      notes: ['index.md'],
      sourceId: 'fs:/Users/sri/coral runs',
      runId: 'task/ts',
    })
    expect(refs[0]!.uri).toMatch(/^coral-note:\/\/fs-Users-sri-coral-runs\//)
  })
})
