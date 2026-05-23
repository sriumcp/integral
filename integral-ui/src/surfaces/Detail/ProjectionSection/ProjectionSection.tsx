import { useEffect, useState } from 'react'
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
}

/**
 * ProjectionSection — fetches the (kind, zoom)-indexed projection from
 * the Vite plugin's `/api/projection` endpoint and renders the prose.
 *
 * Per the matrix framing in `semantics-v0.1.md` S-1: the engine returns
 * `source: 'fallback'` for cells without an LLM plugin (or when the
 * server has no API key) and `source: 'llm'` for the 4 v0.1 cells
 * (nous-campaign × {structure, detail}, nous-iteration × {structure,
 * detail}). The chrome treats both shapes the same; the `data-projection-source`
 * attribute lets future styling distinguish them if useful.
 *
 * Renders nothing on overview zoom — overview is the Map's job, not
 * Detail's. Renders nothing on fetch error so the chrome stays clean.
 */
export function ProjectionSection({ intentId, zoom }: ProjectionSectionProps) {
  const [projection, setProjection] = useState<ProjectionResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [errored, setErrored] = useState(false)

  useEffect(() => {
    if (zoom === 'overview') {
      setProjection(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setErrored(false)
    const params = new URLSearchParams({ intent_id: intentId, zoom })
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
  }, [intentId, zoom])

  if (zoom === 'overview') return null
  if (errored) return null

  if (loading && !projection) {
    return (
      <section className={styles.section} data-testid="projection-loading">
        <SectionLabel>summary</SectionLabel>
        <p className={styles.placeholder}>…</p>
      </section>
    )
  }

  if (!projection) return null

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
      >
        {projection.content}
      </p>
    </section>
  )
}
