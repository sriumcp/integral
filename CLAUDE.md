# Integral — project context

## Project phase

Integral is at **v0.2.0 in progress** — the substrate just shed its demo skin (no fixture, configurable identity, no reversibility placeholder) and the schema bumped to 0.2.0 alongside the cut. v0.1 shipped the Chrome stack + typed `Operation` log + multi-source data plane + three real adapters (Nous full round-trip; Coral and GitHub-issues read-only) + filter/group/sort.

**v0.2.0 schema bump (2026-05-29):** the schema now supports five `IntentKind`s (`nous-campaign`, `nous-iteration`, `coral-optimization`, `coral-attempt`, `feature-campaign`) — down from nine. The four kinds dropped (`paper-campaign`, `paper-section`, `paper-claim`, `feature-pr`) had no adapter and survived only via the bundled fixture; both went away together. Coverage for paper-* returns when the paper adapter ships; coverage for `feature-pr` returns when full feature-dev (PR/CI/review reading) ships. See `intent-schema-v0.2.md` § "What v0.2.0 removed."

**v0.2 + v0.3 scope decision (2026-05-27):** v0.2 focuses exclusively on the **Nous + Paper-authoring axis**. All Coral and GitHub-issues / feature-development work is deferred to **v0.3+**. The existing read-only Coral + GitHub adapters stay shipped; they don't get extended. This concentrates substrate energy on the research-paper authoring loop (cross-tree story: paper-claim → nous-iteration via `EvidenceLink` once paper adapter lands).

Current state of shipped components is derivable from `git log` and the code; **don't duplicate it here**. The live tracker is `roadmap.md`.

## Canonical references

These files are the source of truth. This CLAUDE.md does not summarize them; it points at them and captures only what is not in them.

- `intents-and-harnesses.md` (v2) — the catalog of LLM-harness categories and the intent-aware abstractions Integral provides.
- `intent-schema-v0.2.md` — **current schema source of truth.** The typed object model: `Intent`, `IntentState`, `KnowledgeRef`, `EvidenceLink`, five `IntentKind`s and their extensions, shaping operations, non-goals.
- `intent-schema-v0.1.md` — historical, superseded by v0.2.0. Kept on disk so adapters tagged `0.1.0` (none in this repo today, but external readers might reference it) can still find their grammar.
- `intent-ux-sketch-v0.1.md` — the four UX surfaces (Map / Detail / Activity / Shaping), figure-rendering rules, filter/group/tag scope, design questions left open. Surface decisions are version-stable across v0.1 → v0.2; this file applies as-is.
- `semantics-v0.1.md` — the semantic model: how typed objects acquire meaning across the five layers. Catalogs S-1..S-9 components and C-1..C-8 couplings. Names what v0.1 commits to vs. what is later work; conclusions are still load-bearing under v0.2.0.
- `roadmap.md` — **authoritative live tracker.** Per-item acceptance criteria, stop conditions, v0.2 → v0.3 plan.
- `gaps.md` — schema-fit issues uncovered while sizing adapters; v0.3+ candidates only, do not silently fix.
- `goals.md` — chrome polish spec (done); kept for reference.

Cross-references between these documents are normative. If a code change requires changing one, check whether the others need to follow.

## Core decisions (inherited by every session)

