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

**v0.1 ready to ship — all stop conditions met.** Schema-side typed `Operation` log + multi-source data plane + Adapter #1 (Nous) Phases 1+2+3+4 shipped. Projection generator (A2), refresh affordances (A3), source configuration, writeback (A4), LLM-driven shaping (A4.6), run-command surfacing (A5) all done. The full Nous round-trip is closed end-to-end. **B1 (Coral) + B2 (GitHub-issues) shipped 2026-05-24/25** — schema breadth proven across three of four canonical kinds with 14 G-C-* + 13 G-F-* gaps recorded; one v0.1.0 additive schema amendment (`'github-repo'` `ExternalAnchorKind`). **C1 (filter/group/sort on Map) shipped 2026-05-25** — the Map is now queryable at adapter-data scale via `key:value` filter chips, group dropdown (5 options), sort dropdown (4 options, default `awaiting-recency`), URL state, and typographic group separators. Default top-row at zero filters reads identically clean to pre-C1 (the `+ filter` button replaces the old placeholder chips). v0.1 Paper adapter and v0.1.5 chrome polish are deliberate v0.2 / interim work.

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

**C1. ✓ Filter / group / sort on Map (shipped 2026-05-25).**
The Map is now queryable at adapter-data scale. Filter chips render as `key:value` mono tokens (Linear-style typography but in cognitive-instrument genre — no chips bolted onto the chrome that look like dashboard pills). Group dropdown: `none / source / kind / holder-mode / status` (default `none`). Sort dropdown: `awaiting-recency / recency / status / alphabetical` (default compound `awaiting-recency`, picked because awaiting-me items always rise — Things-3-style "right for most cases"). All state in URL: `?awaiting=me&kind=...&status=...&group=...&sort=...`. Typographic group separators (uppercase mono label · count chip · horizontal rule) — no heavy section bars that compete with cards. GroupSortControls auto-hide at zero filters; the Map at default state has *less* visual chrome than pre-C1 (the placeholder `all kinds` / `last 24h` chips were removed in favor of the cleaner `+ filter` discovery affordance).

**Implementation plan**: see `integral-ui/.plan-c1.md`.

**Shipped:**
- Pure utilities: `src/lib/filter-query.ts` (parse/serialize/apply, round-trip property-checked) + `src/lib/intent-grouping.ts` (groupIntents + sortIntents + sortGroups, severity-ordered for status, alphabetical for source/kind/holder).
- Atom: `src/components/atoms/FilterChip/` — composes existing Chip atom; mono `key:value` token + × remove (amber on hover, single-amber-signal rule).
- Molecules in `src/surfaces/Map/`: `FilterBar/` (active chips + native `<details>`-based + filter disclosure with categories STATUS/KIND/HOLDER/TAG; tag autocomplete via `availableTags` prop), `GroupSortControls/` (two `<details>` dropdowns, visible only when ≥1 filter active or non-default group/sort), `MapControls/` (composes status header + FilterBar + GroupSortControls + new-button + source picker). All disclosures use native `<details>`/`<summary>` — no custom dropdown widget; cognitive-instrument genre rewards web-platform primitives.
- MapSurface integration: render typographic group separators when `group !== 'none'`; render empty-state with `clear filter →` link when filter excludes everything; **true rootness** computed via "no other intent's `decomposition.children` includes my id" so B2 sub-issues no longer surface as top-level cards (small B2 follow-up fix that fell out of C1 naturally).
- App.tsx URL state extension: parses `?awaiting`, `?kind`, `?status`, `?holder`, `?tag`, `?group`, `?sort` alongside existing `?sources`; serializes back via `history.replaceState` on every change. Preserves unrelated params.
- 78 new Vitest tests (27 filter-query + 21 intent-grouping + 6 FilterChip + 10 FilterBar + 6 GroupSortControls + 8 MapControls; total **764**, up from 686 after B2). 7 new E2E behavioral tests. 3 new visual baselines (`map-with-filters.png`, `map-grouped-by-source.png`, `map-empty-results.png`); 5 existing baselines regenerated for the cleaner top-row.

**Out of scope (deferred to v0.1.5 / v0.2):** Cmd+K command palette, saved views, free-text title search, density toggle, drag-to-reorder, hierarchy expand/collapse — see `.plan-c1.md` § Out of scope.

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

After v0.1 expansion: regroup, design v0.1.5 (Nous + Paper-authoring focus, see next section), then v0.2 (Nous schema bump + Paper adapter + findings plots). Coral parity, full feature-development integration, and the cross-kind orchestrator are scoped to v0.3+.

---

## v0.1.5 — Nous and Paper-authoring focus

**Phase position:** between v0.1 ship and v0.2 substrate work. Not a polish pass; a re-framing.

**Scope decision (2026-05-27):** v0.1.5 + v0.2 focus exclusively on the **Nous + Paper-authoring axis**. All Coral and GitHub-issues / feature-development work is deferred to **v0.3+** — see the new "Coral parity tier" and "GitHub-issues / feature-development tier" sections under `## v0.3+`. The existing read-only Coral + GitHub adapters (B1, B2) stay shipped and functional; we just don't extend them in v0.1.5 / v0.2. This concentrates substrate energy on the research-paper authoring loop (the most ambitious cross-tree story Integral commits to: paper-claim → nous-iteration via `EvidenceLink`).

**Essence:** v0.1 made the substrate work. v0.1.5 makes the *research-to-paper* loop actually useful — Nous moves a research question through shape → run → read → iterate, and Paper authoring grounds claims in the iterations that produced them.

**The framing question:** *"what is the researcher trying to accomplish, and where does the chrome help vs. just display?"* For Nous, the shape end works (A4.6 LLM-driven shaping); the read-and-iterate handoff is weak. For Paper, the chrome renders paper intents but doesn't yet make the cross-tree story (claim ← evidence ← iteration) prominent.

**Why this isn't v0.2 work.** v0.2 expands the substrate (schema bump, Paper adapter, per-kind writeback for Nous + Paper, findings plots). v0.1.5 stays inside the v0.1 substrate and asks: with what's already shipped, can the Nous and Paper chromes help the researcher finish the job? The schema and the adapter contracts don't change. Only the chrome over them does — except for cases where the Paper adapter starter slides forward into v0.1.5 (TBD per the Paper subsection below).

