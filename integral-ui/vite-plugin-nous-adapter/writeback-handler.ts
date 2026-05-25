/**
 * Server-side handler for `POST /api/nous/writeback`.
 *
 * Takes a `(sourceId, intent, config)` triple from the browser, resolves
 * the source's filesystem path via `integral.config.json`, serializes the
 * Intent + config to YAML, and writes the file at
 * `<source.path>/campaign-<run_id>.yaml`.
 *
 * Discipline:
 *  - Refuse-overwrite: if the target file already exists, return 409.
 *    The user picks a different run_id or removes the existing file.
 *  - Validate target path: must be a writable directory.
 *  - Schema-validate the config payload via `NousWritebackConfigSchema`
 *    on the way in.
 *  - Server-side only — `fs`, `path` imports.
 */

import { promises as fs } from 'node:fs'
import * as path from 'node:path'
import {
  NousWritebackConfigSchema,
  derivedRunId,
  serializeNousCampaign,
  type NousWritebackConfig,
} from '../src/adapters/nous/writeback'
import { IntentSchema, type Intent } from '../src/schema'
import type { ConfiguredSource } from './sources-config'

export interface WritebackRequest {
  sourceId: string
  intent: unknown
  config: unknown
}

export type WritebackResult =
  | {
      ok: true
      path: string
      run_id: string
    }
  | {
      ok: false
      status: 400 | 404 | 409 | 500
      error: string
    }

export async function handleWriteback(
  body: WritebackRequest,
  configuredSources: ReadonlyArray<ConfiguredSource>
): Promise<WritebackResult> {
  // ── Validate inputs ────────────────────────────────────────────────────
  if (!body || typeof body !== 'object') {
    return { ok: false, status: 400, error: 'malformed request body' }
  }
  if (typeof body.sourceId !== 'string' || body.sourceId.length === 0) {
    return { ok: false, status: 400, error: 'sourceId is required' }
  }

  const intentParse = IntentSchema.safeParse(body.intent)
  if (!intentParse.success) {
    return {
      ok: false,
      status: 400,
      error: `intent rejected by schema: ${JSON.stringify(intentParse.error.issues)}`,
    }
  }
  const intent: Intent = intentParse.data

  if (intent.kind !== 'nous-campaign') {
    return {
      ok: false,
      status: 400,
      error: `writeback expects nous-campaign, got ${intent.kind}`,
    }
  }

  const configParse = NousWritebackConfigSchema.safeParse(body.config)
  if (!configParse.success) {
    return {
      ok: false,
      status: 400,
      error: `writeback config rejected: ${JSON.stringify(configParse.error.issues)}`,
    }
  }
  const config: NousWritebackConfig = configParse.data

  // ── Resolve source ─────────────────────────────────────────────────────
  const source = configuredSources.find((s) => s.id === body.sourceId)
  if (!source) {
    return {
      ok: false,
      status: 404,
      error: `unknown sourceId: ${body.sourceId}`,
    }
  }
  if (source.kind !== 'nous') {
    return {
      ok: false,
      status: 400,
      error: `writeback target source must be of kind "nous", got "${source.kind}"`,
    }
  }

  // ── Verify target dir exists + writable ────────────────────────────────
  try {
    const stat = await fs.stat(source.path)
    if (!stat.isDirectory()) {
      return {
        ok: false,
        status: 400,
        error: `source path is not a directory: ${source.path}`,
      }
    }
    await fs.access(source.path, (await import('node:fs')).constants.W_OK)
  } catch (err) {
    return {
      ok: false,
      status: 400,
      error: `source path inaccessible: ${err instanceof Error ? err.message : String(err)}`,
    }
  }

  // ── Compose target path; refuse overwrite ──────────────────────────────
  const runId = config.run_id ?? derivedRunId(intent.declaration.title)
  if (runId.length === 0) {
    return {
      ok: false,
      status: 400,
      error: 'derived run_id was empty (intent title produced no slug)',
    }
  }
  const targetPath = path.join(source.path, `campaign-${runId}.yaml`)

  try {
    await fs.access(targetPath)
    // File exists — refuse overwrite.
    return {
      ok: false,
      status: 409,
      error: `campaign-${runId}.yaml already exists at ${source.path}; pick a different run_id or remove the existing file`,
    }
  } catch {
    // ENOENT — good. We can write.
  }

  // ── Serialize + write ──────────────────────────────────────────────────
  let yaml: string
  try {
    yaml = serializeNousCampaign(intent, config)
  } catch (err) {
    return {
      ok: false,
      status: 500,
      error: `serializer threw: ${err instanceof Error ? err.message : String(err)}`,
    }
  }

  try {
    await fs.writeFile(targetPath, yaml, 'utf-8')
  } catch (err) {
    return {
      ok: false,
      status: 500,
      error: `write failed: ${err instanceof Error ? err.message : String(err)}`,
    }
  }

  return { ok: true, path: targetPath, run_id: runId }
}

/** Read the JSON request body off a Node http.IncomingMessage. */
export async function readJsonBody(
  req: import('node:http').IncomingMessage
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf-8')
        if (raw.length === 0) return resolve(null)
        resolve(JSON.parse(raw))
      } catch (err) {
        reject(err)
      }
    })
    req.on('error', reject)
  })
}
