import * as os from 'node:os'
import * as path from 'node:path'
import type { Plugin } from 'vite'
import { buildNousWorkspace } from '../src/adapters/nous'
import {
  generateProjection,
  type PluginRegistry,
} from '../src/lib/projection'
import { nousCampaignPlugin } from '../src/lib/projection-plugins/nous-campaign'
import { nousIterationPlugin } from '../src/lib/projection-plugins/nous-iteration'
import type { Workspace, ZoomLevel } from '../src/schema'
import { tryCreateLLMClient } from './llm-client-factory'
import { FilesystemNousSource } from './filesystem-source'
import {
  projectionCacheDir,
  readPersistedProjection,
  writePersistedProjection,
} from './projection-cache'

/**
 * Vite plugin that exposes the Nous adapter as `/api/workspace`.
 *
 * The plugin wraps `FilesystemNousSource` (Node-only) and serves the
 * resulting typed `Workspace` as JSON. The browser app fetches this on
 * mount + on the refresh button. The Node-only filesystem code never
 * ships to the client.
 *
 * Source path: hardcoded to `~/Documents/Projects/inference-sim/` for
 * v0.1 per `roadmap.md`. v0.1.1 will accept a query param.
 *
 * Usage from the UI:
 *   GET /api/workspace?source=nous
 */