### Per-adapter primary outcome

| Adapter | What the user is trying to accomplish |
|---|---|
| **Nous** | Move a research question through an iterative cycle: shape → run → read → iterate. Today the shape end works; the read-and-iterate handoff is weak. |
| **Paper** | Author a paper grounded in upstream Nous campaigns: claim → evidence → iteration → principle. Today the chrome renders paper intents (per fixture) but the cross-tree narrative isn't surfaced; the Paper adapter itself is v0.2 work. |

### Nous — the shaper goes from transcription to enablement

The shaper exists (A4.6) and works as a chat that fills declaration fields. To make it actually enabling — getting the user from vague research idea to running campaign that produces insight:

1. **Show the resulting `campaign-X.yaml` in real time** as fields fill. User verifies before committing instead of "trust me."
2. **Pre-flight validation during shaping** ✓ shipped — `runPreflight` engine in `src/lib/nous-preflight.ts` runs four canonical checks (`repo-path-exists`, `nous-cli-available`, `writeback-target-writable`, `run-id-not-in-use`) via injected I/O deps; `vite-plugin-nous-adapter/preflight-handler.ts` wires real `node:fs` + `node:child_process` probing behind `POST /api/nous/preflight`. The Shaping surface's `usePreflight` hook (debounced 400ms) feeds inline `data-preflight-status="ok|warn|fail"` indicator pills next to repo_path / run_id / target source / a "environment" footer for the CLI check. Commit button gates on `failedChecks === 0` with reason text "{N} preflight failed". Falsification check (E2E `e2e/preflight.spec.ts`) confirms a `/nonexistent` repo_path → fail indicator → commit disabled, restoring a real path → ok → commit re-enables.
3. **Socratic prompts on the research question.** The LLM is currently responsive (user says X, LLM transcribes X). The strongest research-question coach pushes back: "this is descriptive, not predictive — what would you bet on?" Karpathy-genre = small inline hint.
4. **Templates from past campaigns.** "You shaped a similar campaign 3 weeks ago — start from `best-of-field-comparison`?" The shaper has workspace access; pull existing intents.
5. **Aftermath integration.** When a campaign completes, offer: "want to shape a follow-up that builds on iter-2's confirmed h_main?" Closes the loop from "I ran it" → "I'm shaping the next one."
6. **Visible commit audit** — show what's about to be written, where, and what command will run. Mutation visibility *before* the click.
7. **Concerns inline, not paneled** — move the LLM's concerns next to the fields they're about, like spell-check underlines for shape-quality.

### Paper-authoring — surface the cross-tree story

Paper authoring is the substrate's most ambitious commitment: a paper-claim doesn't just declare an assertion — it *anchors to* upstream Nous iterations via `EvidenceLink`s. The fixture already encodes this; v0.1.5 makes the chrome surface it. Paper adapter (reading real `papers/<name>/draft.md` + `refs.bib`) is v0.2 work — v0.1.5 either operates against the fixture, or slides a Paper adapter starter forward (TBD; see "Open scope" below).

Outcomes worth shipping in v0.1.5 (against the fixture; subject to user refinement):

1. **Cross-tree evidence prominence on `paper-claim` Detail.** Today the chrome renders evidence-edges in the `EvidenceEdges` section. For paper-claims specifically, the *upstream chain* (claim → evidence → iteration → principle) is the load-bearing story — promote it from a side-section to the primary detail body. Each upstream iteration shows its own confirmation status + principles emitted.
2. **Section-level claim coherence on `paper-section` Detail.** A paper section composes multiple claims. Surface them as a coherent set: which claims are evidence-grounded, which are stated without backing, which conflict.
3. **Outline navigation on `paper-campaign` Map / Detail.** TreeCard for `paper-campaign` should expand to show §1, §2, §3… as nested cards (mirrors the `nous-campaign → iterations` decomposition pattern), not just a flat "paper · 4 sections" hint.
4. **Bibliography integration.** Paper claims often cite external references; surface the cited-works set per claim and per campaign, with `ExternalAnchor` URIs visible.
5. **(Stretch) Claim drafting affordances.** Could v0.1.5 ship a "shape this claim" UX analogous to A4.6's Nous shaping? Likely no — claim drafting needs the Paper adapter and writeback (v0.2) to be useful. Mark as v0.2.

**Open scope (TBD — fill in with the user before starting):**
- Does v0.1.5 ship the Paper adapter starter (read-only `draft.md` + `refs.bib`) or wait for v0.2?
- What's the Nous→Paper handoff workflow? When a Nous campaign reaches a "principle ready to publish" state, does the substrate prompt "shape a paper-claim from this"?
- Should paper-claim drafting intersect with Shaping (the typed phase with mutable declaration) — i.e., is a `paper-claim` "shaped" before being written into `draft.md`?
- Does the visual vocabulary need a Paper-specific atom (e.g., a "claim-evidence sankey" visualizing how iterations support claims)? Held; no new atom in v0.1.5 without concrete falsification.

**Falsification candidates (subject to user refinement):**
- The chrome makes "this paper-claim is grounded in Nous iter-2 of the v3 plateau study" a single click + 2-second read on the claim's Detail surface.
- A reader landing on a `paper-section` Detail can tell which of its claims have evidence and which don't, without reading prose.

### Visual vocabulary — Nous progress pillar

