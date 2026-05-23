# Gaps — schema-fit issues found while sizing v0.1 adapters

Living backlog of places where the v0.1 schema in `intent-schema-v0.1.md` is too thin to capture what real systems actually emit. Each entry is anchored to evidence (a path or filename in a real workflow) so we can revisit them with concrete data, not abstractions.

**Discipline:**

- This file is a backlog, not a v0.2 spec. Items here are *candidates* for the next schema bump — `intent-schema-v0.2.md` will be its own design pass.
- **Do not silently fix gaps in v0.1.** Adapters built against v0.1 may take lossy mappings (flatten a graph, drop a field). That loss is the point — it's the falsification signal. Record what was lost; resist patching the schema mid-flight.
- A gap becomes a v0.2 promotion candidate when at least two adapters need the same field independently. One adapter wanting it isn't enough — one workflow's accident shouldn't drive the substrate.
- Items in CLAUDE.md § Non-goals stay non-goals unless promoted explicitly. Don't move them here without a recorded reason.

---

## Source: Nous campaign sizing

Evidence anchored in `~/Documents/Projects/inference-sim/.nous/best-of-field/` (real Nous campaign with 2 completed iterations, full principles ledger, structured iteration log).

### G-N-1. `HypothesisResult` enum is missing `partially-confirmed`

- **Evidence:** `ledger.json` reports `h_main_result: "PARTIALLY_CONFIRMED"` on 2 of 3 iterations across the campaign. The reviewer-gauntlet, multiturn-decisive, and best-of-field campaigns all emit this value.
- **v0.1 schema:** `HypothesisResultSchema = z.enum(['pending', 'confirmed', 'refuted', 'inconclusive'])`.
- **Loss if we don't fix:** Adapter would map `PARTIALLY_CONFIRMED` → `inconclusive`, conflating "the hypothesis held in some regime but not others" with "the experiment was inconclusive." Hypothesis bars on the Detail surface would mis-bucket these.
- **v0.2 candidate:** Add `partially-confirmed`. Possibly also add a regime/scope field on `Hypothesis` so partial confirmations carry their boundary conditions.

### G-N-2. `principles_emitted: Reference[]` flattens a typed graph

- **Evidence:** `principles.json` has principles like:
  ```
  RP-4: { statement, confidence: high, regime: "...", mechanism: "...",
          applicability_bounds: "...", evidence: [iter-2-rp4-check],
          contradicts: [], superseded_by: null, category: "domain",
          status: "active", extraction_iteration: 2 }
  ```
  Plus a graph over principles via `contradicts` and `superseded_by`.
- **v0.1 schema:** `principles_emitted: Reference[]` — just URIs/IntentIds with optional notes.
- **Loss:** All structure (`confidence`, `regime`, `mechanism`, `applicability_bounds`, `extraction_iteration`) is dropped or stuffed into `note`. The contradicts / superseded_by graph between principles would either disappear or be re-encoded as cross-tree `EvidenceLink`s with relation `contradicts` and a new relation for `superseded-by`.
- **v0.2 candidates:**
  - Promote `Principle` to a typed object with the full structure.
  - Add `superseded-by` to `EvidenceRelation` (the contradicts case is already covered).
  - Decide whether principles are first-class **intents** with `kind: 'nous-principle'` (so the principles-ledger calculus runs over `Intent` directly) or remain a Nous-specific type embedded in `NousIterationExtension`.

### G-N-3. Iteration `family` field has no home

- **Evidence:** `ledger.json` groups iterations by family — e.g., `baseline`, `policy-class-best-of-field`, `policy-class-comparison`. Multiple iterations can share a family; the family captures "what arc this iteration is part of."
- **v0.1 schema:** `NousIterationExtension` has `iteration_number`, `hypothesis_bundle`, `prediction_errors`, `principles_emitted`. No `family`.
- **Loss:** Adapter either drops the field or stuffs it into `tags`, losing the structural relationship between iterations within a family.
- **v0.2 candidate:** Add `family: string` (free-form) or model families as their own intermediate intents (`nous-iteration-family` between campaign and iteration).

