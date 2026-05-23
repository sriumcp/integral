# Roadmap

Tracks what's done, what's in flight, and what's deferred. Companion file to `goals.md` (polish pass — done) and `gaps.md` (v0.2 schema candidates).

---

## Where we are (as of this commit)

**v0.1 chrome polish — done.** All 5 items from `goals.md` shipped (initial commit `45e238c`):
1. AppHeader (sticky chrome, breadcrumb nav, schema-version chip, logo→Landing).
2. LandingSurface (instrument variant, glyph-on-the-left at ≥760px).
3. WorkspaceActivityStrip (right-side, three-bucket significance heuristic).
4. ShapingSurface (two-pane drafts, in-memory commit).
5. Visual regression baselines (15 PNGs locked).

**v0.1 expansion (Path 2) — partial:** Item A done, parts of D done. Items B, C, E remain.

Verification at this commit: 321 Vitest + 15 behavioral E2E + 15 visual baselines + typecheck clean + build clean.

**v0.1 substrate is descriptive only.** Surfaces render typed Intent / IntentState / EvidenceLink / Operation records from the fixture; the user navigates; nothing mutates persistent state outside the in-memory shaping commit. No adapters yet.

---

## v0.1 expansion: Path 2 (current focus)

**Decision recorded** (2026-05-22): expand v0.1 to include typed operation records + four adapters + surface query layer, **but not user-fired operations**. The "intent calculus" becomes visible in the type system but not yet executable from the UI side.

The framing from the conversation that landed this:

> *Path 2 — typed operation signatures, no execution. Adapters emit operations when they read state changes (e.g., a Nous iter completing → emits `satisfy(iter-2)`). The UI renders the operation log but doesn't fire operations from the user side. This adds calculus expressiveness without writeback.*

### A. Schema: typed `Operation` records — ✓ DONE

Shipped in `integral-ui/src/schema/zod.ts`:
- `OperationKindSchema` enum over all 16 op kinds (9 lifecycle + 7 shaping).
- `OperationSchema` discriminated union over `kind` with shared base fields (`id`, `at`, `by`, `target_intent_id`, `cause`) and kind-specific payloads (e.g., `decompose.children`, `gate.gate` + `awaiting_party`, `reframe.from_kind` + `to_kind`).
- `WorkspaceSchema.operations: Operation[]` — required collection alongside `evidence_links`.
- 22 schema falsification tests, parameterized over `OperationKindSchema.options` so a v0.2 op addition fails the suite until acknowledged.
- `src/lib/activity.ts` extended with `classifyOperation(op): Significance` (schema-exhaustive switch over the 16 kinds) and `deriveEvents(workspace)` widened to combine transitions + operations + synthetic markers under a single `ActivityEvent` shape with a `source: 'transition' | 'operation' | 'synthetic'` discriminator.
- 10 representative operations added to `src/fixtures/workspace.ts` covering 8 of 16 kinds (`declare`, `probe`, `clarify`, `decompose`, `gate`, `propose-transition`, `accept-proposal`, `commit`).

### B. Adapter contract

Each adapter is a function `Workspace.from(externalSource) → Workspace`. It produces:
- `intents: Intent[]` (declarations from source files like `campaign-X.yaml`)
- `states: IntentState[]` (1:1 with intents per the bijection refine)
- `evidence_links: EvidenceLink[]` (cross-tree provenance)
- `operations: Operation[]` (emitted from observed state transitions)

The v0.1-normative operation is still `read-at-zoom-level(intentId, zoom) → Projection`. Operation emission is the new addition: when the adapter sees a state change in source data, it emits the corresponding typed operation.

### C. Four adapters (the v0.1 falsification path)

In implementation order — each adapter validates the schema against a real workflow before the next one starts:

1. **Nous campaign adapter.** `integral-ui/src/adapters/nous/`. Read `campaign-X.yaml` (declaration) + `.nous/X/` (state) for an existing Nous workspace (`~/Documents/Projects/inference-sim/` is the canonical test target — ~30 campaigns). Refresh button manual; auto-watch v0.1.1.
2. **Paper writing adapter.** Read `papers/<name>/draft.md` + `refs.bib` + cross-references to upstream Nous campaigns the paper draws claims from.
3. **Coral optimization adapter.** Read `.coral/attempts/*.json` and `.coral/notes/`; tests competitive parallelism (many sibling child intents).
4. **Feature dev (git) adapter.** Read git log + GitHub PR API + repo-scoped `CLAUDE.md`; most expensive integration, runs last so it benefits from the schema lessons of (1)+(2)+(3).

Adapters land *separately* — verify and commit between each. **A gap discovered in adapter N is not silently fixed in v0.1; it goes to `gaps.md`** and the lossy mapping is taken (per the discipline at the top of `gaps.md`).

### D. Surface query layer

Pure UI, no schema or adapter dependency. Subitems track separately.

**D1. Workspace operation feed — ✓ DONE.** `WorkspaceActivityStrip` buckets operations alongside transitions. Operation rows expose `data-source="operation"` and a small mono `Chip` showing the op kind; significance comes from `classifyOperation`.

