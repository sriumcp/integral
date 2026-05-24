import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  WorkspaceSchema,
  type Intent,
  type IntentState,
  type Workspace,
} from '@/schema'
import { shapingFor } from '@/fixtures/shaping'
import { AppHeader, type Crumb } from '@/components'
import { MapSurface } from '@/surfaces/Map'
import { DetailSurface } from '@/surfaces/Detail'
import { LandingSurface } from '@/surfaces/Landing'
import { ShapingSurface } from '@/surfaces/Shaping'
import { WorkspaceActivityStrip } from '@/surfaces/Activity'
import { HoveredIntentProvider } from '@/lib/hovered-intent'
import {
  fetchSourceRegistry,
  FIXTURE_SOURCE,
  loadEnabledSources,
  parseSourcesFromUrl,
  serializeSourcesToUrl,
  type SourceEntry,
} from '@/lib/sources'
import styles from './App.module.css'

const ME = { id: 'sri', kind: 'human' as const, display_name: 'sri' }
const LANDING_SEEN_KEY = 'integral.landing-seen'
const STRIP_COLLAPSED_KEY = 'integral.strip-collapsed'

/**
 * Root. Loads workspace data from one or more sources (fixture, adapters)
 * per the `?sources=` URL contract — see `src/lib/sources.ts`. Default is
 * "all known sources merged" so the user gets the widest possible view by
 * default; toggling sources via the Map's picker chip cluster narrows or
 * widens the workspace and updates the URL.
 *
 * Validation is fail-closed: every fetched source is decorated with its
 * source ID, the merged workspace is validated against `WorkspaceSchema`,
 * and surfaces only render on `safeParse.success`.
 */