### G-N-4. `prediction_accuracy` summary is distinct from `prediction_errors`

- **Evidence:** `ledger.json` carries `prediction_accuracy: { arms_correct: 2, arms_total: 3, accuracy_pct: 66.7 }`. Distinct from per-prediction errors — this is the iteration-level aggregate.
- **v0.1 schema:** `NousIterationExtension.prediction_errors: PredictionError[]?` — per-prediction taxonomy, no aggregate.
- **Loss:** Adapter loses the aggregate or recomputes it from individual errors.
- **v0.2 candidate:** Add `prediction_accuracy?: { arms_correct, arms_total, accuracy_pct }` alongside `prediction_errors`.

### G-N-5. `frontier_update` field — Pareto frontier as a Nous concept

- **Evidence:** `ledger.json` has `frontier_update` (currently null in the campaign I read, but the field name implies Nous tracks Pareto-frontier evolution per iteration in some campaigns).
- **v0.1 schema:** No frontier concept anywhere.
- **Loss:** Adapter would drop this entirely. Worse, this is *Coral-shaped* bleeding into Nous — suggesting frontier-tracking is cross-kind, not specific to optimization. We'd miss the cross-cutting pattern.
- **v0.2 candidate:** Decide whether "Pareto frontier evolution" is a first-class concept (added to the schema directly) or a derived `KnowledgeRef` of role `principles`. Watch the Coral adapter to see if the same shape appears.

### G-N-6. Iteration patches are first-class artifacts

- **Evidence:** Each `.nous/<run>/runs/iter-N/patches/h-main.patch` is a real git patch. The handoff doc references applying these patches between iterations as part of the campaign's machinery (e.g., "apply iter-1 reference impl, build, run").
- **v0.1 schema:** Patches would only be representable as `ExternalAnchor` URIs with no structure.
- **Loss:** No way to capture "this iteration produced this diff against the codebase." The relationship between Nous iterations and the codebase is materially via patches, not just abstractly.
- **v0.2 candidate:** Either add a typed `IterationArtifact` collection on `NousIterationExtension`, or promote patches to a generic concept (a campaign produces typed artifacts of various kinds, patches being one).

### G-N-7. Status enum `phase: DONE` doesn't cleanly map to `Status`

- **Evidence:** `state.json` has `phase: "DONE"`. Other Nous campaigns have phases like `DESIGN`, `EXECUTE`, `ANALYZE`, `REVIEW` (gate-related).
- **v0.1 schema:** `StatusSchema = z.enum(['draft', 'active', 'gated', 'satisfied', 'abandoned', 'revoked'])`.
- **Loss:** `DONE` maps to `satisfied` — fine for the campaign-level state. But the *intra-iteration phases* (DESIGN/EXECUTE/ANALYZE) are richer and currently get flattened into `gate_status.current_gate`.
- **v0.2 candidate:** Either expand `StatusSchema` (probably wrong — those are domain-specific), or formalize the gate vocabulary so per-kind phases compose with the universal status.

### G-N-8. Campaign `success_criterion` has no source in the YAML

- **Evidence (Phase 1 ingestion):** Real `campaign-X.yaml` files don't carry an explicit success criterion. The schema requires `Declaration.success_criterion: string (max 2000)` (allows empty), so the adapter currently emits `''`.
- **v0.1 schema:** `Declaration.success_criterion: z.string().min(0).max(2000)`.
- **Loss:** The Detail header's "success" line is empty for every adapter-emitted nous-campaign. Users can't see what would constitute satisfaction without reading the YAML's `research_question` (which is closer to a question than a criterion).
- **v0.2 candidate:** Either (a) extract success criteria from the campaign declaration LLM-side as part of projection, (b) add a `success_criterion` field to the Nous YAML schema upstream, or (c) make `success_criterion` optional on `Declaration` so its absence is visible rather than rendered as a blank chip.

### G-N-9. Iteration runtime fields with no schema home