export function nousAdapterPlugin(): Plugin {
  const defaultSourcePath = path.join(
    os.homedir(),
    'Documents',
    'Projects',
    'inference-sim'
  )

  // Server-side state. The cached workspace is consulted by the projection
  // endpoint so it doesn't need to re-read .nous/<run>/ on every projection
  // request. Caching is per-source-path. v0.1 keeps it in-memory; refresh
  // affordances (A3) will invalidate. (Projections are cached on disk —
  // see `projection-cache.ts`.)
  let cachedWorkspace: Workspace | null = null
  const projectionPlugins: PluginRegistry = {
    'nous-campaign': nousCampaignPlugin,
    'nous-iteration': nousIterationPlugin,
  }
  const { client: llm, provider: llmProvider } = tryCreateLLMClient()
  if (llm) {
    // eslint-disable-next-line no-console
    console.log(`[integral] projection LLM provider: ${llmProvider}`)
  } else {
    // eslint-disable-next-line no-console
    console.log(
      '[integral] no projection LLM provider configured (set OPENAI_API_KEY or ANTHROPIC_API_KEY) — projections will fall back to raw fields'
    )
  }
  // eslint-disable-next-line no-console
  console.log(`[integral] projection cache dir: ${projectionCacheDir()}`)

  return {
    name: 'nous-adapter',
    apply: 'serve',
    configureServer(server) {
      // Expose `/api/sources` so the UI can confirm which adapters
      // are configured. v0.1 lists only Nous (the fixture is loaded
      // statically by the client and isn't an adapter).
      server.middlewares.use('/api/sources', async (req, res) => {
        if (req.method && req.method !== 'GET') {
          res.statusCode = 405
          res.end()
          return
        }
        res.statusCode = 200
        res.setHeader('content-type', 'application/json')
        res.setHeader('cache-control', 'no-store')
        res.end(
          JSON.stringify({
            sources: [
              {
                id: 'nous',
                label: 'nous campaigns',
                kind: 'adapter',
                path: defaultSourcePath,
              },
            ],
          })
        )
      })

      server.middlewares.use('/api/workspace', async (req, res) => {
        try {
          const url = new URL(req.url ?? '', 'http://localhost')
          const sourceKey = url.searchParams.get('source')
          if (sourceKey !== 'nous') {
            res.statusCode = 400
            res.setHeader('content-type', 'application/json')
            res.end(
              JSON.stringify({
                error: `unsupported source: ${sourceKey ?? '(none)'}`,
                supported: ['nous'],
              })
            )
            return
          }

          const sourcePath = url.searchParams.get('path') ?? defaultSourcePath
          const source = new FilesystemNousSource(sourcePath)
          const workspace = await buildNousWorkspace(source)
          // Cache for the projection endpoint so it doesn't need to re-read
          // every campaign on every request.
          cachedWorkspace = workspace

          res.statusCode = 200
          res.setHeader('content-type', 'application/json')
          res.setHeader('cache-control', 'no-store')
          res.end(
            JSON.stringify({
              source: { id: source.id, label: source.label, kind: 'nous' },
              workspace,
            })
          )
        } catch (err) {
          res.statusCode = 500
          res.setHeader('content-type', 'application/json')
          res.end(
            JSON.stringify({
              error: err instanceof Error ? err.message : String(err),
            })
          )
        }
      })

      // ─── /api/projection ───────────────────────────────────────────────
      // Returns the LLM-generated projection for a single intent at a
      // given zoom level. The chrome (DetailSurface) hits this on mount.
      //
      // Contract:
      //   GET /api/projection?intent_id=X&zoom={overview|structure|detail}
      //   200 { content: string, source: 'llm' | 'fallback' }
      //   400 if params missing
      //   404 if intent_id not in cached workspace
      //
      // Graceful degradation: if no ANTHROPIC_API_KEY in env, the engine
      // falls back to raw-field rendering (source='fallback'). The chrome
      // sees the same shape either way; no errors propagate.
      server.middlewares.use('/api/projection', async (req, res) => {
        try {
          const url = new URL(req.url ?? '', 'http://localhost')
          const intentId = url.searchParams.get('intent_id')
          const zoomParam = url.searchParams.get('zoom')
          if (!intentId || !zoomParam) {
            res.statusCode = 400
            res.setHeader('content-type', 'application/json')
            res.end(
              JSON.stringify({
                error: 'intent_id and zoom query params are required',
              })
            )
            return
          }
          if (!isZoomLevel(zoomParam)) {
            res.statusCode = 400
            res.setHeader('content-type', 'application/json')
            res.end(
              JSON.stringify({
                error: `unsupported zoom: ${zoomParam}`,
                supported: ['overview', 'structure', 'detail'],
              })
            )
            return
          }
          const zoom: ZoomLevel = zoomParam

          // Hydrate the cached workspace if missing — the chrome may hit
          // /api/projection before /api/workspace if the user deep-links.
          if (!cachedWorkspace) {
            const source = new FilesystemNousSource(defaultSourcePath)
            cachedWorkspace = await buildNousWorkspace(source)
          }

          const intent = cachedWorkspace.intents.find((i) => i.id === intentId)
          const state = cachedWorkspace.states.find(
            (s) => s.intent_id === intentId
          )
          if (!intent || !state) {
            res.statusCode = 404
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify({ error: `intent not found: ${intentId}` }))
            return
          }

          // Disk cache check (unless ?refresh=true). Cache key triple:
          // (intent_id, zoom, state.last_advanced_at). State-driven
          // invalidation is automatic — when state advances, the key
          // misses and the LLM is called fresh.
          const refresh = url.searchParams.get('refresh') === 'true'
          if (!refresh) {
            const cached = await readPersistedProjection({
              intentId,
              zoom,
              stateTimestamp: state.last_advanced_at,
            })
            if (cached) {
              res.statusCode = 200
              res.setHeader('content-type', 'application/json')
              res.setHeader('cache-control', 'no-store')
              res.end(JSON.stringify(cached))
              return
            }
          }

          const projection = await generateProjection({
            intent,
            state,
            workspace: cachedWorkspace,
            zoom,
            plugins: projectionPlugins,
            // If no API key, the engine receives a stub LLMClient that
            // throws on call → engine catches → fallback. Cleaner than
            // branching at this layer.
            llm: llm ?? noKeyLLMStub,
          })

          // Persist to disk so next dev-server start (or the user's next
          // visit to this intent) doesn't re-hit the LLM. Only persist
          // llm-source projections — fallbacks are cheap to recompute and
          // caching them would mask future plugin / API-key fixes.
          let response: object = projection
          if (projection.source === 'llm') {
            const persisted = await writePersistedProjection({
              intentId,
              zoom,
              stateTimestamp: state.last_advanced_at,
              projection,
              ...(llmProvider ? { model: llmProvider } : {}),
            })
            response = persisted
          }

          res.statusCode = 200
          res.setHeader('content-type', 'application/json')
          res.setHeader('cache-control', 'no-store')
          res.end(JSON.stringify(response))
        } catch (err) {
          res.statusCode = 500
          res.setHeader('content-type', 'application/json')
          res.end(
            JSON.stringify({
              error: err instanceof Error ? err.message : String(err),
            })
          )
        }
      })
    },
  }
}

function isZoomLevel(s: string): s is ZoomLevel {
  return s === 'overview' || s === 'structure' || s === 'detail'
}

/** Stub LLM client used when no ANTHROPIC_API_KEY is in env. Throws on
 *  call so generateProjection's error path falls back to raw fields. */
const noKeyLLMStub = {
  async generate(): Promise<string> {
    throw new Error(
      'no ANTHROPIC_API_KEY in env — projection engine falling back to raw fields'
    )
  },
}
