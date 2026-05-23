# Integral — project context

## Project phase

Integral is at **v0.1 expansion in flight (Path 2)**. Chrome stack landed; typed `Operation` log shipped; multi-source data plane shipped; Adapter #1 (Nous) Phases 1+2+3+4 shipped (read-only — Phase 4 emits typed Operations from observed transitions, but no writeback yet). The substrate is still descriptive only; writeback arrives in Track A items A4+A5.

**v0.1 expansion (revised 2026-05-23)** runs two parallel tracks: Track A closes the Nous round-trip (writeback + projections + one user-fired Operation); Track B falsifies the schema across two more kinds (Coral, GitHub-issue feature-campaign). Paper adapter and full feature-dev integration are now v0.2.

Four canonical design documents are authoritative for everything below. Read them before writing or proposing changes.

## Current state (as of last session)

- **Schema layer**: `integral-ui/src/schema/zod.ts` — 9 IntentKinds, discriminated `TypeExtension` union, `KnowledgeRef` discriminated by scope, `WorkspaceSchema` enforces 1:1 Intent↔IntentState bijection.
- **Atom layer**: `integral-ui/src/components/atoms/` — 10 atoms (StatusDot, Chip, IdPill, KindBadge, PartyChip, Tag, SectionLabel, Sparkline, HypothesisBars, ScoreGauge, ZoomToggle). Each owns a CSS Module + behavioral tests. Genre = Karpathy aesthetic (warm paper, cool ink, single-amber signal, IBM Plex stack).
- **App chrome**: `integral-ui/src/components/AppHeader/` — sticky-top `AppHeader` + `IntegralGlyph` SVG brand mark (hand-tuned hook, scales for landing). Schema-version chip reads `SCHEMA_VERSION` literal. Reversibility chip is display-only with `title="v0.2 — audit log"`. Breadcrumbs ellipsis-truncate below 768px. `data-surface={view kind}` on root. Hidden on Landing.
- **Landing surface**: `integral-ui/src/surfaces/Landing/` — instrument-style first paint. Big `IntegralGlyph` (140px) + "Integral" wordmark + tagline ("intent management for humans + agents") + status peek (`N active · M awaiting you · last activity Xm ago`, derived from validated workspace) + auto-focused `enter →` button. Once-per-session via `sessionStorage['integral.landing-seen']`; subsequent navigation back from Map skips Landing.
- **Map surface**: `integral-ui/src/surfaces/Map/` — `MapSurface` + `TreeCard` molecule + `isAwaitingMe` predicate. Renders the four root campaigns; click-to-detail navigates to the Detail surface.
- **Detail surface**: `integral-ui/src/surfaces/Detail/` — `DetailSurface` composes `DetailHeader` (uniform across kinds), `ChildrenSection` (per-kind specialized body, zoom-aware via `intent.extension.kind` narrowing), `EvidenceEdges` (outgoing/incoming over `workspace.evidence_links`, with cross-tree click-to-navigate), and `KnowledgeRefsSection` (refs grouped by scope; inherited refs surface their `inherited_from`). Single-column layout — per-intent activity is rendered by the unified `WorkspaceActivityStrip` via its `focusedIntentId` + scope-filter mechanism (the previous `IntentActivityStrip` is removed). The zoom toggle drives body content per the resolved decision.
- **Workspace Activity Strip (unified)**: `integral-ui/src/surfaces/Activity/WorkspaceActivityStrip.tsx` — right-side strip on Map and Detail at ≥1280px. Three buckets (critical/notable/routine); routine collapsed by default. Significance filter `notable+` / `routine+`. **Scope filter** `this intent` / `all` is auto-active when `focusedIntentId` is set (Detail surface) and resets on intent change. **Hide/show** via header toggle `›` collapses the panel to a 36 px-wide vertical rail with the non-routine count + expand chevron `‹`; collapsed state persists per-session via `sessionStorage['integral.strip-collapsed']`. Hovering a row writes the target intent ID into `useHoveredIntent()` (context-based, no global store) so Map's `TreeCard` preview-pulses via `data-pulse` attribute. Event derivation lives in `src/lib/activity.ts`; combines transitions + operations with schema-exhaustive significance heuristics over both `IntentKindSchema.options` and `OperationKindSchema.options`.
- **Shaping surface**: `integral-ui/src/surfaces/Shaping/` — two-pane shaping mode for `Status: 'draft'` intents. `ShapingDialog` (left) renders scripted clarification turns; `IntentDraftPane` (right) renders the live typed draft with `⚠ pending` chips on unresolved fields per a hand-authored resolved-set in `src/fixtures/shaping.ts`. Restructure buttons (`decompose`/`fork`/`merge`/`reframe`) render inert with `title="v0.2"` and click logs to console. `commit-to-active` is gated on `requiredFields.every(f => resolvedFields.has(f))`; click transitions the draft state from `draft` → `active` in the in-memory workspace (fixture file is never rewritten). Map TreeCard click routes drafts here, non-drafts to Detail. Two draft fixtures: a fully-resolved Nous campaign (commit enabled) and a partial Coral optimization (commit disabled, pending chips visible).
- **Visual regression**: `integral-ui/e2e/visual/` — Playwright screenshot baselines locking the v0.1 chrome. 15 PNGs covering Landing, Map (default + awaiting), Detail per-kind × 9 + nous-iteration at detail zoom, Activity Strip, Shaping. 1440×900 @ 2× DPR, `maxDiffPixelRatio: 0.01`, animations disabled, font-load gated. `npm run test:e2e:visual` diffs; `npm run test:e2e:visual:update` regenerates. Two Playwright projects (`chromium` for behavioral, `visual` for diffs) keep visual runs out of the default test cycle.
- **Operation log (v0.1 expansion, Path 2)**: Schema includes a typed `Operation` discriminated union over 16 op kinds (9 lifecycle + 7 shaping). `Workspace.operations: Operation[]` is the parallel collection alongside `evidence_links`. `src/lib/activity.ts` derives a unified event stream from both `state.history` transitions and `workspace.operations` with a schema-exhaustive `classifyOperation` heuristic. Both activity strips render op events with a `data-source="operation"` hook + a small kind chip; `IntentActivityStrip` filters ops by `target_intent_id` to scope to the focused intent. `roadmap.md` tracks remaining Path 2 items (4 adapters, filter/group/sort, refresh affordances).
- **Adapter #1 (Nous, Phases 1+2+3+4)**: `integral-ui/src/adapters/nous/` (browser-safe types + pure interpreter + `ledger.ts` + `principles.ts`) + `integral-ui/vite-plugin-nous-adapter/` (Node-only `FilesystemNousSource` + Vite middleware). The adapter follows a transport/interpreter split: `NousSource` is the abstract transport (currently `FilesystemNousSource`; v0.2 may add `S3NousSource`/`HTTPNousSource` without changing the interpreter). The pure `buildNousWorkspace` reads `campaign-X.yaml` declarations + `.nous/<run>/state.json` runtime state + `.nous/<run>/ledger.json` iteration log + `.nous/<run>/principles.json` principles ledger; produces typed `nous-campaign` Intents wired to `nous-iteration` child intents (one per non-baseline ledger entry) via `decomposition.children` + `extension.current_iteration`. The synthetic iter-0 baseline is filtered. Each principle in principles.json becomes a `KnowledgeRef` with `role='principles'` attached at both campaign scope (full set on the parent) and iteration scope (only on the iteration whose `extraction_iteration` matches). URI scheme `nous-principle://<runId>/<id>` is stable across refreshes; `version='v0.1-lossy'` marks the dropped structure. **Phase 4** adds `buildNousWorkspace(source, { prior, at })` — when a prior workspace is provided, the adapter calls the generic `diffWorkspaces` engine in `src/lib/workspace-diff.ts` and emits typed `Operation`s for the delta: `declare` for newly-appearing intents, `decompose` for parents whose children grew, and specialized status ops (`satisfy` / `gate` / `revoke` / `advance`). Op ids are deterministic (`op:<kind>:<target>:<at>`) so refresh is idempotent. The diff engine is schema-exhaustive over `OperationKindSchema.options` via a `KIND_DISPOSITIONS` map; a v0.2 op-kind addition fails the unit test until acknowledged. Lossy mappings recorded in `gaps.md`: `h_main_result` (`PARTIALLY_CONFIRMED → inconclusive` per G-N-1), `principles_extracted` (`{id, action}` → `Reference.observation` per G-N-2/G-N-10), `family` → tags (G-N-3), runtime ledger fields with no schema home (`ablation_results`, `control_result`, `robustness_result`, `candidate_id`, `frontier_update` per G-N-9), full principle structure (G-N-2), and principle-extraction events emit no op because no `OperationKind` fits (G-N-12). `provenance.source = 'nous'` on every emitted intent. Exposed via `/api/workspace?source=nous` + `/api/sources` listing endpoint. Smoke-tested against `~/Documents/Projects/inference-sim/` — 20 campaigns + 47 iteration intents + 157 campaign-scope + 157 iteration-scope principle KnowledgeRefs; with a synthesized prior, **59 Operations** emit across 3 op kinds (declare 20 + decompose 20 + satisfy 19), all validate against `WorkspaceSchema`.
- **Multi-source data plane**: `integral-ui/src/lib/sources.ts` registers known data sources (currently `'fixture'` and `'nous'`). Schema's `Provenance.source: string?` is the v0.1.0 additive amendment that records which source each Intent came from. App.tsx parses the `?sources=a,b` URL contract (default = all known merged); each source is fetched + decorated with its source ID + merged via `mergeWorkspaces` + validated against `WorkspaceSchema` before any rendering. The Map's `topRow` carries a source-picker chip cluster that toggles enabled sources and updates URL via `history.replaceState`. TreeCards + `DetailHeader` render a small `via <source>` chip in their meta row (reads from `intent.provenance.source`).
- **Projection engine (A2)**: `integral-ui/src/lib/projection.ts` — kind-pluggable, indexed by `(intent.kind, zoom)`. `generateProjection({intent, state, workspace, zoom, plugins, llm})` is pure (no env, no network). v0.1 ships 4 LLM-driven cells: nous-campaign + nous-iteration × {structure, detail}. Other kinds + overview zoom fall back to raw-field rendering. Char budgets enforced post-hoc (≤800 structure; detail unbounded). `src/lib/projection-plugins/{nous-campaign,nous-iteration}.ts` carry the prompt templates. `src/surfaces/Detail/ProjectionSection/` fetches `/api/projection?intent_id=X&zoom=Y` and renders prose; `data-projection-source={llm|fallback}` attribute distinguishes the two. **Persistence**: generated projections are cached on disk under `~/.cache/integral/projections/<sha256>.json` (overridable via `INTEGRAL_CACHE_DIR`). Cache key is `(intent_id, zoom, state.last_advanced_at)` — state advance auto-invalidates. Survives dev-server restarts. The Detail surface footer shows "generated <relative-time> ago · ↻ regenerate"; clicking regenerate hits `/api/projection?…&refresh=true` to bypass the cache and force a fresh LLM call. Server-side LLM client lives in `vite-plugin-nous-adapter/` (outside `src/` — browser bundle never sees it). `tryCreateLLMClient` factory prefers OpenAI-compatible (`OPENAI_API_KEY` + optional `OPENAI_BASE_URL`) over Anthropic (`ANTHROPIC_API_KEY` / `ANTHROPIC_AUTH_TOKEN` + optional `ANTHROPIC_BASE_URL`); model override via `INTEGRAL_PROJECTION_MODEL`. No env key → projections fall back to raw fields without errors. Smoke against real `inference-sim/` campaigns: first call 2.2s (LLM), cached 0.028s (76× faster), survives restart, regenerate writes fresh. **Tests never call real LLMs** — see `## Test discipline` in this file.
- **Tests**: 488 Vitest tests + 17 Playwright behavioral E2E + 15 Playwright visual baselines; all passing; TS strict clean; build clean.
- **Live dev**: `npm run dev` from `integral-ui/` → `http://localhost:5173/`.