- **Protocol-first, not platform.** Integral describes intents that other harnesses produce; it does not host execution. Adapters read existing-system state through `ExternalAnchor`s.
- **Five intent kinds in v0.2.0.** `nous-campaign`, `nous-iteration`, `coral-optimization`, `coral-attempt`, `feature-campaign`. The four kinds present in v0.1 (`paper-campaign`, `paper-section`, `paper-claim`, `feature-pr`) were removed when the fixture was deleted; they return when their adapters ship in a future bump.
- **State is separated from intent.** Independent versioning of declaration vs. state is load-bearing for the audit log. Don't collapse them.
- **External anchors, not mirrors.** When another system owns authoritative state (git, GitHub, filesystem, bibtex), point at it via `ExternalAnchor`. Don't try to be the source of truth.
- **`EvidenceLink` is the unifying primitive.** It's why the kinds aren't parallel schemas. Lives in a separate edge collection, not embedded in intents.
- **Default zoom is `structure`.** Map is for orientation; detail is for inspection; structure is the daily-use level. The projection layer must do this best.
- **Figures are conditional on data threshold.** See `intent-ux-sketch-v0.1.md` § Figures: conditional, not mandatory. Empty/young intents stay clean.
- **Tags are free-form, user-controlled.** System-generated tags are deferred.
- **Bi-actor by default.** Every operation accepts either a human or an agent. The schema does not privilege one.
- **Shaping is a typed phase with mutable declaration.** While `Status == draft`, declaration fields are mutable; shaping operations (refine / decompose / fork / merge / reframe / probe / clarify / commit) are first-class. On `commit`, declaration freezes.
- **Identity (the `me` Party) is configurable, not hardcoded.** `integral.config.json`'s optional `me: { id, display_name }` field, falling back to `os.userInfo().username` on the server. Never bake user identity into source files. See `src/lib/me.ts` for the boundary helper that lifts the narrow shape into a `Party` with `kind: 'human'`.
- **Tests never call real LLMs (NON-NEGOTIABLE).** Every test layer mocks LLMs. Tests must not spend token budget. New code paths that introduce LLM calls land with a mock injection seam or they don't land. Real LLM clients live in `vite-plugin-nous-adapter/` (outside `src/`); the architectural barrier is load-bearing. See `## Test discipline` for the audit-grep checklist and the smoke-test escape hatch.

## Meta-rules for schema/UX evolution

- **The schema is pre-stable.** Every breaking change bumps the minor by creating a new file: v0.1.0 → v0.2.0 created `intent-schema-v0.2.md` alongside `intent-schema-v0.1.md`. Old adapters keep referencing the version they were built against. We do not maintain backward compatibility before 1.0.
- **Optional additive fields do not bump the version.** Adding `tags: list[string]?` was a v0.1.0 amendment, not a break. Note such additions inline in the schema where they were made. Enum-value additions on string-shaped fields also stay at the current minor (e.g. `'github-repo'` was added to `ExternalAnchorKindSchema` as a v0.1.0 amendment and survives in v0.2.0).
- **Removing kinds, fields, or enum values IS a bump.** v0.2.0 removed four kinds and a handful of enums (`CIStatusSchema`, `ReviewStatusSchema`, `PaperSectionStatusSchema`, `ClaimCitationStatusSchema`); each removal was a typed break that flowed through TS until every consumer was updated. The bump is non-negotiable for removals.
- **The `schema_version` field is authoritative.** Adapters MUST reject objects whose version they don't understand. Don't make adapters tolerant of unknown versions.
- **Non-goals lists are normative.** Items in the `## Non-goals` sections are deliberately deferred, not bugs. Do not silently implement them. If a non-goal needs to land, promote it explicitly with a version bump.
- **Open design questions are not closed by code.** If you start implementing against an open question, surface that you're making a choice and update the question's status in the relevant doc.

## Implementation order

**Authoritative source: `roadmap.md`.** It owns the order, per-item acceptance criteria, and the v0.2 → v0.3 promotion plan. Don't re-derive it here.

v0.2 narrows to the Nous + Paper-authoring axis. v0.3+ resumes Coral extension + full feature-dev (the latter brings `feature-pr` back).

## Adapter conventions

- **Transport / interpreter split.** Each adapter has an abstract transport (`NousSource` / `CoralSource` / `GitHubIssuesSource`) and a pure interpreter (`buildXWorkspace(source)`). Filesystem and network transports live in `vite-plugin-nous-adapter/`; interpreters are browser-safe in `src/adapters/<kind>/`. Adding a new transport (S3, HTTP) must not require changing the interpreter.
- **File-shaped first.** Initial adapters read filesystem state, not APIs. Networked transports (e.g. `GhCliIssuesSource`) come second once the schema is stable. This lets us ship in days against real workflows.
- **`read-at-zoom-level` is the one normative operation.** Given an `IntentId` and a `ZoomLevel`, return the corresponding `Projection`. This is the load-bearing operation for the navigation surface.
- **Other operations are adapter-defined.** `declare` / `refine` / `delegate` / `advance` / `gate` / `propose-transition` / `accept-proposal` / `satisfy` / `revoke` / shaping operations are typed concepts but their wire-level shape is deferred.
- **Projection budgets are constraints, not suggestions.** Overview ≤ 280 chars; structure ≤ 800; detail unbounded. If a generator can't fit, the intent probably needs re-decomposing — the budget is a diagnostic.
- **Lossy mappings recorded in `gaps.md`.** Any field the adapter drops or coerces is logged as a `G-<adapter>-<n>` entry. Promotion to a schema fix happens at a future bump, not silently.
- **Provenance.** `provenance.source = '<adapter id>'` on every emitted intent. Adapter-synthesized human holders use `{id: 'unknown-human', display_name: '(unknown)'}` (see `gaps.md` § G-N-13) — never the configured `me`, which would silently misattribute someone else's campaigns.