- **Evidence (Phase 2 ledger ingestion):** Every `ledger.json` entry carries `candidate_id` (the human-readable handle, e.g., `iter-2`), `ablation_results: Record<string, "CONFIRMED" | "REFUTED" | …>` (per-ablation outcomes keyed by ablation id), `control_result` (a `HypothesisResult`-like string for the negative control), `robustness_result` (similarly for the robustness check), and `frontier_update` (covered separately by G-N-5).
- **v0.1 schema:** `NousIterationExtension` has `hypothesis_bundle.h_main` + `h_ablation[]` + `h_control_negative?` + `h_robustness?[]`. The ledger's `*_result` fields could *in principle* attach to the matching `Hypothesis.result`, but the v0.1 phase-2 adapter takes the lossy mapping `h_main_result → h_main.result` and **drops `ablation_results`, `control_result`, `robustness_result`** on the floor. `candidate_id` collapses into the iteration's intent id suffix (used as the parent-scoped suffix in `nous:<source>:<run>:<candidate>`).
- **Loss:** Hypothesis bars on Detail show only `h_main`'s outcome; the ablation/control/robustness hypotheses come back empty. Side-by-side comparison of "main confirmed but ablations refuted" cases is invisible.
- **v0.2 candidates:**
  - Either: synthesize `Hypothesis` records inside `h_ablation` / `h_control_negative` / `h_robustness` from the ledger's `*_result` fields (requires the adapter to fabricate `statement` / `prediction` strings — bad).
  - Or: relax `Hypothesis` to allow `result`-only entries with optional `statement` / `prediction`, so bare outcome rows can survive ingestion.
  - Or: split `HypothesisOutcome` from `Hypothesis` — outcomes are runtime-emitted from the ledger; full hypotheses come from the campaign's design phase. The schema currently fuses them.
- **Severity:** Low for chrome rendering, high for analysis fidelity. Two of three iteration-level signals (control + robustness) are silently dropped.

### G-N-10. `principles_extracted` actions don't map to a typed lifecycle

- **Evidence (Phase 2):** Each `LedgerEntry.principles_extracted: [{ id, action }]` carries an `action` field — observed values: `INSERT`, `UPDATE`, (likely also `SUPERSEDE`, `RETRACT` per the principles ledger machinery). v0.1's lossy mapping shoves `action` into `Reference.note` as `"action=INSERT"`.
- **v0.1 schema:** `Reference = { kind, target, note? }` — `note` is free-form prose.
- **Loss:** The action becomes opaque metadata. UI can't filter "show only iterations that *introduced* new principles vs. iterations that *updated* existing ones" without re-parsing the prose note.
- **v0.2 candidate:** Closely tied to G-N-2 (principles graph). If principles become first-class typed objects, the action becomes a typed `OperationKind` over them (`principle-insert`, `principle-update`, `principle-supersede`).

### G-N-11. `KnowledgeRef.version` is overloaded as a lossy-mapping marker

- **Evidence (Phase 3):** Phase 3 emits `version: 'v0.1-lossy'` on every principle-derived `KnowledgeRef` to mark "the rich principles.json structure (confidence/regime/mechanism/applicability_bounds/evidence/contradicts/superseded_by/category/status) was dropped per G-N-2." The `version` field's natural meaning is "version of the referenced document/corpus" — using it as a lossy-mapping signal is overload.
- **v0.1 schema:** `KnowledgeRef.version: string?` — free-form, no semantic constraint.
- **Loss:** When v0.2 promotes principles to typed objects (per G-N-2), there's no obvious place to flip the marker — does v0.2's adapter use a different `version` string, or does the field name itself shift? A future adapter author won't know whether `version='v0.1-lossy'` means "the corpus is at version v0.1-lossy" or "the adapter took a lossy mapping."
- **v0.2 candidates:**
  - Add `KnowledgeRef.lossy: boolean` (or a richer `lossy_reason: string`) so the lossy-mapping signal has its own field.
  - Or: drop the marker entirely once principles get a real schema home — by then the lossy mapping is gone and the marker is meaningless.
