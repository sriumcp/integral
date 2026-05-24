import { useEffect, useId, useMemo, useState } from 'react'
import type {
  NousWritebackConfig,
} from '@/adapters/nous/writeback'
import { NousWritebackConfigSchema } from '@/adapters/nous/writeback'
import type { WritebackTemplate } from '@/fixtures/shaping'
import type { SourceEntry } from '@/lib/sources'
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
}: WritebackFormProps) {
  const adapterSources = useMemo(
    () => registry.filter((s) => s.kind === 'adapter'),
    [registry]
  )

  // No adapter source = no place to write. Render nothing; ShapingSurface
  // commits in-memory only (the v0.1 backwards-compat path).
  // (Hooks must be called unconditionally below; we return null *after*
  //  declaring all hooks.)

  const [state, setState] = useState<FormState>(() => ({
    sourceId: adapterSources[0]?.id ?? '',
    max_iterations: String(template.max_iterations ?? 5),
    ts_name: template.target_system?.name ?? '',
    ts_description: template.target_system?.description ?? '',
    ts_repo_path: template.target_system?.repo_path ?? '',
    run_id: template.run_id ?? '',
  }))

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
        <input
          id={idRepo}
          type="text"
          className={styles.input}
          value={state.ts_repo_path}
          onChange={(e) => set('ts_repo_path', e.target.value)}
          placeholder="/absolute/path/to/repo"
        />
      </div>
      <div className={styles.row}>
        <label htmlFor={idRunId} className={styles.label}>
          run id (optional)
        </label>
        <input
          id={idRunId}
          type="text"
          className={styles.input}
          value={state.run_id}
          onChange={(e) => set('run_id', e.target.value)}
          placeholder="auto-derived from title"
        />
      </div>
    </section>
  )
}
