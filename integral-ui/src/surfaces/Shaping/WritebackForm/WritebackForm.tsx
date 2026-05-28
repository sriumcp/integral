import { useEffect, useId, useMemo, useState } from 'react'
import type {
  NousWritebackConfig,
} from '@/adapters/nous/writeback'
import { NousWritebackConfigSchema } from '@/adapters/nous/writeback'
import type { WritebackTemplate } from '@/fixtures/shaping'
import type { SourceEntry } from '@/lib/sources'
import type { PreflightCheck } from '@/lib/nous-preflight'
import { SectionLabel } from '@/components/atoms'
import styles from './WritebackForm.module.css'

export interface WritebackFormChange {
  sourceId: string
  config: NousWritebackConfig
}

export interface WritebackFormProps {
  /** Source registry from the App; the form filters to adapter-kind. */
  registry: ReadonlyArray<SourceEntry>
  /** Pre-fill values from the draft's writeback_template (per fixture). */
  template: WritebackTemplate
  /** Fired on every keystroke. Emits `null` when fields are invalid;
   *  emits a fully-validated `{sourceId, config}` when ready to commit.
   *  ShapingSurface uses this to gate the commit button. */
  onChange: (change: WritebackFormChange | null) => void
  /** Latest pre-flight check results. `null` before any settle. The
   *  surface drives the hook (debounced); the form just renders the
   *  indicator next to the relevant field. */
  preflight?: ReadonlyArray<PreflightCheck> | null
}

/** Glyph rendered inside the preflight pill. Kept as text (not SVG) so
 *  it composes with the `font-mono` baseline + remains accessible to
 *  screen readers via the test id + title attribute. */
function statusGlyph(status: PreflightCheck['status']): string {
  if (status === 'ok') return '✓'
  if (status === 'warn') return '!'
  return '✗'
}

/**
 * Render the per-check status pill. Returns null if the check isn't
 * present in the array (preflight hasn't covered it yet, or the
 * server didn't emit it). The test asserts on `data-testid`, so the
 * markup contract is: `<span data-testid="preflight-<name>"
 * data-preflight-status="<status>" title="<message>" />`.
 *
 * `message` is type-narrowed via the discriminated `PreflightCheck`:
 * `ok` carries no message; `warn|fail` always carries one.
 */
function PreflightIndicator({
  checks,
  name,
}: {
  checks: ReadonlyArray<PreflightCheck> | null | undefined
  name: string
}) {
  if (!checks) return null
  const check = checks.find((c) => c.name === name)
  if (!check) return null
  const message = check.status === 'ok' ? undefined : check.message
  return (
    <span
      className={styles.preflight}
      data-testid={`preflight-${name}`}
      data-preflight-status={check.status}
      role="status"
      aria-label={`${name}: ${check.status}${message ? ` — ${message}` : ''}`}
      {...(message ? { title: message } : {})}
    >
      {statusGlyph(check.status)}
    </span>
  )
}

interface FormState {
  sourceId: string
  max_iterations: string
  ts_name: string
  ts_description: string
  ts_repo_path: string
  run_id: string
}

/**
 * WritebackForm — collects Nous writeback config inside the Shaping
 * surface. Pre-fills from the draft's `writeback_template`, validates on
 * every change via `NousWritebackConfigSchema`, and emits the validated
 * config (or `null` if invalid) up to the surface so the commit button
 * can gate on it.
 *
 * Renders nothing when the registry has no adapter sources — there's
 * nowhere to write to. The commit button in `ShapingSurface` falls back
 * to in-memory-only behavior in that case.
 */
