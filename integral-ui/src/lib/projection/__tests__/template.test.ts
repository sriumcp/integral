import { describe, expect, it } from 'vitest'
import { renderTemplate, formatScalar, TemplateError } from '../template'
import type { Excerpt } from '../spec'

const noExcerpts = new Map<string, Excerpt>()
const SCOPE = { scope: 'test' }

describe('formatScalar', () => {
  it('integer renders without decimals', () => {
    expect(formatScalar(5)).toBe('5')
    expect(formatScalar(-12)).toBe('-12')
  })

  it('strips trailing zeros for fractional values', () => {
    expect(formatScalar(0.5)).toBe('0.5')
    expect(formatScalar(0.55)).toBe('0.55')
    expect(formatScalar(0.123)).toBe('0.123')
  })

  it('uses fixed-decimal (never scientific) for small numbers', () => {
    expect(formatScalar(0.0001)).not.toContain('e')
    expect(formatScalar(0.000001)).not.toContain('e')
  })

  it('null / undefined / NaN renders as em-dash', () => {
    expect(formatScalar(null)).toBe('—')
    expect(formatScalar(undefined)).toBe('—')
    expect(formatScalar(NaN)).toBe('—')
    expect(formatScalar(Infinity)).toBe('—')
  })

  it('strings pass through unchanged', () => {
    expect(formatScalar('active')).toBe('active')
  })

  it('values >= 100 lose decimal precision but remain readable', () => {
    expect(formatScalar(123.456)).toBe('123.5')
    expect(formatScalar(1234.5)).toBe('1234.5')
  })
})

describe('renderTemplate', () => {
  it('substitutes scalar placeholders', () => {
    const out = renderTemplate('count={scalar:n}', { n: 5 }, noExcerpts, SCOPE)
    expect(out).toBe('count=5')
  })

  it('substitutes excerpt placeholders verbatim', () => {
    const ex: Map<string, Excerpt> = new Map([['rq', {
      id: 'rq', text: 'How does X interact with Y?', kind: 'paragraph',
      source_ref: { file: 'README.md' },
    }]])
    const out = renderTemplate('Question: {excerpt:rq}', {}, ex, SCOPE)
    expect(out).toBe('Question: How does X interact with Y?')
  })

  it('throws on unknown scalar id', () => {
    expect(() => renderTemplate('{scalar:nope}', {}, noExcerpts, SCOPE))
      .toThrow(TemplateError)
  })

  it('throws on unknown excerpt id', () => {
    expect(() => renderTemplate('{excerpt:nope}', {}, noExcerpts, SCOPE))
      .toThrow(TemplateError)
  })

  it('multiple placeholders + literal text + multi-line', () => {
    const ex: Map<string, Excerpt> = new Map([['e', {
      id: 'e', text: 'foo', kind: 'paragraph', source_ref: { file: '' },
    }]])
    const out = renderTemplate(
      'Line1: {scalar:n} attempts.\n\nLine2: {excerpt:e}.',
      { n: 5 }, ex, SCOPE
    )
    expect(out).toBe('Line1: 5 attempts.\n\nLine2: foo.')
  })

  it('non-placeholder curly braces pass through', () => {
    const out = renderTemplate('Object literal: { foo: 1 }', { n: 1 }, noExcerpts, SCOPE)
    expect(out).toBe('Object literal: { foo: 1 }')
  })

  it('null scalar substitutes to em-dash, doesnt throw', () => {
    const out = renderTemplate('val={scalar:n}', { n: null }, noExcerpts, SCOPE)
    expect(out).toBe('val=—')
  })
})
