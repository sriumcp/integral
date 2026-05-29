/**
 * ProjectionSection — fetches the (kind, zoom)-indexed projection from
 * the Vite plugin's /api/projection endpoint and renders the
 * narrative-arc projection (figures + prose).
 *
 * Behavior:
 *  - Renders nothing on overview zoom (overview is the Map's job).
 *  - Renders a placeholder while the fetch is in flight.
 *  - Renders the figures + prose on success.
 *  - Renders the fallback prose when source='fallback'.
 *  - Re-fetches when zoom or intentId changes.
 *
 * Tests mock `fetch` so we can drive the component without hitting a
 * real server. The wire shape is `ExecutedProjection` — the new
 * typed-evidence pipeline contract.
 */

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ProjectionSection } from './ProjectionSection'
import type { ExecutedProjection } from '@/lib/projection/spec'

function makeProjection(opts: Partial<ExecutedProjection> = {}): ExecutedProjection {
  return {
    spec_version: '1',
    figures: [],
    quoted_numerics: {},
    prose: 'sample prose',
    cite_index: [],
    source: 'llm',
    generated_at: new Date().toISOString(),
    ...opts,
  }
}

function mockFetchOnce(response: ExecutedProjection) {
  globalThis.fetch = vi.fn().mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => response,
  } as Response)
}

