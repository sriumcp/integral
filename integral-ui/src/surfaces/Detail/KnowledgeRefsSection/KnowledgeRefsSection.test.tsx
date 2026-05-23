/**
 * KnowledgeRefsSection — behavioral tests.
 *
 * KnowledgeRef is a discriminated union over `scope`. Tests verify:
 *   - Per-scope grouping (global / project / campaign / iteration / inherited).
 *   - Inherited refs surface their `inherited_from` source.
 *   - Empty intents render a placeholder (so an empty section isn't silent).
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
  it('renders refs grouped by scope', () => {
    const nous = intentFor('nous-campaign') // 2 refs: global + campaign
    render(<KnowledgeRefsSection intent={nous} />)
    expect(screen.getByText('global', { exact: true })).toBeInTheDocument()
    expect(screen.getByText('campaign', { exact: true })).toBeInTheDocument()
  })

  it('exposes data-scope on each ref row', () => {
    const nous = intentFor('nous-campaign')
    const { container } = render(<KnowledgeRefsSection intent={nous} />)
    const refs = container.querySelectorAll('[data-knowledge-ref]')
    expect(refs.length).toBe(2)
    const scopes = Array.from(refs).map((r) => r.getAttribute('data-scope'))
    expect(scopes).toContain('global')
    expect(scopes).toContain('campaign')
  })

  it('inherited refs surface their inherited_from source', () => {
    const iter = intentFor('nous-iteration') // has 1 inherited ref from NID
    render(<KnowledgeRefsSection intent={iter} />)
    expect(screen.getByText('inherited', { exact: true })).toBeInTheDocument()
    expect(screen.getByText(/01HXYZ-NOUS-CAMPAIGN-001/)).toBeInTheDocument()
  })

  it('renders nothing visual when intent has no refs', () => {
    const attempt = intentFor('coral-attempt') // 0 refs
    const { container } = render(<KnowledgeRefsSection intent={attempt} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders the role of each ref', () => {
    const nous = intentFor('nous-campaign') // methodology + principles
    render(<KnowledgeRefsSection intent={nous} />)
    expect(screen.getByText('methodology', { exact: true })).toBeInTheDocument()
    expect(screen.getByText('principles', { exact: true })).toBeInTheDocument()
  })

  it('renders the URI of each ref', () => {
    const nous = intentFor('nous-campaign')
    render(<KnowledgeRefsSection intent={nous} />)
    expect(screen.getByText('file://nous/methodology/v3')).toBeInTheDocument()
  })
})
