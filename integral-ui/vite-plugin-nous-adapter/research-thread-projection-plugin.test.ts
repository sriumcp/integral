/**
 * Research-thread projection plugin — behavioral tests.
 *
 * The plugin reads markdown files from disk + asks the LLM to
 * synthesize them at structure / detail zoom. Tests mock the LLM
 * (capturing the prompt) and use real tmpdirs (the I/O is the
 * interesting bit — that's where bugs would land).
 *
 * No real LLMs touched, per CLAUDE.md § Test discipline.
 */

import { promises as fs } from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Intent, IntentState, Workspace } from '../src/schema'
import type { ProjectionContext } from '../src/lib/projection'
import { researchThreadPlugin } from './research-thread-projection-plugin'

let tmpRoot: string

beforeEach(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'integral-rt-plugin-'))
})

afterEach(async () => {
  await fs.rm(tmpRoot, { recursive: true, force: true })
})

// ─── Helpers ─────────────────────────────────────────────────────────────

const UNKNOWN: Intent['provenance']['declared_by'] = {
  id: 'unknown-human',
  kind: 'human',
  display_name: '(unknown)',
}

function makeIntent(rootPath: string, title = 'thread-x'): Intent {
  return {
    id: `research-thread:rt:${title}`,
    schema_version: '0.3.0',
    kind: 'research-thread',
    declaration: { title, summary: '', success_criterion: '' },
    holder: { mode: 'human-held', parties: [UNKNOWN] },
    lifetime: { kind: 'standing', started_at: '2026-05-25T00:00:00Z' },
    decomposition: { children: [] },
    provenance: {
      declared_by: UNKNOWN,
      declared_at: '2026-05-25T00:00:00Z',
      motivated_by: [],
    },
    knowledge_refs: [],
    tags: [],
    state_ref: `research-thread:rt:${title}-STATE`,
    extension: {
      kind: 'research-thread',
      root_anchor: {
        kind: 'filesystem-path',
        uri: `file://${rootPath}`,
        read_only: true,
      },
    },
  }
}

function makeState(intent: Intent): IntentState {
  return {
    id: intent.state_ref,
    intent_id: intent.id,
    schema_version: '0.3.0',
    status: 'active',
    last_advanced_at: '2026-05-25T00:00:00Z',
    last_advanced_by: UNKNOWN,
    history: [],
    external_anchors: [],
  }
}

function makeCtx(rootPath: string): {
  ctx: ProjectionContext
  llm: ReturnType<typeof vi.fn>
} {
  const intent = makeIntent(rootPath)
  const state = makeState(intent)
  const workspace: Workspace = {
    intents: [intent],
    states: [state],
    evidence_links: [],
    operations: [],
  }
  const llm = vi.fn().mockResolvedValue('synthesized-prose')
  const ctx: ProjectionContext = {
    intent,
    state,
    workspace,
    zoom: 'structure',
    llm: { generate: llm as unknown as (p: string) => Promise<string> },
  }
  return { ctx, llm }
}

// ─── Behavioral tests ────────────────────────────────────────────────────

