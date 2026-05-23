# Integral — project context

## Project phase

Integral is at **v0.1 prototype, all five surfaces landed**. Schema + atom + AppHeader + Landing + Map + Detail + Workspace Activity Strip + Shaping + visual regression baseline all green. Adapters and the typed activity model are the v0.2 roadmap. Three canonical design documents are authoritative for everything below. Read them before writing or proposing changes.

## Current state (as of last session)

- **Schema layer**: `integral-ui/src/schema/zod.ts` — 9 IntentKinds, discriminated `TypeExtension` union, `KnowledgeRef` discriminated by scope, `WorkspaceSchema` enforces 1:1 Intent↔IntentState bijection.
- **Atom layer**: `integral-ui/src/components/atoms/` — 10 atoms (StatusDot, Chip, IdPill, KindBadge, PartyChip, Tag, SectionLabel, Sparkline, HypothesisBars, ScoreGauge, ZoomToggle). Each owns a CSS Module + behavioral tests. Genre = Karpathy aesthetic (warm paper, cool ink, single-amber signal, IBM Plex stack).
- **App chrome**: `integral-ui/src/components/AppHeader/` — sticky-top `AppHeader` + `IntegralGlyph` SVG brand mark (hand-tuned hook, scales for landing). Schema-version chip reads `SCHEMA_VERSION` literal. Reversibility chip is display-only with `title="v0.2 — audit log"`. Breadcrumbs ellipsis-truncate below 768px. `data-surface={view kind}` on root. Hidden on Landing.
- **Landing surface**: `integral-ui/src/surfaces/Landing/` — instrument-style first paint. Big `IntegralGlyph` (140px) + "Integral" wordmark + tagline ("intent management for humans + agents") + status peek (`N active · M awaiting you · last activity Xm ago`, derived from validated workspace) + auto-focused `enter →` button. Once-per-session via `sessionStorage['integral.landing-seen']`; subsequent navigation back from Map skips Landing.
- **Map surface**: `integral-ui/src/surfaces/Map/` — `MapSurface` + `TreeCard` molecule + `isAwaitingMe` predicate. Renders the four root campaigns; click-to-detail navigates to the Detail surface.
- **Detail surface**: `integral-ui/src/surfaces/Detail/` — `DetailSurface` composes `DetailHeader` (uniform across kinds), `ChildrenSection` (per-kind specialized body, zoom-aware via `intent.extension.kind` narrowing), `EvidenceEdges` (outgoing/incoming over `workspace.evidence_links`, with cross-tree click-to-navigate), `KnowledgeRefsSection` (refs grouped by scope; inherited refs surface their `inherited_from`), `IntentActivityStrip` (v0.1 placeholder over `state.history` + synthetic last-advanced marker). The zoom toggle drives body content per the resolved decision — overview collapses to a count, structure shows children list + extension preview, detail adds full extension data.
- **Workspace Activity Strip**: `integral-ui/src/surfaces/Activity/WorkspaceActivityStrip.tsx` — right-side strip on Map and Detail at ≥1280px, stacks below at narrower widths. Three buckets (critical/notable/routine); routine collapsed by default with a `▸ N` toggle. Filter chip toggles `notable+` / `routine+`. Hovering a row writes the target intent ID into `useHoveredIntent()` (context-based, no global store) so Map's `TreeCard` preview-pulses via `data-pulse` attribute. Event derivation lives in `src/lib/activity.ts` with a schema-exhaustive significance heuristic (CI flip on `feature-pr` = critical; gate-resolved = notable; new best score on coral = notable; else routine). Fixture has 7 representative history entries.
- **Shaping surface**: `integral-ui/src/surfaces/Shaping/` — two-pane shaping mode for `Status: 'draft'` intents. `ShapingDialog` (left) renders scripted clarification turns; `IntentDraftPane` (right) renders the live typed draft with `⚠ pending` chips on unresolved fields per a hand-authored resolved-set in `src/fixtures/shaping.ts`. Restructure buttons (`decompose`/`fork`/`merge`/`reframe`) render inert with `title="v0.2"` and click logs to console. `commit-to-active` is gated on `requiredFields.every(f => resolvedFields.has(f))`; click transitions the draft state from `draft` → `active` in the in-memory workspace (fixture file is never rewritten). Map TreeCard click routes drafts here, non-drafts to Detail. Two draft fixtures: a fully-resolved Nous campaign (commit enabled) and a partial Coral optimization (commit disabled, pending chips visible).
- **Visual regression**: `integral-ui/e2e/visual/` — Playwright screenshot baselines locking the v0.1 chrome. 15 PNGs covering Landing, Map (default + awaiting), Detail per-kind × 9 + nous-iteration at detail zoom, Activity Strip, Shaping. 1440×900 @ 2× DPR, `maxDiffPixelRatio: 0.01`, animations disabled, font-load gated. `npm run test:e2e:visual` diffs; `npm run test:e2e:visual:update` regenerates. Two Playwright projects (`chromium` for behavioral, `visual` for diffs) keep visual runs out of the default test cycle.
- **Tests**: 272 Vitest tests + 13 Playwright behavioral E2E + 15 Playwright visual baselines; all passing; TS strict clean; build clean.
- **Live dev**: `npm run dev` from `integral-ui/` → `http://localhost:5173/`.