function App() {
  // Source registry is dynamic — fetched from /api/sources on mount —
  // so multiple Nous workspaces (or other adapter kinds in v0.2) can be
  // configured via integral.config.json without a code change. Until
  // the registry resolves, we render with [FIXTURE_SOURCE] only so the
  // fixture is always available even if the API is offline.
  const [registry, setRegistry] = useState<ReadonlyArray<SourceEntry>>([
    FIXTURE_SOURCE,
  ])

  // Enabled-source set derives from URL + registry. We re-parse whenever
  // the registry resolves so unknown ids in the URL are dropped against
  // the actual configured set.
  const [enabledSources, setEnabledSources] = useState<Set<string>>(() =>
    parseSourcesFromUrl(
      typeof window !== 'undefined' ? window.location.search : '',
      [FIXTURE_SOURCE]
    )
  )

  // Fetch dynamic registry once; merge with the static fixture.
  useEffect(() => {
    let cancelled = false
    void fetchSourceRegistry().then((next) => {
      if (cancelled) return
      setRegistry(next)
      // Re-parse URL against the resolved registry — initial parse used
      // [FIXTURE_SOURCE] only, so adapter ids in the URL would have been
      // dropped. This re-includes them.
      setEnabledSources(
        parseSourcesFromUrl(
          typeof window !== 'undefined' ? window.location.search : '',
          next
        )
      )
    })
    return () => {
      cancelled = true
    }
  }, [])

  const [loadState, setLoadState] = useState<
    | { kind: 'loading' }
    | { kind: 'error'; message: string }
    | { kind: 'ready'; workspace: Workspace; failures: string[]; syncedAt: string }
  >({ kind: 'loading' })

  const [refreshing, setRefreshing] = useState(false)

  const reload = useCallback(
    async (
      sources: Set<string>,
      reg: ReadonlyArray<SourceEntry>,
      opts?: { isRefresh?: boolean }
    ) => {
      const isRefresh = opts?.isRefresh ?? false
      if (isRefresh) {
        setRefreshing(true)
      } else {
        setLoadState({ kind: 'loading' })
      }
      try {
        const { workspace, failures } = await loadEnabledSources(sources, reg)
        const parsed = WorkspaceSchema.safeParse(workspace)
        if (!parsed.success) {
          setLoadState({
            kind: 'error',
            message:
              'WorkspaceSchema rejected merged workspace:\n' +
              JSON.stringify(parsed.error.issues, null, 2),
          })
          return
        }
        setLoadState({
          kind: 'ready',
          workspace: parsed.data,
          failures: failures.map((f) => `${f.sourceId}: ${f.error}`),
          syncedAt: new Date().toISOString(),
        })
      } catch (err) {
        setLoadState({
          kind: 'error',
          message: err instanceof Error ? err.message : String(err),
        })
      } finally {
        if (isRefresh) setRefreshing(false)
      }
    },
    []
  )

  useEffect(() => {
    void reload(enabledSources, registry)
  }, [enabledSources, registry, reload])

  const onRefresh = useCallback(() => {
    void reload(enabledSources, registry, { isRefresh: true })
  }, [enabledSources, registry, reload])

  const toggleSource = useCallback(
    (sourceId: string) => {
      setEnabledSources((prev) => {
        const next = new Set(prev)
        if (next.has(sourceId)) {
          next.delete(sourceId)
        } else {
          next.add(sourceId)
        }
        // Reflect in URL so the state is bookmarkable + survives reload.
        try {
          const params = new URLSearchParams(window.location.search)
          params.set('sources', serializeSourcesToUrl(next, registry))
          const search = params.toString()
          window.history.replaceState(
            null,
            '',
            `${window.location.pathname}${search ? '?' + search : ''}${window.location.hash}`
          )
        } catch {
          // history.replaceState may fail in restricted contexts; fall through.
        }
        return next
      })
    },
    [registry]
  )

  if (loadState.kind === 'loading') {
    return (
      <main
        style={{
          fontFamily: 'var(--mono)',
          maxWidth: 760,
          margin: '60px auto',
          padding: '0 24px',
          color: 'var(--mute)',
        }}
      >
        loading workspace…
      </main>
    )
  }
  if (loadState.kind === 'error') {
    return (
      <SchemaErrorBanner
        issues={[{ message: loadState.message, path: ['sources'] }]}
      />
    )
  }

  return (
    <HoveredIntentProvider>
      <Router
        initialWorkspace={loadState.workspace}
        enabledSources={enabledSources}
        onToggleSource={toggleSource}
        sourceFailures={loadState.failures}
        syncedAt={loadState.syncedAt}
        onRefresh={onRefresh}
        refreshing={refreshing}
        registry={registry}
      />
    </HoveredIntentProvider>
  )
}

type View =
  | { kind: 'landing' }
  | { kind: 'map' }
  | { kind: 'detail'; intent: Intent }
  | { kind: 'shaping'; intent: Intent }

function initialView(): View {
  if (typeof window !== 'undefined') {
    try {
      if (window.sessionStorage.getItem(LANDING_SEEN_KEY) === 'true') {
        return { kind: 'map' }
      }
    } catch {
      // sessionStorage may be unavailable; fall through to landing.
    }
  }
  return { kind: 'landing' }
}

function initialStripCollapsed(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.sessionStorage.getItem(STRIP_COLLAPSED_KEY) === 'true'
  } catch {
    return false
  }
}

interface RouterProps {
  initialWorkspace: Workspace
  enabledSources: Set<string>
  onToggleSource: (sourceId: string) => void
  sourceFailures: string[]
  syncedAt: string
  onRefresh: () => void
  refreshing: boolean
  registry: ReadonlyArray<SourceEntry>
}

