/**
 * SectionLabel — behavioral tests.
 *
 * Discipline applied:
 *  - Test the public API (children, hint).
 *  - Test the semantic role: SectionLabel renders as a heading
 *    (`<h3>`) so accessible outline navigation works. This is *behavior
 *    visible to users* (screen-reader heading-list), not implementation.
 *  - Test conditional rules: hint is rendered only when provided.
 *  - Don't test class names or computed CSS.
 */

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SectionLabel } from './SectionLabel'

describe('SectionLabel', () => {
  it('renders the label as a heading', () => {
    render(<SectionLabel>intents in fixture</SectionLabel>)
    // Heading-list accessibility: this is what a screen-reader user sees in
    // their outline. Asserting role=heading rather than tag name keeps the
    // test resilient to tag changes (h3 → h4 etc.) while preserving intent.
    const heading = screen.getByRole('heading', { name: /intents in fixture/i })
    expect(heading).toBeInTheDocument()
  })

  it('omits the hint element when hint is not provided', () => {
    const { container } = render(<SectionLabel>section</SectionLabel>)
    // Wrapper has only the heading child when no hint.
    const wrapper = container.firstElementChild as HTMLElement
    expect(wrapper.children).toHaveLength(1)
  })

  it('renders the hint when provided', () => {
    render(
      <SectionLabel hint="9 entries">knowledge corpus</SectionLabel>
    )
    expect(
      screen.getByRole('heading', { name: /knowledge corpus/i })
    ).toBeInTheDocument()
    expect(screen.getByText('9 entries')).toBeInTheDocument()
  })

  it('treats an empty-string hint as present (renders the slot)', () => {
    // Mirrors the empty-string discipline of Tag / IdPill / KindBadge.
    const { container } = render(
      <SectionLabel hint="">section</SectionLabel>
    )
    const wrapper = container.firstElementChild as HTMLElement
    expect(wrapper.children).toHaveLength(2)
  })

  it('accepts node hints (not only strings)', () => {
    render(
      <SectionLabel hint={<span data-testid="hint-node">9 · click to expand</span>}>
        evidence edges
      </SectionLabel>
    )
    expect(screen.getByTestId('hint-node')).toBeInTheDocument()
  })
})
