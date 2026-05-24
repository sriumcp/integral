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
import {
  loadSourcesConfig,
  type ConfiguredSource,
} from './sources-config'
import { handleWriteback, readJsonBody } from './writeback-handler'
import { handleShape, type ShapeRequest } from './shape-handler'

/**
 * Vite plugin that exposes the Nous adapter as `/api/workspace` and
 * `/api/projection`.
 *
 * Sources are read from `integral.config.json` at startup (see
 * `sources-config.ts`). The default config (one Nous source pointing at
 * `~/Documents/Projects/inference-sim/`) is used when the file is absent
 * so existing dev environments keep working without a config file.
 *
 * Endpoints:
 *   GET /api/sources                               — list configured sources
 *   GET /api/workspace?source=<id>                 — adapter output for one source
 *   GET /api/projection?intent_id=X&zoom=Y         — LLM projection (cached on disk)
 *   GET /api/projection?intent_id=X&zoom=Y&refresh=true
 *                                                   — bypass cache, regenerate
 */
export function nousAdapterPlugin(): Plugin {
  // Configured sources are loaded asynchronously when the dev server
  // starts. Until they're loaded, all middleware awaits this promise.
  let sourcesPromise: Promise<ConfiguredSource[]> | null = null
  const ensureSourcesLoaded = (cwd: string): Promise<ConfiguredSource[]> => {
    if (!sourcesPromise) sourcesPromise = loadSourcesConfig(cwd)
    return sourcesPromise
  }

  // Server-side workspace cache, keyed by source id. The projection
  // endpoint consults this so it doesn't re-read filesystem state on
  // every projection request.
  const workspaceCache = new Map<string, Workspace>()

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
      const cwd = server.config.root ?? process.cwd()
      // Eagerly start config load so the first request doesn't pay the
      // file-read latency. (No-op if it fails; ensureSourcesLoaded retries.)
      void ensureSourcesLoaded(cwd).then((srcs) => {
        // eslint-disable-next-line no-console
        console.log(
          `[integral] configured sources (${srcs.length}): ${srcs
            .map((s) => `${s.id} → ${s.path}`)
            .join(', ')}`
        )
      })

      server.middlewares.use('/api/sources', async (req, res) => {
        if (req.method && req.method !== 'GET') {
          res.statusCode = 405
          res.end()
          return
        }
        const sources = await ensureSourcesLoaded(cwd)
        res.statusCode = 200
        res.setHeader('content-type', 'application/json')
        res.setHeader('cache-control', 'no-store')
        res.end(
          JSON.stringify({
            sources: sources.map((s) => ({
              id: s.id,
              label: s.label,
              kind: 'adapter' as const,
              path: s.path,
              adapter_kind: s.kind,
            })),
          })
        )
      })

      server.middlewares.use('/api/workspace', async (req, res) => {
        try {
          const url = new URL(req.url ?? '', 'http://localhost')
          const sourceKey = url.searchParams.get('source')
          if (!sourceKey) {
            res.statusCode = 400
            res.setHeader('content-type', 'application/json')
            res.end(
              JSON.stringify({
                error: '?source=<id> query param is required',
              })
            )
            return
          }

          const sources = await ensureSourcesLoaded(cwd)
          const configured = sources.find((s) => s.id === sourceKey)
          if (!configured) {
            res.statusCode = 400
            res.setHeader('content-type', 'application/json')
            res.end(
              JSON.stringify({
                error: `unsupported source: ${sourceKey}`,
                supported: sources.map((s) => s.id),
              })
            )
            return
          }

          const source = new FilesystemNousSource(configured.path)
          const workspace = await buildNousWorkspace(source)
          workspaceCache.set(configured.id, workspace)

          res.statusCode = 200
          res.setHeader('content-type', 'application/json')
          res.setHeader('cache-control', 'no-store')
          res.end(
            JSON.stringify({
              source: {
                id: configured.id,
                label: configured.label,
                kind: 'nous',
                path: configured.path,
              },
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

      // ─── /api/shape ────────────────────────────────────────────────────
      // LLM-driven shaping conversation. Takes the current draft +
      // conversation history + user message; returns the LLM's reply,
      // a patch to apply to the draft, a status signal, and concerns.
      // Falls back gracefully when no LLM provider is configured (the
      // chrome continues to work in manual-edit-only mode).
      server.middlewares.use('/api/shape', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify({ error: 'POST required' }))
          return
        }
        try {
          const body = (await readJsonBody(req)) as ShapeRequest
          if (!body || typeof body !== 'object') {
            res.statusCode = 400
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify({ error: 'malformed request body' }))
            return
          }
          const result = await handleShape(body, llm)
          res.statusCode = 200
          res.setHeader('content-type', 'application/json')
          res.setHeader('cache-control', 'no-store')
          res.end(JSON.stringify(result))
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

      // ─── /api/nous/writeback ───────────────────────────────────────────
      // Shaping commit on a Nous draft posts here. Writes a real
      // campaign-<run_id>.yaml under the configured source's path.
      // Refuse-overwrite: returns 409 if the file already exists.
      // Schema-validates the intent + writeback config payloads.
      server.middlewares.use('/api/nous/writeback', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify({ error: 'POST required' }))
          return
        }
        try {
          const body = (await readJsonBody(req)) as {
            sourceId?: unknown
            intent?: unknown
            config?: unknown
          }
          const sources = await ensureSourcesLoaded(cwd)
          const result = await handleWriteback(
            {
              sourceId: typeof body?.sourceId === 'string' ? body.sourceId : '',
              intent: body?.intent,
              config: body?.config,
            },
            sources
          )
          if (!result.ok) {
            res.statusCode = result.status
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify({ error: result.error }))
            return
          }
          // Invalidate the workspace cache for this source so the next
          // /api/workspace?source=<id> fetch re-reads from disk and the
          // newly-written campaign appears.
          workspaceCache.delete(result.path) // by path (no-op; harmless)
          workspaceCache.delete(body!.sourceId as string) // by id
          res.statusCode = 200
          res.setHeader('content-type', 'application/json')
          res.end(
            JSON.stringify({
              ok: true,
              path: result.path,
              run_id: result.run_id,
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

          // Resolve the intent across all configured sources. We hydrate
          // workspaces lazily — the first projection request after a fresh
          // server start may pay a filesystem walk per source.
          const sources = await ensureSourcesLoaded(cwd)
          let resolvedSource: ConfiguredSource | null = null
          let resolvedWorkspace: Workspace | null = null

          // Intent id convention from the Nous adapter:
          //   nous:fs-<slug-of-source-path>:<run>:<iter>?
          // We attempt to find the intent in cached workspaces first;
          // fall back to hydrating one source at a time on miss.
          for (const candidate of sources) {
            let ws = workspaceCache.get(candidate.id)
            if (!ws) {
              ws = await buildNousWorkspace(
                new FilesystemNousSource(candidate.path)
              )
              workspaceCache.set(candidate.id, ws)
            }
            if (ws.intents.some((i) => i.id === intentId)) {
              resolvedSource = candidate
              resolvedWorkspace = ws
              break
            }
          }

          if (!resolvedSource || !resolvedWorkspace) {
            res.statusCode = 404
            res.setHeader('content-type', 'application/json')
            res.end(
              JSON.stringify({ error: `intent not found: ${intentId}` })
            )
            return
          }

          const intent = resolvedWorkspace.intents.find(
            (i) => i.id === intentId
          )!
          const state = resolvedWorkspace.states.find(
            (s) => s.intent_id === intentId
          )!

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
            workspace: resolvedWorkspace,
            zoom,
            plugins: projectionPlugins,
            llm: llm ?? noKeyLLMStub,
          })

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

/** Stub LLM client used when no API key is in env. Throws on call so
 *  generateProjection's error path falls back to raw fields. */
const noKeyLLMStub = {
  async generate(): Promise<string> {
    throw new Error(
      'no LLM provider configured — projection engine falling back to raw fields'
    )
  },
}

// Suppress unused-import warning when path isn't otherwise referenced.
void path