## Operating conventions

The production code lives in `integral-ui/` (Vite + React 19 + TypeScript strict + zod 4 + Vitest + RTL). The Babel-in-browser JSX prototype in `ccdesign/` is the visual design reference and is *not* part of the production build.

- **Build / test commands** (run from `integral-ui/`):
  - `npm run dev` — Vite dev server
  - `npm run build` — production build (typecheck + bundle)
  - `npm run test:run` — Vitest single run (use this for CI / hooks)
  - `npm run test:e2e` — Playwright behavioral E2E (auto-starts dev server)
  - `npm run typecheck` — strict TS check, no emit
  - **None of these commands consume LLM tokens.** All test layers run with mocked LLMs.
- **Schema layer**: `integral-ui/src/schema/zod.ts` is the source of truth. zod schemas first; TS types inferred via `z.infer`. Adding a new schema field is a single edit there; types and validators stay in sync.
- **Schema_version literal**: every `Intent` / `IntentState` MUST carry `schema_version: '0.2.0'`. The constant lives at `integral-ui/src/schema/zod.ts:SCHEMA_VERSION`. Adapters MUST reject objects with mismatched versions (enforced by `IntentSchema`).
- **Test seed data**: `integral-ui/src/test/seed-workspace.ts` and `seed-shaping.ts` provide deterministic typed test data for unit + behavioral tests. **Test scaffolding only — never loaded at runtime.** Lives under `src/test/` (not `src/fixtures/`) because production reads adapter output, not bundled fixtures. The pre-v0.2.0 fixture path is gone; if you need to add a kind back to seed data, also add it to the schema (which means a version bump).
- **Path alias**: `@/*` → `integral-ui/src/*`. Use it for cross-module imports.
- **Adapters location**: `integral-ui/src/adapters/{nous,coral,feature}/` (browser-safe interpreters) + `integral-ui/vite-plugin-nous-adapter/` (Node-only transports + middleware + handlers).
- **`vite-plugin-nous-adapter/` is the architectural barrier.** Despite the historical name, it houses *all* server-side concerns — every adapter's transport, every `/api/*` handler, the LLM clients, `node:fs` and `node:child_process` calls. Real I/O and LLM clients NEVER live in `src/` — not even type-only imports that pull module side-effects.
- **The projection generator runs in-process.** Whether it splits into a separate service is a future question. `read-at-zoom-level` is a function, not a network call.
- **The UI is web** for now. Terminal / other surfaces are out of scope until the web surfaces stabilize.

## Test discipline

- **Schema layer**: zod runtime validators + Vitest. Tests live in `integral-ui/src/schema/__tests__/`. Cover acceptance of valid seed data, rejection of malformed shapes, kind/extension consistency, schema_version literal enforcement.
- **Component layer**: React Testing Library — assert user-visible behavior, never implementation details. Behavioral tests for: zoom toggle changes content, proposal accept fires the right callback, activity event scrolls to target, shaping commit gates correctly.
- **E2E (Playwright)**: behavioral E2E in `e2e/`; one critical-flow test per surface that doesn't depend on specific adapter data shape (the substrate runs against real adapter sources, which are non-deterministic). Falsification-style stop-condition tests (preflight, etc.) self-stage their inputs (tmpdirs, real-filesystem probes).
- **Visual regression**: removed in v0.2.0 along with the fixture (every visual baseline depended on `?sources=fixture` for deterministic data). Coverage returns when a deterministic data-seeding mechanism ships, OR when the paper / feature-pr adapters reintroduce kinds we want pixel-locked chrome for.
- **LLM isolation (NON-NEGOTIABLE)**: tests **never** call real LLMs — at any level. Unit, integration, e2e — all three layers mock LLMs. **Tests must never spend token budget.** This is an operating principle, not a guideline.
  - The projection engine accepts an injected `LLMClient`; tests inject a mock that returns canned strings.
  - The shape handler is exercised by tests via the same injected-client seam — never by hitting `/api/shape` against a live server.
  - The real Anthropic / OpenAI clients live in `vite-plugin-nous-adapter/` (outside `src/`) so they're **architecturally unreachable** from the Vitest runner by construction. **Treat this barrier as load-bearing — never `import` a real client into `src/`.**
  - Any test that wants to verify LLM behavior against a real model is a **smoke test** — manual, runs outside `npm test*`, never picked up by the canonical glob.
  - **New code paths that introduce LLM calls MUST land alongside a mock injection seam.** If you can't make the seam, the design is wrong — refactor before merging.
  - **Audit grep** before claiming verification:
    ```
    grep -rln "OPENAI_API_KEY\|ANTHROPIC_API_KEY\|ANTHROPIC_AUTH_TOKEN\|tryCreateLLMClient\|api.openai.com\|api.anthropic.com\|@anthropic-ai\|from 'openai'" \
      --include="*.test.ts" --include="*.test.tsx" --include="*.spec.ts" --include="*.spec.tsx"
    ```
    Must return zero hits.
