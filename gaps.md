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

### G-N-9. Iteration runtime fields with no schema home — **RESOLVED in v0.1.5 (commit pending)**

- **Evidence (Phase 2 ledger ingestion):** Every `ledger.json` entry carries `candidate_id` (the human-readable handle, e.g., `iter-2`), `ablation_results: Record<string, "CONFIRMED" | "REFUTED" | …>` (per-ablation outcomes keyed by ablation id), `control_result` (a `HypothesisResult`-like string for the negative control), `robustness_result` (similarly for the robustness check), and `frontier_update` (covered separately by G-N-5).
- **v0.1 schema:** `NousIterationExtension` has `hypothesis_bundle.h_main` + `h_ablation[]` + `h_control_negative?` + `h_robustness?[]`. The ledger's `*_result` fields could *in principle* attach to the matching `Hypothesis.result`, and the v0.1 schema *did* support this — but the v0.1 phase-2 adapter took the lossy mapping `h_main_result → h_main.result` only, and **dropped `ablation_results`, `control_result`, `robustness_result`** on the floor.
- **v0.1 loss (now resolved):** HypothesisGrid atom rendered no cells beyond `h_main` because only `h_main` carried a `result`. Side-by-side comparison of "main confirmed but ablations refuted" cases was invisible.
- **v0.1.5 resolution (commit pending):** the gap was *adapter-side, not schema-side*. Took the synthesize-templated-Hypothesis option:
  - `parseLedger` now extracts `ablation_results` (defensively: dict only, drops non-string values, treats array-shaped legacy data as missing).
  - `interpretIteration` (`integral-ui/src/adapters/nous/ledger.ts`) populates `h_ablation` from the dict (sorted by key for stable row-order in HypothesisGrid), `h_control_negative` from `control_result`, `h_robustness` from `robustness_result` (wrapped in a 1-element array since the schema's `h_robustness` is array-shaped while runtime carries a single result).
  - Mapping function generalized: `mapHmainResultToHypothesisResult` → `mapResultStringToHypothesisResult` (back-compat alias preserved). `PARTIALLY_CONFIRMED → inconclusive` per G-N-1 still applies.
  - Synthesized statements use clearly-templated form (`'ablation: ${key}'`, `'control: campaign predictions do not generalize…'`, `'robustness: main outcome holds under perturbations.'`) so future readers can tell prose is structural, not researcher-authored. Once a future schema adds `statement` / `prediction` to the runtime ledger format, the adapter switches to real strings without changing the schema shape.
  - 11 new adapter tests pin the contract: ablation dict extraction, sorted-by-key population, control + robustness population, optional/null branches, PARTIALLY_CONFIRMED → inconclusive across all three.
- **Outcome:** HypothesisGrid atom now lights up on real `inference-sim` campaigns. `ordering-theorem` shows h_main + 2 ablations + control + robustness = 5 rows × 5 iterations.
- **Remaining v0.2 candidates** (deferred):
  - Relax `Hypothesis` to allow `result`-only entries with optional `statement` / `prediction`, eliminating the synthesized-template workaround.
  - Or: split `HypothesisOutcome` from `Hypothesis` — outcomes are runtime-emitted; full hypotheses come from the campaign's design phase. The schema currently fuses them.
  - These are nice-to-haves; the v0.1.5 resolution is sufficient for chrome.
- **Severity (was Low/High; now resolved):** Adapter loss closed. Schema-cleanliness opportunity remains for v0.2 if `Hypothesis` is split.

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

## Source: Coral optimization sizing

Evidence anchored in `~/Documents/learning/coral/pi-mc/results/pi-mc/2026-05-24_194843/` (real Coral run, 2 attempts captured during the A5-followup hello-world smoke; includes a specification-gaming attempt at the grader's `1e12` cap).

### G-C-1. `Declaration.success_criterion` has no source in `task.yaml`

- **Evidence:** A Coral `task.yaml` carries `task.description` (the human framing) and `grader.entrypoint` + `grader.direction` (the scoring mechanism), but no explicit success criterion in declarative form. The pi-mc fixture's task description is "Optimize seed/solution.py to print a more accurate Monte Carlo estimate of pi" — closer to a problem statement than a satisfaction predicate.
- **v0.1 schema:** `Declaration.success_criterion: z.string().min(0).max(2000)` (allows empty).
- **Loss:** The B1 adapter emits `''`. The Detail header's "success" line is empty for every Coral campaign; the grader's `direction: maximize` is the closest thing to a satisfaction predicate but lives on the extension, not the declaration.
- **v0.2 candidate:** Same shape as G-N-8 (Nous has the same gap) — relax `success_criterion` to optional, OR add an upstream convention that the harness's task declaration carries an explicit criterion.

### G-C-2. `direction: maximize | minimize` has no home on `CoralOptimizationExtension`

- **Evidence:** `task.yaml.grader.direction` carries the optimization sense; the chrome needs it to render "best score" correctly (highest vs. lowest). The B1 adapter computes `best_score_so_far` correctly per direction, but has no schema-typed place to *record* the direction itself for downstream consumers (filter chips, projection plugins, etc.).
- **v0.1 schema:** `CoralOptimizationExtension` has `scoring_function_ref`, `search_algorithm`, `population_size`, two anchors, optional `best_score_so_far`. No `direction`.
- **Loss:** B1 stuffs the direction into `tags` as `direction:maximize` / `direction:minimize`. Tags are free-form string-soup; consumers needing the direction must string-match a tag prefix.
- **v0.2 candidate:** Add `direction: 'maximize' | 'minimize'` to `CoralOptimizationExtension`. Cheap, well-localized, semantic.

### G-C-3. `search_algorithm` enum doesn't reflect Coral's actual mechanism

- **Evidence:** Coral runs a population of agents in parallel; each turn produces an attempt; high-scoring attempts seed knowledge for the next turn (notes, principles, role evolution). The `task.yaml` doesn't carry a search-algorithm name; the algorithm is in Coral's source code.
- **v0.1 schema:** `CoralSearchAlgorithmSchema = z.enum(['ucb', 'island', 'beam', 'best-of-n', 'other'])`.
- **Loss:** B1 emits `'other'` for every Coral campaign. The enum's signal value is zero in practice.
- **v0.2 candidate:** Either drop the enum (replace with free-form `string` description), OR add `'parallel-agents-with-shared-corpus'` (Coral's actual shape) and verify against more Coral runs.

### G-C-4. `roles/agent-N.md` carries rich role-evolution data; `Party` doesn't

- **Evidence:** Each agent in a Coral run has a `roles/agent-N.md` file with frontmatter (`agent_id`, `generation`, `last_revised_at`, `last_revised_after_eval`) and a structured body (sections: "How I'd describe my role right now," "What I've actually done," "What I've learned about how I work," "What I think I should do next," "History"). Generation bumps are evidence of agent self-revision over time. The pi-mc fixture has `agent-2` at generation 1 (it ran one eval and rewrote its self-description); `agent-1` is still at generation 0 (seeded blank).
- **v0.1 schema:** `Party = { id: PartyId, kind: PartyKind, display_name: string }`.
- **Loss:** B1 reads role frontmatter to confirm `agent_id` but drops everything else. The "agent-2 evolved its self-description after eval 1" signal is invisible.
- **v0.2 candidate:** Either (a) attach role history as a `KnowledgeRef` with role `'principles'` + scope `'campaign'` (lossy in the same way as Nous principles), OR (b) introduce a Party-scoped `Persona` typed object with a generation-history list. (b) is cleaner but needs more design.

### G-C-5. No campaign-level "done" signal

- **Evidence:** A Coral run that hit max score (pi-mc's case — both attempts capped at 1e12) is structurally identical on disk to a Coral run that ran out of budget. There's no `<run>/.coral/state.json` analogous to Nous's `state.json` with a `phase: DONE` field.
- **v0.1 schema:** `StatusSchema = z.enum(['draft', 'active', 'gated', 'satisfied', 'abandoned', 'revoked'])`.
- **Loss:** B1 always emits `status: 'active'` for the campaign, regardless of whether it's still running. Users can't tell from the chrome whether to expect more attempts.
- **v0.2 candidate:** Either (a) request that Coral writes a per-run `state.json` analogous to Nous, OR (b) derive run status from a heartbeat heuristic ("no heartbeat updates in N hours → 'idle'") in the chrome (not the adapter). (a) is cleaner.

### G-C-6. `coral-attempt.status` enum is unknown beyond `'improved'`

- **Evidence:** The pi-mc fixture's two attempts both have `status: 'improved'`. Coral's source likely emits other values (`'regressed'`, `'failed'`, `'pending'`, …) but we haven't observed them yet.
- **v0.1 schema:** B1 maps `'improved' → satisfied`, anything else → `'active'`.
- **Loss:** Unknown statuses get bucketed into `'active'`, which conflates "running" with "completed-but-not-improved."
- **v0.2 candidate:** Read Coral's source to enumerate status values; add an explicit per-Coral-status mapping table; record the mapping in the adapter inline.

### G-C-7. `attempt.feedback` has no schema home

- **Evidence:** Each attempt JSON carries a `feedback` field. It's empty in the pi-mc fixture but presumably gets populated when the grader returns explanatory text alongside the score (e.g., test-failure messages, runtime errors).
- **v0.1 schema:** `CoralAttemptExtension` has `worktree_anchor`, `score`, `artifact_uri`, `parent_attempts`, `evaluator_log_uri`. No `feedback`.
- **Loss:** B1 drops `feedback` entirely. Useful evaluator output disappears.
- **v0.2 candidate:** Add `evaluator_feedback: string | null` to `CoralAttemptExtension`. Strongly correlated with `evaluator_log_uri` — together they cover prose feedback + raw log.

### G-C-8. `attempt.shared_state_hash` has no representation

- **Evidence:** Each attempt records the SHA of the shared knowledge corpus (notes/) at eval time. Useful for "which set of notes was this attempt seeded with" — answer changes over the course of a run.
- **v0.1 schema:** No corpus-snapshot concept anywhere.
- **Loss:** B1 drops the field. Reasoning about "agent-2 saw the prior eval-1 note before eval-2" requires manual git-archaeology in the public repo.
- **v0.2 candidate:** Add `corpus_snapshot_hash: string?` to `CoralAttemptExtension`. Probably tied to G-C-10 (notes as KnowledgeRefs) — the snapshot SHA is the version pin for the campaign-scope corpus at that attempt's moment.

### G-C-9. `attempt.metadata.budget_class` is opaque metadata

- **Evidence:** Observed value `'real'`; Coral's source distinguishes `'tune'` (cheap iteration) vs. `'real'` (counts toward score). The pi-mc fixture only has `'real'` attempts.
- **v0.1 schema:** No budget concept.
- **Loss:** B1 stuffs into `tags` as `budget-class:real`. Same string-soup problem as G-C-2.
- **v0.2 candidate:** Add `budget_class: string | null` to `CoralAttemptExtension`. Or model "tune-vs-real" as an attempt-status modifier (`status: 'tune-improved'` etc.) — but that bloats the status enum.

### G-C-10. `notes/**.md` mapping mirrors G-N-2 (Nous principles)

- **Evidence:** Coral notes are structured prose: each note has frontmatter (`creator`, `last_updated`, optional `eval`) and structured sections ("Status," "Key Finding," "Synthesis," "Confidence"). The pi-mc fixture has `index.md` (a synthesis across the run) and `experiments/eval-1-math-pi-optimal.md` (a per-eval finding). They're principles by another name.
- **v0.1 schema:** `KnowledgeRef = { uri, role, version?, scope }` — opaque URI, no body.
- **Loss:** B1 emits one `KnowledgeRef` per note with `role: 'principles'`, `scope: 'campaign'`, `version: 'v0.1-lossy'`. The full markdown body, frontmatter, and section structure are dropped. Same shape as Nous's G-N-2.
- **v0.2 candidate:** Resolve together with G-N-2. Coral's notes are a second adapter independently wanting "structured knowledge unit with confidence + scope + body" — that's the two-adapter signal that promotes the gap from "candidate" to "v0.2 commitment" per the gaps.md discipline.

### G-C-11. Pre-installed personas (`agents/<persona>.md`) have no schema home

- **Evidence:** The pi-mc run has `agents/deep-researcher.md` and `agents/librarian.md` — pre-installed reusable agent personas that Coral provisions for every run. They live alongside `roles/` (which is per-eval-mutable) but represent immutable templates.
- **v0.1 schema:** No persona/template concept; closest fit is `KnowledgeRoleSchema = z.enum([..., 'methodology', ...])` which suggests v0.1 anticipated this.
- **Loss:** B1 ignores them entirely.
- **v0.2 candidate:** Surface as `KnowledgeRef`s with role `'methodology'`, scope `'project'` (since they're not campaign-scoped — they're cross-run templates). This is the cleanest fit; would need a path-resolution scheme.

### G-C-12. Pre-installed skills (`skills/<skill>/`) have no schema home

- **Evidence:** The pi-mc run has `skills/deep-research/SKILL.md`, `skills/organize-files/SKILL.md`, `skills/skill-creator/SKILL.md` — each with `agents/`, `references/`, `scripts/` subdirs. These are reusable capability bundles. Strongly correlated with `KnowledgeRoleSchema`'s existing `'skills'` value, suggesting v0.1 anticipated this.
- **v0.1 schema:** No `Skill` typed object; only `KnowledgeRef` with `role: 'skills'`.
- **Loss:** B1 ignores. The `KnowledgeRoleSchema` enum value `'skills'` has zero adapter-emitted refs in v0.1.
- **v0.2 candidate:** Same shape as G-C-11 — surface as `KnowledgeRef`s with role `'skills'`, scope `'project'`. The skill bundle's `SKILL.md` is the addressable artifact; sub-files (`scripts/`, `references/`) are followable from the bundle's anchor.

### G-C-13. Operational state has no schema home

- **Evidence:** Every Coral run carries operational telemetry: per-agent heartbeats (`heartbeat/agent-N.json`), per-agent logs (`logs/agent-N.M.log`), per-eval logs (`eval_logs/`), aggregate eval counter (`eval_count`), tmux session data (`sessions.json`), grader heartbeat (`grader_daemon_heartbeat`), agent error traces (`diagnostics/agent-N/agent.err`).
- **v0.1 schema:** No observability concept.
- **Loss:** B1 drops all of it.
- **v0.2 candidate:** Probably stays out of the schema — these are observability concerns, not intent semantics. The orchestrator (v0.2) may want to consume them for "is this run alive" signals; the schema needn't.

### G-C-14. Attempt git-worktree kind name is approximate

- **Evidence:** Each agent has a real git worktree at `<run>/agents/<agent_id>/.git`. B1 emits `worktree_anchor` with `kind: 'coral-shared-dir'` because there's no `coral-agent-worktree` value in the enum.
- **v0.1 schema:** `ExternalAnchorKindSchema` has `'worktree'` (generic), `'coral-shared-dir'` (Coral-specific dir-shaped), but no Coral-specific worktree kind.
- **Loss:** B1 conflates "Coral's shared-state directory" (notes + skills + eval results) with "Coral agent's git worktree" (per-agent code in flight) under one anchor kind. Consumers that want to dereference the worktree's git log have to disambiguate by URI substring.
- **v0.2 candidate:** Either add `'coral-agent-worktree'` (Coral-specific), or use the existing generic `'worktree'` (and disambiguate via URI scheme). Cheap fix.

---

## Source: GitHub-issues feature-campaign sizing

Evidence anchored in `github.com/sriumcp/integral` (the seed fixture for B2's smoke test, captured 2026-05-25): 5 issues — 1 tracking with 3 formal sub-issues + 1 top-level leaf. Schema mapping verified end-to-end via `gh` CLI.

### G-F-1. `Declaration.success_criterion` has no source in a GitHub issue

- **Evidence:** GitHub issues carry `title` + `body` (markdown) but no separate "success criterion" field. The body conventionally describes the bug/feature, not the satisfaction predicate.
- **v0.1 schema:** `Declaration.success_criterion: z.string().min(0).max(2000)` (allows empty).
- **Loss:** B2 emits `''`. Detail header's "success" line is empty for every GitHub-sourced campaign.
- **v0.2 candidate:** **Three adapters now want this** (G-N-8 Nous + G-C-1 Coral + G-F-1 GitHub) — promote to v0.2 commitment per the gaps.md two-adapter rule. Either relax `success_criterion` to optional, or add an upstream convention (issue-template field, label like `criterion:...`).

### G-F-2. `feature-campaign.inherited_conventions` not populated in v0.1

- **Evidence:** A GitHub repo's CLAUDE.md / CONTRIBUTING.md / coding-standards docs are the natural inputs to `inherited_conventions`. v0.1 doesn't walk the repo; full feature-dev integration (git log + repo file walk) is v0.2.
- **v0.1 schema:** `inherited_conventions: list[KnowledgeRef]` — schema admits empty array; B2 emits `[]`.
- **Loss:** No project-scoped conventions surface. Detail's KnowledgeRefs section is empty for GitHub Intents.
- **v0.2 candidate:** Walk the configured repo's tree for known convention files (CLAUDE.md, CONTRIBUTING.md, .editorconfig, etc.); emit one `KnowledgeRef` per with `scope: 'project'`.

### G-F-3. `feature-campaign.standing_invariants` not populated in v0.1

- **Evidence:** CI rules + lint configs + repo settings (branch protection, required checks) constitute "standing invariants" — declared elsewhere but binding on this campaign.
- **v0.1 schema:** `standing_invariants: list[Reference]` — empty in v0.1.
- **Loss:** Same shape as G-F-2.
- **v0.2 candidate:** Walk `.github/workflows/`, `eslint.config.js`, `tsconfig.json`, `package.json#scripts` etc.; emit `Reference`s pointing at each.

### G-F-4. `state_reason: REOPENED` is transient and lossy

- **Evidence:** When an issue is reopened, GitHub flips `state` back to `OPEN` and may set `state_reason: REOPENED` briefly. The "this issue was closed and then reopened" history is captured only in the timeline events API, not on the issue object directly.
- **v0.1 schema:** B2 maps to `Status: 'active'` (correct for current state) but the *history* is dropped because `IntentState.history = []`.
- **Loss:** Reopens vanish from the activity log. Users can't tell from the chrome whether an issue is "freshly opened" vs. "previously satisfied, now reopened."
- **v0.2 candidate:** Walk `/repos/{o}/{r}/issues/{n}/timeline` and reconstruct state transitions. Tied to G-F-7.

### G-F-5. Legacy issues with `state_reason: null` map ambiguously

- **Evidence:** Issues closed before GitHub introduced `state_reason` (~2022) have `null` in that field even when they were completed. v0.1 defensively maps to `'satisfied'`.
- **v0.1 schema:** Mapping is consistent (every legacy closed issue → `'satisfied'`); the loss is in distinguishing them from explicitly-completed modern issues.
- **Loss:** Some "closed by abandonment" pre-2022 issues are mis-bucketed as satisfied.
- **v0.2 candidate:** Use the issue's `closed_by` + close-event reason (timeline) to disambiguate. Or accept the loss — pre-2022 data is increasingly historical.

### G-F-6. Unassigned issues need a synthetic Party to satisfy `Holder.parties.min(1)`

- **Evidence:** GitHub issues can be unassigned indefinitely (an issue someone filed but no one's claimed). The schema requires `Holder.parties` to be non-empty.
- **v0.1 schema:** B2 emits a synthetic `{id: 'github-unassigned', kind: 'system', display_name: '(unassigned)'}` party with `holder.mode: 'jointly-held'`.
- **Loss:** "No human owns this" gets recharacterized as "the system owns it." Subtle but the chrome's holder chip shows `(unassigned)` which is at least honest.
- **v0.2 candidate:** Either (a) relax `Holder.parties` to allow zero (riskier — invariants downstream may rely on min(1)), or (b) introduce a typed sentinel `{kind: 'unassigned'}` in `PartyKindSchema`.

### G-F-7. `IntentState.history` is empty — timeline events not reconstructed

- **Evidence:** GitHub's `/timeline` API returns assigned/unassigned, label add/remove, milestone change, close/reopen, etc. as typed events. v0.1 doesn't walk them.
- **v0.1 schema:** `IntentState.history: array(StateTransitionSchema)` — schema admits empty array.
- **Loss:** Detail's activity strip shows nothing for GitHub Intents (no transitions, no comments — see G-F-8). The Detail surface for an active GitHub issue is essentially raw fields.
- **v0.2 candidate:** Walk `/timeline`; map each event to a `StateTransition`. Cost: one API call per issue (or paginated repo-wide events). Probably wait for B2 + B3 lessons before designing the walker.

### G-F-8. Comments not loaded in v0.1

- **Evidence:** Issue comments are an N+1 fetch (per-issue) or one repo-wide call (`/repos/{o}/{r}/issues/comments`). B2 doesn't load them. The activity strip on Detail for GitHub Intents stays empty (combined with G-F-7).
- **v0.1 schema:** No specific operation kind matches "user commented on tracked work" — closest semantic fit is `clarify`, but it's a stretch (clarify is a draft-shaping operation in the schema's vocabulary).
- **Loss:** Discussion history vanishes from the chrome.
- **v0.2 candidate:** Either (a) load via repo-wide `/issues/comments` and map to `clarify` operations (lossy semantically — record the forced fit), OR (b) introduce a new `OperationKind: 'comment'` (breaks v0.1 schema; v0.2-only). Decide alongside G-F-7's timeline walker — both are activity-log inputs.

### G-F-9. Cross-repo sub-issues silently dropped

- **Evidence:** GitHub allows a tracking issue in repo A to have sub-issues in repo B. The `/sub_issues` endpoint returns them. B2 filters them out (compares `repository_url` against the configured source's repo).
- **v0.1 schema:** Workspace is single-source-per-fetch; cross-repo children would need to also exist in the workspace.
- **Loss:** Cross-repo children disappear from the parent's `decomposition.children` without trace. The chrome can't tell the parent had additional children elsewhere.
- **v0.2 candidate:** Either (a) multi-repo source semantics (one source = many repos, fetched together), OR (b) emit `EvidenceLink` records for cross-repo children with `relation: 'derived-from'` so the link survives even if the child intent doesn't.

### G-F-10. `'github-repo'` `ExternalAnchorKind` added as v0.1.0 additive

- **Evidence:** B2 needs to anchor `feature-campaign.repo_anchor` at a GitHub repo URL. The closest existing kind was `'github-pr'` (wrong — anchors a PR, not a repo) or `'other'` (works but loses signal).
- **v0.1 schema:** **Added `'github-repo'` to `ExternalAnchorKindSchema` as a v0.1.0 additive amendment** (per CLAUDE.md: "Adding a fifth intent kind is a v0.2 change" but enum-value additions on string-shaped fields stay at v0.1.0). Documented in `intent-schema-v0.1.md`.
- **No further v0.2 work.** This entry exists to document the additive amendment, not propose further change.

### G-F-11. `feature-campaign.repo_anchor` is single-repo

- **Evidence:** The schema admits one repo per `feature-campaign`. Monorepo workflows with sub-repos, or cross-org tracking issues spanning repos, would need a different shape.
- **v0.1 schema:** `repo_anchor: ExternalAnchor` — singular.
- **Loss:** B2 declares one source = one repo as a v0.1 simplification.
- **v0.2 candidate:** Either (a) `repo_anchors: list[ExternalAnchor]` (plural), or (b) keep singular and use `EvidenceLink`s for cross-repo references. (b) is cleaner — the primary repo is structural, secondary repos are evidential.

### G-F-12. Issue → PR linking unrepresented

- **Evidence:** GitHub auto-links PRs that say "Closes #123" in their body. The `linked_pull_requests` field on issues exposes this. v0.1 ignores it (no PR reading at all).
- **v0.1 schema:** Would need either `feature-campaign.primary_pr_anchor` populated (currently unused) or a typed `EvidenceLink` from issue → PR.
- **v0.2 candidate:** Full feature-dev (the original v0.1 plan promoted to v0.2) — read PRs as `feature-pr` Intents, link via `EvidenceLink` with `relation: 'derived-from'` from PR → issue.

### G-F-13. Task-list-syntax hierarchy unrepresented

- **Evidence:** Many older repos use `- [ ] #123` in issue bodies to express sub-issue relationships, predating GitHub's formal sub-issues feature (2024). v0.1 honors only formal sub-issues.
- **v0.1 schema:** Would map identically once the relationships are extracted.
- **Loss:** Repos using the older convention show up as a flat list of leaves with no hierarchy.
- **v0.2 candidate:** Parse issue bodies for `- [ ] #N` references; treat as `decomposition.children` if the referenced issue is in the same repo. Disambiguate "blocks" / "fixes" / "see also" — multiple conventions exist.

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
