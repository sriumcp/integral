/**
 * KindBadge — behavioral tests.
 *
 * Discipline applied:
 *  - Test the public API (kind, label, size, ariaLabel).
 *  - Test the glyph mapping is *complete* — every IntentKind from the schema
 *    must yield a glyph. This is the falsification path: if v0.2 adds a kind
 *    and we forget to update KIND_GLYPHS, the type system fails first; this
 *    test verifies the runtime glyph is non-empty for every kind.
 *  - Test the data-* contract (`data-kind` for CSS / surface targeting).
 *  - Test accessibility surface (decorative by default; accessible mode via
 *    ariaLabel).
 *  - Test the size prop drives the CSS custom property used by the module.
 *  - Don't test glyph *characters* exhaustively — those are content, not
 *    behaviour, and pinning them via assertion would brittle the test
 *    against a v0.2 glyph refresh. We test that *some* non-empty glyph
 *    renders for every kind; one canonical mapping (nous-campaign → "N") is
 *    asserted as a sanity check.
 */

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { IntentKindSchema, type IntentKind } from '@/schema'
import { KindBadge, KIND_GLYPHS } from './KindBadge'

const ALL_KINDS = IntentKindSchema.options as readonly IntentKind[]

describe('KindBadge', () => {
  it('renders the canonical Nous campaign glyph as a sanity anchor', () => {
    render(<KindBadge kind="nous-campaign" />)
    // The glyph is real text — assertable via getByText.
    expect(screen.getByText('N')).toBeInTheDocument()
  })

  it('has a non-empty glyph for every IntentKind in the schema', () => {
    // Falsification path: this test fails if a v0.2 IntentKind is added and
    // KIND_GLYPHS isn't updated to cover it.
    for (const kind of ALL_KINDS) {
      const glyph = KIND_GLYPHS[kind]
      expect(glyph, `glyph for ${kind} should be non-empty`).toBeTruthy()
    }
  })

  it('renders a glyph for every IntentKind without crashing', () => {
    for (const kind of ALL_KINDS) {
      const { unmount, container } = render(<KindBadge kind={kind} />)
      const wrapper = container.firstElementChild as HTMLElement
      expect(wrapper.getAttribute('data-kind')).toBe(kind)
      unmount()
    }
  })

  it('renders a label when provided', () => {
    render(<KindBadge kind="nous-campaign" label="Nous · campaign" />)
    expect(screen.getByText('Nous · campaign')).toBeInTheDocument()
  })

  it('omits the label element when label is not provided', () => {
    const { container } = render(<KindBadge kind="coral-attempt" />)
    // Wrapper has only the glyph child when no label.
    const wrapper = container.firstElementChild as HTMLElement
    expect(wrapper.children).toHaveLength(1)
  })

  it('renders an empty label when label is the empty string', () => {
    // Empty string is intentionally a real (zero-width) label — this pins
    // the contract that `label === ''` differs from `label` being absent,
    // matching the same discipline IdPill applies to `short`.
    const { container } = render(<KindBadge kind="coral-attempt" label="" />)
    const wrapper = container.firstElementChild as HTMLElement
    expect(wrapper.children).toHaveLength(2)
  })

  it('exposes data-kind on the wrapper for CSS / surface targeting', () => {
    const { container } = render(<KindBadge kind="coral-attempt" />)
    const wrapper = container.firstElementChild as HTMLElement
    expect(wrapper.getAttribute('data-kind')).toBe('coral-attempt')
  })

  it('drives glyph size via the --kind-badge-size CSS variable', () => {
    const { container } = render(<KindBadge kind="coral-attempt" size={26} />)
    const wrapper = container.firstElementChild as HTMLElement
    expect(wrapper.style.getPropertyValue('--kind-badge-size')).toBe('26px')
  })

  it('is decorative by default (aria-hidden glyph, no role on wrapper)', () => {
    const { container } = render(<KindBadge kind="nous-campaign" />)
    const wrapper = container.firstElementChild as HTMLElement
    const glyph = wrapper.firstElementChild as HTMLElement
    expect(wrapper.getAttribute('role')).toBeNull()
    expect(glyph.getAttribute('aria-hidden')).toBe('true')
  })

  it('exposes an accessible label when ariaLabel is set', () => {
    render(
      <KindBadge kind="nous-campaign" ariaLabel="Nous campaign · v3 plateau study" />
    )
    const wrapper = screen.getByLabelText('Nous campaign · v3 plateau study')
    expect(wrapper.getAttribute('role')).toBe('img')
    // The inner glyph stops being aria-hidden so the accessible label fully
    // describes the visible content of the badge.
    const glyph = wrapper.firstElementChild as HTMLElement
    expect(glyph.getAttribute('aria-hidden')).toBeNull()
  })
})