- **Skills to invoke**:
  - `superpowers:test-driven-development` — when implementing logic with correctness criteria.
  - `superpowers:verification-before-completion` — before claiming any milestone done; report exit codes, not assertions.
  - `frontend-design:frontend-design` — when iterating on visuals for a new surface.
  - `senior-frontend:senior-frontend` — at PR-review time for UI code.

## Patterns for new endpoints, hooks, and UI extensions

Load-bearing patterns the codebase has converged on. Deviations should be motivated by the limitation, not by drift. Read the cited reference files when implementing.

### A new `/api/...` endpoint that does I/O

Mirror the writeback / preflight / shape / me pattern. Three layers:

1. **Pure logic in `src/lib/<feature>.ts`** — accepts a typed `Input` + an injected `Deps` interface for I/O. Returns a typed result. Never throws on dep failure; turn failures into typed result fields. Heavy unit-testing (with `vi.fn()` mocks of `Deps`) lives next to the file. Reference: `src/lib/nous-preflight.ts`.
2. **Server-side handler in `vite-plugin-nous-adapter/<feature>-handler.ts`** — Zod-validates the wire request, resolves the source via `ConfiguredSource[]`, constructs real `Deps` from `node:fs` / `node:child_process`, calls the pure layer. Optional `deps?: Deps` parameter makes the handler unit-testable. Reference: `vite-plugin-nous-adapter/preflight-handler.ts`.
3. **Middleware wiring in `vite-plugin-nous-adapter/index.ts`** — `server.middlewares.use('/api/...')` reads JSON via `readJsonBody`, calls the handler, returns 400 / 404 / 409 / 500 as appropriate.

The vitest config picks up `vite-plugin-nous-adapter/**/*.test.ts` so handler tests sit next to handlers. Don't write a handler test that imports the real I/O — pass deps via the optional parameter. Reference: `preflight-handler.test.ts`.

### A new browser hook that calls an endpoint

Mirror `usePreflight.ts`. Conventions:

- **Debounce input changes with `setTimeout`** (default 400ms), not `useEffect` retrigger storms. Pair with a sequence-number ref. Guard the seq on **every** `setState` inside the timer callback — including the `loading` flip — so a debounce-cancel doesn't flicker the spinner.
- **Return a discriminated union over phase**, not a `{loading, checks, error}` triple. Canonical shape: `{ phase: 'idle' } | { phase: 'loading'; previous } | { phase: 'ok'; checks } | { phase: 'error'; error; previous }` — admits exactly the 4 valid states and forces consumers to check `phase === 'ok'` before trusting data (fail-closed by construction). Carry `previous` through `loading`/`error` for last-known indicators, but **never** consult it for gating decisions.
- **Short-circuit on empty input** so the hook stays inert when there's nothing to fetch.
- **Validate response shape on the wire boundary.** Throw early in `.then` so the catch sets `phase: 'error'`.
- **Mock `globalThis.fetch` in tests** with `vi.fn().mockResolvedValue(...)`. Use `vi.useFakeTimers()` + `vi.advanceTimersByTimeAsync()` to drive the debounce — **never `waitFor`** with fake timers (it polls real time and deadlocks).

### Per-field UI indicators

Mirror the `PreflightIndicator` pattern in `WritebackForm.tsx`:

- Render `<span data-testid="<feature>-<key>" data-preflight-status="..." title="..." aria-label="...">` so behavioral tests assert the data-* contract, not class names or text.
- Color via `data-status` selectors in CSS module: `--sage` for ok, `--rose` for fail, `--mute` for warn. **Never use `--amber`** for errors — it's reserved for "current/active/awaiting your action" per the genre commitment.
- Glyph as plain text (`✓` / `!` / `✗`), not SVG.
- The atom returns `null` when checks haven't settled or the named check isn't present. **Never render an unsettled state** — invisible during initial fetch, not blocked.

### Commit-button gates that depend on async signals

**Fail-closed by default.** A gate that depends on an async signal must require positive `phase === 'ok'` evidence — never read "absence of failures" as success. Canonical shape (`ShapingSurface.tsx`):

```ts
const preflightActive = writebackActive
const preflightOk =
  !preflightActive ||
  (preflight.phase === 'ok' &&
    !preflight.checks.some(c => c.status === 'fail'))
const commitEnabled = allResolved && writebackReady && !submitting && !llmLoading && preflightOk
```

- Each clause is a single boolean. The button's `aria-label` enumerates the *first* failing clause via a precedence-ordered helper.
- Tests must verify all four phases gate correctly: `idle`, `loading`, `error`, `ok-with-failures`.

### Render gates on async-resolved props

When a render needs an async-resolved value to be correct (not just for cosmetics), gate the render until the value resolves — never render with a placeholder. The Map's `awaiting-recency` sort reads `me.id`; rendering once with `me={id:'user'}` then re-rendering after `fetchMe()` resolves caused a draft to mis-sort to the top of the list. The fix: `App.tsx` uses `me: Party | null = null` and gates surface render on `me !== null` alongside the workspace-loading gate. Same fail-closed discipline as commit gates: positive evidence > absence of failure.

### Real-I/O deps in server handlers

The deps factory must distinguish "expected absence" (ENOENT for paths; non-zero exit for `which`-style probes) from "unexpected failure" (EACCES, ELOOP, EROFS, timeout):

- **Expected absence resolves to `false`.** The pure check engine treats this as a `fail` or `warn` with a generic message.
- **Unexpected failures THROW.** The pure engine's per-check `try/catch` then surfaces them with the *original error message* preserved. Bare `catch {}` blocks that swallow distinct errno classes are forbidden.
- **Paths that demand a directory** must check `stat.isDirectory()`, not `isFile() || isDirectory()`. A regular file at the path is NOT a valid target.
- **Subprocess probes** must distinguish ENOENT/non-zero-exit ("not found" → false) from timeout/SIGTERM (ambiguous → throw).

Test the dep contract with real temp directories under `os.tmpdir()`. Reference: `preflight-handler.test.ts` "defaultDeps — real filesystem probes".

### Tests for surfaces that mount async hooks

If a surface mounts a hook that fires fetch on mount (or after a debounce), add a `beforeEach` that stubs `globalThis.fetch` with a no-op-success response. Tests that need a specific response override the stub locally.

### Verification before claiming done

Run all four canonical commands from `integral-ui/`:

```
npm run typecheck    # strict TS, must exit 0
npm run test:run     # all vitest, must exit 0
npm run test:e2e     # behavioral E2E, must exit 0
npm run build        # production bundle, must exit 0
```

Plus the LLM-discipline audit grep (see `## Test discipline`). Must return zero hits.

## Resolved surface decisions

These were the four open questions from the kinetic review of `ccdesign/`. Closed so atom + surface work doesn't have to re-litigate them inline.

1. **Zoom semantics — what changes between overview / structure / detail.**
   - `overview` = card-shaped projection (~280 char budget) for Map tree cards. Per-kind structural badges visible; children NOT enumerated; figures render only when their data threshold is met.
   - `structure` = the Detail surface's daily-use body. Children list with kind-specialized rendering. Evidence edges + knowledge corpus visible. Cross-tree edges shown as outgoing/incoming columns. (~800 char prose budget for any generated summary text.)
   - `detail` = full extension data + complete history + every evidence link rendered. No content budget. Reached on demand.
   - Toggle behaviour: clicking the toggle changes the *body*, not just the toggle's highlighted segment.