**Phase position:** atom-level commitment. Composes into the Nous projection plugins above. Distinguished from v0.2 *findings* plots: this section ships **progress trackers** (plots about a campaign's meta-state — how many iterations, which hypotheses are confirmed, when gates transitioned), not **findings plots** (plots about the data the campaign produced — those need a schema bump and live in v0.2).

**Scope contraction (2026-05-27):** the originally-planned Coral atom (`BestSoFarLine`) is deferred to v0.3+ alongside all other Coral parity work. The visual vocabulary in v0.1.5 is now Nous-only. Paper-side visualizations (if any) emerge from the Paper-authoring scope above as concrete falsification needs surface.

**Architecture: hand-tuned static SVG. No chart library.** Atoms in `src/components/atoms/` extend the existing `Sparkline` / `ScoreGauge` / `HypothesisBars` vocabulary. Each atom takes typed structured data and renders inline SVG. Per-kind projection plugins compose them. The "no library" choice is load-bearing — these atoms set the aesthetic register against which v0.2's Observable Plot output will be visually tested.

**Aesthetic discipline (load-bearing for both v0.1.5 and v0.2):**
- Inherit `--paper` / `--ink` / `--mute` / `--amber` / `--sage` / `--rose` tokens. No hue inventions.
- Single-amber signal preserved: `--amber` only for "current/active/awaiting" — never decorative.
- `--sage` for confirmed/satisfied; `--rose` for refuted/abandoned; `--mute-2` for "not yet probed."
- Whitespace > gridlines. Reach for whitespace before drawing a line; if a gridline must exist, render in `--mute-2` dashed at low opacity.
- Annotation > legend. Label values inline; never push to a sidebar legend.
- Typography: serif rare (titles only when the surrounding context doesn't provide one); mono for tick labels and value annotations; sans for axis titles.
- No animation, no tooltips. In-band annotations only.
- Always show units, scale type (linear/log), and N (sample size) when relevant.
- Don't lie: y-axis starts at zero unless the data demands a different anchor (and the anchor is named inline if so).
- Small multiples > overlays for comparison. Avoid spaghetti plots.
- Print-faithful: SVG output, no canvas, no JS-runtime interactivity.

**Interpretability discipline:**
- The central question must be legible from a 2-second glance.
- A reader who's never seen this codebase reads the plot the same way as a senior researcher.
- One-line human-authored summary above each plot (no LLM in v0.1.5 — atoms author their own captions).

**The Nous atoms** (revised after schema audit + G-N-9 promotion in v0.1.5; `IterationTrajectory` still deferred to v0.2; `BestSoFarLine` deferred to v0.3+):

| Atom | Renders | Data threshold | Schema fields consumed | Adapter consumer |
|---|---|---|---|---|
| **`PrinciplesTempo`** ✓ shipped | Stepped line of cumulative principles extracted per iteration; gaps in the slope tell the user "we learned in bursts" | ≥3 iterations AND ≥2 principles | `nous-iteration.extension.principles_emitted: Reference[]` + `iteration_number` | Nous (`nous-campaign + structure`) |
| **`HMainTimeline`** ✓ shipped | Single horizontal strip showing `h_main` result across iterations: `[✓ ✓ − ✓ ?]` — confirmation streak vs. contested hypothesis story | ≥3 iterations with ≥2 results on `h_main` | `nous-iteration.extension.hypothesis_bundle.h_main.result` | Nous (`nous-campaign + structure` and `+ detail`) |
| **`HypothesisGrid`** ✓ shipped — **lights up post-G-N-9** | 2D grid: rows = hypothesis position (`h_main` · `h_ablation[i]` · `h_control_negative` · `h_robustness[i]`), columns = iterations, cells = `--sage` ✓ / `--rose` − / `--mute-2` ? / blank | ≥2 iterations AND ≥2 distinct hypotheses with results | `nous-iteration.extension.hypothesis_bundle.*.result: 'pending' \| 'confirmed' \| 'refuted' \| 'inconclusive'` | Nous (`nous-campaign + detail`) |

**Schema audit note (load-bearing):** the originally-planned `IterationTrajectory` ("sparkline of the campaign's main metric") is deferred. The v0.1 `nous-iteration.extension` schema carries no numeric metric field — that gap is **G-N-4** (`prediction_accuracy` aggregate), still a v0.2 schema-bump candidate. Plotting a metric trajectory would require fabricating data. Once G-N-4 lands in v0.2, the trajectory work folds into the v0.2 `trajectory` directive (Observable Plot output, LLM-emitted) — no separate atom to build later.

**G-N-9 promotion (v0.1.5, 2026-05-28):** previously listed as a v0.2 schema-bump candidate. Investigation showed the gap was *adapter-side, not schema-side* — the v0.1 schema's `HypothesisBundle` already supported populated `h_ablation` / `h_control_negative` / `h_robustness`, but the adapter at `ledger.ts:227` was hardcoding `h_ablation: []` and discarding `control_result` + `robustness_result` from the runtime ledger. Promotion landed without any schema change: parser extracts `ablation_results`; `interpretIteration` synthesizes templated `Hypothesis` records (`statement: 'ablation: ${key}'`, etc.) so the schema's `min(1)` constraints are satisfied while making the structural-template nature visible. PARTIALLY_CONFIRMED → inconclusive per G-N-1 still applies. See `gaps.md § G-N-9` for full resolution detail. **HypothesisGrid now renders on real `inference-sim` campaigns** — `ordering-theorem` shows h_main + 2 ablations + control + robustness = 5 rows × 5 iterations.

Each atom: one component file + one CSS module + one behavioral test file. Tests assert structural attributes (axis labels, annotation text, `data-*` hooks) but never SVG path data — same discipline as `IntegralGlyph.test.tsx:5-6`.

**Per-adapter composition (Nous-only in v0.1.5):**
- **Nous** — structure projection composes `PrinciplesTempo` + `HMainTimeline`; detail projection adds `HypothesisGrid` (now lights up after G-N-9 promotion). Trajectory plot deferred to v0.2 alongside G-N-4.
- **Coral / GitHub** — no atom work in v0.1.5 (deferred to v0.3+).

**Timeline / sequencing (v0.1.5 visual vocabulary):**

1. ✓ **Phase 1 — `PrinciplesTempo` + `HypothesisGrid`.** Shipped commit `3161b05` + threshold-hardening + a11y follow-up `ed96e0f`.
2. ✓ **Phase 2 — `HMainTimeline`.** Shipped commit `8595d1f` (2026-05-28). Single-strip atom; renders on real `ordering-theorem` data.
3. ✓ **G-N-9 promotion** (commit pending). Adapter populates `h_ablation` / `h_control_negative` / `h_robustness` from runtime ledger fields; HypothesisGrid lights up.
4. **Phase 3 — Visual baseline regen + Nous aesthetic review.** Lock the chrome at this milestone. Pending. **~½ day.**

**Total remaining scope:** Phase 3 visual baseline regen (~½ day) is the only remaining visual-vocabulary item.

**Falsification per atom (the stop conditions):**
- `PrinciplesTempo`: a campaign extracting principles across multiple iterations communicates "burst learning, not steady" visually. ✓ shipped + verified on `ordering-theorem`.
- `HMainTimeline`: a 5-iteration h_main confirmation streak reads as a uniform `--sage` strip in 2 seconds; a contested hypothesis reads as a mixed strip in the same time. ✓ shipped.
- `HypothesisGrid`: the v3 plateau study renders as a clean grid distinguishing confirmed / refuted / inconclusive without a legend. ✓ shipped + lights up post-G-N-9 promotion in v0.1.5.
- `HMainTimeline` (proposed): a 5-iteration h_main confirmation streak reads as a uniform `--sage` strip in 2 seconds; a contested hypothesis reads as a mixed strip in the same time.
- **Cross-cut**: visual baseline diff against pre-v0.1.5 Detail surfaces shows new atoms inheriting tokens cleanly, no foreign aesthetic.

### What v0.1.5 leaves to v0.2

The Nous + Paper focus makes the v0.2 boundary cleaner:

- **Paper adapter.** Real `papers/<name>/draft.md` + `refs.bib` reading + cross-references to upstream Nous campaigns. May slide forward to v0.1.5 in starter form (TBD per Paper subsection).
- **Nous schema bump** (G-N-* promotions). G-N-9 unlocks HypothesisGrid's full 2D content + the `trajectory` findings directive.
- **Per-kind writeback** for Nous (already shipped, hardened) + Paper (new).
- **Findings plots** (charts of the data the campaign produced — scatter, ablation grids, distributions, etc., authored via LLM-emitted directives + Observable Plot rendering). Depends on G-N-9. Distinct from the v0.1.5 progress trackers above. See "Findings plots" subsection under v0.2 below — now scoped to Nous + Paper only.

### What v0.1.5 leaves to v0.3+

- **All Coral parity work** — writeback, shaping, projection plugins, Phase-4 ops, run-command plugin, `BestSoFarLine` atom, schema bumps (G-C-*).
- **All GitHub-issues / feature-development work** — timeline events, linked PRs, body rendering, body-search, jump-to-github, full feature-dev adapter (git log + PR API + CI status), schema bumps (G-F-*).
- **Cross-kind execution orchestrator** (touches all four adapters). Promoted to v0.3+ since it can't be designed without cross-kind evidence and we're now scoping v0.2 to Nous + Paper only.

### Falsification per adapter

Each cleanup needs a checkable stop condition (analogous to "the schema accepts this without modification" for B1/B2):

- **Nous:** the spec-gaming nous-campaign that passes commit gating today should fail it under v0.1.5's pre-flight validation OR the user is shown the validation failure inline. (Concrete: shape a campaign with a non-existent `repo_path` → committing is gated until the path exists.)
- **Paper:** the chrome makes "this paper-claim is grounded in Nous iter-2 of the v3 plateau study" a single click + 2-second read on the claim's Detail surface. (Concrete: open a fixture `paper-claim` whose `evidence_links` point at a `nous-iteration` → upstream chain is the primary detail body, not a side-section.)

### Companion files

- **`integral-ui/.notes-v0.1.5.md`** — the original parking lot (legibility framing). To be re-organized once v0.1.5 brainstorming converts these themes into the outcome framing above. The legibility issues stay in scope; they're now consequences rather than primary objectives.
- **`integral-ui/.plan-v0.1.5.md`** — to be written after brainstorming + scope decisions. Not started.

### Implementation note

v0.1.5 is **scoped to chrome work on the Nous + Paper axis** — no new schema, no new adapter contracts (with one possible exception: the Paper adapter starter, if the user opts to slide it forward from v0.2). If a v0.1.5 candidate requires substrate change beyond that, it slides to v0.2. Coral and GitHub-issues are explicitly out of scope for v0.1.5 — see v0.3+ tiers.

---

## v0.2 — Nous schema bump + Paper adapter + findings plots

**Scope contraction (2026-05-27):** v0.2 is now scoped to **Nous + Paper only**. All Coral parity work and full feature-development integration have moved to v0.3+. This concentrates substrate energy on the research-paper authoring loop and on landing the cross-tree provenance test (paper-claim → nous-iteration via `EvidenceLink`) the substrate's design has been promising since v0.1.

**Nous schema bump (the v0.2 schema design pass).**
Promote G-N-* candidates from `gaps.md`. Each promotion writes a new `intent-schema-v0.2.md` alongside v0.1; old adapters keep referencing v0.1.

*From Nous (G-N series, surfaced during A1+A2):* G-N-1 (`partially-confirmed` outcome), G-N-2 (typed `Principle` objects + principles graph), G-N-3 (`family` field on iteration), G-N-4 (`prediction_accuracy` aggregate — load-bearing for the findings-plot `trajectory` directive), G-N-5 (frontier evolution), G-N-6 (typed iteration artifacts/patches), G-N-7 (intra-iteration phases as gate vocabulary), G-N-8 (campaign success criterion source), G-N-10 (typed principle action lifecycle), G-N-11 (KnowledgeRef.version overload), G-N-12 (principle-extraction `OperationKind`). *G-N-9 (control/robustness/ablation outcomes) was originally listed here but resolved in v0.1.5 — see the Visual vocabulary subsection above and `gaps.md § G-N-9`.*

*Paper schema work:* validate that `paper-campaign` / `paper-section` / `paper-claim` extensions carry what the Paper adapter needs. Likely candidates surface during adapter implementation: a `paper-claim.evidence_chain` typed walk over `EvidenceLink` upstream-iterations, a `paper-section.completion_state` enum (drafted / argued / cited), a `paper-campaign.draft_anchor` `ExternalAnchor` to `draft.md`. Catalog as G-P-* gaps as they emerge during adapter design.

*Coral and GitHub schema bumps (G-C-*, G-F-*) deferred to v0.3+.*

**Writeback hardening (Nous + Paper).**
Generalize Track A's writeback (A4) to Paper. Filesystem auto-watch replaces the refresh button.

Per-adapter scope:
- **Nous writeback already shipped** (A4) — keep, harden against multi-source races.
- **Paper writeback (Adapter #4 v0.2):** edits to `draft.md` sections via section-anchored edits; bibliography additions to `refs.bib`. Section anchors are the load-bearing trick — multiple `paper-section`s in one draft.md means writes need to target a specific section without touching the rest.
- *Coral and GitHub writeback deferred to v0.3+.*

**Acceptance:** Nous + Paper reach declare-edit-refine parity through the chrome. Backwards-compat: existing Nous writeback path stays intact.

**Adapter #4 — Paper.**
The original 4th-of-4 in the v0.1 plan, now centralized in v0.2. Read `papers/<name>/draft.md` + `refs.bib` + cross-references to upstream Nous campaigns. Tests cross-tree provenance via `EvidenceLink` (paper-claim → nous-iteration). The structural test that's been deferred from v0.1 expansion.

Per-kind structure:
- **`paper-campaign`** — root intent for one paper draft. `decomposition.children` = `paper-section` IDs in document order. `ExternalAnchor` points at the draft.md file root.
- **`paper-section`** — one §N section. `decomposition.children` = `paper-claim` IDs. `ExternalAnchor` points at the section's anchor in draft.md.
- **`paper-claim`** — one assertion. `evidence_links` (outgoing) → `nous-iteration` IDs upstream. Optional `external_citations` → `refs.bib` entries.

Adapter responsibilities (v0.2):
1. Read draft.md, parse §-headers + claim markers (TBD format — a comment syntax like `<!-- claim: X -->` or front-matter blocks).
2. Read refs.bib via a typed parser (`@article{key, …}`).
3. Resolve cross-tree links: a claim's `evidence_links` must point at typed `nous-iteration` intents in the workspace. The `EvidenceLink` validation already enforces this; the adapter just needs to populate it.
4. Filesystem auto-watch on draft.md + refs.bib so chrome refreshes when the author edits in their preferred editor (the substrate doesn't host a draft.md editor; it surfaces what's there).

**Execution / orchestrator scoping.**
The cross-kind orchestrator (`▶ run` affordance + workspace-watcher + per-kind runners) is now **deferred to v0.3+** — it can't be designed without cross-kind evidence (Nous + Coral + Paper together), and v0.2 is Nous + Paper only. The v0.1 `RunCommand` panel (manual `cd <root> && nous run` invocation) stays as the canonical Nous run path. Paper "execution" is editing draft.md / refs.bib in the user's editor — there's no `▶ run` for paper authoring.

The Nous-specific run-command plugin (`src/lib/run-command-plugins/nous-campaign.ts`) stays as is. Paper has no analog — it's not a run-shaped artifact.

**Semantic-model promotion (Nous + Paper).**
- S-1 projection generator filled out for `paper-campaign`, `paper-section`, `paper-claim` (Adapter #4's three kinds). v0.1 ships only Nous projection plugins; v0.2 adds three Paper cells × {structure, detail} = up to 6 plugin cells.
- S-2 per-kind status grammars: nail down `paper-claim.status` semantics (drafted? argued? evidence-grounded? satisfied means published?).
- S-4 evidence narratives (one-line generated narrative per `EvidenceLink`) — load-bearing for paper-claim's upstream chain rendering.
- S-5 principles-as-typed-objects (depends on G-N-2 schema bump — Nous side only in v0.2 since Coral is deferred).
- C-4 architectural decision: adapter-side vs. generator-side projections. Recommended generator-side; v0.2 commits.
- Two-audiences API surface: documented `/api/intents/<id>?zoom=...` endpoints.

**Calculus semantics (cautious).**
v0.1 declares operation signatures; v0.2 may add per-kind validity for Nous + Paper kinds (when can `gate` fire on a `paper-claim`? When does `satisfy` make sense for a `paper-section`?). Reduction rules / composition theorems only if a pattern is forced by real adapter behavior. **Resist formalizing prematurely.**

### Findings plots — declarative chart authoring (Observable Plot)

**Phase position:** v0.2 atom-level commitment built on top of the schema bump. **Hard dependencies** on the v0.2 Nous schema work — primarily G-N-4 (`prediction_accuracy` aggregate, for the `trajectory` directive's metric data) and the cross-tree Paper adapter (for the load-bearing claim → iteration findings demo). G-N-9 (control/robustness/ablation outcomes) was originally a hard dependency here too, but it was promoted into v0.1.5 ahead of schedule — the runtime data is now visible via HypothesisGrid + adapter pass-through, which means the directive grammar in v0.2 can compose richer findings plots from data the chrome already surfaces.

**The distinction restated:** v0.1.5 progress trackers describe *the campaign's meta-state* (how many iterations, which hypotheses confirmed). v0.2 findings plots describe *the data the campaign produced* — scatter plots of experimental results, ablation comparisons, training curves, distribution histograms, hyperparameter heatmaps. They compose on the same Detail surface but answer different questions; they share aesthetic discipline but use different rendering primitives (atoms vs. Plot).

**Aesthetic ambition:** the bar is **better than what a researcher could quickly build in matplotlib + Jupyter**. Not because the substrate has more features, but because the chrome is consistent, the typography is dialed, the color tokens align with the rest of the substrate, and the LLM picks the right chart kind for the data shape automatically. This is the load-bearing visual claim of Integral: *understanding what a campaign found should be faster here than anywhere else.*

**Architectural commitment: the directive seam.**

```
Layer 1 — DATA      Iteration.hypothesis_bundle (G-N-9 already populated
                    in v0.1.5) + G-N-4 numeric aggregate (v0.2)
                    ↓ adapter passes through (no projection)
Layer 2 — DIRECTIVE LLM emits {type: 'scatter', x: 'model_size', y: 'accuracy', …}
                    ↓ projection plugin (mockable for tests)
Layer 3 — CATALOG   handAuthored.scatter(data, directive) → Plot.plot({…})
                    ↓ pure JS (no LLM)
Layer 4 — RENDERER  Plot output → static inline SVG
                    ↓ unmounted, unchanging in v0.2
DOM
```

**Module boundary:** `src/lib/charts/`. The rest of the app sees only the directive type, not Plot. Swapping the rendering primitive (Plot → Vega-Lite, or Plot → hand-tuned SVG) is a contained refactor in this module. Same load-bearing isolation discipline as the LLM client living outside `src/`.

**Library: Observable Plot.** Picked over Vega-Lite for cleaner aesthetic defaults + tighter token alignment via Plot's API; over Chart.js / Plotly because Plot renders SVG (inherits CSS tokens) and is small (~200KB). Pre-1.0 status mitigated by the directive seam — **we own the per-kind plot catalog**; Plot is just the rendering primitive.

**The directive grammar.** A small fixed enum of plot kinds the LLM can author safely. v0.2 ships:

| Directive type | Renders | Use case |
|---|---|---|
| `trajectory` | Single line over iterations/attempts (extends progress sparkline) | Metric over time, small-multiple-able by `compare_by` |
| `scatter` | x vs y, optional `color_by` / `shape_by` encoding | Correlations, "x predicts y across N runs" |
| `compare` | Small-multiples grid faceted by a categorical field | Ablation studies, condition-by-condition |
| `distribution` | Histogram or density | "What's the spread of N evaluator scores" |
| `heatmap` | 2D categorical × categorical with intensity | Hyperparameter sweeps |
| `bar` | Categorical comparison with optional error bars | Ablation summaries, group means |
| `prose` | Fallback when nothing visual fits | LLM signals "this data doesn't have a natural plot shape" |

LLM emits `{type: <enum>, x: <field>, y?: <field>, color_by?: <field>, …}`. Each directive is a typed Zod schema in `src/lib/charts/directive.ts` so invalid emissions fail validation and fall back to prose gracefully.

**Aesthetic discipline (extending v0.1.5):**
- All Plot calls go through catalog wrappers in `src/lib/charts/plots/<kind>.ts`. Plot's defaults are overridden once, in the catalog — never per-call.
- Plot's CSS classes restyled via `src/lib/charts/charts.module.css` to inherit `--ink-2` for axis lines, `--mute` for tick labels, `--paper` for background. No inline styles on rendered SVG.
- Color encoding inherits the v0.1.5 vocabulary: `--amber` for the focused/current data point, `--sage` for "confirmed/within target," `--rose` for "refuted/out of bounds," `--mute-2` for everything else. No rainbow scales by default; sequential `--ink` luminance ramps for ordinal data; categorical pastels (`--amber-soft`, `--sage-soft`, `--rose-soft`) for nominal data with ≤4 categories.
- Typography matches the substrate: same global font stack, mono tick labels, sans axis titles. Plot's default font replaced via CSS module override.
- **Annotations are mandatory.** Every plot has a one-line LLM-authored caption above it (*"r=0.78 — model size predicts accuracy on the eval set"*). The caption is the entry point; the plot is the supporting evidence. Plots without captions don't render.
- No interactive features in v0.2. No tooltips, no hover, no zoom. Static SVG, readable from print, accessible to screen readers via `<title>` / `<desc>`. Interactive plots are v0.3.
- Don't lie: same discipline as v0.1.5 — no axis truncation, always show N, always show units.

**Interpretability discipline:**
- LLM directive emission is bounded — a fixed enum, not arbitrary code. Sanitize: if the directive's named fields don't match the data's actual keys, fall back to prose and log the mismatch.
- Caption + plot must answer "what's the takeaway in 5 seconds?" together. If a reader needs to read both fully to understand, the plot has failed.
- Each catalog wrapper has hand-authored *inline annotations* (e.g., scatter highlights the focused data point; compare grid annotates the leading panel). Annotations are part of the catalog, not LLM-driven.

**Per-adapter rollout (Nous + Paper only):**

| Adapter | Findings plot consumers | Notes |
|---|---|---|
| **Nous** | `nous-iteration + detail` shows ablation/control/robustness scatter or compare plots; `nous-campaign + detail` shows aggregate findings across iterations | Phase 1 — most data-rich; validates the directive grammar |
| **Paper** | `paper-claim + detail` shows the figure referenced by the claim — including, crucially, plots derived from upstream Nous iteration data via `EvidenceLink` resolution. *This is the load-bearing cross-tree v0.2 demo*: a paper-claim's plot is literally the rendering of its upstream Nous iteration's findings, surfacing the evidence chain in the visual itself. | Phase 2 — tests cross-tree findings (paper claims pointing at upstream Nous figures via `EvidenceLink`) |

*Coral findings plots and feature-campaign decisions deferred to v0.3+.*

**Test discipline:**
- LLM mocked in directive emission tests. Mock returns canned directives; assertions verify the projection plugin produces the right directive given canned data. Same pattern as v0.1 projection prose tests.
- Plot catalog tested via behavioral assertions on rendered SVG: `data-plot="scatter"`, `data-x-field="model_size"`, `data-points="42"`. Path data never asserted.
- Snapshot tests on rendered Plot output for small fixture datasets, behind a feature flag — snapshots regenerate intentionally, never silently.
- LLM isolation discipline preserved: real Plot calls are pure JS (no network); real LLM calls do not happen in tests.

**Timeline / sequencing (v0.2 findings plots, Nous + Paper):**

1. **Phase 0 — Schema prerequisite.** G-N-4 promotion (`prediction_accuracy` aggregate as a typed `Iteration.metric` field). Writes `intent-schema-v0.2.md` alongside v0.1. **~1 PR, schema design pass.** *(G-N-9 already resolved in v0.1.5, so it's not a Phase 0 dependency anymore.)*
2. **Phase 1 — Adapter pass-through.** Stop dropping G-N-4 numeric fields in `src/adapters/nous/`; pass `metric` through. Paper adapter (Adapter #4) reads draft.md / refs.bib + resolves cross-tree `EvidenceLink`s. **~2 PRs (Nous data-pass-through, Paper adapter starter).**
3. **Phase 2 — Directive grammar + Zod schemas.** Define the 7 directive kinds in `src/lib/charts/directive.ts` + tests. **~1 PR.**
4. **Phase 3 — Plot catalog + renderer module.** `src/lib/charts/plots/<kind>.ts` for each directive kind + `src/lib/charts/render.ts` (the directive → Plot output dispatcher). **~6-7 PRs (one per directive kind, batchable).**
5. **Phase 4 — LLM directive emission in projection plugins.** Update `src/lib/projection-plugins/{nous-iteration,nous-campaign,paper-*}.ts` to emit directives in addition to prose. Paper claims emit directives *that resolve through their upstream nous-iteration evidence* — the cross-tree visual demo. **~2-3 PRs (Nous + Paper plugin updates).**
6. **Phase 5 — Aesthetic review.** Visual diffs against v0.1.5 Nous progress trackers — the Plot output must look like one substrate with the v0.1.5 atoms, not two grafted layers. **~½ day; may surface catalog tweaks.**

**Total scope:** ~2-3 weeks of focused work, ~10-12 PRs across the v0.2 cycle (smaller than the original Coral-inclusive plan). Lands alongside the Nous schema bump and the Paper adapter so the cross-tree case is real.

**Falsification per directive type (the stop conditions):**
- `scatter`: a Nous iteration's ablation results render as a scatter with the focused condition in `--amber`; reading "x correlates with y" is faster than reading the LLM's prose.
- `compare`: a 4-condition ablation renders as 4 small multiples; the leading condition is annotated.
- `distribution`: 100 evaluator scores render as a clean histogram with N + median annotated inline.
- `heatmap`: a hyperparameter sweep renders without the LLM having to author a colorscale.
- `bar`: ablation summary renders with error bars derived from the same `ResultBundle`.
- **Cross-cut**: a researcher comparing the Detail surface to their own matplotlib Jupyter scratch finds Integral's plot more readable in <30 seconds.

**Stop conditions for the whole v0.2 chart pillar:**
- G-N-4 promoted to schema; adapter surfaces numeric metric data.
- Directive grammar finalized; each directive type has a catalog wrapper + tests.
- Module boundary `src/lib/charts/` enforced — no Plot import outside it (load-bearing test in CI).
- At least one Nous campaign has its findings rendered as charts on Detail; reads stunningly compared to prose-only.
- Paper-claim findings plots resolve through their upstream Nous iteration's data via `EvidenceLink` — the cross-tree visual demo shows.

**Recovery plan if Plot stalls or breaks API across versions:**
- Renderer module is the only Plot consumer. Swap to Vega-Lite (JSON spec emission instead of API calls) by rewriting `src/lib/charts/render.ts` — directive contract + catalog signatures unchanged.
- Worst case: hand-tune SVG inside the catalog (no library). Bigger effort but bounded — the catalog has 7 directive kinds, each ~50-100 lines of SVG.

**Companion files:**
- `integral-ui/.plan-v0.2-charts.md` — to be drafted during v0.2 design pass. Captures directive-schema final form, catalog scope decisions, Plot version pinning, gradient/colorscale tokens.

---

## v0.3+ — Coral parity + feature-development + collaboration tier

Absorbs all work deferred from v0.1.5 + v0.2 by the 2026-05-27 scope decision (Nous + Paper focus). Three independent tiers — they can ship in any order.

### Coral parity tier

B1 shipped Coral as read-only Phases 1+2 (2026-05-24). Bringing Coral to Nous-parity requires several discrete items, each independently shippable:

1. **Coral schema bump (G-C-* promotions).** From `gaps.md`: G-C-1 (`success_criterion` source — same shape as G-N-8; ideally promotes alongside it), G-C-2 (`direction: maximize|minimize`), G-C-3 (`search_algorithm` enum reflects nothing real), G-C-4 (`Party` thin for role-evolution), G-C-5 (no campaign-level "done" signal), G-C-6 (`coral-attempt.status` enum mapping), G-C-7 (`evaluator_feedback` field), G-C-8 (`shared_state_hash`), G-C-9 (`budget_class`), G-C-10 (notes-as-typed-knowledge — joint with G-N-2 which lands in v0.2; G-C-10 catches up here), G-C-11 (pre-installed personas as `KnowledgeRef`s), G-C-12 (pre-installed skills as `KnowledgeRef`s), G-C-13 (operational state stays out — observability), G-C-14 (Coral agent-worktree anchor kind name).
2. **Coral writeback.** `task.yaml` serializer (`src/adapters/coral/writeback.ts`) + `/api/coral/writeback` endpoint + `CoralWritebackConfig` schema covering `task.{name, description}` + `grader.{entrypoint, direction, timeout, args}` + `agents.{count, runtime, model}` + `workspace.repo_path`. Refuse-overwrite semantics mirror Nous's. Today's `writeback-handler.ts` early-rejects `source.kind !== 'nous'` with 400 — that guard inverts when the Coral handler lands.
3. **Coral LLM-driven shaping (mirrors A4.6).** New `+ new coral campaign` button on `MapSurface.topRow`. Per-kind shape-handler dispatch — the existing `vite-plugin-nous-adapter/shape-handler.ts` carries a Nous-specific system prompt; refactor to dispatch on `intent.kind` so Coral and Paper slot in similarly. `shape-patch.ts` is already kind-agnostic.
4. **Coral projection plugins.** B1 deliberately shipped without these; v0.2 deferred them; v0.3+ fills four cells:
   - `src/lib/projection-plugins/coral-optimization.ts` — structure (≤800 chars: best score, attempt count, agent count, recent-leader narrative) + detail (unbounded: full attempt-tree narrative, principle highlights, gaming-attempt callouts).
   - `src/lib/projection-plugins/coral-attempt.ts` — structure (score + status + lineage one-liner) + detail (attempt rationale, parent comparison, feedback prose).
   - Reason for original deferral: pi-mc was one Coral run; prompt design overfits without cross-validation against more Coral runs.
5. **Coral Phase-4 operations diff.** B1 left ops empty — `buildCoralWorkspace`'s `BuildCoralWorkspaceOpts.prior` is reserved but ignored. The generic `diffWorkspaces` engine in `src/lib/workspace-diff.ts` is adapter-agnostic; Coral's job is to plug in. **The load-bearing test:** Coral's DAG-shaped decomposition is structurally different from Nous's tree-shaped decomposition — DAG growth must produce clean ops without double-counting when an attempt's parent-attempt-id is also a child of the campaign at the schema level.
6. **`BestSoFarLine` atom (visual vocabulary, deferred from v0.1.5 Phase 2).** Step-line of best score across attempts; gaming attempts marked with `--rose` triangles. Threshold: ≥3 attempts. Wires into `coral-optimization + structure` projection. Replaces the original v0.1.5 Coral outcome #1 ("best-so-far chart").
7. **Coral outcome cleanup (chrome that helps the user *steer* the optimization).** Originally listed under v0.1.5; defers to here:
   - Gaming-detection signal (the `math.pi` attempt hit the 1e12 cap — mark suspicious attempts visibly).
   - Side-by-side attempt diff (click two attempts → see the diff in `solution.py`).
   - Agent personalities visible (each `roles/agent-N.md` rendered inline; G-C-4 lossy today).
   - Notes-as-principles in context (G-C-10 surfaces note bodies / excerpts on campaign Detail).
8. **Coral findings plots (v0.2 work that now defers).** Per the v0.2 findings-plot rollout that originally listed Coral as Phase 2: `coral-optimization + detail` shows attempt-population scatter (parent_hash → child relationships visible as edges); `coral-attempt + detail` shows scatter of solution attributes. Depends on Coral schema bump (G-C-* analogues to G-N-9).
9. **Coral run-command plugin** (per-kind small plugin mirroring `src/lib/run-command-plugins/nous-campaign.ts`). `cd <root> && coral run` (or whatever Coral's CLI entrypoint is). Composes from `task.yaml`'s presence + the run timestamp dir.

Sequencing recommendation: **(1) schema bump → (2) writeback + (3) shaping together → (4) projection plugins → (5) Phase-4 ops → (6) BestSoFarLine atom → (7) outcome chrome → (8) findings plots → (9) run plugin.** Each is independently shippable; per-PR scope.

### GitHub-issues / feature-development tier

B2 shipped GitHub-issues as read-only Phases 1+2 (2026-05-25). Promoting it to the full feature-development story is the most expensive integration (git log + PR API + CI status + repo-scoped `CLAUDE.md` as a scoped knowledge corpus); benefits from schema lessons of three other adapters.

1. **GitHub-issues schema bump (G-F-* promotions).** Cataloged in `gaps.md`; 13 G-F-* gaps recorded during B2. Promotions land here.
2. **GitHub-issue writeback** (open / close / comment / assign via `gh` CLI or REST). Read-only B2 doesn't write; the writeback story rides this tier.
3. **GitHub-issues outcome cleanup** (chrome that helps the user *triage*). Originally listed under v0.1.5; defers to here:
   - Timeline events + comments loaded — promotes G-F-7 + G-F-8. Activity Strip on GitHub Detail is silent today; making it speak is the highest-leverage GitHub fix.
   - Linked PRs as references — surface `linked_pull_requests` as a chip on Detail ("linked: PR#123 ci-failing"), typed as `EvidenceLink`.
   - Stale-data signal honest — "synced 12m ago · refresh →" when reality has shifted on github.com.
   - Markdown body rendering on Detail (closest in-spec substitute for the missing projection plugin).
   - Body-search / jump-to-issue (`/` keyboard shortcut → narrow to substring matches).
   - One-click jump to github.com to comment (until writeback lands).
4. **Full feature-development adapter.** Promote the GitHub-issues stand-in (B2) to the full feature-dev story: git log + PR API + CI status + repo-scoped `CLAUDE.md` as scoped knowledge corpus.
5. **`feature-campaign` projection plugins** (`src/lib/projection-plugins/feature-{campaign,pr}.ts`).
6. **Findings-plot decision for `feature-campaign`.** Originally "excluded by design" because feature work is declarative not data-producing. Re-decide here: do feature campaigns produce data that earns plots (CI metrics, PR latency distributions, review-cycle times)? If yes, slot into the directive grammar.

### Cross-kind execution orchestrator (deferred from v0.2)

Build the in-chrome execution capability as a substrate-level concern, not a per-kind UI button. A workspace-watcher service observes intent state and policies (auto-fire on declare? gate on human approval per kind?); a generic process manager handles spawn/track/kill/log; per-kind runners (`nous-runner`, `coral-runner`, `feature-dev-runner`) plug in. The chrome adds a `▶ run` affordance that calls the same orchestrator API a background watcher would. Cross-restart idempotency and process-tracking design happen here, once, with cross-kind evidence (Nous + Coral + feature-dev) in hand. The v0.1 `RunCommand` panel from A5 stays as the manual fallback.

Per-kind run-command plugins:
- `nous-campaign` → ✓ shipped (A5)
- `coral-optimization` → see Coral parity tier item (9)
- `feature-campaign` → invocation TBD when the full feature-dev adapter lands

### Collaboration tier (original v0.3+ scope)

High-level only. Not actionable today; listed so future sessions know it exists.

- **Multi-agent collaboration semantics.** Two agents working the same intent (or disagreeing); proposal/acceptance flows extended for agent-vs-agent.
- **Personalized projections.** Different prose per consumer; a junior collaborator and a senior reviewer see the same intent rendered differently.
- **Trustworthiness scoring** on LLM-generated projections — provenance chain visible per claim.
- **Real-time collaborative cursors** on the Map and Detail surfaces.
- **Agent-fired structural operations** — agents can propose `fork` / `merge` / `reframe`; humans confirm. (v0.1 explicitly forbids agent-initiated structural ops.)
- **Interactive findings plots** — tooltips, brushing, faceted drill-down on the v0.2 Plot output. Static SVG in v0.2; interaction layer is a separate concern (event handling, accessibility implications, mobile interaction).

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
