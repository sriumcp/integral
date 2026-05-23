/**
 * Tag — behavioral tests.
 *
 * Discipline applied:
 *  - Test the public API (children).
 *  - Don't test class names or computed CSS.
 *  - Don't test what React/TS already guarantees (children rendering,
 *    string vs node types).
 *
 * This atom is intentionally minimal — a single visual mode with no variant
 * flags. The tests reflect that: there's nothing to differentiate beyond
 * "did it render the content".
 */

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Tag } from './Tag'

describe('Tag', () => {
  it('renders string children', () => {
    render(<Tag>investigation</Tag>)
    expect(screen.getByText('investigation')).toBeInTheDocument()
  })

  it('renders node children', () => {
    render(
      <Tag>
        <span>v3</span>-<span>plateau</span>
      </Tag>
    )
    // Composed text appears in the rendered tag.
    expect(screen.getByText('v3')).toBeInTheDocument()
    expect(screen.getByText('plateau')).toBeInTheDocument()
  })

  it('renders multiple Tags side-by-side without crashing or merging', () => {
    render(
      <>
        <Tag>investigation</Tag>
        <Tag>v3-optimizer</Tag>
        <Tag>principles</Tag>
      </>
    )
    expect(screen.getByText('investigation')).toBeInTheDocument()
    expect(screen.getByText('v3-optimizer')).toBeInTheDocument()
    expect(screen.getByText('principles')).toBeInTheDocument()
  })

  it('preserves an empty-string label as a real (zero-width) tag', () => {
    // Same discipline as IdPill / KindBadge: empty string is content, not
    // absence. Pinning the contract so a future change to a falsy short-
    // circuit (`children || null`) is caught.
    const { container } = render(<Tag>{''}</Tag>)
    expect(container.firstElementChild).not.toBeNull()
    expect(container.firstElementChild!.textContent).toBe('')
  })
})