function Router({
  initialWorkspace,
  enabledSources,
  onToggleSource,
  sourceFailures: _sourceFailures,
  syncedAt,
  onRefresh,
  refreshing,
  registry,
}: RouterProps) {
  const [workspace, setWorkspace] = useState<Workspace>(initialWorkspace)
  const [view, setView] = useState<View>(initialView)
  const [stripCollapsed, setStripCollapsed] = useState<boolean>(
    initialStripCollapsed
  )

  // Keep workspace in sync when source selection (and therefore the
  // initialWorkspace prop) changes.
  useEffect(() => {
    setWorkspace(initialWorkspace)
  }, [initialWorkspace])

  const toggleStrip = () => {
    setStripCollapsed((v) => {
      const next = !v
      try {
        window.sessionStorage.setItem(STRIP_COLLAPSED_KEY, String(next))
      } catch {
        // Best-effort.
      }
      return next
    })
  }

  // Lookup helper — used to route by status (drafts → shaping).
  const stateById = useMemo(
    () => new Map(workspace.states.map((s) => [s.intent_id, s])),
    [workspace]
  )

  const goMap = () => setView({ kind: 'map' })

  const openIntent = (intent: Intent) => {
    const state = stateById.get(intent.id)
    if (state?.status === 'draft') {
      setView({ kind: 'shaping', intent })
    } else {
      setView({ kind: 'detail', intent })
    }
  }

  const onEnter = () => {
    try {
      window.sessionStorage.setItem(LANDING_SEEN_KEY, 'true')
    } catch {
      // Best-effort.
    }
    setView({ kind: 'map' })
  }

  /** Logo click — returns to Landing. Clears the once-per-session flag so
   *  the user lands on the Landing surface (not Map) on this navigation. */
  const onLogoClick = () => {
    try {
      window.sessionStorage.removeItem(LANDING_SEEN_KEY)
    } catch {
      // Best-effort.
    }
    setView({ kind: 'landing' })
  }

  /** Commit a draft intent: transition its state from 'draft' to 'active'
   *  in the in-memory workspace. The fixture file is never rewritten. */
  const onCommitDraft = (intentId: string) => {
    setWorkspace((prev) => {
      const states: IntentState[] = prev.states.map((s) =>
        s.intent_id === intentId
          ? { ...s, status: 'active' as const, last_advanced_at: new Date().toISOString(), last_advanced_by: ME }
          : s
      )
      return { ...prev, states }
    })
    setView({ kind: 'map' })
  }

  /** A4: Nous writeback handler. POSTs to /api/nous/writeback; on
   *  success, the caller (ShapingSurface) fires onCommit to flip the
   *  in-memory state. After writeback, also triggers a workspace refresh
   *  so the newly-written campaign appears as a real Intent in the
   *  registered source. */
  const onShapingWriteback = useCallback(
    async (args: {
      intentId: string
      sourceId: string
      config: import('@/adapters/nous/writeback').NousWritebackConfig
    }): Promise<{ ok: boolean; error?: string; path?: string; run_id?: string }> => {
      try {
        const intent = workspace.intents.find((i) => i.id === args.intentId)
        if (!intent) return { ok: false, error: 'intent not found in workspace' }
        const res = await fetch('/api/nous/writeback', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            sourceId: args.sourceId,
            intent,
            config: args.config,
          }),
        })
        const body = await res.json().catch(() => ({}))
        if (!res.ok) {
          return { ok: false, error: body.error ?? `HTTP ${res.status}` }
        }
        // Trigger a workspace refresh upstream so the new campaign appears.
        onRefresh()
        return {
          ok: true,
          path: body.path,
          run_id: body.run_id,
        }
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        }
      }
    },
    [workspace, onRefresh]
  )

  if (view.kind === 'landing') {
    return <LandingSurface workspace={workspace} me={ME} onEnter={onEnter} />
  }

  if (view.kind === 'shaping') {
    const shape = shapingFor(view.intent.id)
    if (!shape) {
      // Defensive — drafts without shaping data shouldn't exist in v0.1.
      return (
        <>
          <AppHeader
            surface={view.kind}
            breadcrumbs={[
              { label: 'workspace', onClick: goMap },
              { label: 'shaping', onClick: goMap },
              { label: view.intent.declaration.title },
            ]}
            me={ME}
            onLogoClick={onLogoClick}
          />
          <main style={{ padding: 40, fontFamily: 'var(--mono)' }}>
            no shaping data found for {view.intent.id}
          </main>
        </>
      )
    }
    return (
      <>
        <AppHeader
          surface={view.kind}
          breadcrumbs={[
            { label: 'workspace', onClick: goMap },
            { label: 'shaping', onClick: goMap },
            { label: view.intent.declaration.title },
          ]}
          me={ME}
          onLogoClick={onLogoClick}
          onRefresh={onRefresh}
          lastSyncedAt={syncedAt}
          refreshing={refreshing}
        />
        <ShapingSurface
          intent={view.intent}
          shape={shape}
          onCommit={onCommitDraft}
          onBack={goMap}
          registry={registry}
          onWriteback={onShapingWriteback}
        />
      </>
    )
  }

  const breadcrumbs: Crumb[] =
    view.kind === 'map'
      ? [{ label: 'workspace', onClick: goMap }, { label: 'map' }]
      : [
          { label: 'workspace', onClick: goMap },
          { label: 'detail', onClick: goMap },
          { label: view.intent.declaration.title },
        ]

  return (
    <>
      <AppHeader
        surface={view.kind}
        breadcrumbs={breadcrumbs}
        me={ME}
        onLogoClick={onLogoClick}
      />
      <div className={styles.body}>
        <div>
          {view.kind === 'map' ? (
            <MapSurface
              workspace={workspace}
              me={ME}
              onOpenIntent={openIntent}
              knownSources={registry}
              enabledSources={enabledSources}
              onToggleSource={onToggleSource}
            />
          ) : (
            <DetailSurface
              workspace={workspace}
              intent={view.intent}
              me={ME}
              onOpenIntent={openIntent}
              onBack={goMap}
              onRefresh={onRefresh}
              refreshing={refreshing}
            />
          )}
        </div>
        <aside
          className={styles.aside}
          data-collapsed={stripCollapsed ? 'true' : undefined}
        >
          <WorkspaceActivityStrip
            workspace={workspace}
            onOpenIntent={openIntent}
            collapsed={stripCollapsed}
            onToggleCollapsed={toggleStrip}
            {...(view.kind === 'detail' && {
              focusedIntentId: view.intent.id,
            })}
          />
        </aside>
      </div>
    </>
  )
}