## Next milestone: v0.1 expansion (Path 2, revised)

The chrome polish from `goals.md` is done. The next phase runs **two parallel tracks**:

- **Track A (depth) — close the Nous round-trip.** Phase 4 operations from observed transitions, projection generator (kind-pluggable, S-1 from `semantics-v0.1.md`), refresh affordances, Shaping → real `campaign-X.yaml` writeback, one user-fired Operation. After Track A: the substrate is no longer descriptive only.
- **Track B (breadth) — falsify the schema across two more kinds.** Coral (`.coral/attempts/*.json`) + GitHub-issues-as-`feature-campaign`. Each ships its minimum-viable read-only adapter.
- **Track C (cross-cutting) — make the Map queryable.** Filter / group / sort on Map; visual baseline regen as chrome shifts.

Paper adapter and full feature-dev integration (git+PR+CI) are now **v0.2**, alongside the schema bump from `gaps.md` and semantic-model promotion (S-2/S-4/S-5/C-4).

**Authoritative tracker: `roadmap.md`.** Read it before starting any new work. It lists per-item acceptance criteria, the v0.1 stop conditions, and the v0.2 plan.

The v0.1 chrome stack (Landing + Header + Map + Detail + Activity + Shaping) is stable enough to consume real adapter output without surface drift; visual baselines in `e2e/visual/` lock the chrome so adapter-induced data changes don't silently change the look.