- **Severity:** Low for v0.1 (single adapter, single marker value), but the next adapter to take a similar lossy mapping will hit the same overload.

### G-N-12. Principle extraction has no canonical `OperationKind`

- **Evidence (Phase 4):** When a Nous campaign re-reads its `principles.json` and a new principle URI appears on an iteration's `knowledge_refs`, that's a meaningful state change — *the harness extracted a new principle from this iteration's evidence*. Phase 4's diff engine emits typed `Operation`s for declared intents, decomposed parents, and status changes — but **emits nothing for new knowledge refs** because no `OperationKind` fits.
- **v0.1 schema:** `OperationKindSchema` enumerates 16 kinds (9 lifecycle + 7 shaping). None of `declare` / `refine` / `delegate` / `advance` / `gate` / `propose-transition` / `accept-proposal` / `satisfy` / `revoke` / `decompose` / `fork` / `merge` / `reframe` / `probe` / `clarify` / `commit` describes "a new piece of knowledge attached to this intent."
- **Loss:** Principle-extraction events vanish from the activity log even though they're among the most semantically interesting moments in a Nous campaign's life. The principle still surfaces via the iteration's `knowledge_refs` count chip (post-Phase-3 UX), but the *moment of extraction* has no event row.
- **v0.2 candidates:**
  - Add `extract-knowledge` (or `attach-knowledge-ref`) as a typed op with payload `{ ref: KnowledgeRef }`.
  - Tied to G-N-2 — if principles become first-class typed objects (their own `IntentKind`), the extraction event becomes a `declare(<principle-id>)` op, which is already in the vocabulary.
  - Decision deferred until G-N-2 promotion clarifies whether principles are intents or knowledge.
- **Severity:** Medium. Activity log under-represents the most informative moments of a research campaign.

---

## Cross-cutting observations

These are not gaps to fix — they're observations that may shape v0.2 thinking.

### O-1. The principles ledger is a calculus

Inside one Nous campaign, the principles system has typed terms (principles with confidence/regime/mechanism), typed edges (contradicts, superseded_by, evidence), operations (INSERT, UPDATE, supersede), and invariants (status: active vs superseded; superseded_by points at the replacement). Integral's `EvidenceLink` collection generalizes the same pattern across kinds. **The substrate already has the structural pieces of a calculus** — typed terms, typed edges, declared ops, invariants. What it doesn't yet have are reduction rules, composition theorems, and a proof obligation system. v0.2 may want to formalize what the operations *do* (declare/refine/decompose/fork/merge/reframe/probe/clarify/commit) so the ops have semantics, not just names. **Do not formalize prematurely.** Build the four adapters first; let the operations' real shape fall out of how adapters actually emit transitions.

### O-2. Cross-kind concepts bleed across kinds

`frontier_update` in Nous is Coral-shaped. Patches produced by Nous iterations are feature-development-shaped (they're git diffs). Paper claims grounded in Nous iterations are evidence-link-shaped. **The kinds are less independent than the four-kind decomposition suggests.** v0.2 may need to recognize "an intent of kind X commonly produces artifacts of kind Y" as a first-class relationship, not as ad-hoc EvidenceLinks.

### O-3. The schema's edge primitive is holding up

`EvidenceLink` was designed for cross-tree provenance (paper claim → Nous iteration). The Nous principles graph (contradicts / superseded_by / evidence) is also edge-shaped. Same primitive, different scope. **This is the strongest signal so far that the v0.1 design generalizes** — the edge collection is doing real work at multiple layers.

### O-4. Nous data is more typed than expected

Earlier I assumed adapters would be ~50% LLM-driven. After looking at real `.nous/<run>/` structure, most fields are already in structured JSON (state.json, ledger.json, principles.json). Adapter work is **~90% deterministic JSON ingestion + ~10% LLM for prose projections** at each zoom level. This changes the cost/refresh story materially: re-reads are cheap; LLM re-renders only fire when projection-relevant fields actually change.
