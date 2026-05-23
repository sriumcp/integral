import { useMemo, useState } from 'react'
import {
  WorkspaceSchema,
  type Intent,
  type IntentState,
  type Workspace,
} from '@/schema'
import { fixtureWorkspace } from '@/fixtures/workspace'
import { shapingFor } from '@/fixtures/shaping'
import { AppHeader, type Crumb } from '@/components'
import { MapSurface } from '@/surfaces/Map'
import { DetailSurface } from '@/surfaces/Detail'
import { LandingSurface } from '@/surfaces/Landing'
import { ShapingSurface } from '@/surfaces/Shaping'
import { WorkspaceActivityStrip } from '@/surfaces/Activity'
import { HoveredIntentProvider } from '@/lib/hovered-intent'
import styles from './App.module.css'

const ME = { id: 'sri', kind: 'human' as const, display_name: 'sri' }
const LANDING_SEEN_KEY = 'integral.landing-seen'

/**
 * Root. Validates the fixture against `WorkspaceSchema` at load and gates
 * downstream rendering on success — when the fixture fails, only the error
 * banner renders, not stale data. This is the same discipline adapters will
 * follow at v0.2.
 *
 * v0.1 routing is in-memory only. Landing is the default first paint per
 * session; subsequent navigation back from Map skips it. The `AppHeader`
 * chrome renders above Map / Detail / Shaping. Drafts route to Shaping;
 * everything else routes to Detail. Commit transitions the draft to active
 * in the live workspace state (in-memory only — fixture is not rewritten).
 */
function App() {
  const result = WorkspaceSchema.safeParse(fixtureWorkspace)
  if (!result.success) {
    return <SchemaErrorBanner issues={result.error.issues} />
  }
  return (
    <HoveredIntentProvider>
      <Router initialWorkspace={result.data} />
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

function Router({ initialWorkspace }: { initialWorkspace: Workspace }) {
  const [workspace, setWorkspace] = useState<Workspace>(initialWorkspace)
  const [view, setView] = useState<View>(initialView)

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
        />
        <ShapingSurface
          intent={view.intent}
          shape={shape}
          onCommit={onCommitDraft}
          onBack={goMap}
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
            <MapSurface workspace={workspace} me={ME} onOpenIntent={openIntent} />
          ) : (
            <DetailSurface
              workspace={workspace}
              intent={view.intent}
              me={ME}
              onOpenIntent={openIntent}
              onBack={goMap}
            />
          )}
        </div>
        <aside className={styles.aside}>
          <WorkspaceActivityStrip
            workspace={workspace}
            onOpenIntent={openIntent}
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
        schema rejected fixture · downstream rendering halted
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
        <strong>✗ WorkspaceSchema rejected the fixture</strong>
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