**Companion files:**
- `roadmap.md` — two-track Path 2 scope + per-item acceptance + stop conditions for v0.1 expansion + v0.2 + v0.3 outline.
- `semantics-v0.1.md` — semantic model commitments (S-1..S-9 components, C-1..C-8 couplings, two-audiences contract).
- `gaps.md` — schema-fit issues uncovered while sizing adapters; v0.2 candidates only, do not silently fix in v0.1.
- `goals.md` — chrome polish spec (done); kept for reference.

## Canonical references

These files are the source of truth. This CLAUDE.md does not summarize them; it points at them and captures only what is not in them.

- `intents-and-harnesses.md` (v2) — the catalog of LLM-harness categories and the intent-aware abstractions Integral provides (intent as first-class object; collaboration mode; knowledge corpus; work state).
- `intent-schema-v0.1.md` — the typed object model: `Intent`, `IntentState`, `KnowledgeRef`, `EvidenceLink`, four `IntentKind`s and their extensions, shaping operations, non-goals.
- `intent-ux-sketch-v0.1.md` — the four UX surfaces (Map / Detail / Activity / Shaping), figure-rendering rules, filter/group/tag scope, design questions left open.
- `semantics-v0.1.md` — the semantic model: how typed objects acquire meaning across the five layers (source / types / chrome / calculus / semantic). Catalogs S-1..S-9 components (projection, status grammar, decomposition stories, evidence narratives, knowledge growth, operation semantics, awaiting predicates, significance heuristics, time semantics) and C-1..C-8 couplings between layers. Names what v0.1 commits to vs. what is v0.2 work.

