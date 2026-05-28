/**
 * Server-side handler for `POST /api/nous/preflight`.
 *
 * Receives a `(sourceId, target_system, runId)` triple from the Shaping
 * surface, resolves the source's filesystem path, and runs the pure
 * `runPreflight` engine with real filesystem + PATH probing.
 *
 * Returns a `{checks: PreflightCheck[]}` payload the browser hook
 * surfaces inline next to the relevant fields. Failures here gate the
 * commit button — see `WritebackForm.tsx` and `roadmap.md § Falsification
 * per adapter` (the v0.1.5 Nous stop condition).
 *
 * Architecture: the heavy lifting lives in `src/lib/nous-preflight.ts`
 * (pure, browser-safe). This file is the wiring — Zod validation +
 * source resolution + real I/O deps. Same pattern as writeback-handler.
 *
 * Server-side only — `node:fs`, `node:child_process` imports.
 */

import { promises as fs, constants as fsConstants } from 'node:fs'
import { execFile } from 'node:child_process'
import {
  runPreflight,
  type PreflightCheck,
  type PreflightDeps,
} from '../src/lib/nous-preflight'
import type { ConfiguredSource } from './sources-config'

/** The wire request from the browser hook. Loosely typed because it
 *  comes from the network; the handler validates it explicitly. */
export interface PreflightHandlerRequest {
  sourceId?: unknown
  target_system?: unknown
  runId?: unknown
}

export type PreflightHandlerDeps = PreflightDeps

export type PreflightHandlerResult =
  | {
      ok: true
      checks: PreflightCheck[]
    }
  | {
      ok: false
      status: 400 | 404 | 500
      error: string
    }

/**
 * Validate input + resolve source + run the pre-flight engine. The
 * `deps` arg is dependency-injection so tests can swap real I/O for
 * fakes; production callers omit it and get the real-deps default.
 */
export async function handlePreflight(
  body: PreflightHandlerRequest | object | null,
  configuredSources: ReadonlyArray<ConfiguredSource>,
  deps?: PreflightHandlerDeps,
): Promise<PreflightHandlerResult> {
  // ── Validate inputs ──────────────────────────────────────────────────
  if (!body || typeof body !== 'object') {
    return { ok: false, status: 400, error: 'malformed request body' }
  }
  const b = body as PreflightHandlerRequest

  if (typeof b.sourceId !== 'string' || b.sourceId.length === 0) {
    return { ok: false, status: 400, error: 'sourceId is required' }
  }

  if (!b.target_system || typeof b.target_system !== 'object') {
    return {
      ok: false,
      status: 400,
      error: 'target_system is required',
    }
  }
  const ts = b.target_system as { repo_path?: unknown }
  // repo_path may be empty/undefined — pre-flight surfaces that as a
  // fail check, not a request error. Only its *type* needs guarding.
  const repoPath =
    typeof ts.repo_path === 'string' ? ts.repo_path : undefined

  // runId is optional; missing/non-string treated as empty (deferred derivation).
  const runId = typeof b.runId === 'string' ? b.runId : ''

  // ── Resolve source ───────────────────────────────────────────────────
  const source = configuredSources.find((s) => s.id === b.sourceId)
  if (!source) {
    return {
      ok: false,
      status: 404,
      error: `unknown sourceId: ${b.sourceId}`,
    }
  }
  if (source.kind !== 'nous') {
    return {
      ok: false,
      status: 400,
      error:
        `pre-flight target source must be of kind "nous", got "${source.kind}". ` +
        `Per-adapter pre-flight (coral, github-issues, paper) is v0.2 with the orchestrator.`,
    }
  }

  // ── Run pre-flight ───────────────────────────────────────────────────
  const checks = await runPreflight(
    {
      targetRepoPath: repoPath,
      writebackPath: source.path,
      runId,
    },
    deps ?? defaultDeps(),
  )

  return { ok: true, checks }
}

/**
 * Real-I/O deps factory. Probes the filesystem + PATH using Node
 * primitives. Errors are caught at the per-check level by `runPreflight`,
 * so any throw here surfaces as a check fail rather than a 500.
 */
export function defaultDeps(): PreflightHandlerDeps {
  return {
    pathExists: async (p) => {
      try {
        const stat = await fs.stat(p)
        return stat.isDirectory() || stat.isFile()
      } catch {
        return false
      }
    },
    isWritable: async (p) => {
      try {
        await fs.access(p, fsConstants.W_OK)
        return true
      } catch {
        return false
      }
    },
    hasNousCli: async () => {
      try {
        await runQuiet('which', ['nous'])
        return true
      } catch {
        return false
      }
    },
    campaignFileExists: async (writebackPath, runId) => {
      try {
        // Match writeback-handler: target file is `campaign-<runId>.yaml`
        // under writebackPath. Use a manual join to avoid a `path` import
        // mismatch with the writeback handler's identical behavior.
        const target = `${writebackPath.replace(/\/$/, '')}/campaign-${runId}.yaml`
        await fs.access(target)
        return true
      } catch {
        return false
      }
    },
  }
}

/**
 * Run a subprocess argv-style (no shell interpretation) and resolve
 * with stdout. Rejects on non-zero exit or spawn error. Used to probe
 * the `nous` CLI without shelling out — the ENOENT path is the
 * primary signal here.
 */
function runQuiet(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: 3000 }, (err, stdout) => {
      if (err) reject(err)
      else resolve(stdout)
    })
  })
}