**D2. Per-intent operation log — ✓ DONE (via unification).** The previous `IntentActivityStrip` was deleted (Detail's right-aside column with synthetic + history + filtered-ops); per-intent activity now lives inside `WorkspaceActivityStrip` via the **`focusedIntentId` prop + scope filter chip** (`scope · this intent` / `scope · all`). Defaults to `this intent` on Detail surface; resets each time the focused intent changes.

**D3. Hide/show on the strip — ✓ DONE (chrome refinement).** `›` toggle in the strip header collapses to a 36 px vertical rail with the non-routine event count and a `‹` expand chevron. State persists per session via `sessionStorage['integral.strip-collapsed']`. App body grid auto-narrows the aside column when collapsed.

**D4. Filter chips on Map — pending.** Beyond the existing "awaiting me," add filters for: kind (multi-select), tag, holder mode, status. Filter chip cluster lives next to the existing one in `MapSurface.topRow`.

**D5. Group toggle — pending.** Group-by-kind / group-by-holder / no-grouping. Surfaces existing TreeCards under section headers.

**D6. Sort — pending.** Recency, awaiting, status, alphabetical. Toggle in the filter cluster.

### E. Refresh affordances

- **Workspace-level refresh button** in AppHeader (replaces or co-locates with the placeholder `reversibility · 24h` chip).
- **Per-intent refresh** in the Detail header (small `↻` next to the kind badge).
- **Staleness indicator** on every projection: "synced X ago"; goes amber past `stale_after`.

Implementation: clicking refresh re-runs the adapter pipeline for the targeted scope. Auto-watch is v0.1.1.

### F. Visual baseline updates

Every chrome change in items C-E regenerates the 15 baselines via `npm run test:e2e:visual:update`. New baseline candidates as the operation log + filter chips land:
- Map with filter chips active
- Detail with operation log section
- AppHeader showing the workspace refresh affordance

---

## Deferred to v0.2 (do not silently pull forward)

- **User-fired operations.** Any operation that mutates persistent state (declare/archive/satisfy/fork/etc. fired by the user, persisted to disk, and consumed by the harness). This is **Scenario B writeback** from the conversation; deferred explicitly.
- **Writeback / `campaign.yaml` generation from typed Intent.** Same scope as user-fired ops.
- **Filesystem auto-watch.** Refresh-button-driven for v0.1; watcher in v0.1.1 or v0.2.
- **The intent calculus reduction rules.** v0.1 expresses operations as typed terms; v0.2 may add operation semantics (when can op X fire? what does it produce? composition theorems). Resist formalizing prematurely.
- **Schema-fit issues.** All entries in `gaps.md` are v0.2 candidates. Adapters take lossy mappings against v0.1 deliberately — that's the falsification signal.

---

## Implementation order

Done:
1. ✓ **Schema: `Operation` type** + activity classification widening + fixture ops + workspace strip rendering.
2. ✓ **Operation log surface unification** — folded per-intent activity into `WorkspaceActivityStrip` via scope filter; deleted the separate `IntentActivityStrip`.
3. ✓ **Hide/show on the unified strip** (collapse rail, sessionStorage persistence).
4. ✓ **Adapter #1 — Nous, Phase 1.** Transport/interpreter split (`NousSource` abstract; `FilesystemNousSource` impl). `buildNousWorkspace` reads `campaign-X.yaml` + `.nous/<run>/state.json` → typed `nous-campaign` Intents. Vite plugin exposes `/api/workspace?source=nous`. Smoke test: 20 real campaigns from `~/Documents/Projects/inference-sim/`.
5. ✓ **Multi-source data plane** — `Provenance.source` v0.1.0 additive schema amendment; `src/lib/sources.ts` registry + URL parsing + workspace merging; `App.tsx` fetches all enabled sources and merges; `MapSurface` source-picker chip cluster (URL-synced via `history.replaceState`); `TreeCard` + `DetailHeader` carry a `via <source>` attribution chip. Default URL behavior: all known sources merged. Existing tests scoped to `?sources=fixture` for determinism.

Remaining (in suggested order):
6. **Adapter #1 — Nous, Phase 2.** Read `.nous/<run>/ledger.json` → produce `nous-iteration` child intents with `hypothesis_bundle` + `prediction_errors` + `principles_emitted`. Wire into the campaign's `decomposition.children`. Surface gaps to `gaps.md`.
7. **Adapter #1 — Nous, Phase 3.** Read `principles.json` → emit `KnowledgeRef`s (lossy per `gaps.md` G-N-2; principles graph deferred to v0.2).
8. **Adapter #1 — Nous, Phase 4.** Emit `Operation`s from observed transitions (gate-resolved, iteration-completed, principle-extracted, etc.).
9. **Refresh affordances** (workspace + per-intent buttons in the chrome; staleness chip on projections). Now meaningful since the API endpoint is live.
10. **Filter / group / sort on Map** (UI-only, can run in parallel with adapter work).
11. **Adapter #2 — Paper.**
12. **Adapter #3 — Coral.**
13. **Adapter #4 — Feature.**
14. **Visual baseline regen** after each chrome change.

Verification triple after every item: `test:run` + `typecheck` + `build` + `test:e2e` (and `test:e2e:visual` after chrome changes).

---

## Stop conditions for v0.1 expansion

The v0.1 expansion is done when:
- All four adapters can read their canonical real-data targets and produce typed `Workspace` snapshots that validate against `WorkspaceSchema`.
- Operation log renders for any intent with observed transitions.
- Filter/group/sort work on Map with all four adapter outputs.
- Refresh button works workspace-wide and per-intent.
- Test counts updated in CLAUDE.md "Current state."
- All four verification commands exit 0 from a clean run.
- `gaps.md` has been updated with any new schema-fit issues found during adapter work.

After v0.1 expansion: regroup, design v0.2 (writeback + reduction rules + auto-watch + schema bumps from `gaps.md`).