describe('researchThreadPlugin.structure', () => {
  it('returns empty content when root_anchor is malformed', async () => {
    const intent = makeIntent('/some/path')
    if (intent.extension.kind === 'research-thread') {
      // Force a non-file:// URI so rootAnchorPath returns null.
      intent.extension.root_anchor.uri = 'http://example.com/not-a-file'
    }
    const ctx: ProjectionContext = {
      intent,
      state: makeState(intent),
      workspace: { intents: [intent], states: [], evidence_links: [], operations: [] },
      zoom: 'structure',
      llm: { generate: async () => 'should-not-be-called' },
    }
    const out = await researchThreadPlugin.structure!(ctx)
    expect(out.content).toBe('')
  })

  it('produces LLM-synthesized prose when files are present', async () => {
    await fs.writeFile(
      path.join(tmpRoot, 'README.md'),
      '# EA Control Stack\n\nMulti-iteration study of evaluator control.',
    )
    const { ctx, llm } = makeCtx(tmpRoot)
    const out = await researchThreadPlugin.structure!(ctx)
    expect(out.content).toBe('synthesized-prose')
    expect(out.source).toBe('llm')
    expect(llm).toHaveBeenCalledOnce()
  })

  it('passes the README content into the LLM prompt', async () => {
    await fs.writeFile(
      path.join(tmpRoot, 'README.md'),
      'EA-WFQ saturation under burst load.',
    )
    const { ctx, llm } = makeCtx(tmpRoot)
    await researchThreadPlugin.structure!(ctx)
    const prompt = llm.mock.calls[0]?.[0] as string
    expect(prompt).toContain('EA-WFQ saturation under burst load.')
  })

  it('prioritizes README.md, brief.md, and PAPER.md over alphabetical fill', async () => {
    // Files in alphabetical order would be: aaa.md, brief.md, PAPER.md, README.md, zzz.md
    // STRUCTURE_MAX_FILES is 3 — ranked picks should be README, brief, PAPER.
    await fs.writeFile(path.join(tmpRoot, 'aaa.md'), 'AAA-content')
    await fs.writeFile(path.join(tmpRoot, 'brief.md'), 'BRIEF-content')
    await fs.writeFile(path.join(tmpRoot, 'PAPER.md'), 'PAPER-content')
    await fs.writeFile(path.join(tmpRoot, 'README.md'), 'README-content')
    await fs.writeFile(path.join(tmpRoot, 'zzz.md'), 'ZZZ-content')
    const { ctx, llm } = makeCtx(tmpRoot)
    await researchThreadPlugin.structure!(ctx)
    const prompt = llm.mock.calls[0]?.[0] as string
    expect(prompt).toContain('README-content')
    expect(prompt).toContain('BRIEF-content')
    expect(prompt).toContain('PAPER-content')
    expect(prompt).not.toContain('AAA-content')
    expect(prompt).not.toContain('ZZZ-content')
  })

  it('lists top-level subdirectories in the prompt', async () => {
    await fs.writeFile(path.join(tmpRoot, 'README.md'), 'r')
    await fs.mkdir(path.join(tmpRoot, 'runs'))
    await fs.mkdir(path.join(tmpRoot, 'drafts'))
    const { ctx, llm } = makeCtx(tmpRoot)
    await researchThreadPlugin.structure!(ctx)
    const prompt = llm.mock.calls[0]?.[0] as string
    expect(prompt).toMatch(/Top-level subdirectories:.*drafts.*runs/)
  })

  it('tolerates missing README.md (alphabetical fill catches whatever is there)', async () => {
    await fs.writeFile(path.join(tmpRoot, 'notes.md'), 'arbitrary notes content')
    const { ctx, llm } = makeCtx(tmpRoot)
    const out = await researchThreadPlugin.structure!(ctx)
    expect(out.content).toBe('synthesized-prose')
    const prompt = llm.mock.calls[0]?.[0] as string
    expect(prompt).toContain('arbitrary notes content')
  })

  it('tolerates an empty directory (still calls the LLM with just the title)', async () => {
    const { ctx, llm } = makeCtx(tmpRoot)
    await researchThreadPlugin.structure!(ctx)
    expect(llm).toHaveBeenCalledOnce()
    const prompt = llm.mock.calls[0]?.[0] as string
    expect(prompt).toContain('Thread: thread-x')
  })

  it('skips dotfiles + non-md files', async () => {
    await fs.writeFile(path.join(tmpRoot, 'README.md'), 'visible-content')
    await fs.writeFile(path.join(tmpRoot, '.hidden.md'), 'hidden-content')
    await fs.writeFile(path.join(tmpRoot, 'data.json'), '{"hidden":true}')
    const { ctx, llm } = makeCtx(tmpRoot)
    await researchThreadPlugin.structure!(ctx)
    const prompt = llm.mock.calls[0]?.[0] as string
    expect(prompt).toContain('visible-content')
    expect(prompt).not.toContain('hidden-content')
    expect(prompt).not.toContain('"hidden":true')
  })
})

describe('researchThreadPlugin.detail', () => {
  it('reads more files than structure (DETAIL_MAX_FILES > STRUCTURE_MAX_FILES)', async () => {
    // 6 files — more than STRUCTURE_MAX_FILES=3 but ≤ DETAIL_MAX_FILES=10.
    for (let i = 0; i < 6; i++) {
      await fs.writeFile(
        path.join(tmpRoot, `file-${i}.md`),
        `unique-content-${i}`,
      )
    }
    const { ctx, llm } = makeCtx(tmpRoot)
    ctx.zoom = 'detail'
    await researchThreadPlugin.detail!(ctx)
    const prompt = llm.mock.calls[0]?.[0] as string
    // All 6 should land in the detail prompt.
    for (let i = 0; i < 6; i++) {
      expect(prompt).toContain(`unique-content-${i}`)
    }
  })

  it('clamps individual file content at DETAIL_MAX_FILE_BYTES with truncated marker', async () => {
    const huge = 'x'.repeat(20 * 1024) // 20 KB > DETAIL_MAX_FILE_BYTES (16 KB)
    await fs.writeFile(path.join(tmpRoot, 'README.md'), huge)
    const { ctx, llm } = makeCtx(tmpRoot)
    ctx.zoom = 'detail'
    await researchThreadPlugin.detail!(ctx)
    const prompt = llm.mock.calls[0]?.[0] as string
    expect(prompt).toContain('…(truncated)')
  })
})
