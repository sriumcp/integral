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

**v0.1 expansion (Path 2) — Track A closed; B1 + B2 shipped.** Schema-side typed `Operation` log + multi-source data plane + Adapter #1 (Nous) Phases 1+2+3+4 shipped. Projection generator (A2), refresh affordances (A3), source configuration, writeback (A4), LLM-driven shaping (A4.6), run-command surfacing (A5) all done. The full Nous round-trip is closed end-to-end. **B1 (Coral, Adapter #2) shipped 2026-05-24** — read-only Phases 1+2 with DAG-shaped decomposition via `parent_hash`; 14 G-C-* gaps recorded. **B2 (GitHub issues, Adapter #3) shipped 2026-05-25** — read-only Phases 1+2 producing `feature-campaign` Intents with sub-issue hierarchy via `decomposition.children`; first networked transport (`gh` CLI subprocess); falsification fixture is `github.com/sriumcp/integral` itself; 13 G-F-* gaps recorded; one v0.1.0 additive schema amendment (`'github-repo'` `ExternalAnchorKind`). Schema breadth claim now stands across three of four canonical kinds (Nous + Coral + GitHub-issues). In-chrome process invocation and the cross-kind orchestrator are v0.2. **Track C (filter/group/sort) remains.**

Verification at this commit: 611 Vitest + 17 behavioral E2E + 15 visual baselines + typecheck clean + build clean.

**v0.1 substrate is mutating state for Nous and shaping fresh campaigns.** Surfaces render typed Intent / IntentState / EvidenceLink / Operation records from the fixture or live adapter output. Users can:
1. Click `+ new nous campaign` on the Map → shape a brand-new campaign through natural-language conversation with the LLM-driven shaper (A4.6).
2. The form auto-fills as the LLM extracts fields; user can override any value.
3. Click commit → real `campaign-<run_id>.yaml` written to disk (A4); workspace auto-refreshes; new campaign appears as a typed Intent on the Map.
4. The user then runs `nous run campaign-X.yaml` from a terminal. Subsequent workspace refreshes show iterations + principles as Nous produces them.

**A5 ✓ shipped.** The Detail surface for `active` and `gated` Nous campaigns now renders a `RunCommand` panel between projection and children sections — absolute working directory + `nous run --auto-approve campaign-<runId>.yaml`, with a copy button that places a single-line, shell-quoted version on the clipboard. The user runs it from their terminal; Integral's job — removing the thought work between "campaign is shaped" and "command is executable" — is done. In-chrome execution and the cross-kind orchestrator are v0.2.

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

**A3. Refresh affordances + staleness. ✓ DONE.**
Workspace-level refresh button in AppHeader (replaces the placeholder `reversibility · 24h` chip). Per-intent refresh in DetailHeader (small `↻` next to the IdPill). "Synced X ago" hint on the AppHeader button + "generated X ago" on the ProjectionSection footer; both go amber past 60min via `data-stale="true"`. Source configuration moved from a hardcoded path to `integral.config.json` (project-local, gitignored; example file committed); the Vite plugin reads it at startup and `/api/sources` returns the resolved list. The browser's `fetchSourceRegistry()` discovers adapter sources dynamically; multiple Nous workspaces with distinct ids/labels/paths are supported and render as separate picker chips with distinct `via <source>` attribution on TreeCards. Default fallback (no config file) preserves the URL contract `?sources=fixture,nous` and existing visual baselines.

**A4. Shaping → Nous writeback. ✓ DONE.**
Commit-to-active on a Nous draft writes a real `campaign-<run_id>.yaml` to a configured Nous source path. The Shaping surface gains a `WritebackForm` below the typed-draft pane (target source dropdown + max_iterations + target_system.{name, description, repo_path} + optional run_id), pre-filled from the draft's `writeback_template`. Same-button approach: commit POSTs to `/api/nous/writeback` (server-side handler refuses overwrite with 409, validates inputs against `IntentSchema` + `NousWritebackConfigSchema`, writes via the pure `serializeNousCampaign` function), then on success flips the in-memory state + triggers workspace refresh. Coral drafts (no `writeback_template`) and registry-less callers (tests, preview) keep the in-memory-only path — backwards compat. Schema unchanged: Nous-specific writeback fields live in adapter-private `NousWritebackConfig`, not the universal schema. **First true mutation of state outside the in-memory shaping commit.** Nous CLI invocation deferred to A5.

**A5. Run-command surfacing on Detail (close the loop without hosting execution).**
After A4 (writeback) + A4.6 (shaping), the user has shaped a campaign and the YAML is on disk. To run it, they currently have to remember the source path, the runId, and the exact `nous run` invocation. A5 closes that gap by surfacing the precise command in the chrome:

- **`<RunCommand />` panel** on the Detail surface, between `ProjectionSection` and `ChildrenSection`, for any `nous-campaign` whose state is `active` (just-shaped) or `gated` (between iterations).
- The panel shows the absolute working directory + the `nous run --auto-approve campaign-<runId>.yaml` argv, with a copy-to-clipboard button that yields a single-line, shell-quoted command ready to paste.
- The user runs the command from their terminal. Existing workspace refresh (A3) + the Phase 1+2 read adapter pick up new iterations as Nous writes them; Phase 4 emits operations on refresh.

**Scope revision (2026-05-24).** The original A5 framing — "▶ run" button, `child_process.spawn`, status / kill endpoints, in-memory process registry — was rejected during planning. The reasons recorded in `integral-ui/.plan-a5.md`:

1. It pulled Integral toward platform-shape, conflicting with the protocol-first principle (`CLAUDE.md`: "does not host execution").
2. Cross-restart idempotency required PID files or `ps` probing, both adding state-management complexity disproportionate to v0.1's needs.
3. A button-per-kind UI pre-commits the orchestrator design before we have evidence about what cross-kind orchestration should look like.

**Architecture (one component, no server):**
- `src/lib/run-command.ts` — pure dispatcher `runCommandFor(intent, state, registry) → RunCommand | null`.
- `src/lib/run-command-plugins/nous-campaign.ts` — Nous-specific resolver (intent id → runId; source registry → cwd; yaml path).
- `src/surfaces/Detail/RunCommand/` — the panel component.
- No new endpoints. No process tracking. Nothing written into `.nous/` directories. Nothing written anywhere on disk by Integral.

**Scope discipline (v0.1 minimum):**
- Panel is pure browser. No Vite plugin changes.
- Plugin shape mirrors projection-plugins so v0.2 can add `coral-optimization` etc. without chrome changes.
- Single source of truth for "is this campaign running?" remains the user's terminal + `ps`.
- Kind-pluggability via the dispatcher; only `nous-campaign` ships in v0.1.

**What this proves:**
Integral resolves a typed Intent → exact shell command — the part only the substrate can do, given knowledge of source registry + runId convention. Combined with A1–A4.6, the v0.1 expansion satisfies the round-trip in this shape: **declare** (LLM-shape) → **handover** (writeback YAML) → **execute** (terminal, user-driven) → **interpret** (read adapter + projections + refresh).

**What this deliberately doesn't do (deferred to v0.2 with the orchestrator):**
- No spawn-from-chrome. No process tracking. No status / kill endpoints. No PID file or `ps` probe.
- No filesystem auto-watch — refresh button stays as the workspace-update affordance.
- No `revoke` operation. v0.2 promotion candidate alongside the orchestrator.
- No user-fired structural operations to the harness. v0.2.

**Implementation plan: `integral-ui/.plan-a5.md`** — authoritative for file layout, TDD plan, smoke test, and verification triple. Read it before implementing.

### Track B — Schema breadth (falsification)

Parallel internally. Each adapter can land independent of the other.

**B1. ✓ Adapter #2 — Coral optimization (shipped 2026-05-24).**
Read a Coral project directory (e.g. `~/Documents/learning/coral/pi-mc/`) and produce typed `coral-optimization` + `coral-attempt` intents. Tests competitive parallelism (many sibling child intents under one parent) and DAG-shaped decomposition (each attempt has a `parent_hash` pointing at the prior commit it built on). Surfaces structural questions about decomposition pattern (parallel vs. sequence — see `semantics-v0.1.md` S-3). Phases 1+2 minimum (read declarations + scored attempts); operations + writeback v0.2.

**On-disk layout (verified against real Coral run, not docs).** Coral writes per-run state under `<root>/results/<task-name>/<timestamp>/.coral/`. The adapter source path points at `<root>` (the Coral project containing `task.yaml` + `seed/` + `grader/` + `results/`); the adapter scans `results/<task>/<timestamp>/` to discover runs. Each run is its own `coral-optimization` intent — re-running the same task starts fresh, no shared state with prior runs.

Within `<run>/.coral/public/`:
- `attempts/<commit-sha>.json` — one file per `coral eval` call. Fixed schema: `commit_hash`, `parent_hash`, `agent_id`, `title`, `score`, `status` (`improved` is the observed value; full enum TBD), `timestamp`, `feedback`, `shared_state_hash`, `metadata.budget_class`. The `parent_hash` makes attempts a DAG; the chain typically starts from a synthetic root commit Coral creates from the seed.
- `notes/index.md` + `notes/experiments/*.md` — agent-shared knowledge corpus. Maps to `KnowledgeRefs` (campaign-scope), analogous to Nous principles → KnowledgeRefs.
- `roles/agent-N.md` — per-agent persona. Holder mapping: `attempt.holder.parties = [resolveAgent(agent_id, roles/)]`.
- `agents/<persona>.md` + `skills/<skill>/` — pre-installed personas and reusable capabilities. v0.2 — for v0.1 just record their existence in gaps.md.

