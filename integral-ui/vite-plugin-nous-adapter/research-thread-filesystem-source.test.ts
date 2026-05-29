/**
 * FilesystemResearchThreadSource — integration tests against real
 * temp directories.
 *
 * Filesystem-isolated in `os.tmpdir()` — never touches the user's
 * actual `~/Documents/Projects/...` trees.
 */

import { promises as fs } from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { FilesystemResearchThreadSource } from './research-thread-filesystem-source'

let tmpRoot: string

beforeEach(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'integral-rt-'))
})

afterEach(async () => {
  await fs.rm(tmpRoot, { recursive: true, force: true })
})

describe('FilesystemResearchThreadSource', () => {
  it('returns [] gracefully when the parent directory does not exist', async () => {
    const source = new FilesystemResearchThreadSource(
      path.join(tmpRoot, 'nonexistent'),
    )
    expect(await source.listThreads()).toEqual([])
  })

  it('returns [] when the parent dir exists but has no subdirs', async () => {
    // Just files at top level — no thread subdirs.
    await fs.writeFile(path.join(tmpRoot, 'README.md'), 'hi')
    const source = new FilesystemResearchThreadSource(tmpRoot)
    expect(await source.listThreads()).toEqual([])
  })

  it('discovers each immediate subdirectory as a thread', async () => {
    await fs.mkdir(path.join(tmpRoot, 'ea-control-stack'))
    await fs.mkdir(path.join(tmpRoot, 'plateau-study'))
    const source = new FilesystemResearchThreadSource(tmpRoot)
    const threads = await source.listThreads()
    expect(threads.map((t) => t.name)).toEqual([
      'ea-control-stack',
      'plateau-study',
    ])
  })

  it('skips dotfiles + hidden directories', async () => {
    await fs.mkdir(path.join(tmpRoot, '.git'))
    await fs.mkdir(path.join(tmpRoot, '.cache'))
    await fs.mkdir(path.join(tmpRoot, 'real-thread'))
    const source = new FilesystemResearchThreadSource(tmpRoot)
    const threads = await source.listThreads()
    expect(threads.map((t) => t.name)).toEqual(['real-thread'])
  })

  it('skips file entries (only directories become threads)', async () => {
    await fs.mkdir(path.join(tmpRoot, 'thread-1'))
    await fs.writeFile(path.join(tmpRoot, 'random.md'), 'not a thread')
    const source = new FilesystemResearchThreadSource(tmpRoot)
    const threads = await source.listThreads()
    expect(threads.map((t) => t.name)).toEqual(['thread-1'])
  })

  it('attaches an absolute rootPath per thread', async () => {
    await fs.mkdir(path.join(tmpRoot, 'thread-1'))
    const source = new FilesystemResearchThreadSource(tmpRoot)
    const [t] = await source.listThreads()
    expect(t!.rootPath).toBe(path.resolve(tmpRoot, 'thread-1'))
  })

  it('attaches an ISO 8601 lastModified timestamp from the directory mtime', async () => {
    await fs.mkdir(path.join(tmpRoot, 'thread-1'))
    const source = new FilesystemResearchThreadSource(tmpRoot)
    const [t] = await source.listThreads()
    // RFC3339-ish: starts with YYYY-MM-DD
    expect(t!.lastModified).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    // And it parses back into a date
    expect(Number.isFinite(new Date(t!.lastModified).getTime())).toBe(true)
  })

  it('returns threads sorted alphabetically by name (stable display order)', async () => {
    await fs.mkdir(path.join(tmpRoot, 'zebra'))
    await fs.mkdir(path.join(tmpRoot, 'alpha'))
    await fs.mkdir(path.join(tmpRoot, 'mango'))
    const source = new FilesystemResearchThreadSource(tmpRoot)
    const threads = await source.listThreads()
    expect(threads.map((t) => t.name)).toEqual(['alpha', 'mango', 'zebra'])
  })

  it('preserves the configured id / label (used by /api/sources response)', async () => {
    const source = new FilesystemResearchThreadSource(tmpRoot, {
      id: 'my-rt',
      label: 'My Research Threads',
    })
    expect(source.id).toBe('my-rt')
    expect(source.label).toBe('My Research Threads')
  })

  it('exposes the parent path so chrome features can compose paths against it', async () => {
    const source = new FilesystemResearchThreadSource(tmpRoot)
    expect(source.path).toBe(path.resolve(tmpRoot))
  })
})