Cross-references between these documents are normative. If a code change requires changing one, check whether the others need to follow.

## Core decisions (inherited by every session)

- **Protocol-first, not platform.** Integral describes intents that other harnesses produce; it does not host execution. Adapters read existing-system state through `ExternalAnchor`s.
- **Four intent kinds in v0.1.** `nous-campaign`, `coral-optimization`, `feature-campaign`, `paper-campaign` (plus their child kinds: iteration, attempt, pr, section, claim). Adding a fifth kind is a v0.2 change.
- **State is separated from intent.** Independent versioning of declaration vs. state is load-bearing for the audit log. Don't collapse them.
- **External anchors, not mirrors.** When another system owns authoritative state (git, GitHub, filesystem, bibtex), point at it via `ExternalAnchor`. Don't try to be the source of truth.
- **`EvidenceLink` is the unifying primitive.** It's why the four kinds aren't four parallel schemas. Live in a separate edge collection, not embedded in intents.
- **Default zoom is `structure`.** Map is for orientation; detail is for inspection; structure is the daily-use level. The projection layer must do this best.
- **Figures are conditional on data threshold.** See `intent-ux-sketch-v0.1.md` § Figures: conditional, not mandatory. Empty/young intents stay clean.
- **Tags are free-form, user-controlled.** System-generated tags are v0.2.
- **Bi-actor by default.** Every operation accepts either a human or an agent. The schema does not privilege one.
- **Shaping is a typed phase with mutable declaration.** While `Status == draft`, declaration fields are mutable; shaping operations (refine / decompose / fork / merge / reframe / probe / clarify / commit) are first-class. On `commit`, declaration freezes.