function SchemaErrorBanner({
  issues,
}: {
  issues: ReadonlyArray<{ message: string; path: ReadonlyArray<PropertyKey> }>
}) {
  return (
    <main
      style={{
        fontFamily: 'var(--sans)',
        maxWidth: 760,
        margin: '60px auto',
        padding: '0 24px',
        color: 'var(--ink)',
      }}
    >
      <h1
        style={{
          fontFamily: 'var(--serif)',
          fontSize: 28,
          margin: 0,
          letterSpacing: -0.4,
          fontWeight: 500,
        }}
      >
        Integral · v0.1
      </h1>
      <p
        style={{
          margin: '6px 0 18px',
          color: 'var(--mute)',
          fontFamily: 'var(--mono)',
          fontSize: 12,
        }}
      >
        schema rejected workspace · downstream rendering halted
      </p>
      <section
        style={{
          border: '1px solid var(--rose-border)',
          borderRadius: 4,
          padding: '14px 18px',
          background: 'var(--rose-soft)',
          color: 'var(--rose-fg)',
        }}
      >
        <strong>✗ Workspace failed validation</strong>
        <ul
          style={{
            marginTop: 10,
            paddingLeft: 18,
            fontFamily: 'var(--mono)',
            fontSize: 12,
          }}
        >
          {issues.map((issue, i) => (
            <li key={i}>
              {issue.path.length > 0
                ? `${issue.path.map(String).join('.')}: `
                : ''}
              {issue.message}
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}

export default App