export function WritebackForm({
  registry,
  template,
  onChange,
  preflight,
}: WritebackFormProps) {
  const adapterSources = useMemo(
    () => registry.filter((s) => s.kind === 'adapter'),
    [registry]
  )

  // Hooks must run unconditionally per React's rules — we declare all
  // hooks first, then return null at the bottom of this function when
  // there's no adapter source to write to (ShapingSurface falls back
  // to in-memory-only commit in that case).

  const [state, setState] = useState<FormState>(() => ({
    sourceId: adapterSources[0]?.id ?? '',
    max_iterations: String(template.max_iterations ?? 5),
    ts_name: template.target_system?.name ?? '',
    ts_description: template.target_system?.description ?? '',
    ts_repo_path: template.target_system?.repo_path ?? '',
    run_id: template.run_id ?? '',
  }))

  // A4.6: when the parent's `template` changes (LLM patches arrive
  // during shaping), sync the form's internal state for any field the
  // user hasn't already started editing into a non-empty value. This
  // gives the user the "form auto-fills as conversation progresses"
  // experience without clobbering typing-in-progress.
  useEffect(() => {
    setState((prev) => {
      const next: FormState = { ...prev }
      const tsName = template.target_system?.name ?? ''
      const tsDesc = template.target_system?.description ?? ''
      const tsRepo = template.target_system?.repo_path ?? ''
      // Only update fields that are still empty in the form state.
      // This protects the user's in-flight edits.
      if (prev.ts_name === '' && tsName !== '') next.ts_name = tsName
      if (prev.ts_description === '' && tsDesc !== '') next.ts_description = tsDesc
      if (prev.ts_repo_path === '' && tsRepo !== '') next.ts_repo_path = tsRepo
      if (template.max_iterations !== undefined && prev.max_iterations === '5') {
        next.max_iterations = String(template.max_iterations)
      }
      if (template.run_id !== undefined && prev.run_id === '') {
        next.run_id = template.run_id
      }
      return next
    })
  }, [template])

  // Re-emit validated config whenever fields change. Pure derivation
  // from `state` so the parent gets a stable signal each render.
  useEffect(() => {
    if (adapterSources.length === 0) {
      onChange(null)
      return
    }
    const max = Number(state.max_iterations)
    const candidate: unknown = {
      max_iterations: Number.isFinite(max) ? max : Number.NaN,
      target_system: {
        name: state.ts_name,
        description: state.ts_description,
        repo_path: state.ts_repo_path,
      },
      ...(state.run_id.length > 0 ? { run_id: state.run_id } : {}),
    }
    const parsed = NousWritebackConfigSchema.safeParse(candidate)
    if (!parsed.success) {
      onChange(null)
      return
    }
    onChange({ sourceId: state.sourceId, config: parsed.data })
  }, [state, adapterSources.length, onChange])

  const idMax = useId()
  const idName = useId()
  const idDesc = useId()
  const idRepo = useId()
  const idRunId = useId()
  const idSource = useId()

  if (adapterSources.length === 0) return null

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setState((prev) => ({ ...prev, [k]: v }))

  return (
    <section className={styles.section}>
      <SectionLabel hint="writeback">target</SectionLabel>
      <div className={styles.row}>
        <label htmlFor={idSource} className={styles.label}>
          target source
        </label>
        <div className={styles.inputWrap}>
          <select
            id={idSource}
            className={styles.input}
            value={state.sourceId}
            onChange={(e) => set('sourceId', e.target.value)}
          >
            {adapterSources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label} ({s.id})
              </option>
            ))}
          </select>
          <PreflightIndicator
            checks={preflight}
            name="writeback-target-writable"
          />
        </div>
      </div>
      <div className={styles.row}>
        <label htmlFor={idMax} className={styles.label}>
          max iterations
        </label>
        <input
          id={idMax}
          type="number"
          min={1}
          className={styles.input}
          value={state.max_iterations}
          onChange={(e) => set('max_iterations', e.target.value)}
        />
      </div>
      <div className={styles.row}>
        <label htmlFor={idName} className={styles.label}>
          target system name
        </label>
        <input
          id={idName}
          type="text"
          className={styles.input}
          value={state.ts_name}
          onChange={(e) => set('ts_name', e.target.value)}
        />
      </div>
      <div className={styles.row}>
        <label htmlFor={idDesc} className={styles.label}>
          target system description
        </label>
        <textarea
          id={idDesc}
          className={styles.textarea}
          rows={2}
          value={state.ts_description}
          onChange={(e) => set('ts_description', e.target.value)}
        />
      </div>
      <div className={styles.row}>
        <label htmlFor={idRepo} className={styles.label}>
          target system repo path
        </label>
        <div className={styles.inputWrap}>
          <input
            id={idRepo}
            type="text"
            className={styles.input}
            value={state.ts_repo_path}
            onChange={(e) => set('ts_repo_path', e.target.value)}
            placeholder="/absolute/path/to/repo"
          />
          <PreflightIndicator
            checks={preflight}
            name="repo-path-exists"
          />
        </div>
      </div>
      <div className={styles.row}>
        <label htmlFor={idRunId} className={styles.label}>
          run id (optional)
        </label>
        <div className={styles.inputWrap}>
          <input
            id={idRunId}
            type="text"
            className={styles.input}
            value={state.run_id}
            onChange={(e) => set('run_id', e.target.value)}
            placeholder="auto-derived from title"
          />
          <PreflightIndicator
            checks={preflight}
            name="run-id-not-in-use"
          />
        </div>
      </div>
      {preflight && (
        <div className={styles.envRow} data-testid="preflight-env-row">
          <span className={styles.envLabel}>environment</span>
          <PreflightIndicator
            checks={preflight}
            name="nous-cli-available"
          />
        </div>
      )}
    </section>
  )
}
