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
import * as os from 'node:os'
import * as path from 'node:path'
import { z } from 'zod'
import {
  runPreflight,
  type PreflightCheck,
  type PreflightDeps,
} from '../src/lib/nous-preflight'
import type { ConfiguredSource } from './sources-config'

/**
 * Wire schema for the request body. Zod-derived to match the project's
 * convention (writeback handler uses `NousWritebackConfigSchema.safeParse`).
 *
 * `target_system.repo_path` is optional because pre-flight surfaces
 * an empty path as a `fail` check; it doesn't reject the request.
 * Same for `runId` — empty/missing means "not yet derived."
 */
export const PreflightRequestSchema = z.object({
  sourceId: z.string().min(1),
  target_system: z
    .object({
      repo_path: z.string().optional(),
    })
    .passthrough(),
  runId: z.string().optional(),
})
export type PreflightRequest = z.infer<typeof PreflightRequestSchema>

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
  body: unknown,
  configuredSources: ReadonlyArray<ConfiguredSource>,
  deps?: PreflightHandlerDeps,
): Promise<PreflightHandlerResult> {
  const parsed = PreflightRequestSchema.safeParse(body)
  if (!parsed.success) {
    return {
      ok: false,
      status: 400,
      error: `request rejected by schema: ${JSON.stringify(parsed.error.issues)}`,
    }
  }
  const req = parsed.data

  const source = configuredSources.find((s) => s.id === req.sourceId)
  if (!source) {
    return {
      ok: false,
      status: 404,
      error: `unknown sourceId: ${req.sourceId}`,
    }
  }
  if (source.kind !== 'nous') {
    return {
      ok: false,
      status: 400,
      error:
        `pre-flight target source must be of kind "nous", got "${source.kind}". ` +
        `Per-adapter pre-flight is deferred per the v0.1.5 scope decision (CLAUDE.md § Project phase) — coral and github-issues are v0.3+.`,
    }
  }

  const checks = await runPreflight(
    {
      targetRepoPath: expandHome(req.target_system.repo_path),
      writebackPath: source.path,
      runId: req.runId ?? '',
    },
    deps ?? defaultDeps(),
  )

  return { ok: true, checks }
}

/**
 * Expand a leading `~/` (and bare `~`) to the user's home directory.
 * Matches `sources-config.ts`'s convention so user-typed paths in the
 * Shaping form work the same as paths in `integral.config.json`.
 *
 * Returns the input unchanged for empty/undefined/absolute paths.
 * `fs.stat` doesn't perform tilde expansion (that's a shell concern),
 * so the substrate must do it explicitly at the I/O boundary.
 */
export function expandHome(p: string | undefined): string | undefined {
  if (p === undefined || p.length === 0) return p
  if (p === '~') return os.homedir()
  if (p.startsWith('~/')) return path.join(os.homedir(), p.slice(2))
  return p
}

/**
 * Real-I/O deps factory. Probes the filesystem + PATH using Node
 * primitives.
 *
 * Error-handling discipline: each dep distinguishes "expected absence"
 * (ENOENT for paths; ENOENT or non-zero exit for `which`) from
 * unexpected failures (EACCES, ELOOP, EROFS, timeout). Expected
 * absence resolves to `false`; unexpected failures THROW so
 * `runPreflight`'s per-check try/catch surfaces them as `fail`/`warn`
 * with the original message — never silently degrade EACCES into
 * "doesn't exist."
 */
export function defaultDeps(): PreflightHandlerDeps {
  return {
    pathExists: async (p) => {
      try {
        const stat = await fs.stat(p)
        // `nous run` requires a directory; a file at the given path
        // is not a valid target. (`/etc/passwd` would otherwise pass
        // pre-flight but fail downstream.)
        return stat.isDirectory()
      } catch (err) {
        if (isErrnoCode(err, 'ENOENT', 'ENOTDIR')) return false
        throw err
      }
    },
    isWritable: async (p) => {
      try {
        await fs.access(p, fsConstants.W_OK)
        return true
      } catch (err) {
        if (isErrnoCode(err, 'ENOENT', 'EACCES')) return false
        throw err
      }
    },
    hasNousCli: async () => {
      try {
        await runQuiet('which', ['nous'])
        return true
      } catch (err) {
        // `which` exits non-zero when the command isn't on PATH; the
        // wrapper surfaces that as an Error whose code is undefined
        // (no `errno`-level code, just a non-zero exit). Treat any
        // ENOENT-ish or "non-zero exit" as "not installed" → false.
        // Distinguish timeouts: `child_process` sets `signal: 'SIGTERM'`
        // and the resulting Error reads "Command failed" but with the
        // signal property — those should propagate.
        if (isWhichNotFound(err)) return false
        throw err
      }
    },
    campaignFileExists: async (writebackPath, runId) => {
      try {
        const target = `${writebackPath.replace(/\/$/, '')}/campaign-${runId}.yaml`
        await fs.access(target)
        return true
      } catch (err) {
        if (isErrnoCode(err, 'ENOENT')) return false
        throw err
      }
    },
  }
}

/** True when `err` is a NodeJS errno error whose `.code` matches one
 *  of the supplied codes. Handles non-Error throws + missing code. */
function isErrnoCode(err: unknown, ...codes: string[]): boolean {
  if (typeof err !== 'object' || err === null) return false
  const code = (err as { code?: unknown }).code
  return typeof code === 'string' && codes.includes(code)
}

/** True when `err` represents "command not found" from a `which`
 *  invocation — either the spawn itself failed with ENOENT (which
 *  binary missing on PATH; rare on POSIX) or `which` exited non-zero
 *  (the more common case: the queried command isn't on PATH). Crucially
 *  excludes timeouts: `child_process` errors carry a `signal` property
 *  (SIGTERM) when killed by timeout, and we want those to propagate so
 *  the caller can distinguish "not installed" from "couldn't determine." */
function isWhichNotFound(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false
  const e = err as { code?: unknown; signal?: unknown }
  // Killed by timeout (SIGTERM) — propagate.
  if (typeof e.signal === 'string' && e.signal.length > 0) return false
  // `which nous` exited non-zero: e.code is the exit number. Any
  // non-zero exit means "not found in PATH." ENOENT (Node spawning
  // `which` itself failed) also means "not installed."
  if (e.code === 'ENOENT') return true
  if (typeof e.code === 'number' && e.code !== 0) return true
  return false
}

/**
 * Run a subprocess argv-style (no shell interpretation) and resolve
 * with stdout. Rejects on non-zero exit, spawn error, OR the 3000ms
 * timeout (SIGTERM kill). Used to probe the `nous` CLI without
 * shelling out.
 */
function runQuiet(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: 3000 }, (err, stdout) => {
      if (err) reject(err)
      else resolve(stdout)
    })
  })
}
