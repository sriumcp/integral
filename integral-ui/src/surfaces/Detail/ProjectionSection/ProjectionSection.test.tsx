/**
 * ProjectionSection — fetches the (kind, zoom)-indexed projection from
 * the Vite plugin's /api/projection endpoint and renders the prose.
 *
 * Behavior:
 *  - Renders nothing on overview zoom (overview is the Map's job).
 *  - Renders a placeholder while the fetch is in flight.
 *  - Renders the prose content on success.
 *  - Renders the fallback content when source='fallback' (no API key /
 *    no plugin / error path) — same DOM shape as success, but a small
 *    hint so the user knows it's not LLM-generated.
 *  - Re-fetches when zoom changes.
 *
 * Tests mock `fetch` so we can drive the component without hitting a
 * real server.
 */

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ProjectionSection } from './ProjectionSection'

interface MockProjectionResponse {
  content: string
  source: 'llm' | 'fallback'
  generated_at?: string
}

function mockFetchOnce(response: MockProjectionResponse) {
  globalThis.fetch = vi.fn().mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => response,
  } as Response)
}

function mockFetchSequence(responses: MockProjectionResponse[]) {
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
    const { container } = render(
      <ProjectionSection intentId="c1" zoom="overview" />
    )
    expect(container.firstChild).toBeNull()
  })

  it('shows a placeholder while loading', async () => {
    let resolveFetch: (value: Response) => void = () => {}
    globalThis.fetch = vi.fn().mockImplementation(
      () =>
        new Promise<Response>((r) => {
          resolveFetch = r
        })
    )
    render(<ProjectionSection intentId="c1" zoom="structure" />)
    // Placeholder is rendered via data-projection-loading.
    const placeholder = await screen.findByTestId('projection-loading')
    expect(placeholder).toBeInTheDocument()
    // Resolve so afterEach doesn't leak an unresolved promise.
    resolveFetch({
      ok: true,
      status: 200,
      json: async () => ({ content: 'x', source: 'llm' as const }),
    } as Response)
  })

  it('renders the prose content on success', async () => {
    mockFetchOnce({
      content: 'This campaign investigates EA-WFQ scheduling fairness.',
      source: 'llm',
    })
    render(<ProjectionSection intentId="c1" zoom="structure" />)
    await waitFor(() => {
      expect(
        screen.getByText(/EA-WFQ scheduling fairness/i)
      ).toBeInTheDocument()
    })
  })

  it('exposes data-projection-source on the rendered prose', async () => {
    mockFetchOnce({ content: 'p', source: 'llm' })
    const { container } = render(
      <ProjectionSection intentId="c1" zoom="structure" />
    )
    await waitFor(() => {
      const node = container.querySelector('[data-projection-source]')
      expect(node?.getAttribute('data-projection-source')).toBe('llm')
    })
  })

  it('renders fallback content with source=fallback marker', async () => {
    mockFetchOnce({
      content: 'Test campaign — a research campaign',
      source: 'fallback',
    })
    const { container } = render(
      <ProjectionSection intentId="c1" zoom="structure" />
    )
    await waitFor(() => {
      const node = container.querySelector('[data-projection-source]')
      expect(node?.getAttribute('data-projection-source')).toBe('fallback')
    })
  })

  it('refetches when zoom changes', async () => {
    mockFetchSequence([
      { content: 'structure prose', source: 'llm' },
      { content: 'detail prose — multi-paragraph', source: 'llm' },
    ])
    const { rerender } = render(
      <ProjectionSection intentId="c1" zoom="structure" />
    )
    await waitFor(() => {
      expect(screen.getByText(/structure prose/)).toBeInTheDocument()
    })
    rerender(<ProjectionSection intentId="c1" zoom="detail" />)
    await waitFor(() => {
      expect(screen.getByText(/detail prose/)).toBeInTheDocument()
    })
    expect(globalThis.fetch).toHaveBeenCalledTimes(2)
  })

  it('refetches when intentId changes', async () => {
    mockFetchSequence([
      { content: 'campaign A prose', source: 'llm' },
      { content: 'campaign B prose', source: 'llm' },
    ])
    const { rerender } = render(
      <ProjectionSection intentId="c1" zoom="structure" />
    )
    await waitFor(() =>
      expect(screen.getByText(/campaign A/)).toBeInTheDocument()
    )
    rerender(<ProjectionSection intentId="c2" zoom="structure" />)
    await waitFor(() =>
      expect(screen.getByText(/campaign B/)).toBeInTheDocument()
    )
  })

  it('handles a failed fetch by rendering nothing (chrome stays clean)', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 500 } as Response)
    const { container } = render(
      <ProjectionSection intentId="c1" zoom="structure" />
    )
    await waitFor(() => {
      // After fetch settles + error path, no projection content rendered.
      // Component falls back to null so the chrome doesn't show a partial.
      expect(
        container.querySelector('[data-projection-source]')
      ).toBeNull()
    })
  })

  // ─── Regenerate button + timestamp ───────────────────────────────────

  it('shows a generated-at hint when the response includes generated_at', async () => {
    mockFetchOnce({
      content: 'cached prose',
      source: 'llm',
      generated_at: new Date(Date.now() - 5 * 60_000).toISOString(),
    })
    render(<ProjectionSection intentId="c1" zoom="structure" />)
    await waitFor(() => {
      expect(screen.getByText(/generated.*ago/i)).toBeInTheDocument()
    })
  })

  it('does not show the generated-at hint when generated_at is missing (fallback case)', async () => {
    mockFetchOnce({ content: 'fallback prose', source: 'fallback' })
    render(<ProjectionSection intentId="c1" zoom="structure" />)
    await waitFor(() => {
      expect(screen.getByText(/fallback prose/)).toBeInTheDocument()
    })
    expect(screen.queryByText(/generated.*ago/i)).not.toBeInTheDocument()
  })

  it('exposes a regenerate button when source=llm', async () => {
    mockFetchOnce({
      content: 'p',
      source: 'llm',
      generated_at: new Date().toISOString(),
    })
    render(<ProjectionSection intentId="c1" zoom="structure" />)
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /regenerate/i })
      ).toBeInTheDocument()
    })
  })

  it('does not show the regenerate button for fallback projections', async () => {
    mockFetchOnce({ content: 'p', source: 'fallback' })
    render(<ProjectionSection intentId="c1" zoom="structure" />)
    await waitFor(() => {
      expect(screen.getByText(/^p$/)).toBeInTheDocument()
    })
    expect(
      screen.queryByRole('button', { name: /regenerate/i })
    ).not.toBeInTheDocument()
  })

  it('clicking regenerate refetches with refresh=true', async () => {
    mockFetchSequence([
      {
        content: 'old prose',
        source: 'llm',
        generated_at: new Date(Date.now() - 60_000).toISOString(),
      },
      {
        content: 'new prose',
        source: 'llm',
        generated_at: new Date().toISOString(),
      },
    ])
    render(<ProjectionSection intentId="c1" zoom="structure" />)
    await waitFor(() => {
      expect(screen.getByText('old prose')).toBeInTheDocument()
    })
    const button = screen.getByRole('button', { name: /regenerate/i })
    await userEvent.click(button)
    await waitFor(() => {
      expect(screen.getByText('new prose')).toBeInTheDocument()
    })
    // The second fetch carried refresh=true; assert this against the
    // recorded call URL.
    const calls = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } })
      .mock.calls
    expect(calls.length).toBe(2)
    expect(String(calls[1]?.[0])).toContain('refresh=true')
  })
})
