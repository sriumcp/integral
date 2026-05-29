import { promises as fs } from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { loadMeConfig } from './sources-config'

/**
 * Integration tests for `loadMeConfig` — the server-side resolver for the
 * current user's identity. Exercises real filesystem reads of
 * `integral.config.json` under a temp directory, so the config-parse +
 * fallback paths are tested end-to-end without mocking `node:fs`.
 *
 * Per CLAUDE.md § Patterns, the contract is:
 *  - configured `me: { id, display_name }` wins
 *  - missing `me` falls back to `os.userInfo().username`
 *  - malformed `me` (wrong types, empty strings) also falls back
 *  - unreadable config file falls back
 */
describe('loadMeConfig', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'integral-me-config-'))
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  async function writeConfig(body: object): Promise<void> {
    await fs.writeFile(
      path.join(tmpDir, 'integral.config.json'),
      JSON.stringify(body),
      'utf-8'
    )
  }

  it('returns OS username when config file is absent', async () => {
    const me = await loadMeConfig(tmpDir)
    const expected = os.userInfo().username
    expect(me.id).toBe(expected)
    expect(me.display_name).toBe(expected)
  })

  it('returns OS username when config has no `me` field', async () => {
    await writeConfig({ sources: [] })
    const me = await loadMeConfig(tmpDir)
    const expected = os.userInfo().username
    expect(me.id).toBe(expected)
    expect(me.display_name).toBe(expected)
  })

  it('returns configured value when both fields are valid', async () => {
    await writeConfig({
      me: { id: 'alice', display_name: 'Alice Liddell' },
    })
    const me = await loadMeConfig(tmpDir)
    expect(me.id).toBe('alice')
    expect(me.display_name).toBe('Alice Liddell')
  })

  it('falls back to OS username when `me.id` is empty string', async () => {
    await writeConfig({ me: { id: '', display_name: 'Alice' } })
    const me = await loadMeConfig(tmpDir)
    expect(me.id).toBe(os.userInfo().username)
  })

  it('falls back to OS username when `me.display_name` is missing', async () => {
    await writeConfig({ me: { id: 'alice' } })
    const me = await loadMeConfig(tmpDir)
    expect(me.id).toBe(os.userInfo().username)
  })

  it('falls back to OS username when `me` is not an object', async () => {
    await writeConfig({ me: 'alice' })
    const me = await loadMeConfig(tmpDir)
    expect(me.id).toBe(os.userInfo().username)
  })

  it('falls back to OS username when config file is malformed JSON', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'integral.config.json'),
      '{not valid json',
      'utf-8'
    )
    const me = await loadMeConfig(tmpDir)
    expect(me.id).toBe(os.userInfo().username)
  })

  it('configured me does not require a `sources` field', async () => {
    await writeConfig({ me: { id: 'alice', display_name: 'alice' } })
    const me = await loadMeConfig(tmpDir)
    expect(me.id).toBe('alice')
    expect(me.display_name).toBe('alice')
  })
})
