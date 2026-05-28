/**
 * WritebackForm — collects max_iterations + target_system fields + an
 * optional run_id for Nous campaign writeback. Lives inside the Shaping
 * surface; pre-fills from the draft's `writeback_template`.
 *
 * Tests verify:
 *  - Renders with pre-filled values from a template.
 *  - Calls onChange(config) when fields are valid; calls onChange(null)
 *    when fields are invalid.
 *  - Source picker filters to adapter sources (drops fixture).
 *  - Empty target source defaults to the first adapter source.
 */

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SourceEntry } from '@/lib/sources'
import type { WritebackTemplate } from '@/fixtures/shaping'
import type { PreflightCheck } from '@/lib/nous-preflight'
import { WritebackForm } from './WritebackForm'

const REGISTRY: ReadonlyArray<SourceEntry> = [
  { id: 'fixture', label: 'demo fixture', kind: 'fixture' },
  { id: 'nous', label: 'nous campaigns', kind: 'adapter' },
  { id: 'wb-test', label: 'writeback test', kind: 'adapter' },
]

const TEMPLATE: WritebackTemplate = {
  max_iterations: 5,
  target_system: {
    name: 'inference-sim',
    description: 'simulator',
    repo_path: '~/Documents/Projects/inference-sim',
  },
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('WritebackForm', () => {
  it('renders with values pre-filled from the template', () => {
    render(
      <WritebackForm
        registry={REGISTRY}
        template={TEMPLATE}
        onChange={() => {}}
      />
    )
    expect(
      (screen.getByLabelText(/max iterations/i) as HTMLInputElement).value
    ).toBe('5')
    expect(
      (screen.getByLabelText(/target.*name/i) as HTMLInputElement).value
    ).toBe('inference-sim')
    expect(
      (screen.getByLabelText(/repo.*path/i) as HTMLInputElement).value
    ).toBe('~/Documents/Projects/inference-sim')
  })

  it('exposes only adapter sources in the source picker (no fixture)', () => {
    render(
      <WritebackForm
        registry={REGISTRY}
        template={TEMPLATE}
        onChange={() => {}}
      />
    )
    const select = screen.getByLabelText(/target source/i) as HTMLSelectElement
    const options = Array.from(select.options).map((o) => o.value)
    expect(options).toContain('nous')
    expect(options).toContain('wb-test')
    expect(options).not.toContain('fixture')
  })

  it('defaults to the first adapter source when no preselect is given', () => {
    render(
      <WritebackForm
        registry={REGISTRY}
        template={TEMPLATE}
        onChange={() => {}}
      />
    )
    const select = screen.getByLabelText(/target source/i) as HTMLSelectElement
    expect(select.value).toBe('nous')
  })

  it('reports a valid config via onChange when fields are filled', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <WritebackForm
        registry={REGISTRY}
        template={TEMPLATE}
        onChange={onChange}
      />
    )
    // Force a re-emit by typing a single character in repo_path.
    const repo = screen.getByLabelText(/repo.*path/i)
    await user.click(repo)
    await user.keyboard('!')
    // The most recent emission should be a valid config object.
    const lastCall = onChange.mock.calls.at(-1)
    expect(lastCall).toBeDefined()
    const last = lastCall?.[0] as {
      sourceId: string
      config: { max_iterations: number }
    } | null
    expect(last).not.toBeNull()
    expect(last?.sourceId).toBe('nous')
    expect(last?.config.max_iterations).toBe(5)
  })

  it('reports null via onChange when required fields are empty', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const emptyTemplate: WritebackTemplate = {
      max_iterations: 5,
      target_system: { name: 'X', description: 'Y', repo_path: '/p' },
    }
    render(
      <WritebackForm
        registry={REGISTRY}
        template={emptyTemplate}
        onChange={onChange}
      />
    )
    // Clear the repo_path field — config should become invalid.
    const repo = screen.getByLabelText(/repo.*path/i) as HTMLInputElement
    await user.clear(repo)
    expect(onChange.mock.calls.at(-1)?.[0]).toBeNull()
  })

  it('reports null when max_iterations is non-positive', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <WritebackForm
        registry={REGISTRY}
        template={TEMPLATE}
        onChange={onChange}
      />
    )
    const max = screen.getByLabelText(/max iterations/i) as HTMLInputElement
    await user.clear(max)
    await user.type(max, '0')
    expect(onChange.mock.calls.at(-1)?.[0]).toBeNull()
  })

  it('changing the source updates the emitted sourceId', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <WritebackForm
        registry={REGISTRY}
        template={TEMPLATE}
        onChange={onChange}
      />
    )
    const select = screen.getByLabelText(/target source/i) as HTMLSelectElement
    await user.selectOptions(select, 'wb-test')
    const last = onChange.mock.calls.at(-1)?.[0] as
      | { sourceId: string }
      | null
    expect(last?.sourceId).toBe('wb-test')
  })

  describe('preflight indicators', () => {
    const ALL_OK: PreflightCheck[] = [
      { name: 'repo-path-exists', status: 'ok' },
      { name: 'nous-cli-available', status: 'ok' },
      { name: 'writeback-target-writable', status: 'ok' },
      { name: 'run-id-not-in-use', status: 'ok' },
    ]

    const REPO_FAIL: PreflightCheck[] = [
      {
        name: 'repo-path-exists',
        status: 'fail',
        message: 'path does not exist: /nonexistent',
      },
      { name: 'nous-cli-available', status: 'ok' },
      { name: 'writeback-target-writable', status: 'ok' },
      {
        name: 'run-id-not-in-use',
        status: 'warn',
        message: 'run id will be derived from title at commit time',
      },
    ]

    it('renders no indicators when preflight is null (initial state)', () => {
      render(
        <WritebackForm
          registry={REGISTRY}
          template={TEMPLATE}
          onChange={() => {}}
          preflight={null}
        />
      )
      expect(
        screen.queryByTestId('preflight-repo-path-exists')
      ).not.toBeInTheDocument()
    })

    it('renders ok indicator next to the repo_path field on success', () => {
      render(
        <WritebackForm
          registry={REGISTRY}
          template={TEMPLATE}
          onChange={() => {}}
          preflight={ALL_OK}
        />
      )
      const indicator = screen.getByTestId('preflight-repo-path-exists')
      expect(indicator).toHaveAttribute('data-preflight-status', 'ok')
    })

    it('renders fail indicator with the message as tooltip when repo-path-exists fails', () => {
      render(
        <WritebackForm
          registry={REGISTRY}
          template={TEMPLATE}
          onChange={() => {}}
          preflight={REPO_FAIL}
        />
      )
      const indicator = screen.getByTestId('preflight-repo-path-exists')
      expect(indicator).toHaveAttribute('data-preflight-status', 'fail')
      expect(indicator).toHaveAttribute(
        'title',
        'path does not exist: /nonexistent'
      )
    })

    it('renders run-id-not-in-use indicator next to the run_id field', () => {
      render(
        <WritebackForm
          registry={REGISTRY}
          template={TEMPLATE}
          onChange={() => {}}
          preflight={REPO_FAIL}
        />
      )
      const indicator = screen.getByTestId('preflight-run-id-not-in-use')
      expect(indicator).toHaveAttribute('data-preflight-status', 'warn')
    })

    it('renders writeback-target-writable indicator next to the source picker', () => {
      render(
        <WritebackForm
          registry={REGISTRY}
          template={TEMPLATE}
          onChange={() => {}}
          preflight={ALL_OK}
        />
      )
      expect(
        screen.getByTestId('preflight-writeback-target-writable')
      ).toHaveAttribute('data-preflight-status', 'ok')
    })

    it('renders nous-cli-available indicator (general; non-blocking warn)', () => {
      const cliMissing: PreflightCheck[] = [
        ...ALL_OK.filter(
          (c): c is PreflightCheck => c.name !== 'nous-cli-available',
        ),
        {
          name: 'nous-cli-available',
          status: 'warn',
          message: '`nous` CLI not on PATH',
        },
      ]
      render(
        <WritebackForm
          registry={REGISTRY}
          template={TEMPLATE}
          onChange={() => {}}
          preflight={cliMissing}
        />
      )
      const indicator = screen.getByTestId('preflight-nous-cli-available')
      expect(indicator).toHaveAttribute('data-preflight-status', 'warn')
    })
  })

  it('renders nothing when the registry has no adapter sources', () => {
    const fixtureOnly: ReadonlyArray<SourceEntry> = [
      { id: 'fixture', label: 'demo fixture', kind: 'fixture' },
    ]
    const { container } = render(
      <WritebackForm
        registry={fixtureOnly}
        template={TEMPLATE}
        onChange={() => {}}
      />
    )
    expect(container.firstChild).toBeNull()
  })
})
