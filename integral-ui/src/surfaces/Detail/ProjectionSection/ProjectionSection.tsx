import { useCallback, useEffect, useState } from 'react'
import type { ZoomLevel } from '@/schema'
import { SectionLabel } from '@/components/atoms'
import styles from './ProjectionSection.module.css'

export interface ProjectionSectionProps {
  intentId: string
  zoom: ZoomLevel
}

interface ProjectionResponse {
  content: string
  source: 'llm' | 'fallback'
  /** Present when source='llm' and the server cached this projection. */
  generated_at?: string
  model?: string
}

/**
 * ProjectionSection — fetches the (kind, zoom)-indexed projection from
 * the Vite plugin's `/api/projection` endpoint and renders the prose.
 *
 * Per the matrix framing in `semantics-v0.1.md` S-1: the engine returns
 * `source: 'fallback'` for cells without an LLM plugin (or when the
 * server has no API key) and `source: 'llm'` for the 4 v0.1 cells
 * (nous-campaign × {structure, detail}, nous-iteration × {structure,
 * detail}). The chrome treats both shapes the same; the
 * `data-projection-source` attribute lets future styling distinguish
 * them if useful.
 *
 * Persistence: when source='llm', the response includes `generated_at`
 * (set by the server's disk cache layer). The chrome surfaces this as a
 * "generated <relative-time> ago" hint and offers a `regenerate` button
 * that re-fetches with `?refresh=true` so the user can force a fresh
 * LLM call when the cached prose is stale or wrong.
 *
 * Renders nothing on overview zoom — overview is the Map's job, not
 * Detail's. Renders nothing on fetch error so the chrome stays clean.
 */
export function ProjectionSection({ intentId, zoom }: ProjectionSectionProps) {
  const [projection, setProjection] = useState<ProjectionResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [errored, setErrored] = useState(false)

  const fetchProjection = useCallback(
    (refresh: boolean): (() => void) => {
      let cancelled = false
      setLoading(true)
      setErrored(false)
      const params = new URLSearchParams({ intent_id: intentId, zoom })
      if (refresh) params.set('refresh', 'true')
      fetch(`/api/projection?${params.toString()}`)
        .then(async (res) => {
          if (!res.ok) throw new Error(`projection fetch failed: ${res.status}`)
          return res.json() as Promise<ProjectionResponse>
        })
        .then((body) => {
          if (cancelled) return
          setProjection(body)
          setLoading(false)
        })
        .catch(() => {
          if (cancelled) return
          setErrored(true)
          setLoading(false)
        })
      return () => {
        cancelled = true
      }
    },
    [intentId, zoom]
  )

  useEffect(() => {
    if (zoom === 'overview') {
      setProjection(null)
      return
    }
    return fetchProjection(false)
  }, [intentId, zoom, fetchProjection])

  if (zoom === 'overview') return null
  if (errored) return null

  if (loading && !projection) {
    return (
      <section className={styles.section} data-testid="projection-loading">
        <SectionLabel>summary</SectionLabel>
        <p className={styles.loadingText}>summarizing…</p>
      </section>
    )
  }

  if (!projection) return null

  const isLLM = projection.source === 'llm'
  const isRegenerating = loading && !!projection
  const generatedAtRel = projection.generated_at
    ? humanRelTime(projection.generated_at)
    : null
  const stale = projection.generated_at
    ? Date.now() - new Date(projection.generated_at).getTime() > 60 * 60 * 1000
    : false

  return (
    <section className={styles.section}>
      <SectionLabel
        hint={projection.source === 'fallback' ? 'raw' : undefined}
      >
        summary
      </SectionLabel>
      <p
        className={styles.prose}
        data-projection-source={projection.source}
        data-regenerating={isRegenerating ? 'true' : undefined}
      >
        {projection.content}
      </p>
      {isLLM && (
        <footer className={styles.footer}>
          {isRegenerating ? (
            <span className={styles.regeneratingText}>regenerating…</span>
          ) : (
            generatedAtRel && (
              <span
                className={styles.timestamp}
                data-stale={stale ? 'true' : undefined}
              >
                generated {generatedAtRel} ago
                {projection.model ? ` · ${projection.model}` : ''}
              </span>
            )
          )}
          <button
            type="button"
            className={styles.regenerateButton}
            onClick={() => fetchProjection(true)}
            disabled={loading}
            title="rewrite this summary with a fresh LLM call"
          >
            ↻ regenerate
          </button>
        </footer>
      )}
    </section>
  )
}

function humanRelTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 0) return 'just now'
  if (ms < 60_000) return 'just now'
  const m = Math.round(ms / 60_000)
  if (m < 60) return `${m}m`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h`
  const d = Math.round(h / 24)
  if (d < 30) return `${d}d`
  const mo = Math.round(d / 30)
  return `${mo}mo`
}
