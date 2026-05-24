import { useCallback, useEffect, useState } from 'react'
import type { Intent, IntentState } from '@/schema'
import type { SourceEntry } from '@/lib/sources'
import { runCommandFor } from '@/lib/run-command'
import { nousCampaignRunCommand } from '@/lib/run-command-plugins/nous-campaign'
import { SectionLabel } from '@/components/atoms'
import styles from './RunCommand.module.css'

export interface RunCommandProps {
  intent: Intent
  state: IntentState
  registry: ReadonlyArray<SourceEntry>
}

const PLUGINS = {
  'nous-campaign': nousCampaignRunCommand,
}

const COPIED_FLASH_MS = 1800

/**
 * RunCommand — paste-ready shell invocation for an `active` or `gated`
 * Nous campaign. Lives between ProjectionSection and ChildrenSection on
 * the Detail surface.
 *
 * The chrome's job is to remove the thought work between "campaign is
 * shaped" and "shell line is executable." The user runs the line in
 * their terminal; Integral never spawns processes here. See A5 framing
 * in `roadmap.md` and `integral-ui/.plan-a5.md`.
 *
 * Renders nothing when the dispatcher returns null (kind mismatch, state
 * not active/gated, source missing, intent id unrecognized).
 */
export function RunCommand({ intent, state, registry }: RunCommandProps) {
  const cmd = runCommandFor({ intent, state, registry, plugins: PLUGINS })
  const [copied, setCopied] = useState(false)

  // Reset the "copied ✓" flash if the underlying command changes mid-flash.
  useEffect(() => {
    setCopied(false)
  }, [cmd?.oneLiner])

  const onCopy = useCallback(async () => {
    if (!cmd) return
    try {
      await navigator.clipboard.writeText(cmd.oneLiner)
      setCopied(true)
    } catch {
      // Clipboard denied or unavailable. Fail silently — the line is
      // visible on screen and the user can select it manually. We
      // intentionally don't surface an error toast in v0.1.
    }
  }, [cmd])

  useEffect(() => {
    if (!copied) return
    const t = window.setTimeout(() => setCopied(false), COPIED_FLASH_MS)
    return () => window.clearTimeout(t)
  }, [copied])

  if (!cmd) return null

  return (
    <section
      className={styles.section}
      data-testid="run-command-panel"
      aria-label="run command"
    >
      <SectionLabel>run command</SectionLabel>
      <p className={styles.lead}>to advance this campaign, run from your terminal:</p>
      <pre className={styles.command}>
        <code>cd {cmd.cwd}</code>
        {'\n'}
        <code>{cmd.argv.join(' ')}</code>
      </pre>
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.copyButton}
          onClick={onCopy}
          aria-label={copied ? 'copied' : 'copy command'}
        >
          {copied ? 'copied ✓' : '⧉ copy'}
        </button>
        <span className={styles.hint}>
          then click ↻ refresh above to see iterations.
        </span>
      </div>
    </section>
  )
}
