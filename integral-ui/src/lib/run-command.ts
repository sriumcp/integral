/**
 * run-command — pure dispatcher that resolves a typed Intent into the
 * exact shell command a user can paste into a terminal.
 *
 * v0.1 (A5) ships one plugin (`nous-campaign`); the dispatcher itself
 * is kind-agnostic. v0.2 adds Coral / GitHub-issue feature-dev / paper
 * runners with no chrome change.
 *
 * Discipline:
 *   - Engine is pure: takes plugins as injected deps. No env, no fs, no
 *     network. The Vite plugin doesn't need to know about this file.
 *   - The chrome renders nothing when this returns null. Plugins return
 *     null for any reason (kind mismatch, state mismatch, intent shape
 *     unrecognized, source missing) — the dispatcher does not interpret
 *     the reason.
 *   - Shell quoting follows the POSIX `'...'` + `'\''` escape pattern.
 *     We do not target Windows shells; Integral is dev-only and Nous
 *     targets *nix.
 */

import type { Intent, IntentKind, IntentState } from '@/schema'
import type { SourceEntry } from '@/lib/sources'

// ─── Types ─────────────────────────────────────────────────────────────────

export interface RunCommand {
  /** Absolute working directory the command must be invoked from. */
  cwd: string
  /** argv tokens (program + args), unquoted, ready to spawn or join. */
  argv: string[]
  /** Single-line, shell-quoted, paste-ready: `cd '<cwd>' && <argv...>`. */
  oneLiner: string
}

export interface RunCommandPluginArgs {
  intent: Intent
  state: IntentState
  source: SourceEntry
}

export type RunCommandPlugin = (args: RunCommandPluginArgs) => RunCommand | null

export type RunCommandRegistry = Partial<Record<IntentKind, RunCommandPlugin>>

export interface RunCommandForArgs {
  intent: Intent
  state: IntentState
  registry: ReadonlyArray<SourceEntry>
  plugins: RunCommandRegistry
}

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Resolve a typed Intent into the shell command that runs its harness.
 *
 * Returns null when:
 *   - no plugin registered for `intent.kind`
 *   - intent has no `provenance.source`
 *   - the source id isn't in the registry
 *   - the plugin itself opts out (state mismatch, malformed id, etc.)
 *
 * The chrome's contract: render nothing when this returns null.
 */
export function runCommandFor(args: RunCommandForArgs): RunCommand | null {
  const plugin = args.plugins[args.intent.kind]
  if (!plugin) return null

  const sourceId = args.intent.provenance.source
  if (!sourceId) return null

  const source = args.registry.find((s) => s.id === sourceId)
  if (!source) return null

  return plugin({ intent: args.intent, state: args.state, source })
}

// ─── Shell quoting ─────────────────────────────────────────────────────────

/**
 * POSIX-safe single-quote wrapping with `'\''` escape for embedded single
 * quotes. This is the standard way to quote arbitrary strings for `sh`/
 * `bash`/`zsh` without worrying about $-expansion or backslash escapes.
 *
 * Output is always wrapped in single quotes (even for empty input), so
 * concatenated commands always parse correctly.
 */
export function shellQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`
}

/** A token that is "simple" enough to render unquoted in a one-liner.
 *  Conservative: alphanumerics, dash, dot, underscore, slash. Anything
 *  else gets shellQuote'd to be safe. */
function isSimpleToken(s: string): boolean {
  return /^[A-Za-z0-9._\-/]+$/.test(s) && s.length > 0
}

/**
 * Compose a paste-ready one-liner: `cd '<cwd>' && <argv joined with spaces>`.
 *
 * - cwd is always shell-quoted (paths can contain anything).
 * - argv items are quoted only if they contain shell-significant chars,
 *   to keep the readable line free of clutter.
 */
export function composeOneLiner(args: {
  cwd: string
  argv: string[]
}): string {
  const argvStr = args.argv
    .map((tok) => (isSimpleToken(tok) ? tok : shellQuote(tok)))
    .join(' ')
  return `cd ${shellQuote(args.cwd)} && ${argvStr}`
}