The grader's `task.yaml` has `direction: maximize|minimize` — the `coral-optimization` extension should surface this so "best score" rendering knows which way is better.

**Falsification fixture (real data).** `~/Documents/learning/coral/pi-mc/results/pi-mc/2026-05-24_194843/` — 2 attempts captured during the A5-followup hello-world smoke. Includes a specification-gaming attempt (`a06c06c4...json`) where agent-2 printed `math.pi` directly and hit the grader's `1e12` cap with title "Use math.pi (IEEE 754 float64) as optimal estimate". Schema must accept this without flinching — real Coral runs will produce gaming outcomes.

**Implementation plan**: see `integral-ui/.plan-b1.md` for the file layout, TDD plan, and architecture decisions.

**Shipped:**
- `src/adapters/coral/` — browser-safe transport/interpreter split mirroring Nous. `types.ts` (CoralSource, RunFiles, ParsedAttempt, ParsedTaskYaml, ParsedRoleFile), `interpreter.ts` (`buildCoralWorkspace`, `interpretRun` per-run pure mapping), `notes.ts` (notes/*.md → campaign-scope KnowledgeRefs).
- `vite-plugin-nous-adapter/coral-filesystem-source.ts` — Node-only `FilesystemCoralSource`. Discovers runs by scanning `<root>/results/<task>/<timestamp>/.coral/public/`; tolerates missing `attempts/`, `notes/`, `roles/` subdirs.
- Vite plugin: `sources-config.ts` accepts `kind: 'nous' | 'coral'`; `/api/workspace?source=<id>` and `/api/projection` dispatch via `buildWorkspaceForSource(configured)` helper.
- DAG resolution via `parent_hash`: campaign's `decomposition.children` lists root attempts only; each attempt's `decomposition.children` lists its DAG descendants; each attempt's `extension.parent_attempts` carries the typed parent edge. The schema's `parent_attempts: list[IntentId]` was already plural — no schema bump required for B1's load-bearing test.
- Attempt-status mapping: `'improved' → satisfied`, default → `'active'` (G-C-6 records the unknown-enum gap).
- 38 new Vitest tests (interpreter 32 + notes 6); 649 total passing. Typecheck clean. Build clean.

**Smoke test (real data):** registered `~/Documents/learning/coral/pi-mc/` as a Coral source in `integral.config.json`; the merged workspace contains 1 `coral-optimization` + 2 `coral-attempt` intents alongside Nous campaigns; the spec-gaming attempt's 90-char title clamps cleanly to 80 chars without rejecting the schema.

**Gaps recorded:** G-C-1..G-C-14 in `gaps.md` (success_criterion, direction, search_algorithm, role-evolution, campaign-done signal, attempt-status enum, feedback, shared_state_hash, budget_class, notes-as-KnowledgeRefs, personas, skills, operational state, agent-worktree kind name).

**B2. ✓ Adapter #3 — GitHub issues (shipped 2026-05-25).**
Read GitHub issues via `gh` CLI for a configurable repo. Issues become `feature-campaign` declarations: title → `declaration.title`, body → `declaration.summary`, labels → `tags`, assignees → `holder.parties`. **Sub-issue hierarchy preserved** as `decomposition.children` — tracking issues become parents, leaves stay leaves. Recursive nesting works. Cross-repo sub-issues silently dropped (G-F-9). Comments / linked PRs / CI status / git log / repo-CLAUDE.md walk all deferred to v0.2 (full feature-dev integration).

**Implementation plan:** see `integral-ui/.plan-b2.md`.

**Shipped:**
- `src/adapters/feature/` — browser-safe transport/interpreter split mirroring Nous + Coral. `types.ts` (GitHubIssuesSource, ParsedIssue, ParsedSubIssueRef, RepoCoordinates), `tree.ts` (pure tree reconstruction with cycle defense + cross-repo filtering at the source boundary), `interpreter.ts` (`buildFeatureWorkspace`, `interpretIssue`).
- `vite-plugin-nous-adapter/gh-cli-source.ts` — Node-only `GhCliIssuesSource`. Argv-based subprocess (Node's `execFile` family via `util.promisify`); pre-validates `<owner>/<name>` against strict regex; user-controlled fields never reach argv. Wraps `gh issue list --repo … --json …` (single paginated call) + `gh api repos/.../issues/{n}/sub_issues` per tracking issue. Concurrency-capped at 4 for per-issue `subIssuesSummary` fetches. Subprocess timeout 60s; 32MB max buffer. Surfaces typed errors for `ENOENT` (gh not installed), `SIGTERM` (timeout), and stderr propagation.
- Vite plugin: `sources-config.ts` accepts `kind: 'github-issues'`; for that kind `path` is treated as a repo coordinate, NOT filesystem-expanded. `index.ts` `buildWorkspaceForSource` adds the dispatch branch. `writeback-handler.ts` rejects non-Nous sources with an explicit per-adapter v0.2 message.
- Schema: `'github-repo'` added to `ExternalAnchorKindSchema` as a v0.1.0 additive amendment. Documented in `intent-schema-v0.1.md`. 3 new schema unit tests; existing 48 unaffected.
- Sub-issue tree: parent's `decomposition.children` wired via formal `/sub_issues` endpoint (GitHub's 2024 feature). Tracking issues get `lifetime.kind: 'campaign'`; leaves get `'discrete'`. Sub-issues do NOT also appear at top level.
- State mapping: `OPEN → active`, `CLOSED+COMPLETED → satisfied`, `CLOSED+NOT_PLANNED → abandoned`, `CLOSED+DUPLICATE → abandoned`, `CLOSED+null → satisfied` (legacy default; G-F-5).
- Holder: assignees → human Parties, mode `'human-held'`. Unassigned issues get a synthetic `(unassigned)` system Party with mode `'jointly-held'` (G-F-6).
- Bot detection: `author.is_bot === true` → `kind: 'agent'`. Normalizes both `is_bot` (gh CLI shape) and REST's `type: 'Bot'`.
- 34 new Vitest tests (8 tree + 26 interpreter including the `sriumcp/integral` fixture round-trip). 5 smoke tests against the live repo.

**Falsification fixture:** `github.com/sriumcp/integral` (this repo). Seeded with 5 issues: 1 tracking issue (`#1` v0.1 expansion roadmap) with 3 formal sub-issues (`#2` B1 closed/COMPLETED, `#3` B2 open, `#4` C1 open) + 1 top-level leaf (`#5` Visual baseline regen tracker). Smoke verified: tracker resolves to a campaign with 3 children; #2 maps to `'satisfied'`; #5 stays at top-level; merged 3-adapter workspace (5 feature + 71 nous + 3 coral = 79 intents) validates against `WorkspaceSchema`.

**Gaps recorded:** G-F-1..G-F-13 in `gaps.md` (success_criterion, inherited_conventions, standing_invariants, REOPENED transient state, legacy null state_reason, unassigned synthetic party, timeline events not reconstructed, comments not loaded, cross-repo dropped, github-repo additive amendment, single-repo per source, issue-PR linking, task-list-syntax hierarchy). G-F-1 closes the three-adapter `success_criterion` cross-signal (G-N-8 + G-C-1 + G-F-1) — promotes from "candidate" to "v0.2 commitment" per the gaps.md two-adapter rule.

### Track C — Cross-cutting UI (parallel with both tracks)

**C1. Filter / group / sort on Map.**
Beyond "awaiting me," add filters: kind (multi-select), tag, holder mode, status, source (already shipped — extend the cluster). Group toggle: by-kind / by-holder / by-source / no-grouping. Sort: recency / awaiting / status / alphabetical. Filter+group+sort live in `MapSurface.topRow`'s chip cluster.

**C2. Visual baseline regen.**
Every chrome-affecting item regenerates the 15 baselines via `npm run test:e2e:visual:update`. Already regenerated through this expansion: A3 (refresh button replaces reversibility chip), A4 (WritebackForm appears on Nous draft Shaping), A4.6 (`+ new nous campaign` button on Map). Future regen candidates as features land:
- Map with filter chips active (C1)
- Detail with operation log section + projection prose
- TreeCards rendering Coral + GitHub-issue intents (B1, B2)
- Detail with `RunCommand` panel for `active`/`gated` Nous campaigns (A5)

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
12. ✓ **A2 polish — projection persistence + regenerate + loading indicators.** Projections cached on disk under `~/.cache/integral/projections/<sha256>.json` (overridable via `INTEGRAL_CACHE_DIR`). Cache key is `(intent_id, zoom, state.last_advanced_at)` — state advance auto-invalidates. Survives dev-server restarts. Smoke: 76× faster cache hits vs LLM call. ProjectionSection footer shows "generated <relative-time> ago · <model>" + `↻ regenerate` button (`?refresh=true` bypasses cache). Loading states: "summarizing…" on initial load + "regenerating…" during refresh + dimmed prose on regen + pulsing animation.
13. ✓ **A3 — Refresh affordances + multi-source configuration.** Workspace-level refresh button in AppHeader (replaces the placeholder reversibility chip): "↻ synced <time> ago", goes amber past 60min, disables to "refreshing…" while in flight. Per-intent refresh in DetailHeader (small ↻ next to IdPill; piggy-backs on workspace refresh in v0.1). ProjectionSection timestamp goes amber past 60min via `data-stale`. **Source configuration:** the hardcoded `inference-sim` path becomes a config-file-driven list. `integral-ui/integral.config.json` (gitignored, user-local; example file `integral.config.example.json` committed) declares `{sources: [{id, kind, label, path}]}`. Vite plugin reads it at startup; `/api/sources` returns the resolved list. Browser registry is dynamic — `fetchSourceRegistry()` discovers adapter sources at app mount. Multiple Nous workspaces with distinct ids render as separate picker chips with distinct `via <source>` attribution. Default (no config file) keeps `id='nous'`, `label='nous campaigns'`, `path=~/Documents/Projects/inference-sim` so the URL contract `?sources=fixture,nous` and the existing visual baselines are preserved.
14. ✓ **A4 — Shaping → Nous writeback (first true mutation).** `src/adapters/nous/writeback.ts` (browser-safe pure serializer + `NousWritebackConfigSchema`); `vite-plugin-nous-adapter/writeback-handler.ts` (Node-only file writer with refuse-overwrite + write-permission validation + schema validation). New `POST /api/nous/writeback` endpoint. `src/surfaces/Shaping/WritebackForm/` collects target source + max_iterations + target_system fields + optional run_id; pre-fills from the draft's `writeback_template` (a new field on `DraftShape`). ShapingSurface integrates: commit is **same-button** — when the draft has a writeback_template AND a registry+onWriteback are provided, click POSTs writeback then on `ok:true` flips in-memory state + triggers workspace refresh. Failure paths show inline error (e.g., "campaign-X.yaml already exists" on 409). Coral drafts (no template) keep the in-memory-only path. Schema unchanged: Nous-specific writeback fields are adapter-private. End-to-end smoke verified: a full Shaping commit through the chrome writes a real YAML to disk, validates against `yaml.parse`, and the new campaign reappears in the merged workspace on next refresh. **The substrate now closes the loop on Nous: declare → execute (user runs `nous run campaign-X.yaml`) → interpret.**
15. ✓ **A4.6 — LLM-driven shaping (the load-bearing UX).** Users can shape a brand-new Nous campaign via natural-language conversation. `+ new nous campaign` button on Map (`MapSurface.onNewNousDraft`) creates a blank draft + navigates to Shaping. ShapingSurface detects empty `dialog` + presence of `onShapeMessage` and renders the new **`ShapingChat`** (interactive: text input + threaded turns + Enter-to-send/Shift+Enter-newline + auto-scroll + "shaper is thinking…" pulse + concerns panel). On user message, App.tsx POSTs `/api/shape` to the new server-side handler (`shape-handler.ts`), which runs the same LLM factory we use for projections (OpenAI/Anthropic env-driven) with a Nous-specific system prompt that knows the schema. LLM returns `{reply, patch, status, concerns, kind_suggestion}`. Browser applies the patch via the new `applyShapePatch` pure function (`src/adapters/nous/shape-patch.ts` — schema-clean: only declaration/extension/tags/writeback fields are LLM-patchable, never holder/lifetime/provenance/schema_version; immutable; preserves user typing-in-progress). The right pane (`IntentDraftPane` + `WritebackForm`) auto-fills as the LLM extracts fields — the form's `useEffect`-based template sync updates not-yet-edited fields without clobbering user input. Commit gates on **dynamically-resolved** fields (non-empty values, computed live) AND writeback validity; the LLM's `ready-to-commit` signal renders as an amber→green hint above the button; `kind-mismatch` surfaces an amber suggestion box. **End-to-end smoke verified**: click +new → directive message → LLM fills title/summary/research_question/success_criterion/target_system in one turn → form auto-fills → commit → YAML on disk. Backwards compat: existing fixture drafts (Nous + Coral) keep their scripted `ShapingDialog`. **The v0.1 substrate now closes the FULL round-trip: declare (LLM-driven, fixture-free) → handover (YAML on disk) → execute (`nous run` by user) → interpret (read adapter + projections).** A5 (run-command surfacing on the Detail surface — see § A5; in-chrome execution deferred to v0.2 with the orchestrator) is the next milestone.
16. ✓ **Bugfix — writeback-written campaigns invisible to read adapter.** `FilesystemNousSource.listRunIds()` previously fell back to `campaign-*.yaml` discovery only when `.nous/` was empty. With existing runs in place (e.g., 30 inference-sim campaigns), newly-written YAMLs from Shaping commit were ignored on the next workspace refresh — the adapter saw 30 entries from `.nous/` and never ran the YAML scan. Fix: union both discovery sources (`.nous/<run>/` directory names + `campaign-*.yaml` filenames stripped to run_ids), then dedupe. A campaign now surfaces if it has *either* a `.nous/<run>/` runtime dir or a `campaign-*.yaml` declaration (Nous-completed campaigns have both; freshly-shaped ones have just the YAML until the user runs Nous). Smoke verified against synthetic source with both forms.
17. ✓ **A5 — run-command surfacing on the Detail surface (Track A closed).** New: `src/lib/run-command.ts` (pure dispatcher with `shellQuote` + `composeOneLiner`), `src/lib/run-command-plugins/nous-campaign.ts` (kind-specific resolver), `src/surfaces/Detail/RunCommand/` (chrome panel with copy-to-clipboard). The dispatcher is shaped after the projection-plugin pattern so v0.2 can drop in `coral-runner` etc. without chrome changes. The plugin parses the Nous adapter's `nous:<slug>:<runId>` intent-id convention (per `interpreter.ts:271-276`), composes `<source.path>/campaign-<runId>.yaml`, and returns a `RunCommand` with `cwd`, `argv`, and a single-line shell-quoted `oneLiner`. Returns null (panel hidden) for: non-Nous kinds, statuses other than `active` / `gated`, missing source path, intent ids that don't match the adapter's shape (fixture-style ids deliberately don't trigger). `SourceEntry` gained an optional `path` field; `fetchSourceRegistry` retains it from `/api/sources`. **No bytes written by Integral into Nous's directory tree** — no PID files, no log files, no process tracking. The original A5 spawn-from-chrome design (PID-file dance, status endpoints, kill semantics, cross-restart idempotency) was rejected during planning to keep the substrate protocol-shaped; in-chrome execution is now an explicit v0.2 promotion path with a cross-kind orchestrator (see `integral-ui/.plan-a5.md` for the rationale and `roadmap.md § v0.2` for the orchestrator entry). Tests: 13 dispatcher + 15 plugin + 10 RTL component + 4 source-registry path-retention = 42 new (608 total Vitest, up from 566). End-to-end smoke against `inference-sim/`: 24 nous-campaign intents, dispatcher resolves an active campaign to `cd '/Users/sri/Documents/Projects/inference-sim' && nous run --auto-approve campaign-enforcement.yaml`, yaml exists on disk, paste-and-run would succeed. Visual baselines unchanged — fixture nous-campaign id (`01HXYZ-...`) doesn't match the adapter shape so the panel correctly stays hidden in baselines; the panel only triggers on real adapter sources, which is hermetic-by-design.
18. ✓ **Bugfix — projection cache instability for fresh campaigns (mtime fallback).** Surfaced shortly after A5 ship when the user observed the LLM summary regenerating on every Detail navigation for a freshly-shaped campaign (`pd-disaggregation-decider-in-blis-routing`). Root cause: for campaigns without a `.nous/<run>/state.json` (writeback-fresh, never-run), `interpretCampaign` synthesized `state.last_advanced_at` via `synthTimestamp() = new Date().toISOString()`, which returns a different value on every adapter read. The projection cache key (`intent_id, zoom, state.last_advanced_at`) therefore changed on every `/api/workspace` fetch → cache never hit → LLM regenerated per page load. Fix: extended `CampaignFiles` with optional `campaignYamlMtime`; `FilesystemNousSource.fetchCampaignFiles` populates it via `fs.stat`; `interpretCampaign` uses it as a stable fallback before `synthTimestamp()`. State.json's timestamp still wins when present, so running campaigns naturally invalidate cache as Nous writes new iterations — desired behavior. Tests: 3 new unit tests on `interpretCampaign` (mtime fallback, stable-across-repeats, parsedState-wins-over-mtime). 611 total Vitest. The pre-existing `synthTimestamp()` path is preserved as last-resort fallback (only fires when the source can't supply mtime — non-filesystem transports in v0.2).

Verification triple after every item: `npm run test:run` + `npm run typecheck` + `npm run build` + `npm run test:e2e` (and `npm run test:e2e:visual` after chrome changes).

---

## Stop conditions for v0.1 expansion

The expansion is done when **all** of the following hold:

1. **Round-trip closed on Nous** — A1 + A2 + A3 + A4 + A5 shipped. A user can shape a Nous draft, commit it (writes a real `campaign-X.yaml`), see the exact `nous run` command in the Detail surface ready to copy, run it from their terminal, and watch iterations come back through the adapter on refresh. (User-fired operations to the harness and in-chrome process invocation are deferred to v0.2 with the orchestrator.)
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
Promote candidates from `gaps.md`. Each promotion writes a new `intent-schema-v0.2.md` alongside v0.1; old adapters keep referencing v0.1.

*From Nous (G-N series, surfaced during A1+A2):* G-N-1 (`partially-confirmed` outcome), G-N-2 (typed `Principle` objects + principles graph), G-N-3 (`family` field on iteration), G-N-4 (`prediction_accuracy` aggregate), G-N-5 (frontier evolution), G-N-6 (typed iteration artifacts/patches), G-N-7 (intra-iteration phases as gate vocabulary), G-N-8 (campaign success criterion source), G-N-9 (control/robustness/ablation outcomes), G-N-10 (typed principle action lifecycle), G-N-11 (KnowledgeRef.version overload), G-N-12 (principle-extraction `OperationKind`).

*From Coral (G-C series, surfaced during B1):* G-C-1 (`success_criterion` source — same shape as G-N-8; promote together), G-C-2 (`direction: maximize|minimize` on `CoralOptimizationExtension`), G-C-3 (`search_algorithm` enum reflects nothing real), G-C-4 (`Party` is too thin for role-evolution history), G-C-5 (no campaign-level "done" signal), G-C-6 (`coral-attempt.status` enum mapping), G-C-7 (`evaluator_feedback` field on attempt), G-C-8 (`corpus_snapshot_hash` — typed `shared_state_hash`), G-C-9 (`budget_class` field on attempt), G-C-10 (notes-as-typed-knowledge — same shape as G-N-2; **two adapters independently want this, so it promotes from "candidate" to "v0.2 commitment" per the gaps.md two-adapter rule**), G-C-11 (pre-installed personas as `KnowledgeRef`s), G-C-12 (pre-installed skills as `KnowledgeRef`s), G-C-13 (operational state stays out — observability, not intent semantics), G-C-14 (Coral agent-worktree anchor kind name).

*From B2 (TBD):* G-F-* once GitHub-issues adapter lands. Promotions land then.

**Writeback hardening.**
Generalize Track A's writeback (A4) beyond Nous. Each adapter declares its writeback schema; UI affords commit/declare/refine for every kind, not just Nous. Filesystem auto-watch replaces the refresh button (the v0.1.1 ambition realized later than planned).

Per-adapter scope:
- **Nous writeback already shipped** (A4) — keep, harden against multi-source races.
- **Coral writeback (new in v0.2):** `task.yaml` serializer (`src/adapters/coral/writeback.ts`) + `/api/coral/writeback` endpoint (`vite-plugin-nous-adapter/coral-writeback-handler.ts`) + a `CoralWritebackConfig` schema covering `task.{name, description}` + `grader.{entrypoint, direction, timeout, args}` + `agents.{count, runtime, model}` + `workspace.repo_path`. Refuse-overwrite semantics mirror Nous's. Today's `writeback-handler.ts` early-rejects `source.kind !== 'nous'` with 400 — that guard inverts when the Coral handler lands.
- **GitHub-issue writeback (B2 promotion):** open/close/comment/assign via `gh` CLI or REST. Read-only B2 doesn't write; the writeback story rides v0.2.
- **Paper writeback (Adapter #4 v0.2):** edits to `draft.md` sections via section-anchored edits; bibliography additions to `refs.bib`.

**Acceptance:** all four kinds reach declare-edit-refine parity through the chrome. Backwards-compat: existing Nous writeback path stays intact.

**Execution orchestrator (promoted from the original A5 framing).**
Build the in-chrome execution capability as a substrate-level concern, not a per-kind UI button. A workspace-watcher service observes intent state and policies (auto-fire on declare? gate on human approval per kind?); a generic process manager handles spawn/track/kill/log; per-kind runners (`nous-runner`, `coral-runner`, `feature-dev-runner`, `paper-runner`) plug in. The chrome adds a `▶ run` affordance that calls the same orchestrator API a background watcher would. Cross-restart idempotency and process-tracking design happen here, once, with cross-kind evidence in hand. The v0.1 `RunCommand` panel from A5 stays as the manual fallback for environments where the orchestrator isn't running.

Per-kind run-command plugins (the small per-kind piece; each one mirrors `src/lib/run-command-plugins/nous-campaign.ts`):
- `coral-optimization` → `cd <root> && coral run` (or whatever Coral's CLI entrypoint is). Composes from `task.yaml`'s presence + the run timestamp dir.
- `feature-campaign` → invocation TBD when B2's full feature-dev story lands.
- `paper-campaign` → invocation TBD with Adapter #4.

**Adapter #4 — Paper.**
The original 4th-of-4 in the v0.1 plan. Read `papers/<name>/draft.md` + `refs.bib` + cross-references to upstream Nous campaigns. Tests cross-tree provenance via `EvidenceLink` (paper-claim → nous-iteration). The structural test that's been deferred from v0.1 expansion.

**Coral parity with Nous (the explicit follow-up list from B1).**
B1 shipped Coral as read-only Phases 1+2. Bringing it to Nous parity is several discrete v0.2 items, listed here so future sessions can pick them up independently:

1. **Coral writeback** — covered under "Writeback hardening" above. Mirrors A4 for Coral.
2. **Coral LLM-driven shaping (mirrors A4.6).** New `+ new coral campaign` button on `MapSurface.topRow`. New shape-handler variant — the existing `vite-plugin-nous-adapter/shape-handler.ts` carries a Nous-specific system prompt that knows about `research_question`, `target_system`, etc. Coral needs its own prompt scoped to graders + agents + seed dirs, OR the handler refactors to dispatch on `intent.kind`. Recommended: dispatch + per-kind prompt files, so Adapter #4 (Paper) and full feature-dev slot in similarly. `shape-patch.ts` is already kind-agnostic — patches apply to any draft Intent regardless of kind, so that piece is reusable as-is.
3. **Coral run-command plugin** — covered under "Execution orchestrator" above. Mirrors A5 for Coral.
4. **Coral projection plugins.** B1 deliberately shipped without these. The projection engine is kind-pluggable (`src/lib/projection.ts` indexed by `(intent.kind, zoom)`); B1 left the slots empty so all Coral kinds fall back to raw fields with `data-projection-source="fallback"`. v0.2 fills four cells:
   - `src/lib/projection-plugins/coral-optimization.ts` — structure (≤800 chars: best score, attempt count, agent count, recent-leader narrative) + detail (unbounded: full attempt-tree narrative, principle highlights, gaming-attempt callouts).
   - `src/lib/projection-plugins/coral-attempt.ts` — structure (score + status + lineage one-liner) + detail (attempt rationale, parent comparison, feedback prose).
   - Register both in `vite-plugin-nous-adapter/index.ts:55-58`'s `projectionPlugins` map.
   - Reason for deferring: pi-mc is one Coral run; prompt design overfits without cross-validation against more Coral runs. Fill once we have at least two real Coral fixtures.
5. **Coral Phase-4 operations diff.** B1 left ops empty — `buildCoralWorkspace`'s `BuildCoralWorkspaceOpts.prior` is reserved but ignored. The generic `diffWorkspaces` engine in `src/lib/workspace-diff.ts` is adapter-agnostic; Coral's job in v0.2 is to plug in. **The load-bearing v0.2 test:** Coral's DAG-shaped decomposition is structurally different from Nous's tree-shaped decomposition (each parent attempt potentially has multiple children via parent_hash chains). The diff engine's `KIND_DISPOSITIONS` map needs no changes — `decompose` already covers "parent's children grew" — but the test is whether DAG growth produces clean ops without double-counting when an attempt's parent-attempt-id is also a child of the campaign at the schema level. **This is the validation B1 deferred** — Coral as the second adapter through `diffWorkspaces` is the breadth-of-decomposition-shape test the engine needs.
6. **CoralWritebackConfig schema gaps.** When v0.2 designs Coral writeback, expect the same fields surfaced in G-C-1..G-C-3 + G-C-7..G-C-9 to surface again as writeback config fields. Promote those gaps before designing the writeback to avoid round-tripping through a schema that drops user input.

Each of (1)-(5) is independently shippable and small enough to land per-PR. Sequencing recommendation: **(4) projection plugins first** (no schema dependencies, smallest surface, fastest feedback on Coral chrome quality), then **(2) shaping + (1) writeback together** (couple naturally), then **(3) + (5) under the orchestrator umbrella** (need cross-kind design).

**Full feature-development adapter.**
Promote the GitHub-issues stand-in (B2) to the full feature-dev story: git log + PR API + CI status + repo-scoped `CLAUDE.md` as a scoped knowledge corpus. Most expensive integration; benefits from schema lessons of three other adapters.

**Semantic-model promotion.**
- S-1 projection generator filled out for Coral kinds + B2's `feature-campaign` + Adapter #4's paper kinds. v0.1 ships only Nous projection plugins; v0.2 fills the remaining `(IntentKind × ZoomLevel)` cells. See "Coral parity with Nous" item (4) above for Coral specifics.
- S-2 per-kind status grammars made explicit (hover tooltips on status chips; `Kind × Status → Meaning` table). Coral status mapping is currently `'improved' → satisfied`, default → `'active'` (G-C-6); v0.2 nails down the full Coral enum.
- S-4 evidence narratives (one-line generated narrative per `EvidenceLink`).
- S-5 principles-as-typed-objects (depends on G-N-2 + G-C-10 joint schema bump — two adapters independently want this).
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
