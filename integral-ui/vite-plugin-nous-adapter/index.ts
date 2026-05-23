import * as os from 'node:os'
import * as path from 'node:path'
import type { Plugin } from 'vite'
import { buildNousWorkspace } from '../src/adapters/nous'
import { FilesystemNousSource } from './filesystem-source'

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
    },
  }
}
