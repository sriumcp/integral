import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  WorkspaceSchema,
  type Intent,
  type IntentState,
  type Party,
  type Workspace,
} from '@/schema'
import { fetchMe, meAsParty } from '@/lib/me'
import { blankNousDraftShape } from '@/lib/draft-shape'
import { AppHeader, type FocusSegment, type ScopePill } from '@/components'
import {
  intentAncestry,
  mapScopeInteractive,
} from '@/lib/header-scope'
import { MapSurface } from '@/surfaces/Map'
import { DetailSurface } from '@/surfaces/Detail'
import { LandingSurface } from '@/surfaces/Landing'
import { ShapingSurface } from '@/surfaces/Shaping'
import { WorkspaceActivityStrip } from '@/surfaces/Activity'
import { HoveredIntentProvider } from '@/lib/hovered-intent'
import {
  fetchSourceRegistry,
  loadEnabledSources,
  parseSourcesFromUrl,
  serializeSourcesToUrl,
  type SourceEntry,
} from '@/lib/sources'
import {
  DEFAULT_VIEW,
  parseFilterQuery,
  serializeFilterQuery,
  type MapView,
} from '@/lib/filter-query'
import styles from './App.module.css'

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
  // so multiple workspaces of any adapter kind can be configured via
  // integral.config.json without a code change. Until the registry
  // resolves, we render with an empty list and gate surface render on
  // both workspace + identity resolution below.
  const [registry, setRegistry] = useState<ReadonlyArray<SourceEntry>>([])

  // Current-user identity is fetched from /api/me on mount. We render
  // `null` until it resolves (gating the surface render on the loading
  // state below) — never with a placeholder, because the awaiting-me
  // sort and isAwaitingMe predicate read `me.id`, and any identity
  // mismatch between first paint and the resolved value would flicker
  // the Map's sort order. The initial-load gate wraps both workspace
  // and identity resolution.
  const [me, setMe] = useState<Party | null>(null)

  // Enabled-source set derives from URL + registry. We re-parse whenever
  // the registry resolves so unknown ids in the URL are dropped against
  // the actual configured set.
  const [enabledSources, setEnabledSources] = useState<Set<string>>(() =>
    parseSourcesFromUrl(
      typeof window !== 'undefined' ? window.location.search : '',
      []
    )
  )

  // Fetch dynamic registry + me identity once. The two fetches are
  // independent (different endpoints, no shared state) so they run in
  // parallel; `cancelled` guards both setState calls in case the
  // component unmounts before either resolves.
  useEffect(() => {
    let cancelled = false
    void fetchSourceRegistry().then((next) => {
      if (cancelled) return
      setRegistry(next)
      // Re-parse URL against the resolved registry — initial parse used
      // an empty registry, so any adapter ids in the URL would have been
      // dropped. This re-includes them.
      setEnabledSources(
        parseSourcesFromUrl(
          typeof window !== 'undefined' ? window.location.search : '',
          next
        )
      )
    })
    void fetchMe().then((identity) => {
      if (cancelled) return
      setMe(meAsParty(identity))
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

  if (loadState.kind === 'loading' || me === null) {
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
        me={me}
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
  /** Current-user identity, lifted to a Party (kind: 'human' baked in)
   *  by the parent App via `meAsParty(...)`. Used as the `by` field on
   *  lifecycle transitions, the holder on freshly-shaped drafts, and the
   *  AppHeader's right-cluster PartyChip. */
  me: Party
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
  me,
}: RouterProps) {
  const [workspace, setWorkspace] = useState<Workspace>(initialWorkspace)
  const [view, setView] = useState<View>(initialView)
  const [stripCollapsed, setStripCollapsed] = useState<boolean>(
    initialStripCollapsed
  )
  // Map view (filter / group / sort) — parsed from URL on mount, written
  // back to URL via history.replaceState on every change. The URL is the
  // single source of truth for shareability + reload-survival.
  const [mapView, setMapView] = useState<MapView>(() =>
    typeof window !== 'undefined'
      ? parseFilterQuery(new URLSearchParams(window.location.search))
      : DEFAULT_VIEW
  )

  const onChangeMapView = useCallback((next: MapView) => {
    setMapView(next)
    try {
      const existing = new URLSearchParams(window.location.search)
      const updated = serializeFilterQuery(next)
      // Preserve `sources` (and any other unrelated params); replace
      // only the keys this serializer owns.
      for (const key of [
        'awaiting',
        'kind',
        'status',
        'holder',
        'tag',
        'group',
        'sort',
      ]) {
        existing.delete(key)
      }
      for (const [k, v] of updated) existing.set(k, v)
      const search = existing.toString()
      window.history.replaceState(
        null,
        '',
        `${window.location.pathname}${search ? '?' + search : ''}${window.location.hash}`
      )
    } catch {
      // history.replaceState may fail in restricted contexts; fall through.
    }
  }, [])

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

  // Scope pills for the AppHeader center cluster — the canonical v0.2.0
  // scope-control affordance. ALL known sources render as interactive
  // pills (enabled = filled style, disabled = muted/dashed); click
  // toggles. Same cluster is used on every surface (Map / Detail /
  // Shaping), so scope decisions live in chrome — not in per-surface
  // controls. The pure derivation lives in `lib/header-scope` and is
  // unit-tested there.
  const scopePills = useMemo<ScopePill[]>(
    () => mapScopeInteractive(registry, enabledSources, onToggleSource),
    [registry, enabledSources, onToggleSource]
  )

  // Build the focus chain (ancestry root → leaf) for a focused intent.
  // Ancestors are clickable to navigate up; the leaf has no handler so
  // the AppHeader renders it as plain text. Pure walk over
  // `decomposition.children` lives in `lib/header-scope`.
  const buildFocusChain = (intent: Intent): FocusSegment[] => {
    const chain = intentAncestry(intent, workspace)
    return chain.map((node, i) => {
      const isLeaf = i === chain.length - 1
      const segment: FocusSegment = { label: node.declaration.title }
      if (!isLeaf) segment.onClick = () => openIntent(node)
      return segment
    })
  }

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
          ? { ...s, status: 'active' as const, last_advanced_at: new Date().toISOString(), last_advanced_by: me }
          : s
      )
      return { ...prev, states }
    })
    setView({ kind: 'map' })
  }

  /** A4.6: Create a blank Nous draft + navigate to the Shaping surface.
   *  The draft has no scripted dialog (DraftShape's `dialog` is empty),
   *  which signals the ShapingSurface to use the LLM-driven ShapingChat
   *  instead of the legacy ShapingDialog. */
  const onNewNousDraft = useCallback(() => {
    const draftId = `draft-nous-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const now = new Date().toISOString()
    const blank: Intent = {
      id: draftId,
      schema_version: '0.2.0',
      kind: 'nous-campaign',
      declaration: {
        title: 'untitled campaign',
        summary: '',
        success_criterion: '',
      },
      holder: { mode: 'jointly-held', parties: [me] },
      lifetime: { kind: 'campaign', started_at: now },
      decomposition: { children: [] },
      provenance: {
        declared_by: me,
        declared_at: now,
        motivated_by: [],
        source: 'fixture',
      },
      knowledge_refs: [],
      tags: [],
      state_ref: `${draftId}-STATE`,
      extension: {
        kind: 'nous-campaign',
        research_question: '(to be shaped)',
        open_hypothesis_bundles: [],
        gate_status: { current_gate: 'design' },
      },
    }
    const blankState: IntentState = {
      id: `${draftId}-STATE`,
      intent_id: draftId,
      schema_version: '0.2.0',
      status: 'draft',
      last_advanced_at: now,
      last_advanced_by: me,
      history: [],
      external_anchors: [],
    }
    setWorkspace((prev) => ({
      ...prev,
      intents: [...prev.intents, blank],
      states: [...prev.states, blankState],
    }))
    setView({ kind: 'shaping', intent: blank })
  }, [me])

  /** A4.6: LLM-driven shaping handler. POSTs to /api/shape with the
   *  current draft + conversation history + user message. The Vite
   *  plugin's shape-handler runs the LLM and returns a structured
   *  reply + patch + status. ShapingSurface applies the patch to the
   *  live draft and renders the reply as a new turn. */
  const onShapeMessage = useCallback(
    async (args: {
      draft: import('@/adapters/nous/shape-patch').DraftState
      history: ReadonlyArray<{ speaker: 'user' | 'shaper'; body: string; at: string }>
      user_message: string
    }): Promise<{
      reply: string
      patch: import('@/adapters/nous/shape-patch').ShapePatch | null
      status: 'shaping' | 'ready-to-commit' | 'kind-mismatch'
      concerns: ReadonlyArray<string>
      kind_suggestion?: string
    }> => {
      const draftPayload = {
        intent: {
          kind: args.draft.intent.kind,
          declaration: args.draft.intent.declaration,
          extension: {
            kind: args.draft.intent.extension.kind,
            ...(args.draft.intent.extension.kind === 'nous-campaign'
              ? {
                  research_question:
                    args.draft.intent.extension.research_question,
                }
              : {}),
          },
          tags: args.draft.intent.tags ?? [],
        },
        writeback: args.draft.writeback,
      }
      const res = await fetch('/api/shape', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          draft: draftPayload,
          history: args.history.map((t) => ({
            speaker: t.speaker,
            body: t.body,
          })),
          user_message: args.user_message,
        }),
      })
      const body = await res.json()
      return body
    },
    []
  )

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
      /** A4.6: live intent (with LLM-shaped fields). Falls back to the
       *  workspace lookup when not provided (legacy fixture-draft path). */
      intent?: Intent
    }): Promise<{ ok: boolean; error?: string; path?: string; run_id?: string }> => {
      try {
        const intent =
          args.intent ?? workspace.intents.find((i) => i.id === args.intentId)
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
    return <LandingSurface workspace={workspace} me={me} onEnter={onEnter} />
  }

  if (view.kind === 'shaping') {
    // v0.2.0: every draft is LLM-driven (via "+ new nous campaign").
    // The scripted-dialog fixture path was removed when the fixture
    // was deleted. Only nous-campaign drafts are supported in v0.2.0.
    const shape =
      view.intent.kind === 'nous-campaign' ? blankNousDraftShape() : undefined
    if (!shape) {
      // Defensive — non-nous-campaign drafts without shaping data
      // shouldn't exist in v0.1.
      return (
        <>
          <AppHeader
            surface={view.kind}
            scope={scopePills}
            focus={buildFocusChain(view.intent)}
            me={me}
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
          scope={scopePills}
          focus={buildFocusChain(view.intent)}
          me={me}
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
          onShapeMessage={onShapeMessage}
        />
      </>
    )
  }

  const headerScope: ScopePill[] = scopePills
  const headerFocus: FocusSegment[] | undefined =
    view.kind === 'map' ? undefined : buildFocusChain(view.intent)

  return (
    <>
      <AppHeader
        surface={view.kind}
        scope={headerScope}
        focus={headerFocus}
        me={me}
        onLogoClick={onLogoClick}
      />
      <div className={styles.body}>
        <div>
          {view.kind === 'map' ? (
            <MapSurface
              workspace={workspace}
              me={me}
              onOpenIntent={openIntent}
              onNewNousDraft={onNewNousDraft}
              view={mapView}
              onChangeView={onChangeMapView}
            />
          ) : (
            <DetailSurface
              workspace={workspace}
              intent={view.intent}
              me={me}
              onOpenIntent={openIntent}
              onBack={goMap}
              onRefresh={onRefresh}
              refreshing={refreshing}
              registry={registry}
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
