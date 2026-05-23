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