## Next milestone: Adapter #1 (Nous campaign)

Per the four-adapter validation plan in § "Implementation order", the next milestone is the **Nous campaign adapter** — read existing campaign files from disk and produce typed `Intent` + `IntentState` arrays that hydrate the v0.1 surfaces. File-shaped, read-only, smallest path to a real-data signal against a canonical workflow.

The v0.1 chrome stack (Landing + Header + Map + Detail + Activity + Shaping) is stable enough to consume real adapter output without surface drift; visual baselines in `e2e/visual/` lock the chrome so adapter-induced data changes don't silently change the look. Per `intents-and-harnesses.md` and `intent-schema-v0.1.md`, the adapter should land at `integral-ui/src/adapters/nous/` and expose a `read-at-zoom-level(intentId, zoom) → Projection` operation as the v0.1-normative surface.

## Canonical references

These files are the source of truth. This CLAUDE.md does not summarize them; it points at them and captures only what is not in them.

- `intents-and-harnesses.md` (v2) — the catalog of LLM-harness categories and the intent-aware abstractions Integral provides (intent as first-class object; collaboration mode; knowledge corpus; work state).
- `intent-schema-v0.1.md` — the typed object model: `Intent`, `IntentState`, `KnowledgeRef`, `EvidenceLink`, four `IntentKind`s and their extensions, shaping operations, non-goals.
- `intent-ux-sketch-v0.1.md` — the four UX surfaces (Map / Detail / Activity / Shaping), figure-rendering rules, filter/group/tag scope, design questions left open.

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

The plan is to validate the v0.1 schema against four adapters, in this order, with each adapter's *minimum* form (just enough to prove the intent shape fits — not a full integration).

1. **Nous campaign.** Read existing campaign files; describe campaign + iteration + experiment as typed objects; render at three zoom levels. File-shaped, read-only, smallest path to a real signal against a canonical workflow.
2. **Paper writing.** Read a markdown draft + a bibtex file + (where present) Nous campaigns the paper draws claims from; describe paper + sections + claims with `EvidenceLink`s pointing at upstream evidence. Lowest external-integration cost; stresses provenance chains in a fundamentally different way.
3. **Coral optimization.** Read `.coral/attempts/*.json` and `.coral/notes/`; describe campaign + attempts + worktree-state; render scored attempts in a population view. Tests competitive parallelism and the schema's capacity for many sibling child intents.
4. **Feature development in git.** Read git log + GitHub PR API + repo-scoped CLAUDE.md; describe feature campaign with PRs as child intents and repo conventions as a *scoped* knowledge corpus. Most expensive integration; runs last so the schema lessons from the prior three protect this adapter from being rebuilt.

The temptation to do (4) earlier is real and should be resisted — its integration cost is high, and the schema lessons from (1)+(2)+(3) save it from being rebuilt twice.

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