## Meta-rules for schema/UX evolution

- **v0.1 is pre-stable.** Every breaking change bumps the minor by creating a new file: `intent-schema-v0.2.md` will live alongside `intent-schema-v0.1.md`. Old adapters keep referencing the version they were built against. We do not maintain backward compatibility before 1.0.
- **Optional additive fields do not bump the version.** Adding `tags: list[string]?` was a v0.1.0 amendment, not a v0.2.0 break. Note such additions inline in the schema where they were made.
- **The `schema_version` field is authoritative.** Adapters MUST reject objects whose version they don't understand. Don't make adapters tolerant of unknown versions.
- **Non-goals lists are normative.** Items in the `## Non-goals` sections are deliberately deferred, not bugs. Do not silently implement them. If a non-goal needs to land, promote it to v0.2 explicitly with a version bump.
- **Open design questions are not closed by code.** If you start implementing against an open question, surface that you're making a choice and update the question's status in the relevant doc.

## Implementation order

**Authoritative source: `roadmap.md`.** That file owns the order, the acceptance criteria per item, and the v0.1 → v0.2 → v0.3 promotion plan. This section captures only the *framing* — read `roadmap.md` for the live state.

v0.1 expansion runs **two parallel tracks** (revised 2026-05-23):

- **Track A (depth)** — close the round-trip on Nous: Phase 4 operations from observed transitions, projection generator (kind-pluggable), refresh affordances, Shaping → `campaign-X.yaml` writeback, one user-fired Operation.
- **Track B (breadth)** — falsify the schema against two more kinds: Coral (`.coral/attempts/*.json`) and GitHub-issues-as-feature-campaign. Each ships its minimum-viable read-only adapter.
- **Track C (cross-cutting)** — filter/group/sort on Map; visual baseline regen as chrome shifts.

The v0.2 plan is now explicit (see `roadmap.md § v0.2`): schema bump from `gaps.md` candidates, writeback hardening across adapters, the Paper adapter (cross-tree provenance test), full feature-dev (git+PR+CI), semantic-model promotion (S-2/S-4/S-5/C-4 from `semantics-v0.1.md`), and cautious calculus semantics.

**Why two tracks instead of four-adapters-in-sequence.** The original plan optimized for schema falsification at the cost of the round-trip the substrate exists to enable (declare → execute → interpret → act). The revised plan keeps the falsification signal (Coral + GH issues) and adds the round-trip on Nous so v0.1 ships a tool that closes the loop, not just a library that displays types. Paper + full feature-dev move to v0.2.

## Adapter conventions

- **File-shaped first.** Initial adapters read filesystem state, not APIs. This lets us ship in days against real workflows and find out what the schema actually needs before committing to network plumbing.
- **`read-at-zoom-level` is the one v0.1-normative operation.** Given an `IntentId` and a `ZoomLevel`, return the corresponding `Projection`. This is the load-bearing operation for the navigation surface and the single most important thing to validate early.
- **Other operations are adapter-defined in v0.1.** `declare` / `refine` / `delegate` / `advance` / `gate` / `propose-transition` / `accept-proposal` / `satisfy` / `revoke` / shaping operations are typed concepts but their wire-level shape is deferred to v0.2.
- **Projection budgets are constraints, not suggestions.** Overview ≤ 280 chars; structure ≤ 800; detail unbounded. If a generator can't fit, the intent probably needs re-decomposing — the budget is a diagnostic.

## Operating conventions

The production code lives in `integral-ui/` (Vite + React 19 + TypeScript strict + zod 4 + Vitest + RTL). The Babel-in-browser JSX prototype in `ccdesign/` is the visual design reference and is *not* part of the production build.

- **Build / test commands** (run from `integral-ui/`):
  - `npm run dev` — Vite dev server
  - `npm run build` — production build (typecheck + bundle)
  - `npm run test:run` — Vitest single run (use this for CI / hooks)
  - `npm run test:e2e` — Playwright E2E (auto-starts dev server)
  - `npm run typecheck` — strict TS check, no emit
