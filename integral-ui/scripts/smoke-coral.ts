/**
 * Coral adapter smoke test against real pi-mc data.
 *
 * Exercises the Phase-1+2 adapter end-to-end:
 *   FilesystemCoralSource → buildCoralWorkspace → WorkspaceSchema.parse
 *
 * Usage:
 *   npx tsx scripts/smoke-coral.ts [<coral-project-root>]
 *
 * Default root: ~/Documents/learning/coral/pi-mc
 *
 * Manual smoke test — never wired into `npm test*` (per CLAUDE.md §
 * Test discipline; smokes against real data live outside the canonical
 * suite).
 */

import * as os from 'node:os'
import * as path from 'node:path'
import { buildCoralWorkspace } from '../src/adapters/coral'
import { FilesystemCoralSource } from '../vite-plugin-nous-adapter/coral-filesystem-source'
import { WorkspaceSchema } from '../src/schema'

async function main() {
  const root =
    process.argv[2] ?? path.join(os.homedir(), 'Documents/learning/coral/pi-mc')

  console.log(`[smoke] reading Coral project: ${root}`)
  const source = new FilesystemCoralSource(root)
  const runIds = await source.listRunIds()
  console.log(`[smoke] runs discovered (${runIds.length}):`, runIds)

  const ws = await buildCoralWorkspace(source)
  const campaigns = ws.intents.filter((i) => i.kind === 'coral-optimization')
  const attempts = ws.intents.filter((i) => i.kind === 'coral-attempt')
  console.log(
    `[smoke] workspace: ${campaigns.length} campaign(s) + ${attempts.length} attempt(s) + ${ws.evidence_links.length} edges + ${ws.operations.length} ops`
  )

  for (const c of campaigns) {
    console.log(`\n  campaign ${c.id}`)
    console.log(`    title:   ${c.declaration.title}`)
    console.log(`    summary: ${c.declaration.summary.slice(0, 80)}…`)
    console.log(`    tags:    ${(c.tags ?? []).join(', ') || '(none)'}`)
    if (c.extension.kind === 'coral-optimization') {
      console.log(
        `    pop=${c.extension.population_size}; algo=${c.extension.search_algorithm}; best=${c.extension.best_score_so_far ?? '(none)'}`
      )
    }
    console.log(`    children (${c.decomposition.children.length}):`)
    for (const childId of c.decomposition.children) {
      const child = ws.intents.find((i) => i.id === childId)
      if (child && child.extension.kind === 'coral-attempt') {
        console.log(
          `      • ${child.id} score=${child.extension.score} status=${
            ws.states.find((s) => s.intent_id === child.id)?.status
          } parents=[${child.extension.parent_attempts.join(', ') || '∅'}]`
        )
      }
    }
    console.log(`    knowledge_refs: ${c.knowledge_refs.length}`)
    for (const ref of c.knowledge_refs.slice(0, 5)) {
      console.log(`      • ${ref.uri}`)
    }
  }

  console.log('\n[smoke] validating against WorkspaceSchema…')
  const result = WorkspaceSchema.safeParse(ws)
  if (!result.success) {
    console.error('[smoke] FAIL — schema validation:')
    console.error(result.error.issues)
    process.exit(1)
  }
  console.log('[smoke] PASS — full workspace round-trips through WorkspaceSchema')
}

main().catch((err) => {
  console.error('[smoke] ERROR:', err)
  process.exit(1)
})
