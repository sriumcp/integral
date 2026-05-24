/**
 * ShapingChat — interactive chat UI for the LLM-driven shaping flow.
 *
 * Replaces the scripted ShapingDialog when the draft has no canned
 * dialog turns (i.e., it was created via "+ new"). Renders threaded
 * turns + a text input + a send button; calls onSend when the user
 * submits a message; shows a loading indicator while the LLM is
 * thinking.
 */

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ShapingChat } from './ShapingChat'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ShapingChat', () => {
  it('renders existing turns in order', () => {
    render(
      <ShapingChat
        turns={[
          { speaker: 'user', body: 'first message', at: '2026-05-23T20:00:00Z' },
          { speaker: 'shaper', body: 'first reply', at: '2026-05-23T20:00:01Z' },
        ]}
        loading={false}
        onSend={async () => {}}
      />
    )
    expect(screen.getByText('first message')).toBeInTheDocument()
    expect(screen.getByText('first reply')).toBeInTheDocument()
  })

  it('marks user vs shaper turns via data-speaker', () => {
    const { container } = render(
      <ShapingChat
        turns={[
          { speaker: 'user', body: 'hi', at: '2026-05-23T20:00:00Z' },
          { speaker: 'shaper', body: 'hello', at: '2026-05-23T20:00:01Z' },
        ]}
        loading={false}
        onSend={async () => {}}
      />
    )
    const turns = container.querySelectorAll('[data-speaker]')
    expect(turns.length).toBe(2)
    expect(turns[0]?.getAttribute('data-speaker')).toBe('user')
    expect(turns[1]?.getAttribute('data-speaker')).toBe('shaper')
  })

  it('typing in the input + clicking send fires onSend with the message', async () => {
    const user = userEvent.setup()
    const onSend = vi.fn().mockResolvedValue(undefined)
    render(
      <ShapingChat turns={[]} loading={false} onSend={onSend} />
    )
    const input = screen.getByRole('textbox', { name: /message/i })
    await user.type(input, 'hello shaper')
    await user.click(screen.getByRole('button', { name: /send/i }))
    expect(onSend).toHaveBeenCalledTimes(1)
    expect(onSend).toHaveBeenCalledWith('hello shaper')
  })

  it('Enter without Shift sends; Shift+Enter inserts a newline', async () => {
    const user = userEvent.setup()
    const onSend = vi.fn().mockResolvedValue(undefined)
    render(
      <ShapingChat turns={[]} loading={false} onSend={onSend} />
    )
    const input = screen.getByRole('textbox', { name: /message/i })
    await user.type(input, 'one line{Shift>}{Enter}{/Shift}two lines')
    expect(onSend).not.toHaveBeenCalled()
    await user.keyboard('{Enter}')
    expect(onSend).toHaveBeenCalledTimes(1)
    expect(onSend.mock.calls[0]?.[0]).toContain('one line')
    expect(onSend.mock.calls[0]?.[0]).toContain('two lines')
  })

  it('clears the input after a successful send', async () => {
    const user = userEvent.setup()
    const onSend = vi.fn().mockResolvedValue(undefined)
    render(
      <ShapingChat turns={[]} loading={false} onSend={onSend} />
    )
    const input = screen.getByRole('textbox', { name: /message/i }) as HTMLTextAreaElement
    await user.type(input, 'hello')
    await user.click(screen.getByRole('button', { name: /send/i }))
    expect(input.value).toBe('')
  })

  it('disables input + send while loading', () => {
    render(
      <ShapingChat turns={[]} loading={true} onSend={async () => {}} />
    )
    const input = screen.getByRole('textbox', {
      name: /message/i,
    }) as HTMLTextAreaElement
    const send = screen.getByRole('button', { name: /send/i }) as HTMLButtonElement
    expect(input.disabled).toBe(true)
    expect(send.disabled).toBe(true)
  })

  it('shows a "shaper is thinking…" indicator while loading', () => {
    render(
      <ShapingChat
        turns={[
          { speaker: 'user', body: 'hi', at: '2026-05-23T20:00:00Z' },
        ]}
        loading={true}
        onSend={async () => {}}
      />
    )
    expect(screen.getByText(/shaper.*thinking/i)).toBeInTheDocument()
  })

  it('does not fire onSend when input is empty or whitespace-only', async () => {
    const user = userEvent.setup()
    const onSend = vi.fn().mockResolvedValue(undefined)
    render(
      <ShapingChat turns={[]} loading={false} onSend={onSend} />
    )
    const input = screen.getByRole('textbox', { name: /message/i })
    // Empty
    await user.click(screen.getByRole('button', { name: /send/i }))
    expect(onSend).not.toHaveBeenCalled()
    // Whitespace
    await user.type(input, '   \n  ')
    await user.click(screen.getByRole('button', { name: /send/i }))
    expect(onSend).not.toHaveBeenCalled()
  })

  it('renders concerns when provided (LLM-flagged warnings)', () => {
    render(
      <ShapingChat
        turns={[]}
        loading={false}
        onSend={async () => {}}
        concerns={[
          'research_question is too vague — needs a regime',
          'target_system.repo_path not yet known',
        ]}
      />
    )
    expect(
      screen.getByText(/research_question is too vague/)
    ).toBeInTheDocument()
    expect(
      screen.getByText(/repo_path not yet known/)
    ).toBeInTheDocument()
  })
})