function mockFetchSequence(responses: ExecutedProjection[]) {
  const queue = [...responses]
  globalThis.fetch = vi.fn().mockImplementation(async () => {
    const next = queue.shift()
    return {
      ok: true,
      status: 200,
      json: async () => next,
    } as Response
  })
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ProjectionSection', () => {
  it('renders nothing when zoom is overview', () => {
    const { container } = render(<ProjectionSection intentId="c1" zoom="overview" />)
    expect(container.firstChild).toBeNull()
  })

  it('shows a placeholder while loading', async () => {
    let resolveFetch: (value: Response) => void = () => {}
    globalThis.fetch = vi.fn().mockImplementation(
      () => new Promise<Response>((r) => { resolveFetch = r })
    )
    render(<ProjectionSection intentId="c1" zoom="structure" />)
    const placeholder = await screen.findByTestId('projection-loading')
    expect(placeholder).toBeInTheDocument()
    expect(placeholder.textContent).toMatch(/composing/i)
    resolveFetch({
      ok: true, status: 200,
      json: async () => makeProjection({ prose: 'x' }),
    } as Response)
  })

  it('renders the prose on success', async () => {
    mockFetchOnce(makeProjection({
      prose: 'This campaign investigates EA-WFQ scheduling fairness.',
    }))
    render(<ProjectionSection intentId="c1" zoom="structure" />)
    await waitFor(() => {
      expect(screen.getByText(/EA-WFQ scheduling fairness/i)).toBeInTheDocument()
    })
  })

  it('exposes data-projection-source on the rendered projection root', async () => {
    mockFetchOnce(makeProjection({ prose: 'p', source: 'llm' }))
    const { container } = render(<ProjectionSection intentId="c1" zoom="structure" />)
    await waitFor(() => {
      const node = container.querySelector('[data-projection-source]')
      expect(node?.getAttribute('data-projection-source')).toBe('llm')
    })
  })

  it('renders fallback projection with source=fallback marker', async () => {
    mockFetchOnce(makeProjection({
      prose: 'Test campaign — a research campaign',
      source: 'fallback',
    }))
    const { container } = render(<ProjectionSection intentId="c1" zoom="structure" />)
    await waitFor(() => {
      const node = container.querySelector('[data-projection-source]')
      expect(node?.getAttribute('data-projection-source')).toBe('fallback')
    })
  })

  it('refetches when zoom changes', async () => {
    mockFetchSequence([
      makeProjection({ prose: 'structure prose' }),
      makeProjection({ prose: 'detail prose multi-paragraph' }),
    ])
    const { rerender } = render(<ProjectionSection intentId="c1" zoom="structure" />)
    await waitFor(() => expect(screen.getByText(/structure prose/)).toBeInTheDocument())
    rerender(<ProjectionSection intentId="c1" zoom="detail" />)
    await waitFor(() => expect(screen.getByText(/detail prose/)).toBeInTheDocument())
    expect(globalThis.fetch).toHaveBeenCalledTimes(2)
  })

  it('refetches when intentId changes', async () => {
    mockFetchSequence([
      makeProjection({ prose: 'campaign A prose' }),
      makeProjection({ prose: 'campaign B prose' }),
    ])
    const { rerender } = render(<ProjectionSection intentId="c1" zoom="structure" />)
    await waitFor(() => expect(screen.getByText(/campaign A/)).toBeInTheDocument())
    rerender(<ProjectionSection intentId="c2" zoom="structure" />)
    await waitFor(() => expect(screen.getByText(/campaign B/)).toBeInTheDocument())
  })

  it('handles a failed fetch by rendering nothing', async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce({ ok: false, status: 500 } as Response)
    const { container } = render(<ProjectionSection intentId="c1" zoom="structure" />)
    await waitFor(() => {
      expect(container.querySelector('[data-projection-source]')).toBeNull()
    })
  })

  it('rejects malformed wire shapes (drift protection) and renders nothing', async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true, status: 200,
      json: async () => ({ content: 'old shape', source: 'llm' }),
    } as Response)
    const { container } = render(<ProjectionSection intentId="c1" zoom="structure" />)
    await waitFor(() => {
      expect(container.querySelector('[data-projection-source]')).toBeNull()
    })
  })

  it('shows a generated-at hint when the response includes generated_at', async () => {
    mockFetchOnce(makeProjection({
      prose: 'cached prose',
      generated_at: new Date(Date.now() - 5 * 60_000).toISOString(),
    }))
    render(<ProjectionSection intentId="c1" zoom="structure" />)
    await waitFor(() => {
      expect(screen.getByText(/generated.*ago/i)).toBeInTheDocument()
    })
  })

  it('marks the timestamp stale past 60min', async () => {
    mockFetchOnce(makeProjection({
      prose: 'old prose',
      generated_at: new Date(Date.now() - 90 * 60_000).toISOString(),
    }))
    const { container } = render(<ProjectionSection intentId="c1" zoom="structure" />)
    await waitFor(() => expect(screen.getByText(/old prose/)).toBeInTheDocument())
    expect(container.querySelector('[data-stale="true"]')).not.toBeNull()
  })

  it('does not show generated-at hint for fallback projections', async () => {
    mockFetchOnce(makeProjection({ prose: 'fallback prose', source: 'fallback' }))
    render(<ProjectionSection intentId="c1" zoom="structure" />)
    await waitFor(() => expect(screen.getByText(/fallback prose/)).toBeInTheDocument())
    expect(screen.queryByText(/generated.*ago/i)).not.toBeInTheDocument()
  })

  it('exposes a regenerate button for source=llm', async () => {
    mockFetchOnce(makeProjection({ prose: 'p' }))
    render(<ProjectionSection intentId="c1" zoom="structure" />)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /regenerate/i })).toBeInTheDocument()
    })
  })

  it('does not show regenerate button for fallback projections', async () => {
    mockFetchOnce(makeProjection({ prose: 'p', source: 'fallback' }))
    render(<ProjectionSection intentId="c1" zoom="structure" />)
    await waitFor(() => expect(screen.getByText(/^p$/)).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: /regenerate/i })).not.toBeInTheDocument()
  })

  it('clicking regenerate refetches with refresh=true', async () => {
    mockFetchSequence([
      makeProjection({ prose: 'old prose' }),
      makeProjection({ prose: 'new prose' }),
    ])
    render(<ProjectionSection intentId="c1" zoom="structure" />)
    await waitFor(() => expect(screen.getByText('old prose')).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: /regenerate/i }))
    await waitFor(() => expect(screen.getByText('new prose')).toBeInTheDocument())
    const calls = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls
    expect(calls.length).toBe(2)
    expect(String(calls[1]?.[0])).toContain('refresh=true')
  })
})
