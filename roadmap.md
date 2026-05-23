# Roadmap

Tracks what's done, what's in flight, and what's deferred. Companion file to `goals.md` (chrome polish — done), `gaps.md` (schema-fit issues found during adapter work), and `semantics-v0.1.md` (semantic model commitments + open questions).

---

## The original purpose

Integral exists to do three things:

1. **Specify intent declaratively** (with the system's help) — Shaping surface; in v0.1 this is in-memory; v0.1 expansion adds a real writeback path.
2. **Let harnesses act on it** — adapters read what harnesses produce; v0.1 expansion lets one harness (Nous) round-trip from declaration through execution.
3. **Sensibly interpret and act on results** — projections + activity log + user-fired operations let humans (and eventually agents) understand and steer in-flight work.

This roadmap is checked against those three at every revision. If a planned item doesn't move at least one of them forward, it's parked.

---

## Where we are (as of this commit)

**v0.1 chrome polish — done.** All 5 items from `goals.md` shipped (initial commit `45e238c`):
1. AppHeader (sticky chrome, breadcrumb nav, schema-version chip, logo→Landing).
2. LandingSurface (instrument variant, glyph-on-the-left at ≥760px).
3. WorkspaceActivityStrip (right-side, three-bucket significance heuristic).
4. ShapingSurface (two-pane drafts, in-memory commit).
5. Visual regression baselines (15 PNGs locked).

**v0.1 expansion (Path 2) — in flight.** Schema-side typed `Operation` log + multi-source data plane + Adapter #1 (Nous) Phases 1+2+3 shipped. Round-trip work, projection layer, breadth adapters all remaining (see Track A / Track B / Track C below).

Verification at this commit: 483 Vitest + 17 behavioral E2E + 15 visual baselines + typecheck clean + build clean.

**v0.1 substrate is descriptive only today.** Surfaces render typed Intent / IntentState / EvidenceLink / Operation records from the fixture or live adapter output; the user navigates; nothing mutates persistent state outside the in-memory shaping commit. **v0.1 expansion changes this** — the round-trip on Nous (Track A items A4 + A5) lands real writeback + at least one user-fired operation. After v0.1 expansion, "descriptive only" no longer holds.

---

## v0.1 expansion (Path 2) — current focus

**Decision recorded** (2026-05-22, revised 2026-05-23): expand v0.1 along two parallel tracks rather than serial-falsification.

The original Path 2 framing ("typed operation signatures, no execution; build four adapters in sequence") was too read-heavy. It optimized for schema falsification at the cost of the round-trip the original purpose demands. The revised Path 2 keeps falsification (now via two more adapters, not three) and adds the full round-trip on one harness so v0.1 ships a tool that closes the loop, not just a library that displays types.

The two tracks share the schema and the chrome. Otherwise they're independent and run in parallel.

### Track A — Nous round-trip (depth)

Sequential. Each item depends on the prior.

**A1. Nous Phase 4 — Operations from observed transitions. ✓ DONE.**
Generic `diffWorkspaces(prior, current, by, at) → Operation[]` engine in `src/lib/workspace-diff.ts` — adapter-agnostic; reused by Coral/GH later. Schema-exhaustive over `OperationKindSchema.options` via a `KIND_DISPOSITIONS` map. Specialized ops (`satisfy`/`gate`/`revoke`) win over generic `advance`. Deterministic op ids (`op:<kind>:<target>:<at>`) for refresh idempotency. `buildNousWorkspace(source, { prior, at })` consumes the diff and includes ops in the returned workspace. Smoke against `inference-sim/` with synthesized prior: 59 Operations across 3 kinds (declare 20 + decompose 20 + satisfy 19), validates clean. New gap: G-N-12 (principle-extraction events have no canonical op kind — emit nothing in v0.1).

**A2. Projection generator (S-1) — kind-pluggable, indexed by `(kind, zoom)`. ✓ DONE.**
`src/lib/projection.ts` implements the engine; `src/lib/projection-plugins/{nous-campaign,nous-iteration}.ts` carry the prompt templates for the 4 LLM-driven cells. Engine is pure (no env, no network); takes injected `LLMClient`. Char budgets clamped post-hoc (≤800 structure; detail unbounded). Other kinds + overview zoom fall back to raw-field render. Server-side `LLMClient` factory in `vite-plugin-nous-adapter/llm-client-factory.ts` prefers OpenAI-compatible (`OPENAI_API_KEY` + optional `OPENAI_BASE_URL`) over Anthropic (`ANTHROPIC_API_KEY` / `ANTHROPIC_AUTH_TOKEN` + optional `ANTHROPIC_BASE_URL`); model override via `INTEGRAL_PROJECTION_MODEL`. `/api/projection?intent_id=X&zoom=Y` endpoint with per-state-timestamp cache. `DetailSurface` wires `ProjectionSection` between header and children — fetches on mount, re-fetches on zoom change, falls back silently on error. Tests never call real LLMs (mock injected; real clients live outside `src/`). Smoke against `inference-sim/` campaigns at structure + detail zoom returns coherent prose.

**A3. Refresh affordances + staleness.**
Workspace-level refresh button in AppHeader (replaces the placeholder `reversibility · 24h` chip). Per-intent refresh in DetailHeader (small `↻`). "Synced X ago" chip on projections, goes amber past `stale_after`. Implementation: clicking refresh re-runs the adapter pipeline + projection generator for the targeted scope.

**A4. Shaping → Nous writeback.**
Commit-to-active on a Nous draft writes a real `campaign-X.yaml` to a configurable target dir. Schema-from-Intent serializer must round-trip: an intent the adapter reads back must equal the intent that wrote it (modulo runtime fields). This is **the first true mutation** of state outside the in-memory shaping commit.

**A5. One user-fired Operation on Nous.**
Pick one operation that closes the calculus loop end-to-end. Recommendation: `revoke` on a `nous-iteration` (lowest blast radius — flips state, doesn't touch the harness's running execution). Wire button in DetailHeader → API endpoint → adapter writes a `revoked` marker → next refresh shows status flipped. Proves the user → harness → user round-trip.

### Track B — Schema breadth (falsification)

Parallel internally. Each adapter can land independent of the other.

**B1. Adapter #2 — Coral optimization.**
Read `.coral/attempts/*.json` and `.coral/notes/`. Map to typed `coral-optimization` + `coral-attempt` intents. Tests competitive parallelism (many sibling child intents under one parent). Surfaces structural questions about decomposition pattern (parallel vs. sequence — see `semantics-v0.1.md` S-3). Phases 1+2 minimum (read declarations + scored attempts); operations + writeback v0.2.

**B2. Adapter #3 — GitHub issues (as feature-campaign).**
Read GitHub issues + comments via `gh` CLI or REST API for a configurable repo. Issues become `feature-campaign` declarations: title → `declaration.title`, body → `declaration.summary`, labels → `tags`, assignees → `holder.parties`, comments → activity. Sub-issues / linked PRs / commits / CI status are deferred (full feature-dev integration is v0.2). This is the lighter stand-in for the original "feature-campaign with git log + GitHub PR API + repo-scoped CLAUDE.md" — same kind, thinner read scope.

### Track C — Cross-cutting UI (parallel with both tracks)

**C1. Filter / group / sort on Map.**
Beyond "awaiting me," add filters: kind (multi-select), tag, holder mode, status, source (already shipped — extend the cluster). Group toggle: by-kind / by-holder / by-source / no-grouping. Sort: recency / awaiting / status / alphabetical. Filter+group+sort live in `MapSurface.topRow`'s chip cluster.

**C2. Visual baseline regen.**
Every chrome-affecting item (A2, A3, A5, B1, B2, C1) regenerates the 15 baselines via `npm run test:e2e:visual:update`. New baseline candidates as features land:
- Map with filter chips active
- Detail with operation log section + projection prose
- AppHeader showing the workspace refresh affordance
- TreeCards rendering Coral + GitHub-issue intents

---

## Done so far (chronological, in v0.1 expansion)

1. ✓ **Schema: typed `Operation` records** — `OperationKindSchema` (16 kinds), discriminated union over `kind`, `WorkspaceSchema.operations: Operation[]`, schema-exhaustive falsification tests, `classifyOperation` significance heuristic, fixture ops covering 8 kinds.
2. ✓ **Operation log surface unification** — folded per-intent activity into `WorkspaceActivityStrip` via `focusedIntentId` + scope filter chip; deleted the separate `IntentActivityStrip`.
3. ✓ **Hide/show on the unified strip** — `›`/`‹` toggle, 36 px collapse rail, sessionStorage persistence.
4. ✓ **Adapter #1 — Nous, Phase 1** — Transport/interpreter split (`NousSource` abstract; `FilesystemNousSource` impl). `buildNousWorkspace` reads `campaign-X.yaml` + `.nous/<run>/state.json` → typed `nous-campaign` Intents. Vite plugin exposes `/api/workspace?source=nous`. Smoke: 20 real `inference-sim/` campaigns.
5. ✓ **Multi-source data plane** — `Provenance.source` v0.1.0 additive amendment; source registry; URL contract `?sources=a,b`; merge + validate; source-picker chip cluster; `via <source>` attribution chips on TreeCards + DetailHeader.
6. ✓ **Adapter #1 — Nous, Phase 2** — `ledger.ts`: tolerant `parseLedger`, schema-exhaustive `mapHmainResultToHypothesisResult`, `interpretIteration` (parent-scoped ids for refresh-idempotent decomposition). Filter synthetic iter-0 baselines; wire iteration ids into `decomposition.children` + `extension.current_iteration`. Lossy mappings recorded as G-N-1, G-N-2, G-N-3, G-N-9, G-N-10. Smoke: 47 iterations from 20 campaigns.
7. ✓ **Adapter #1 — Nous, Phase 3** — `principles.ts`: `parsePrinciples`, stable `nous-principle://<runId>/<id>` URI scheme, `interpretPrinciplesAsKnowledgeRefs` (campaign-scoped + iteration-scoped grouped by `extraction_iteration`). Lossy mapping per G-N-2; `version='v0.1-lossy'` marker recorded in G-N-11. Smoke: 157 campaign-scope + 157 iteration-scope principle refs from 20 campaigns.
8. ✓ **KnowledgeRefsSection — collapse to count rows** — opaque URIs were a tease without dereferencing (G-N-2 keeps full content out of the schema). Per-`(scope, role)` count rows replace the URI list; inherited refs still surface their `inherited_from`. Click-through restored in v0.2 once principles get a real schema home.
9. ✓ **`semantics-v0.1.md` drafted** — names the five layers (source / types / chrome / calculus / semantic), catalogs nine semantic components (S-1 through S-9), eight cross-layer couplings (C-1 through C-8), the two-audiences contract (humans need interpretability, agents need actionability), eight open questions, and seven non-goals. Wired into CLAUDE.md as a canonical reference. Unblocks A2 (projection generator) by giving it a documented design surface.
10. ✓ **A1 — Nous Phase 4 (Operations from observed transitions).** Generic `diffWorkspaces` engine in `src/lib/workspace-diff.ts`; adapter-agnostic; schema-exhaustive over `OperationKindSchema.options` via `KIND_DISPOSITIONS` (every kind has a documented "fires when X" or "doesn't fire because Y" disposition — a v0.2 op-kind addition fails the test until acknowledged). `buildNousWorkspace(source, { prior, at, by? })` opt-in; ops emitted only when `prior` is provided. Specialized ops win over generic (`satisfy` / `gate` / `revoke` over `advance`). Deterministic op ids for refresh idempotency. Smoke: 59 ops across 3 kinds from real `inference-sim/` data. Gap G-N-12 records that principle-extraction events have no canonical op kind (deferred until G-N-2 promotion clarifies whether principles are intents or knowledge).
11. ✓ **A2 — Projection generator (S-1).** Kind-pluggable engine in `src/lib/projection.ts` indexed by `(intent.kind, zoom)`. 4 LLM-driven cells (nous-campaign + nous-iteration × {structure, detail}); other kinds + overview zoom fall back to raw-field render. Plugin shape: `KindProjectionPlugin` with optional `structure?` / `detail?` methods + injected `LLMClient`. Char budgets clamped post-hoc (≤800 structure; detail unbounded). `vite-plugin-nous-adapter/` holds the server-side LLM clients + factory: prefers OpenAI-compatible env (`OPENAI_API_KEY`/`OPENAI_BASE_URL`) over Anthropic env (`ANTHROPIC_API_KEY`/`ANTHROPIC_AUTH_TOKEN`/`ANTHROPIC_BASE_URL`); model override via `INTEGRAL_PROJECTION_MODEL`. `/api/projection` endpoint with per-state-timestamp cache. `ProjectionSection` chrome wires into `DetailSurface` between header and children. **Tests never call real LLMs** — clients live outside `src/`; tests inject mocks. Smoke against `inference-sim/` returned coherent prose at structure (≤800) and detail (multi-paragraph) zooms. Promotes S-1 in `semantics-v0.1.md` from "not implemented" to "implemented for Nous kinds; raw-field fallback elsewhere."

Verification triple after every item: `npm run test:run` + `npm run typecheck` + `npm run build` + `npm run test:e2e` (and `npm run test:e2e:visual` after chrome changes).

---

## Stop conditions for v0.1 expansion

The expansion is done when **all** of the following hold:

1. **Round-trip closed on Nous** — A1 + A2 + A3 + A4 + A5 shipped. A user can shape a Nous draft, commit it, see Nous pick it up (manual today; auto-watch v0.2), see iterations come back through the adapter, see at least one user-fired operation flow back to the harness.
2. **Schema breadth proven on three more kinds** — Coral (B1) + GitHub-issue feature-campaign (B2) produce schema-validating Workspaces from real data. Together with Nous, this is three of the four canonical kinds with at least minimum-viable adapters. (Paper is the remaining kind, deliberately deferred — see v0.2.)
3. **Map is queryable** — C1 filter+group+sort works across all three adapter outputs.
4. **All five verification commands exit 0** — `test:run`, `typecheck`, `build`, `test:e2e`, `test:e2e:visual`.
5. **`gaps.md` updated** — every schema-fit issue surfaced during expansion is recorded; v0.2 starts from a known list.
6. **`semantics-v0.1.md` updated** — any S-component that changed status (e.g., S-1 promoted from "not implemented" to "implemented for Nous kinds") reflects in the doc.
7. **CLAUDE.md "Current state" reflects ship state** — test counts, current adapters, current operations.

After v0.1 expansion: regroup, design v0.2 (schema bump + writeback hardening + Paper adapter + full feature-dev + semantic-model promotion).

---

## v0.2 — schema bump + writeback hardening + last adapter

Promoted from "Deferred" — v0.2 has explicit scope now, not just a non-goals list.

**Schema bump (the v0.2 schema design pass).**
Promote candidates from `gaps.md`. Current list at v0.1 expansion start: G-N-1 (`partially-confirmed` outcome), G-N-2 (typed `Principle` objects + principles graph), G-N-3 (`family` field on iteration), G-N-4 (`prediction_accuracy` aggregate), G-N-5 (frontier evolution), G-N-6 (typed iteration artifacts/patches), G-N-7 (intra-iteration phases as gate vocabulary), G-N-8 (campaign success criterion source), G-N-9 (control/robustness/ablation outcomes), G-N-10 (typed principle action lifecycle), G-N-11 (KnowledgeRef.version overload). Each promotion writes a new `intent-schema-v0.2.md` alongside v0.1; old adapters keep referencing v0.1.

**Writeback hardening.**
Generalize Track A's writeback (A4) beyond Nous. Each adapter declares its writeback schema; UI affords commit/declare/refine for every kind, not just Nous. Filesystem auto-watch replaces the refresh button (the v0.1.1 ambition realized later than planned).

**Adapter #4 — Paper.**
The original 4th-of-4 in the v0.1 plan. Read `papers/<name>/draft.md` + `refs.bib` + cross-references to upstream Nous campaigns. Tests cross-tree provenance via `EvidenceLink` (paper-claim → nous-iteration). The structural test that's been deferred from v0.1 expansion.

**Full feature-development adapter.**
Promote the GitHub-issues stand-in (B2) to the full feature-dev story: git log + PR API + CI status + repo-scoped `CLAUDE.md` as a scoped knowledge corpus. Most expensive integration; benefits from schema lessons of three other adapters.

**Semantic-model promotion.**
- S-2 per-kind status grammars made explicit (hover tooltips on status chips; `Kind × Status → Meaning` table).
- S-4 evidence narratives (one-line generated narrative per `EvidenceLink`).
- S-5 principles-as-typed-objects (depends on G-N-2 schema bump).
- C-4 architectural decision: adapter-side vs. generator-side projections. Recommended generator-side; v0.2 commits.
- Two-audiences API surface: documented `/api/intents/<id>?zoom=...` endpoints; operation endpoints symmetric with chrome buttons.

**Calculus semantics (cautious).**
v0.1 declares operation signatures; v0.2 may add per-kind validity (when can `gate` fire on a `paper-claim`? When does `decompose` make sense for `coral-attempt`?). Reduction rules / composition theorems only if a pattern is forced by real adapter behavior. **Resist formalizing prematurely.**

---

## v0.3+ — collaboration tier

High-level only. Not actionable today; listed so future sessions know it exists.

- **Multi-agent collaboration semantics.** Two agents working the same intent (or disagreeing); proposal/acceptance flows extended for agent-vs-agent.
- **Personalized projections.** Different prose per consumer; a junior collaborator and a senior reviewer see the same intent rendered differently.
- **Trustworthiness scoring** on LLM-generated projections — provenance chain visible per claim.
- **Real-time collaborative cursors** on the Map and Detail surfaces.
- **Agent-fired structural operations** — agents can propose `fork` / `merge` / `reframe`; humans confirm. (v0.1 explicitly forbids agent-initiated structural ops.)

---

## Cross-references

These files are normative together. Cross-references between them are load-bearing.

- `intent-schema-v0.1.md` — typed object model. Inputs to adapters and projections.
- `intent-ux-sketch-v0.1.md` — UX surfaces. Where projections render.
- `intents-and-harnesses.md` (v2) — harness catalog. What the substrate generalizes across.
- `semantics-v0.1.md` — semantic model. The matrix between the four plumbing layers.
- `gaps.md` — schema-fit issues found while sizing adapters. Drives v0.2 schema bump.
- `goals.md` — chrome polish spec (done). Kept for reference.
- `CLAUDE.md` — operating conventions + resolved surface decisions + per-session memory.
