# Integral semantics — v0.1

The semantic model is the set of *meanings* humans and agents attach to the typed objects (`Intent` / `IntentState` / `KnowledgeRef` / `EvidenceLink` / `Operation`) that the schema and adapters produce. It bridges **syntax** (what objects exist) and **understanding** (what they're for, what they say, what to do with them).

This document is normative for v0.1 in the same sense as `intent-schema-v0.1.md` and `intent-ux-sketch-v0.1.md`: it states what we commit to, what's deferred, and the open questions that may move v0.2.

**Why this document exists.** The four plumbing layers (source / types / chrome / calculus) are necessary but not sufficient. A user staring at `iter-2 · policy-class-comparison` with `h_main: refuted` knows the *shape* but not the *meaning*: was that a setback or a win? What did we learn? What's next? Without semantics, the chrome is well-typed wallpaper. v0.1 builds the wallpaper carefully on purpose; v0.2 adds the prose. This file captures what "the prose" needs to be.

---

## The five layers

| Layer              | Captures                                                     | v0.1 status                                |
| ------------------ | ------------------------------------------------------------ | ------------------------------------------ |
| Source plane       | Bytes from external systems → typed objects                  | Adapter #1 (Nous) Phases 1+2+3 done; #2–4 pending |
| Type system        | Grammar of what can be said (schema)                         | v0.1 frozen; gaps tracked in `gaps.md`     |
| Chrome             | Vocabulary visualization (surfaces, atoms, figures)          | All five surfaces shipped; baselines locked|
| Calculus skeleton  | Grammar of change (typed `Operation` records)                | Types declared; not user-fired             |
| **Semantic model** | **What the typed objects *mean*; how to project them**        | **Mostly TBD — this doc**                  |

The five layers are not stacked; they couple. Section *§ Couplings* below names the edges that cross between them.

---

## Components of the semantic model

These are the bits of "meaning" the surfaces and adapters need to ship a useful product. Each is a separate concern with its own design questions.

### S-1. Projection generators (zoom-level prose)

The `read-at-zoom-level(intentId, zoom) → Projection` operation is the substrate's load-bearing read. v0.1 chrome currently renders **raw schema fields** (`declaration.title`, hypothesis-bundle structure, etc.). v0.2's projection generator turns the typed object + its history + linked evidence into prose at three budgets:

- **overview** ≤ 280 chars — what this intent is, in one card-shaped paragraph.
- **structure** ≤ 800 chars — how it's decomposed and what's currently in flight.
- **detail** unbounded — full state, history, evidence, plus a generated narrative.

The budgets are *constraints*, not suggestions. If a generator can't fit at a given zoom, the intent likely needs re-decomposing — the budget is a diagnostic.

**The two axes.** Projections are indexed by `(intent.kind, zoom)`. The two axes ask *different questions*:

- **Kind** dictates *what to talk about* — a campaign's projection talks about the research arc and accumulated principles; an iteration's talks about hypothesis + measurement + learning. Different prompt templates per kind.
- **Zoom** dictates *how much, and what context to include* — structure stays close ("what's happening now"); detail widens ("full narrative — arc, what was learned, current state, what's next"). Different prompts AND different context bundles per zoom.

The matrix has one cell per `(kind, zoom)` pair. v0.1 A2 ships **4 LLM-driven cells** (nous-campaign × {structure, detail}, nous-iteration × {structure, detail}). Other cells fall back to today's raw-field rendering. Overview stays structural across all kinds — the Map is a scan surface, and LLM prose at overview slows first paint without changing the scan semantics. Promoting overview to LLM is a v0.2 question.

The matrix is *deliberately revisitable*. As Coral / GH issues / Paper adapters land, the projection requirements per kind may differ enough that the plugin shape needs reshaping. v0.1's plugin pattern is "good enough to ship two Nous kinds"; v0.2 may collapse, split, or restructure the matrix once the cross-kind patterns are visible.

**v0.1 commitment (revised):** A2 ships kind-pluggable engine + Nous plugins (campaign + iteration) + structure/detail prose. Other kinds fall back to raw fields until their plugins land.

### S-2. Status grammar

`StatusSchema = enum('draft', 'active', 'gated', 'satisfied', 'abandoned', 'revoked')`. The same six values mean *different things* across kinds:

- `nous-iteration · satisfied` = the iteration finished and produced a verdict (which may be `refuted`!). Refutation is a finished outcome, not a failure.
- `nous-campaign · satisfied` = the research question is answered (or shelved with a stable principle set).
- `feature-pr · satisfied` = merged.
- `paper-claim · satisfied` = supported by sufficient evidence to ship in the paper.

**v0.1 commitment:** the per-kind interpretation lives implicitly in `src/lib/queue.ts` (`isAwaitingMe`) and the activity classifier. v0.2 should make this explicit — a per-kind status guide visible in the chrome (e.g., a hover-explanation on the status chip).

### S-3. Decomposition stories

When an intent has 5 children, the semantic question is: *what's the relationship between them?* Three patterns observed so far:

- **Sequence** (Nous iter-1 → iter-2 → iter-3): each builds on the prior; the latest dominates.
- **Parallel competition** (Coral attempts): siblings race; best-so-far is meaningful, the others are diagnostic.
- **Independent components** (paper sections, feature PRs): each child is a separate satisfaction subgoal; none dominates.

The schema's `decomposition.children` is a flat list — it doesn't say *which pattern*. Today, kind tells the surface enough (`nous-iteration` → render as a sequence; `coral-attempt` → render as a population). v0.2 may add `decomposition.pattern: 'sequence' | 'parallel' | 'independent'` so cross-kind UI can render uniformly.

**v0.1 commitment:** the pattern is implicit in `ChildrenSection`'s per-kind rendering. Document the implicit rule per-kind here:

| Kind                | Pattern              |
| ------------------- | -------------------- |
| `nous-iteration`    | sequence             |
| `coral-attempt`     | parallel competition |
| `feature-pr`        | independent          |
| `paper-section`     | independent          |
| `paper-claim`       | independent          |

### S-4. Evidence narratives

`EvidenceLink` carries a typed relation (`derived-from`, `supports`, `contradicts`, `refines`, etc.) between intents. Today the surface renders these as clickable arrows in `EvidenceEdges`. The *narrative* — "this paper claim rests on this Nous iteration's confirmed h_main" — exists only by inference from the relation type.

**v0.1 commitment:** the relation vocabulary is in the schema; the rendering is structural (kind + arrow). v0.2 should generate a one-line *narrative* per edge ("Claim 19 is derived from iter-2's confirmed prediction on EA-WFQ") so the user reads meaning, not types.

### S-5. Knowledge growth

`KnowledgeRef`s with `role: 'principles'` accumulate across iterations within a campaign. The campaign's principles ledger is *not* a flat set — principles supersede each other (`superseded_by`), contradict each other (`contradicts`), strengthen via repeated evidence. The accumulating body has a story: "we started believing X; iter-2 surfaced X's boundary condition; iter-3 replaced X with X' that holds in both regimes."

**v0.1 commitment:** principles surface as count chips per `(scope, role)` group (post-Phase-3 UX). The graph structure is dropped per `gaps.md` G-N-2. v0.2's promotion of principles to first-class typed objects unlocks the narrative.

### S-6. Operation semantics

`OperationKindSchema` enumerates 16 op kinds (9 lifecycle + 7 shaping). The schema declares the *signatures*; v0.1 doesn't fire them. The semantic content — *what does `decompose` actually do? When can `accept-proposal` fire? What's the precondition for `commit`?* — is implicit in the chrome's UI affordances (Shaping commit gate, propose-transition arrow, etc.).

**v0.1 commitment:** declared types only. v0.2 (writeback) introduces firing semantics; v0.3+ may add reduction rules / composition theorems if the patterns warrant them. **Resist formalizing prematurely** — let four adapters ship before locking semantics.

### S-7. Awaiting predicates

When does a human need to act? `isAwaitingMe(intent, state, me)` answers this in `src/lib/queue.ts`:
- `Status: gated` and `awaiting_party === me`, OR
- any open proposal in the activity log assigned to me, OR
- for `feature-pr` I authored, `ci_status: failing` OR `review_status: changes-requested`.

This is an explicit semantic — it converts typed state into "act now." The predicate's per-kind branches are part of the model.

**v0.1 commitment:** implemented; documented in CLAUDE.md § Resolved surface decisions point 3.

### S-8. Significance heuristics

Activity events bucket into `critical` / `notable` / `routine` via `classifyTransition` and `classifyOperation` in `src/lib/activity.ts`. The classification is a semantic — it says "this event change is worth interrupting for" vs. "tally it for the routine bucket." Schema-exhaustive over `IntentKindSchema.options` and `OperationKindSchema.options` so a v0.2 addition surfaces missing classification.

**v0.1 commitment:** implemented; deliberately conservative (most events are `routine`).

### S-9. Time semantics

Relative time (`12m ago`, `3h ago`, `5d ago`) uses a uniform formatter. But "12m ago" *means* different things per kind:
- `nous-iteration` advanced 12m ago = the LLM-driven loop fired recently; there might be a new principle.
- `feature-pr` advanced 12m ago = a commit landed or CI re-ran; check for ready-to-merge.
- `paper-claim` advanced 12m ago = a citation or supporting evidence changed; the claim's status may have shifted.

**v0.1 commitment:** uniform formatter; meaning is implicit. v0.2 may add per-kind hover tooltips ("last activity: principle RP-7 emitted 12m ago").

---

## Couplings

The semantic model is the matrix that connects the four plumbing layers. Each coupling below is a *contract*: a place where one layer constrains another.

### C-1. Source plane → Type system

Adapter outputs MUST validate against `WorkspaceSchema`. Lossy mappings are recorded in `gaps.md` and surfaced as gaps, not silently dropped. **v0.1 enforced** by `WorkspaceSchema.safeParse` at the App boundary.

### C-2. Type system → Chrome

Surfaces narrow on `intent.extension.kind` (the discriminated-union discriminator) — never on `intent.kind` directly when reading extension fields. The schema's `.refine` keeps both equal at runtime; the discrimination keeps TS narrowing correct. **v0.1 enforced** by TS strict + the convention documented in `TreeCard.tsx`.

### C-3. Type system → Calculus

`Operation` payloads reference intents by `IntentId`. Operations on a kind that doesn't exist (e.g., a `gate` with `current_gate: 'design'` on a `paper-claim` that has no design phase) is structurally valid but semantically wrong. **v0.1 unaddressed** — the calculus is signature-only; per-kind validity is v0.2 work.

### C-4. Source plane → Semantic model

Adapters today produce *data*; v0.2's projection generator will need *content*. Two architectures possible:
- **Adapter-side:** adapter produces both typed objects and a `Projection` per zoom level (LLM call inside the adapter).
- **Generator-side:** adapter produces only typed objects; a separate projection generator (LLM call) consumes the typed workspace and emits projections on demand.

The second is preferred because it lets one generator serve all four adapters and v0.2's writeback. **v0.1 commitment:** none; this is a v0.2 architectural decision (see `roadmap.md` step "Refresh affordances").

### C-5. Type system → Semantic model

The schema is the projection generator's input. The generator MUST refuse to project objects that don't validate (it's the validation invariant on the read path). **v0.1 unimplemented.**

### C-6. Calculus → Semantic model

When an operation fires (v0.2), the projection cache for the affected intent must invalidate. Operation kind tells the generator *what changed* — `decompose` invalidates children rendering; `gate` invalidates status; `accept-proposal` invalidates state. **v0.1 unimplemented.**

### C-7. Chrome ↔ Semantic model

The chrome renders projections at the zoom the user selected. The chrome also surfaces the *meaning artifacts*: status chips with per-kind hover tooltips (S-2), narrative lines on evidence edges (S-4), per-kind awaiting hints (S-7). **v0.1 partial:** chrome renders raw fields; meaning artifacts mostly absent.

### C-8. Chrome → Calculus (v0.2)

The chrome surfaces operations as actionable affordances (a "decompose" button, a "propose transition" arrow). The button's enabled-state is a semantic — *can this operation fire from this state?* Today only the Shaping `commit-to-active` button has this gate. v0.2 generalizes it across the calculus. **v0.1 limited to Shaping.**

---

## Two audiences, one substrate

Integral must work simultaneously for two consumers of the same surface:

**Humans** need *interpretable* presentations: prose, comparisons, visual cues, narrative arcs. The Detail surface today is human-shaped — chips, paragraphs, figures.

**Agents** need *actionable* representations: structured queries, deterministic operations, predictable feedback. An agent reading a Detail surface today would have to scrape DOM; that's a tell that the agent surface doesn't yet exist.

Both must agree on **meaning**: "satisfied" must mean the same thing whether a human reads it or an agent decides to fire `revoke` against it.

**v0.1 commitment:** schema is the agent-readable representation; chrome is the human-readable representation. Agents consume `/api/workspace?source=...` (already shipping). The semantic model — projections, status grammar, awaiting predicates — must work *across* the two presentations.

**v0.2 candidates:**
- A documented agent API surface (`/api/intents/<id>?zoom=structure` returns the structure-zoom projection as JSON).
- An "explain" endpoint that returns the projection as prose for a human and as structured fields for an agent.
- Operation surfaces that are symmetric — a button for the human, a callable endpoint for the agent.

---

## What v0.1 commits to (semantic minimum viable)

| Component                    | v0.1 status                          |
| ---------------------------- | ------------------------------------ |
| S-1 Projection generators    | Not implemented (raw fields)         |
| S-2 Status grammar           | Implicit in queue.ts + activity.ts   |
| S-3 Decomposition stories    | Implicit in per-kind ChildrenSection |
| S-4 Evidence narratives      | Structural rendering only            |
| S-5 Knowledge growth         | Counts only (post-Phase-3 collapse)  |
| S-6 Operation semantics      | Signatures only                      |
| S-7 Awaiting predicates      | Implemented (queue.ts)               |
| S-8 Significance heuristics  | Implemented (activity.ts)            |
| S-9 Time semantics           | Uniform formatter                    |

Three of nine components are real; the rest are implicit or absent. This is the **honest v0.1 surface**: the chrome is structurally correct; meaning rendering is mostly v0.2.

---

## Open questions

These are not closed. Future sessions may revisit them — please update this section, don't litigate inline.

1. **Where does the projection generator run?** In-process for v0.1 (CLAUDE.md, see `Operating conventions`). v0.2 may need a separate service for caching, fan-out, or LLM-call budgeting.
2. **Adapter-side vs generator-side projections.** See C-4 above.
3. **Agent surface contract.** The schema is the de facto agent API; should there be a separate well-documented agent API with operation endpoints?
4. **Per-kind status grammars — explicit or implicit?** v0.1 keeps it implicit. v0.2 may want a `Kind → Status → Meaning` table that both chrome and generator consume.
5. **Decomposition pattern — schema or convention?** v0.1 keeps the pattern as kind-implicit convention. v0.2 may promote to schema (`decomposition.pattern`).
6. **Cross-kind narratives.** When a paper claim depends on a Nous iteration depends on a Coral attempt, the connecting thread the user reads is a graph traversal + LLM synthesis. v0.2.
7. **Trust / provenance of projections.** When an LLM-generated projection makes a claim, how is the user told "this is generated, not asserted by the harness"? The `provenance.source` field is part of the answer; the projection's own provenance may need its own field.
8. **Versioning of the semantic model itself.** A v0.2 schema bump *might* invalidate v0.1 projections; we may need projection-side versioning analogous to `schema_version`.

---

## Non-goals (v0.1)

Items deliberately deferred. Promotion to v0.2 requires explicit decision, not silent drift.

- **Multi-agent reasoning.** Two agents collaborating on the same intent (or disagreeing) is v0.3+ work.
- **Personalized projections.** Different prose per user is v0.2+; v0.1 has one rendering.
- **Trustworthiness scoring.** "How confident is the projection?" is v0.2+.
- **Real-time collaborative cursors.** Live multi-user sessions are v0.3+ at earliest.
- **Auto-generated tags / categorization.** v0.2 (already in CLAUDE.md non-goals).
- **Reduction rules / composition theorems for the calculus.** Resist until pattern is forced by real adapters.
- **Conversational projection regeneration.** "Rephrase this overview" is v0.2+; v0.1 has fixed budgets.

---

## Cross-references

These files are normative together. Cross-references between them are load-bearing.

- `intent-schema-v0.1.md` — typed object model. Inputs to the semantic model.
- `intent-ux-sketch-v0.1.md` — UX surfaces. Where projections render.
- `intents-and-harnesses.md` — catalog of harnesses. What the substrate is generalizing across.
- `gaps.md` — schema-fit issues found while sizing adapters. Many gaps (G-N-2, G-N-9, G-N-11) are *also* semantic gaps.
- `roadmap.md` — Path 2 expansion items. The semantic-model work below adapter #1 Phase 4 is unscheduled today; v0.2 work.
- `CLAUDE.md` — operating conventions. § Resolved surface decisions and § Implementation order encode several semantic commitments (S-2, S-7, S-8).
