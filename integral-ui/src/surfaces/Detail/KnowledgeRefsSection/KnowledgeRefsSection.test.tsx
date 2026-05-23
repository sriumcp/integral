/**
 * KnowledgeRefsSection — behavioral tests.
 *
 * v0.1 design: opaque URIs are NOT rendered (the schema can't carry the
 * dereferenced content yet — see gaps.md G-N-2). Instead, refs collapse to
 * one count row per (scope, role) pair so the user sees "what kinds of
 * knowledge attach here" without being teased by URIs that don't resolve.
 * The full content (and clickability) returns in v0.2 once principles
 * become first-class typed objects.
 *
 * Tests verify:
 *   - Per-(scope,role) collapse with count.
 *   - Inherited refs surface their `inherited_from` source.
 *   - Empty intents render nothing.
 *   - URIs are NOT exposed in the DOM (the lossy-mapping signal stays
 *     internal to the data, not surfaced as text the user can't act on).
 */

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { Intent } from '@/schema'
import { fixtureWorkspace } from '@/fixtures/workspace'
import { KnowledgeRefsSection } from './KnowledgeRefsSection'

function intentFor(kind: string): Intent {
  const found = fixtureWorkspace.intents.find((i) => i.kind === kind)
  if (!found) throw new Error(`fixture missing ${kind}`)
  return found
}

describe('KnowledgeRefsSection', () => {
  it('renders one summary row per (scope, role) group', () => {
    const nous = intentFor('nous-campaign') // 2 refs: global+methodology, campaign+principles
    const { container } = render(<KnowledgeRefsSection intent={nous} />)
    const rows = container.querySelectorAll('[data-knowledge-group]')
    // 2 distinct (scope, role) pairs in the fixture.
    expect(rows.length).toBe(2)
  })

  it('shows scope and role chips on each group row', () => {
    const nous = intentFor('nous-campaign')
    render(<KnowledgeRefsSection intent={nous} />)
    expect(screen.getByText('global', { exact: true })).toBeInTheDocument()
    expect(screen.getByText('campaign', { exact: true })).toBeInTheDocument()
    expect(screen.getByText('methodology', { exact: true })).toBeInTheDocument()
    expect(screen.getByText('principles', { exact: true })).toBeInTheDocument()
  })

  it('shows a count for each group (singular vs plural)', () => {
    const nous = intentFor('nous-campaign') // 1 of each role
    render(<KnowledgeRefsSection intent={nous} />)
    // Each group has count 1 — singular form.
    const ones = screen.getAllByText(/^1 ref$/)
    expect(ones.length).toBe(2)
  })

  it('inherited refs surface the inherited_from source', () => {
    const iter = intentFor('nous-iteration')
    render(<KnowledgeRefsSection intent={iter} />)
    expect(screen.getByText('inherited', { exact: true })).toBeInTheDocument()
    expect(screen.getByText(/01HXYZ-NOUS-CAMPAIGN-001/)).toBeInTheDocument()
  })

  it('renders nothing when intent has no refs', () => {
    const attempt = intentFor('coral-attempt')
    const { container } = render(<KnowledgeRefsSection intent={attempt} />)
    expect(container.firstChild).toBeNull()
  })

  it('does NOT render the URI text (v0.1: opaque, undereferenceable)', () => {
    const nous = intentFor('nous-campaign')
    const { container } = render(<KnowledgeRefsSection intent={nous} />)
    expect(container.textContent).not.toContain('file://nous/methodology/v3')
    expect(container.textContent).not.toContain('nous-principle://')
  })

  it('exposes data-scope and data-role on each group row', () => {
    const nous = intentFor('nous-campaign')
    const { container } = render(<KnowledgeRefsSection intent={nous} />)
    const groups = container.querySelectorAll('[data-knowledge-group]')
    const triples = Array.from(groups).map((g) => [
      g.getAttribute('data-scope'),
      g.getAttribute('data-role'),
    ])
    // Both groups exposed; CSS picks colors by data-scope.
    expect(triples.length).toBe(2)
    expect(triples.some(([s]) => s === 'global')).toBe(true)
    expect(triples.some(([s]) => s === 'campaign')).toBe(true)
  })
})