2. **Activity strip — workspace + per-intent both visible, or collapse one.**
   - Both visible by default at ≥1280px viewport width.
   - At < 1280px the *workspace* strip auto-collapses to a vertical icon rail; the *per-intent* strip stays expanded inside the Detail surface body.
   - Visual differentiation: workspace strip uses `var(--paper-2)` background with subtle left border; per-intent strip uses `var(--paper)` and lives inside the main column's grid cell.

3. **"Awaiting me" predicate.**
   - v0.2.0 includes: (a) `Status: gated` AND `awaiting_party === me`; OR (b) any open proposal in the activity log assigned to me (placeholder — the proposal queue isn't yet in the schema).
   - The v0.1 third branch (CI-failing on a `feature-pr` I authored) was removed when `feature-pr` was removed in v0.2.0. It returns when full feature-dev ships in v0.3+.
   - Implementation: typed `isAwaitingMe(intent, state, me)` predicate in `src/lib/queue.ts`.

4. **LeftRail tree-list click behavior.**
   - Clicks on active-trees rail items navigate to the Detail surface, same as clicking the tree's card in Map.
   - Hover affordance: subtle `var(--paper)` background + `var(--line)` border.

These decisions are normative for the surfaces. Changes require updating this section explicitly.

---

## What NOT to do without explicit reconfirmation

These decisions are not closed because they're certain — they're closed because the rationale is recorded in the design docs and our conversation history, and re-litigating them silently wastes effort.

- **Do not change schema fields without proper version handling.** Optional additions / enum-value additions on string-shaped fields stay at the current minor; everything else (including removals) bumps to a new file.
- **Do not add new intent kinds without bumping the schema.** Even if the new kind seems to fit. Promote to a new schema file first.
- **Do not expand the projection budgets** (≤280 / ≤800 / unbounded) without a measured reason from observed adapter output.
- **Do not auto-generate tags, shaping templates, typed clarification taxonomies, or stale-draft GC** without explicit promotion.
- **Do not conflate Nous + Coral as "the research workflow."** They are tightly coupled in domain but structurally distinct (principles vs. scored optimization). Treating them as one would overfit the schema and was rejected explicitly.
- **Do not turn Integral into the source of truth for state another system owns.** Adapters read external anchors; they do not duplicate or replace them.
- **Do not collapse `Intent` and `IntentState` into one object.** The separation is what makes audit logs clean; merging them is a foot-gun.
- **Do not embed `EvidenceLink`s inside intent extensions.** They live in a separate edge collection so cross-cutting queries don't traverse intent objects.
- **Do not let the UX surfaces drift in chrome.** Per-kind specialization is allowed in the structural body content; the surrounding chrome (header, activity strip, navigation) stays uniform across kinds.
- **Do not propose `fork` / `merge` / `reframe` from agents in v0.2.** Agents probe; humans (or agents at human direction) restructure. Suggestions are deferred.
- **Do not write Integral-owned state into adapter source directories.** No PID files, no log files, no process tracking inside Nous's / Coral's / a target repo's tree. The substrate observes; it does not annotate.
- **Do not bundle a runtime fixture or "demo data" source.** v0.2.0 deliberately removed the fixture so the tool runs against real adapter output only. Test data lives in `src/test/seed-workspace.ts` — never reachable at runtime, never registered as a source.
- **Do not silently attribute adapter-emitted intents to the configured `me`.** When an adapter's source data has no holder field, use `{id: 'unknown-human', display_name: '(unknown)'}`. Reading another user's campaigns must not look like ours. See `gaps.md` § G-N-13.
- **Do not let any test — unit, integration, or e2e — touch a real LLM.** Tests must not spend token budget. The `vite-plugin-nous-adapter/` boundary is load-bearing: real Anthropic / OpenAI clients live there and must never be imported into `src/`. Smokes against real models are manual, run outside `npm test*`, and never share fixture or harness paths with the canonical suite.

## Conversation history note

The v0.1 design was developed in conversation across these decision points: catalog v1 → v2 with intent-axis re-cut → shape question (platform / protocol / vertical) settled on protocol → four-intent generalizability test → schema → UX sketch → visual navigation views → filter/tag/figure scope → shaping mode. v0.2.0 then narrowed the kind set to "what we ship today" and made the substrate stop pretending to be a demo (no fixture, no reversibility placeholder, configurable identity). If a future session needs the rationale for a specific decision, the design docs capture *what* and *why*; the reasoning chain that led to *why this and not the alternatives* is in conversation history.