- **Schema layer**: `integral-ui/src/schema/zod.ts` is the source of truth. zod schemas first; TS types inferred via `z.infer`. Adding a new schema field is a single edit there; types and validators stay in sync.
- **Schema_version literal**: every `Intent` / `IntentState` MUST carry `schema_version: '0.1.0'`. The constant lives at `integral-ui/src/schema/zod.ts:SCHEMA_VERSION`. Adapters MUST reject objects with mismatched versions (enforced by `IntentSchema`).
- **Fixture discipline**: `integral-ui/src/fixtures/workspace.ts` is the falsification fixture — must validate against `WorkspaceSchema` for every `IntentKind` v0.1 supports. Adding a kind in v0.2 means adding an example here; the test in `src/schema/__tests__/validation.test.ts` will fail until the schema accepts it.
- **Path alias**: `@/*` → `integral-ui/src/*`. Use it for cross-module imports.
- **Adapters location** (when they land): `integral-ui/src/adapters/{nous,paper,coral,feature}/` — each produces typed `Intent` + `IntentState` + `EvidenceLink` arrays from external state.
- **The projection generator runs in-process for v0.1.** Whether it splits into a separate service is a v0.2 question. `read-at-zoom-level` is a function, not a network call, in v0.1.
- **The UI is web** for v0.1. Terminal / other surfaces are out of scope until the web surfaces stabilize.

## Test discipline

- **Schema layer (now)**: zod runtime validators + Vitest. Tests live in `integral-ui/src/schema/__tests__/`. Cover acceptance of valid fixtures, rejection of malformed shapes, kind/extension consistency, schema_version literal enforcement.
- **Component layer (when surfaces land)**: React Testing Library — assert user-visible behavior, never implementation details. Behavioral tests for: zoom toggle changes content, proposal accept fires the right callback, activity event scrolls to target, shaping commit gates correctly.
- **E2E (Playwright)**: installed; smoke test at `integral-ui/e2e/scaffold.spec.ts` proves the schema-validation + atom-rendering pipeline works in a real browser. Add one critical-flow test per surface as they land.
- **Visual regression**: Playwright screenshot diffs against the `ccdesign/` baseline so the cognitive-instrument aesthetic doesn't silently drift to Linear/Jira shape during refactors. Land with the first surface.
- **LLM isolation**: tests **never** call real LLMs. The projection engine accepts an injected `LLMClient`; tests inject a mock that returns canned strings. The real Anthropic / OpenAI clients live in `vite-plugin-nous-adapter/` (outside `src/`) so they're unreachable from the Vitest runner by construction. Any test that wants to verify LLM behavior against a real model is a **smoke test** — manual, runs outside `npm test*`, documented as such.
- **Skills to invoke**:
  - `superpowers:test-driven-development` — when implementing logic with correctness criteria (schema validators, projection budget enforcers, adapter readers).
  - `superpowers:verification-before-completion` — before claiming any milestone done; run `npm run test:run` + `npm run typecheck` + `npm run build` and report exit codes, not assertions.
  - `frontend-design:frontend-design` — when iterating on visuals for a new surface; not for scaffolding or schema work.
  - `senior-frontend:senior-frontend` — at PR-review time for UI code.

## Resolved surface decisions (closed before Map view starts)

These were the four open questions from the kinetic review of `ccdesign/`. They're closed now so atom + surface work doesn't have to re-litigate them inline.

1. **Zoom semantics — what changes between overview / structure / detail.**
   - `overview` = card-shaped projection (~280 char budget) suitable for the Map view's tree cards. Per-kind structural badges (e.g., gate status, best score, claim count) are visible; children are *not* enumerated; figures render only when their data threshold is met.
   - `structure` = the Detail surface's daily-use body. Children list with kind-specialized rendering (Nous: iteration rows + hypothesis bars; Coral: population scatter; Paper: section/claim cards; Feature: PR rows). Evidence edges + knowledge corpus visible. Cross-tree edges shown as outgoing/incoming columns. (~800 char prose budget for any generated summary text.)
   - `detail` = full extension data + complete history + every evidence link rendered. No content budget. Reached on demand via the zoom toggle, not the default.
   - Toggle behaviour: clicking the toggle changes the *body* — not just the toggle's highlighted segment. The mock's decorative toggle was a bug; the surface implementation must wire `zoom` through to `ChildrenSection` and gate per-kind richness on it.

