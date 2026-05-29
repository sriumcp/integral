/**
 * PlotFigure — renders a PreparedFigure via Observable Plot.
 *
 * Plot's transforms are NOT used here; the executor pre-aggregated the
 * data server-side (so the cache stores deterministic figure-ready bytes).
 * This component just turns mark + encodings + data into an SVG.
 *
 * Lazy import: `@observablehq/plot` is a non-trivial dep; we import it
 * once here and keep this component lean.
 */

import { useEffect, useRef } from 'react'
import * as Plot from '@observablehq/plot'
import type { PreparedFigure } from '@/lib/projection/spec'
import styles from './PlotFigure.module.css'

export interface PlotFigureProps {
  figure: PreparedFigure
}

export function PlotFigure({ figure }: PlotFigureProps) {
  const mountRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!mountRef.current) return
    const node = mountRef.current
    let svg: (SVGElement | HTMLElement) | null = null
    try {
      svg = renderPlot(figure)
    } catch (err) {
      // Render failure should never break the chrome — surface a small
      // diagnostic in dev tooling instead.
      // eslint-disable-next-line no-console
      console.warn('[integral] PlotFigure render failed', { id: figure.id, err })
      return
    }
    node.replaceChildren(svg)
    return () => {
      node.replaceChildren()
    }
  }, [figure])

  return (
    <figure
      className={styles.figure}
      data-figure-id={figure.id}
      data-mark-type={figure.mark.type}
    >
      <figcaption className={styles.title}>{figure.title}</figcaption>
      <div ref={mountRef} className={styles.svgMount} />
      {figure.caption_rendered && (
        <figcaption className={styles.caption}>{figure.caption_rendered}</figcaption>
      )}
    </figure>
  )
}

function renderPlot(figure: PreparedFigure): SVGElement | HTMLElement {
  const { mark, encodings, data } = figure
  const opts = encodingsToPlotOpts(encodings, mark)
  const marks = [buildMark(mark, data, opts)]
  const result = Plot.plot({
    marks,
    height: 220,
    width: 440,
    style: { background: 'transparent', fontFamily: 'inherit' },
    x: { tickSize: 0, label: encodings.x ?? null, grid: false },
    y: { tickSize: 0, label: encodings.y ?? null, grid: true },
    ...(encodings.fx || encodings.fy ? { facet: { data, ...(encodings.fx ? { x: encodings.fx } : {}), ...(encodings.fy ? { y: encodings.fy } : {}) } } : {}),
  })
  return result
}

function buildMark(
  mark: PreparedFigure['mark'],
  data: PreparedFigure['data'],
  opts: Record<string, unknown>
) {
  switch (mark.type) {
    case 'line':
      return Plot.line(data, { ...opts, ...(mark.curve ? { curve: mark.curve } : {}) })
    case 'area':
      return Plot.areaY(data, { ...opts, ...(mark.curve ? { curve: mark.curve } : {}) })
    case 'bar':
      return mark.orientation === 'horizontal'
        ? Plot.barX(data, opts)
        : Plot.barY(data, opts)
    case 'dot':
      return Plot.dot(data, { ...opts, ...(mark.r ? { r: mark.r } : {}) })
    case 'rule':
      return mark.axis === 'x' ? Plot.ruleX(data, opts) : Plot.ruleY(data, opts)
    case 'text':
      return Plot.text(data, opts)
    case 'tick':
      return mark.axis === 'x' ? Plot.tickX(data, opts) : Plot.tickY(data, opts)
  }
}

function encodingsToPlotOpts(
  encodings: PreparedFigure['encodings'],
  _mark: PreparedFigure['mark']
): Record<string, unknown> {
  const opts: Record<string, unknown> = {}
  if (encodings.x) opts.x = encodings.x
  if (encodings.y) opts.y = encodings.y
  if (encodings.fill) opts.fill = encodings.fill
  if (encodings.stroke) opts.stroke = encodings.stroke
  if (encodings.text) opts.text = encodings.text
  return opts
}
