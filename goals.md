# Goal: Polish v0.1 to "stunningly good"

Take the v0.1 prototype from "schema + Map + Detail land" to a complete, kinetic, visually-locked v0.1 experience. Five work items below; land them in order — earlier items unblock later ones (header is needed for visual baseline; landing depends on header).

The /goal session is complete when every acceptance criterion below is met, every flagged decision was surfaced to the user with options (none silently picked), and the verification protocol exits clean.

> **v0.2.0 status note.** This document captures the v0.1 chrome-polish spec; the work landed and most of it survives unchanged. Three v0.2.0 changes contradict specifics below: (1) the runtime fixture is gone — references to `src/fixtures/workspace.ts`, `fixtureWorkspace`, scripted shaping dialogs, and "render real fixture data" describe history; tests now use `src/test/seed-workspace.ts` and the running app pulls only from real adapter sources; (2) the placeholder `reversibility · 24h` chip and its v0.2 audit-log promise are gone (deleted; not "deferred"); (3) visual-regression baselines were removed alongside the fixture. The five work items themselves shipped.

---

## Universal discipline (applies to every item)

Non-negotiable per CLAUDE.md. Enforce on every change; do not relax silently.

- **TS strict** + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` must remain green (`npm run typecheck` exit 0).
- **Behavioral tests, never implementation.** Vitest tests in RTL assert what the user sees and the `data-*` hooks the surface exposes. Never assert class names or computed CSS.
- **Schema-exhaustive runtime tests.** Where logic branches on a schema enum, parameterize over `Schema.options` (e.g., `IntentKindSchema.options`, `ZoomLevelSchema.options`).
- **Discriminated-union narrowing.** Narrow on `intent.extension.kind` (the discriminator on the `TypeExtension` union), not `intent.kind`.
- **CSS Modules + `data-*` contract.** JS sets attributes; CSS picks colors via attribute selectors. Use the existing tokens in `src/index.css` (`--paper`, `--ink`, `--mute`, `--amber-*`, `--sage-*`, etc.).
- **No tests for what TS guarantees.** Don't write a test that requires `prop={undefined}` under `exactOptionalPropertyTypes`.
- **Empty-string discipline.** `''` is content, not absence. Use `??` not `||` when checking presence.
- **No mocking the schema.** Render real fixture data; if a scenario needs new fixture entries (drafts, history), add them to `src/fixtures/workspace.ts` and ensure `WorkspaceSchema.safeParse` still passes.
- **Karpathy aesthetic.** Warm paper, cool ink, single-amber for "needs attention," IBM Plex Sans/Mono/Serif. No new colors without a recorded reason. No emoji in markup.
- **Verification triple before claiming done:** `npm run test:run` + `npm run typecheck` + `npm run build` + `npm run test:e2e`. Report exit codes, not assertions of success.
- **No new design docs unless asked.** Update CLAUDE.md "Current state" when a milestone lands; don't write planning files.
- **Surface every flagged decision** to the user with 2–3 concrete options. Do not silently pick.

---

## Item 1 — Persistent app header (chrome bar)

The always-on identity strip across the top of every surface (after Landing). The ccdesign mock has it; our build doesn't. Lands first because the Landing visually quotes it and the visual-regression baselines need it stable.

**Files:**
- `src/components/AppHeader/AppHeader.tsx`
- `src/components/AppHeader/AppHeader.module.css`
- `src/components/AppHeader/AppHeader.test.tsx`
- `src/components/AppHeader/IntegralGlyph.tsx` (the inverted-∫ SVG, isolated for reuse on the Landing surface)
- Add a barrel `src/components/index.ts` if not present; re-export `AppHeader`.

**Acceptance criteria:**

- Renders sticky-top, full-width, above the surface body.
- **Left cluster:** inverted-integral glyph (SVG, ~22px) + "Integral" wordmark (Plex Serif, weight 500) + `[v0.1]` Chip (mono, mute).
- **Center cluster:** breadcrumbs derived from current view: `workspace › <view> [ › <intent-title>]`. Each segment is a button; clicking navigates to that level. The `workspace` crumb returns to Map. The `<view>` crumb is "map" when on Map, "detail" when on Detail. The `<intent-title>` segment appears only on Detail.
- **Right cluster:** `● schema v0.1.0` Chip (sage dot, reads from the `SCHEMA_VERSION` literal — not hardcoded), refresh affordance (`↻ synced <time> ago`) when `onRefresh` is wired, `● <me>` PartyChip.
- Exposes `data-surface={current view kind}` on the root so visual tests and surface CSS can scope assertions.
- Does NOT render on the Landing surface.
- ≥6 behavioral tests covering: glyph + wordmark visible; `[v0.1]` chip renders; breadcrumb segments render per view (Map shows 2, Detail shows 3); breadcrumb click navigates to the right level; schema-version chip text is derived from `SCHEMA_VERSION` (test imports the literal and asserts it appears); me chip renders the current `Party` display name.

**Decisions to surface to user (not silently choose):**

- The exact shape of the inverted-integral SVG. Propose 2–3 candidate path strings (e.g., the literal ∫ glyph at 180° rotation; a hand-tuned curve closer to the ccdesign mock; a thinner-stroke variant). Render each in a small comparison sheet so the user can pick. Don't ship a placeholder.
- Whether breadcrumbs hide entirely below 768px viewport, truncate ellipsis-style, or stay visible with smaller font.

**Non-goals (defer to v0.2):**

- Workspace switcher (multi-workspace).
- Notifications / unread count on the me chip.
- Any popover / dropdown behavior.

---

## Item 2 — Landing surface (instrument variant)

The first thing the user sees. Inverted-integral glyph, big, with a quiet status peek. Lean = instrument (confirmed): feels like a control panel powering on, not a marketing splash.

**Files:**
- `src/surfaces/Landing/LandingSurface.tsx`
- `src/surfaces/Landing/LandingSurface.module.css`
- `src/surfaces/Landing/LandingSurface.test.tsx`
- `src/surfaces/Landing/index.ts` (barrel export)
- Wire into `src/App.tsx` as the default view; route `landing → map` on enter.

**Acceptance criteria:**

- Centered column, max-width ~640px, vertical rhythm matching the Karpathy genre (generous whitespace, no decorative frames).
- Big inverted-integral glyph, ≥120px tall. Reuses the `IntegralGlyph` component from Item 1.
- "Integral" wordmark, Plex Serif, ~64px.
- One-line tagline (Plex Sans, mute, ≤80 chars).
- Status peek line (Plex Mono, ≤80 chars): `N active · M awaiting you · last activity Xm ago`. Counts derived from `WorkspaceSchema.safeParse(fixtureWorkspace).data` — must match what Map shows. The "last activity" timestamp is the most recent `state.last_advanced_at` across all intents.
- Enter affordance: a labeled `enter →` button (right-arrow glyph + "enter"). Keyboard Enter and Space activate it. Focus is on this button on first paint.
- Schema-validation gate: if `WorkspaceSchema.safeParse` fails, render the existing `SchemaErrorBanner` instead of Landing (the same fail-closed pattern App.tsx already uses).
- AppHeader is hidden on Landing.
- Exposes `data-surface="landing"` on the root.
- ≥5 behavioral tests: page loads with glyph + wordmark + tagline + peek + enter button visible; counts in peek match the fixture (write the test to derive expected counts the same way the component does, so it stays in sync); enter button auto-focused on first paint; keyboard Enter activates; clicking enter fires the navigate callback.
- ≥1 E2E test: page loads with all elements; click enter; Map renders.

**Decisions to surface to user:**

- The tagline copy. Propose 3 candidates:
  1. *"intent management for humans + agents"*
  2. *"a substrate for collaborative work, typed end-to-end"*
  3. *"protocol-first intent management"*
  Let the user pick or write their own.
- **Once-per-session vs. every-visit.** Recommendation: once per session via `sessionStorage` flag; subsequent navigation back from Map skips Landing and goes straight to Map. Surface the choice; don't pre-decide.
- Whether the status peek includes the kind breakdown (e.g., `2 nous · 1 coral · 1 paper · 1 feature`) or just totals. Recommend totals.

**Non-goals:**

- Login / auth.
- Tagline animation.
- "What is Integral?" explainer text — tagline only.
- Onboarding tour.

---

## Item 3 — Workspace Activity Strip (Surface 3)

Per `intent-ux-sketch-v0.1.md` § Surface 3 and CLAUDE.md § Resolved decision #2. Workspace-wide events bucketed by significance, ordered by recency within bucket.

**Files:**
- `src/surfaces/Activity/WorkspaceActivityStrip.tsx`
- `src/surfaces/Activity/WorkspaceActivityStrip.module.css`
- `src/surfaces/Activity/WorkspaceActivityStrip.test.tsx`
- `src/surfaces/Activity/index.ts` (barrel)
- `src/lib/activity.ts` (event-derivation + significance heuristic)
- `src/lib/__tests__/activity.test.ts`
- Wire into Map and Detail surfaces as a right-side strip when viewport ≥1280px; auto-collapse to a vertical icon rail below.

**Acceptance criteria:**

- Three buckets: `critical` / `notable` / `routine`, in that order.
- Routine bucket collapsed by default with a `▸ N` toggle to expand.
- Each event row: relative time, party, cause, target intent. Clicking the target intent navigates to its Detail surface.
- Hovering an event preview-pulses the affected card on the Map (shared "hovered intent ID" via prop/context — do not introduce a global store like Zustand or Redux).
- Filter: significance threshold (`notable+` default; toggle to `routine+`). The toggle is a Chip-shaped control in the strip header.
- v0.1 event-derivation strategy (since the schema doesn't have first-class events yet): synthesize from `IntentState.history` and a small heuristic significance map:
  - `ci_status: passing → failing` on a `feature-pr` → **critical**
  - `gate-resolved` on any gated intent → **notable**
  - `attempt-scored` setting a new `best_score_so_far` on `coral-optimization` → **notable**; otherwise **routine**
  - `proposed-next-iteration` (when modeled) → **notable**
  - All other state transitions → **routine**
- The heuristic lives in `src/lib/activity.ts` and is schema-exhaustive: parameterize the test over `IntentKindSchema.options` so a v0.2 kind fails the test until handled.
- Auto-collapse below 1280px to a left-bordered vertical icon rail; expand toggle restores the full strip.
- ≥10 behavioral tests covering: bucket ordering (critical → notable → routine); routine collapse/expand; click navigates to Detail of target; filter narrows visible events; viewport breakpoint behavior (rail vs. full); each significance-heuristic branch (critical, notable, routine); empty-state when no events match the filter.
- ≥2 E2E tests: workspace-wide click navigates from Map; filter narrows visible rows.

**Decisions to surface to user:**

- Whether to add minimal fixture history entries to `src/fixtures/workspace.ts` (currently `history: []` everywhere) so the strip has content to render. Recommendation: yes, add 5–10 events across the four trees, including:
  - one critical (`ci_status: passing → failing` on the feature PR — the fixture's PR is already in `failing`, so the history entry shows the prior transition)
  - one notable (gate-resolved on the Nous campaign)
  - several routine (attempt-scored on coral, status changes on paper sections)
- Where the workspace strip lives in the DOM tree: right column on Map only, Detail only, or both. Recommend: both, sticky.
- Whether the strip is dismissible per session (sessionStorage flag).

**Non-goals:**

- A typed event schema (deferred to v0.2 per CLAUDE.md).
- Workspace-wide search / filtering by tag.
- Real-time updates (no live agent activity simulation in v0.1).
- Event-detail expansion (clicking a row navigates; it does not expand inline).

---

## Item 4 — Shaping Mode (Surface 4)

Per `intent-ux-sketch-v0.1.md` § Surface 4. Two-pane surface for `Status: draft` intents.

**Files:**
- `src/surfaces/Shaping/ShapingSurface.tsx`
- `src/surfaces/Shaping/ShapingDialog.tsx` (left pane)
- `src/surfaces/Shaping/IntentDraftPane.tsx` (right pane)
- `src/surfaces/Shaping/ShapingSurface.module.css` (+ per-pane modules as needed)
- `src/surfaces/Shaping/{ShapingSurface,ShapingDialog,IntentDraftPane}.test.tsx`
- `src/surfaces/Shaping/index.ts` (barrel)
- Add ≥2 draft intents to `src/fixtures/workspace.ts` (one fully formed dialog with all fields resolved, one partial). Both must validate against `WorkspaceSchema` with `Status === 'draft'`. Add a hand-authored "resolved field set" map for each draft (e.g., `{ titleResolved: true, summaryResolved: false, ... }`) — likely a sibling fixture file `src/fixtures/shaping.ts` to avoid bloating the workspace fixture.
- Wire Map's TreeCard click handler: drafts → ShapingSurface, others → DetailSurface.

**Acceptance criteria:**

- **Left pane (ShapingDialog):** scripted clarification dialog. Each turn is `{ speaker: Party, body: string, at: Timestamp }`. Free text per CLAUDE.md (no typed probe taxonomy in v0.1). Turns render with party chip + relative time + body.
- **Right pane (IntentDraftPane):** live typed draft. Renders the intent's declaration fields plus per-kind extension. Unresolved fields show a `⚠ pending` Chip (amber tone); resolved fields render normally. The "resolved" set is a hand-authored map per draft fixture in v0.1 (no inference from dialog content).
- **Restructure buttons:** `decompose` / `fork` / `merge` / `reframe`. In v0.1 these render so the affordance is visible but click is a no-op + `console.info('shaping-restructure: <op> (v0.2)')`. Each carries `title="v0.2"`.
- **`commit-to-active` button:** disabled while any field is pending; enabled when all are resolved. Click fires a callback that returns the draft to the workspace as `Status: 'active'` (in-memory only; do not persist to fixture file).
- **Routing from Map:** TreeCard click handler in `src/surfaces/Map/MapSurface.tsx` (or its parent) routes drafts to ShapingSurface and non-drafts to DetailSurface. The routing decision is based on the intent's state status.
- AppHeader renders normally on Shaping (it's a "view" like Detail).
- Exposes `data-surface="shaping"` on the root.
- ≥8 behavioral tests covering: dialog turns render with party + body; pending chips render for unresolved fields; non-pending chip absence for resolved fields; commit button disabled while pending; commit button enabled when all resolved; restructure buttons render but click does not commit; commit fires callback when clicked; navigation arrives at Shaping for a draft TreeCard click.
- ≥1 E2E test: click a draft on the Map → Shaping surface renders both panes; pending chip visible; commit button disabled.

**Decisions to surface to user:**

- The dialog content for the two draft fixtures. Author 4–8 turns each with the canonical Nous-shaping arc from the UX sketch (research question → kind confirmation → hypothesis bundle). Surface the proposed scripts before writing them.
- Whether commit transitions the intent in-memory only (recommended) or also rewrites the fixture file. Recommend: in-memory only.
- Whether "reframe" surfaces a kind-picker UI in v0.1 (recommend: no, click is no-op only).

**Non-goals:**

- Agent-suggested restructures (CLAUDE.md § What NOT to do, point on agents proposing fork/merge/reframe).
- Typed probe taxonomy.
- Stale-draft GC.
- Recursive shaping forks (defer; surface unblocking the parent campaign is enough for v0.1).
- Dialog input (no text box; the dialog is read-only scripted in v0.1).

---

## Item 5 — Visual regression baseline (Playwright screenshot diffs)

Lock the v0.1 visual identity so refactors don't silently drift toward Linear/Jira shape. Lands last because items 1–4 introduce the surfaces being baselined.

**Files:**
- `e2e/visual/baseline.spec.ts` (captures baselines)
- `e2e/visual/__screenshots__/` (committed snapshot directory)
- `e2e/visual/README.md` (canonical capture machine + tolerance docs)
- Update `playwright.config.ts` if needed: `expect.toHaveScreenshot` config with `maxDiffPixelRatio: 0.01`, `animations: 'disabled'`, `caret: 'hide'`.
- Add scripts to `package.json`:
  - `"test:e2e:visual": "playwright test --grep visual"`
  - `"test:e2e:visual:update": "playwright test --grep visual --update-snapshots"`

**Acceptance criteria:**

- One baseline screenshot per surface state, all at `1440x900` viewport with system font fallback explicit (`fontFamily: 'IBM Plex Sans'` confirmed loaded before capture — use Playwright's `page.evaluate(() => document.fonts.ready)` gate):
  - Landing surface (default state)
  - Map surface (default zoom, no filter)
  - Map surface (awaiting-me filter active)
  - Detail surface — one screenshot per IntentKind (9 total) at `structure` zoom
  - Detail surface — `nous-iteration` at `detail` zoom
  - Workspace Activity Strip (notable+ filter, expanded)
  - Shaping Surface (one draft fixture)
- Baselines run via `npm run test:e2e:visual` (capture-only on first pass).
- A second script `npm run test:e2e:visual:update` regenerates baselines.
- A README in `e2e/visual/` explains the canonical capture machine (macOS 14+, Chrome from Playwright bundle, 2x DPR) since screenshot diffs are platform-sensitive. Documents the tolerance (`maxDiffPixelRatio: 0.01`).
- Header comment in the spec file documents the tolerance and the "warn-only first run" stance.

**Decisions to surface to user:**

- Whether to commit the baselines (size: ~200KB each × ~16 = 3.2MB) or store them outside the repo. Recommend commit — the alternative needs a separate artifact host and isn't worth the complexity at this stage.
- Whether to run visual diffs as assertions immediately or warn-only for the first session. Recommend: capture-only this round; promote to assertions in the next.

**Non-goals:**

- Cross-browser baselines (Chromium only in v0.1).
- Mobile viewports.
- Pixel-perfect parity with `ccdesign/` — the prototype is the genre reference, not the spec; some drift is expected and intentional.
- Visual tests for hover/focus/active states (default states only in v0.1).

---

## Order, dependencies, verification protocol

**Build order:**

1. **Item 1 — AppHeader.** Must land first; Landing's "this is what's inside" continuity depends on the same glyph + version literal wiring.
2. **Item 2 — Landing.** Depends on Item 1's `IntegralGlyph` component and `SCHEMA_VERSION` chip pattern.
3. **Item 3 — Workspace Activity Strip.** Independent of Items 1–2 once AppHeader's chrome is settled (the strip slots into the Map/Detail surfaces, not the header).
4. **Item 4 — Shaping Mode.** Independent; can run in parallel with Item 3 if the agent prefers.
5. **Item 5 — Visual regression baseline.** Must land last; requires Items 1–4 stable.

**Verification protocol between items:**

After each item lands, before moving to the next:

1. Run `npm run test:run` from `integral-ui/`. Report exit code and test count.
2. Run `npm run typecheck`. Report exit code.
3. Run `npm run build`. Report exit code and bundle size.
4. Run `npm run test:e2e`. Report exit code and pass count.
5. Update `CLAUDE.md` § "Current state" with the new test counts, surfaces, atoms, and any newly resolved decisions.
6. Do not stack work-in-progress across items. Finish one before starting the next (Items 3 and 4 may interleave per the parallel guidance, but their verification gates are still sequential).

---

## Stop conditions

The /goal session is complete when ALL of the following hold:

- All 5 items meet their acceptance criteria.
- Final test counts (Vitest + Playwright) are recorded in `CLAUDE.md` § "Current state".
- All four verification commands (`test:run`, `typecheck`, `build`, `test:e2e`) exit 0 from a clean run.
- Every "decision to surface to user" was actually surfaced (with concrete options) and the chosen value is recorded — none was silently picked.
- No design docs were created; no v0.2 features were silently implemented; no canonical decisions in CLAUDE.md § "What NOT to do" were re-litigated.