2. **Activity strip — workspace + per-intent both visible, or collapse one.**
   - Both visible by default at ≥1280px viewport width.
   - At < 1280px the *workspace* strip auto-collapses to a vertical icon rail (toggle to expand); the *per-intent* strip stays expanded inside the Detail surface body.
   - Visual differentiation: workspace strip uses `var(--paper-2)` background with a subtle left border; per-intent strip uses `var(--paper)` and lives inside the main column's grid cell. This keeps them legible as two distinct surfaces even when both are visible.

3. **"Awaiting me" predicate — proposal-only or include CI-failing-on-my-PR.**
   - Includes: (a) `Status: gated` AND `awaiting_party === me`; OR (b) any open proposal in the activity log assigned to me; OR (c) for `feature-pr` intents I authored, `ci_status === 'failing'` OR `review_status === 'changes-requested'`.
   - Rationale: a PR with failing CI on a feature campaign I own is functionally a queue item — the human needs to act before the agent can advance. Excluding it would create a gap where critical signal lives but the awaiting-me filter doesn't surface it.
   - Implementation: a typed `isAwaitingMe(intent, state, me)` predicate in `src/lib/queue.ts` (lands with the Map surface).

4. **LeftRail tree-list click behavior.**
   - Clicks on the active-trees rail items navigate to the corresponding Detail surface, same as clicking the tree's card in the Map view. The mock's empty `onClick` was a bug.
   - Hover affordance: subtle `var(--paper)` background + `var(--line)` border, matching the rail's selected-item style.

These decisions are normative for the surfaces. Changes require updating this section explicitly.

---

## What NOT to do without explicit reconfirmation

These are decisions that future sessions will be tempted to revisit. They are not closed because they're certain — they're closed because the rationale is recorded in the design docs and our conversation history, and re-litigating them silently wastes effort.

- **Do not change v0.1 schema fields without proper version handling.** Optional additions stay at the current minor; everything else bumps to a new file.
- **Do not add a fifth intent kind to v0.1.** Even if the new kind seems to fit. Promote to v0.2 first.
- **Do not expand the projection budgets** (≤280 / ≤800 / unbounded) without a measured reason from observed adapter output.
- **Do not auto-generate tags, shaping templates, typed clarification taxonomies, or stale-draft GC** in v0.1. All deferred to v0.2.
- **Do not conflate (1) Nous + (3) Coral as "the research workflow."** They are tightly coupled in domain but structurally distinct (principles vs. scored optimization). Treating them as one would overfit the schema and was rejected explicitly.
- **Do not turn Integral into the source of truth for state another system owns.** Adapters read external anchors; they do not duplicate or replace them.
- **Do not collapse `Intent` and `IntentState` into one object.** The separation is what makes audit logs clean; merging them is a foot-gun.
- **Do not embed `EvidenceLink`s inside intent extensions.** They live in a separate edge collection so cross-cutting queries don't traverse intent objects.
- **Do not let the four UX surfaces drift in chrome.** Per-kind specialization is allowed in the structural body content; the surrounding chrome (header, activity strip, navigation) stays uniform across kinds. This is what keeps the substrate identity intact.
- **Do not propose `fork` / `merge` / `reframe` from agents in v0.1.** Agents probe; humans (or agents at human direction) restructure. Suggestions are v0.2.

## Conversation history note

The v0.1 design was developed in conversation across these decision points (in order): catalog v1 → v2 with intent-axis re-cut → shape question (platform / protocol / vertical) settled on protocol → four-intent generalizability test → schema → UX sketch → visual navigation views → filter/tag/figure scope → shaping mode → this CLAUDE.md. If a future session needs the rationale for a specific decision, the design docs capture the *what* and *why*; the reasoning chain that led to *why this and not the alternatives* is in conversation history.
