# Integral Intent Schema

**Version: 0.1.0**
**Status: superseded by v0.2.0 on 2026-05-29. Kept for historical reference + as the starting point for re-introducing paper-* and feature-pr kinds when their adapters ship.**
**Date: 2026-05-22**

> **Read this for the v0.1.0 grammar.** v0.2.0 narrowed `IntentKindSchema` to five kinds and removed `feature-pr`, `paper-campaign`, `paper-section`, `paper-claim` along with their extensions. Most of this document — core types, holder, lifetime, status, knowledge refs, evidence links, projections, operation log, workspace bundle, shaping operations — applies unchanged to v0.2.0. See `intent-schema-v0.2.md` for the diff and current authoritative kind enum.

## Versioning policy

- Pre-1.0: every breaking change bumps the *minor* (0.1 → 0.2). We do not maintain backward compatibility before 1.0.
- Each version lives in its own file (`intent-schema-v0.1.md`, `intent-schema-v0.2.md`, …) so the diff is legible and old adapters can keep referencing the version they were built against.
- The `schema_version` field on every intent object is authoritative — adapters MUST reject objects whose version they don't understand.
- Non-goals for the current version are listed explicitly at the bottom of this file; deferred concerns are not bugs.

## Companion document

This schema is the substrate behind the catalog in `intents-and-harnesses.md` (v2). The two documents evolve together: the catalog identifies *what* needs to be expressed; this schema specifies *how*.

---

## Design principles

1. **Intent is a typed, persistent, queryable object.** Five core fields — holder, scope/criterion, lifetime, decomposition, provenance — are common to every intent regardless of kind.

2. **State is separate from intent.** The intent object declares *what is being pursued*; the state object records *where pursuit currently stands*. Independent versioning of each makes the audit log clean and lets state mutate without touching declarations.

3. **External anchors, not mirrors.** When authoritative state lives in another system (a git branch, a GitHub PR, a filesystem campaign dir, a markdown paper draft), Integral *points at it* via typed `ExternalAnchor` references. Integral never tries to be the source of truth for state another system already owns.

4. **Discriminated extension by `kind`.** Four genuinely different intent shapes share one core schema; intent-type-specific data lives in a typed `extension` field selected by `kind`. Adding a fifth kind extends the union; it does not change the core.

5. **Cross-intent edges are first-class.** `EvidenceLink` connects intents across kinds (a paper claim → a Nous iteration → a Coral attempt → an external citation). Without this, four parallel schemas; with it, one substrate.

6. **Knowledge corpus references are scoped.** A reference to `principles_ledger.md` is meaningless without scope; the same path means different things at the campaign level vs. the iteration level. Scope is required on every `KnowledgeRef`.

7. **Projection at multiple zoom levels is part of the schema, not a separate concern.** Each intent state object carries cached projections at predefined zoom levels. These are regenerable but cached so the human navigation surface is not bottlenecked on regeneration.

8. **Bi-actor by default.** Every operation that mutates an intent object (declare, refine, advance, gate, satisfy, revoke) accepts either a human party or an agent party. The schema does not privilege one.

9. **Shaping is a typed phase with mutable declaration.** While `Status == draft`, an intent's declaration fields (title, summary, success_criterion, kind, decomposition, holder, knowledge_refs, tags) are mutable — this is the *intent shaping* phase, where a vague idea is refined into an executable typed object through dialog and restructuring. On transition to `active` (the `commit` operation), declaration freezes; only state mutates thereafter. Shaping operations (refine, decompose, fork, merge, reframe, probe, clarify, commit) are logged as typed `StateTransition` events; see *Shaping operations* below.

---

## Notation

This document uses YAML-flavored pseudo-syntax for readability. Production schemas SHOULD be expressed in JSON Schema or equivalent (Pydantic, Zod, TypeBox) — the YAML here is canonical for *meaning*, not for serialization format.

- `?` after a field name marks it optional.
- `list[T]` is a homogeneous list of T.
- `dict[K, V]` is a map.
- `enum { … }` is a closed set; adding a value is a breaking change.
- `// comment` lines are normative when they describe constraints.

---

## Core types

```yaml
IntentId:        type: string   # ULID, workspace-unique, immutable
StateId:         type: string   # ULID, points 1:1 to an IntentId
PartyId:         type: string   # opaque; resolved against a party registry (out of scope for v0.1)
URI:             type: string   # absolute URI; file://, https://, git://, etc.
Timestamp:       type: string   # RFC3339, UTC, milliseconds preserved

Party:
  id: PartyId
  kind: enum { human | agent | system }   // `system` = automated runner, CI, watcher
  display_name: string

Reference:
  // a typed pointer to another intent or to external evidence
  kind: enum { intent | document | observation | external }
  target: URI | IntentId
  note: string?
```

---

## The `Intent` object

```yaml
Intent:
  id:               IntentId
  schema_version:   "0.1.0"        // exact match required by adapters
  kind:             IntentKind     // discriminator for `extension`

  declaration:
    title:               string    // ≤ 80 chars, human-readable
    summary:             string    // 1–3 sentences at conceptual level
    success_criterion:   string    // ideally machine-checkable; otherwise gates to a human

  holder:
    mode:     HolderMode           // human-held | agent-held | jointly-held | hierarchically-held
    parties:  list[Party]          // ≥ 1; semantics depend on mode (see below)

  lifetime:
    kind:                  LifetimeKind   // discrete | campaign | standing
    started_at:            Timestamp
    expected_termination:  ExpectedTermination?
      // for `campaign` with a known terminating event (paper submission, deadline);
      // null for `standing` and for open-ended campaigns

  decomposition:
    parent_id:    IntentId?
    children:     list[IntentId]
    handoff:      HandoffSpec?
      // what this layer owes its parent (typed report shape)
      // and what its children owe back (typed report shape)

  provenance:
    declared_by:    Party
    declared_at:    Timestamp
    motivated_by:   list[Reference]
      // upstream intents, observations, deliverable-of relationships;
      // empty list = root-of-tree intent

  knowledge_refs:   list[KnowledgeRef]
    // explicit corpora this intent draws on and (where applicable) writes back to

  tags:             list[string]?
    // free-form, user-controlled labels for navigation (filter, group).
    // Optional. Order is not significant. Empty list and absent are equivalent.
    // System-generated tags are deferred to v0.2 (see non-goals).

  state_ref:        StateId
    // 1:1 with the IntentState object; separated for independent versioning

  extension:        TypeExtension
    // discriminated union; the variant is selected by `kind`
```

### Enum: `HolderMode`

```yaml
HolderMode: enum {
  human-held         // a human party advances; agents may assist but not advance
  agent-held         // an agent party advances; humans receive reports only
  jointly-held       // multiple parties; advancement requires consent of all parties listed in `holder.parties`
  hierarchically-held // one party (`parties[0]`) advances; child intents may be delegated to others; handoff is typed
}
```

### Enum: `LifetimeKind`

```yaml
LifetimeKind: enum {
  discrete    // single turn; satisfied or abandoned, then frozen
  campaign    // multi-turn, bounded; terminates on satisfaction, abandonment, or `expected_termination`
  standing    // continuous; terminates only on explicit revocation
}
```

### Enum: `IntentKind` (v0.1)

```yaml
IntentKind: enum {
  // (a) Nous-shaped
  nous-campaign
  nous-iteration

  // (b) Coral-shaped
  coral-optimization
  coral-attempt

  // (c) Feature-development-shaped
  feature-campaign
  feature-pr

  // (d) Paper-shaped
  paper-campaign
  paper-section
  paper-claim
}
// Adding a kind = breaking change (bumps to v0.2). Removing one = always breaking.
```

### Type: `HandoffSpec`

```yaml
HandoffSpec:
  parent_owes_children:  Schema?   // shape of the data the parent provides at delegation time
  children_owe_parent:   Schema?   // shape of the report each child provides on satisfaction
  // Schema here is opaque in v0.1; v0.2 will pin to JSON Schema.
```

---

## The `IntentState` object

State is **separated from declaration** so that mutations to state don't perturb intent identity, and so the state's history is independently auditable.

```yaml
IntentState:
  id:               StateId
  intent_id:        IntentId
  schema_version:   "0.1.0"

  status:           Status           // see enum
  last_advanced_at: Timestamp
  last_advanced_by: Party

  history:          list[StateTransition]
    // append-only audit log; never compacted in v0.1

  external_anchors: list[ExternalAnchor]
    // typed pointers to authoritative external state owned by another system

  projections:      dict[ZoomLevel, Projection]
    // cached summaries at predefined zoom levels; regenerable from intent + state + extension

Status: enum {
  draft      // in shaping: declaration fields are mutable; no execution work
             // has begun. Transitions to `active` on `commit`.
  active     // work is in progress
  gated      // active work is paused awaiting a typed gate decision (e.g., human approval)
  satisfied  // success_criterion met
  abandoned  // explicitly stopped without satisfaction
  revoked    // for standing intents: explicit revocation
}

StateTransition:
  at:           Timestamp
  by:           Party
  from_status:  Status
  to_status:    Status
  cause:        string             // free text; v0.2 may type this.
                                   // Recommended vocabulary during shaping:
                                   //   shaping-probe          (agent asks a question)
                                   //   shaping-clarification  (refine / choose-kind / bind-knowledge / probe answer)
                                   //   shaping-restructure    (decompose / fork / merge / reframe)
                                   //   shaping-commit         (draft → active)
  evidence:     list[Reference]?

ExternalAnchor:
  kind:         enum { git-branch | github-pr | github-repo | filesystem-path | markdown-doc | bibliography | worktree | nous-campaign-dir | coral-shared-dir | other }
                // `github-repo` was added v0.1.0 (additive amendment) for
                // Adapter #3 (GitHub-issues → feature-campaign).
  uri:          URI
  read_only:    bool               // if true, Integral MUST NOT mutate this anchor
  last_synced:  Timestamp?
  notes:        string?

ZoomLevel: enum {
  overview      // 1–3 sentences; "what is this and where does it stand"
  structure     // structural picture: children, gates, key state
  detail        // intent-kind-specific full detail
}

Projection:
  zoom:         ZoomLevel
  rendered_at:  Timestamp
  rendered_by:  Party             // could be a human author or an agent summarizer
  body:         string            // markdown
  stale_after:  Timestamp?        // a hint to the projection layer; not enforced
```

---

## `KnowledgeRef` — scoped corpus binding

```yaml
KnowledgeRef:
  scope:           KnowledgeScope
  uri:             URI
  role:            KnowledgeRole
  version:         string?
  inherited_from:  IntentId?       // required iff scope == inherited

KnowledgeScope: enum {
  global       // applies to all intents in the workspace (e.g., paper-writing style guide)
  project      // applies to a project/repo subtree (e.g., a repo's CLAUDE.md, conventions)
  campaign     // applies within a single campaign and its descendants
  iteration    // applies to one iteration only (e.g., that iteration's hypothesis bundle)
  inherited    // this intent inherits a KnowledgeRef from an ancestor; `inherited_from` names it
}

KnowledgeRole: enum {
  methodology      // prompts, phase definitions, gate semantics
  principles       // accumulated qualitative findings (Nous principles, etc.)
  conventions      // style/structure conventions (repo CLAUDE.md, paper venue style)
  citations        // bibliography, prior art
  templates        // hypothesis-bundle templates, attempt templates
  skills           // reusable agent-facing skills (Coral skills, Claude Code skills)
  other
}
```

---

## `EvidenceLink` — cross-intent edges

The single most important primitive in v0.1. Without it, the four kinds are parallel; with it, they're unified.

```yaml
EvidenceLink:
  id:             string                // ULID
  from_intent:    IntentId              // the asserting intent
  to_intent:      IntentId | Reference  // the supporting intent OR an external reference
  relation:       EvidenceRelation
  asserted_by:    Party
  asserted_at:    Timestamp
  strength:       enum { weak | moderate | strong }?
  note:           string?

EvidenceRelation: enum {
  supports
  contradicts
  partially-supports
  replicates
  derived-from         // the asserting intent is a derivative product of `to_intent`
                       //   (e.g., a paper claim derived from a Nous iteration)
  cites                // formal citation; for paper claims pointing at external work
}
```

**Examples of edges this enables (concrete, not hypothetical):**

- `paper-claim` `derived-from` `nous-iteration` — a paper claim is grounded in a specific Nous iteration's findings.
- `paper-claim` `replicates` `coral-attempt` — a paper validates that a Coral-discovered solution generalizes.
- `feature-pr` `supports` `nous-iteration` — a feature PR was opened to enable a hypothesized capability.
- `nous-iteration` `contradicts` `nous-iteration` (different campaigns) — replication failure across campaigns.

**Constraint.** `EvidenceLink` MUST NOT be embedded inside an intent's `extension`; it lives in a separate edge collection so cross-cutting queries ("what evidence supports claim X?") don't require traversing intent objects.

---

## Type extensions (one per `kind`)

### (a) Nous-shaped

```yaml
NousCampaignExtension:
  kind:                       "nous-campaign"
  research_question:          string
  current_iteration:          IntentId?
  open_hypothesis_bundles:    list[IntentId]    // all currently open `nous-iteration` children
  gate_status:                GateStatus
  // principles are accumulated as a KnowledgeRef on the intent itself,
  // not embedded here, so they can be queried independently.

NousIterationExtension:
  kind:                       "nous-iteration"
  iteration_number:           int
  hypothesis_bundle:          HypothesisBundle
  prediction_errors:          list[PredictionError]?
  principles_emitted:         list[Reference]?       // pointers into the principles ledger

HypothesisBundle:
  // matches Nous's H-main / H-ablation / H-super-additivity / H-control-negative / H-robustness shape
  h_main:                Hypothesis
  h_ablation:            list[Hypothesis]
  h_super_additivity:    Hypothesis?
  h_control_negative:    Hypothesis?
  h_robustness:          list[Hypothesis]?

Hypothesis:
  statement:    string
  prediction:   string                  // falsifiable
  conditions:   list[ConditionRef]      // experimental conditions, point at external runtime objects
  result:       enum { pending | confirmed | refuted | inconclusive }?
  notes:        string?

PredictionError:
  hypothesis_id:   string
  predicted:       string
  observed:        string
  taxonomy:        enum {
                     missing-mechanism | wrong-mechanism | scope-mismatch
                     | measurement-noise | spurious-correlation | other
                   }

GateStatus:
  current_gate:           enum { design | execute_analyze | none }?
  awaiting_party:         Party?
  awaiting_since:         Timestamp?
```

### (b) Coral-shaped

```yaml
CoralOptimizationExtension:
  kind:                  "coral-optimization"
  scoring_function_ref:  URI
  search_algorithm:      enum { ucb | island | beam | best-of-n | other }
  population_size:       int
  attempts_db_anchor:    ExternalAnchor   // points at .coral/attempts/
  shared_skills_anchor:  ExternalAnchor   // points at .coral/skills/
  best_score_so_far:     float?

CoralAttemptExtension:
  kind:                  "coral-attempt"
  worktree_anchor:       ExternalAnchor   // a git worktree
  score:                 float?           // null until evaluated
  artifact_uri:          URI?
  parent_attempts:       list[IntentId]   // for evolutionary lineage
  evaluator_log_uri:     URI?
```

### (c) Feature-development-shaped

```yaml
FeatureCampaignExtension:
  kind:                       "feature-campaign"
  repo_anchor:                ExternalAnchor      // canonical repo identifier
  inherited_conventions:      list[KnowledgeRef]  // SHOULD include the repo's CLAUDE.md, scoped `project`
  standing_invariants:        list[Reference]
    // CI rules, lint, conventions enforced by review/automation. These are
    // standing intents (separately declared, possibly elsewhere) that this
    // campaign must conform to but does not own.
  primary_pr_anchor:          ExternalAnchor?

FeaturePRExtension:
  kind:                       "feature-pr"
  github_pr_anchor:           ExternalAnchor
  ci_status:                  enum { pending | passing | failing | not-run }
  review_status:              enum { unrequested | requested | changes-requested | approved | merged | closed }
  diff_summary:               string?            // 1–3 sentence projection of the diff
```

### (d) Paper-shaped

```yaml
PaperCampaignExtension:
  kind:                       "paper-campaign"
  venue:                      string?
  submission_deadline:        Timestamp?
  draft_anchor:               ExternalAnchor     // markdown or LaTeX file
  citation_library_anchor:    ExternalAnchor     // bibtex, zotero, etc.
  sections:                   list[IntentId]     // ordered

PaperSectionExtension:
  kind:                       "paper-section"
  section_title:              string
  section_order:              int
  draft_anchor:               ExternalAnchor     // a region of the draft
  claims:                     list[IntentId]
  status:                     enum { outlined | drafted | revised | finalized }

PaperClaimExtension:
  kind:                       "paper-claim"
  claim_text:                 string
  // evidence_links lives in the cross-intent edge collection, NOT embedded here.
  // The query "evidence for claim X" filters EvidenceLink by from_intent = X.
  citation_status:            enum { unsourced | citation-attached | self-evidence | unsupported }
```

---

## Concrete examples

The following are minimal, illustrative instances. Each shows the *core* + *extension* shape; state objects and edge instances are abbreviated.

### Example 1: a Nous campaign

```yaml
intent:
  id: 01HXYZ-NOUS-CAMPAIGN-001
  schema_version: "0.1.0"
  kind: nous-campaign
  declaration:
    title: "Why does the v3 evaluator-driven optimizer plateau at 71%?"
    summary: |
      Investigate the plateau observed in the v3 optimizer. Goal is to extract
      qualitative principles that explain the ceiling, not to ship a better optimizer.
    success_criterion: "≥ 3 falsified hypotheses + ≥ 2 retained principles in the ledger."
  holder:
    mode: jointly-held
    parties: [{id: sri, kind: human}, {id: nous-planner, kind: agent}]
  lifetime:
    kind: campaign
    started_at: "2026-05-10T14:00:00Z"
  decomposition:
    parent_id: null
    children: [01HXYZ-NOUS-ITER-001, 01HXYZ-NOUS-ITER-002]
  provenance:
    declared_by: {id: sri, kind: human}
    declared_at: "2026-05-10T14:00:00Z"
    motivated_by: []
  knowledge_refs:
    - {scope: global, uri: file://nous/methodology/, role: methodology}
    - {scope: campaign, uri: file://campaigns/2026-05-10/principles.md, role: principles}
  state_ref: 01HXYZ-NOUS-CAMPAIGN-001-STATE
  extension:
    kind: nous-campaign
    research_question: "Why does the v3 optimizer plateau at 71%?"
    current_iteration: 01HXYZ-NOUS-ITER-002
    open_hypothesis_bundles: [01HXYZ-NOUS-ITER-002]
    gate_status: {current_gate: execute_analyze, awaiting_party: {id: sri, kind: human}}
```

### Example 2: a Coral optimization attempt

```yaml
intent:
  id: 01HXYZ-CORAL-ATTEMPT-042
  schema_version: "0.1.0"
  kind: coral-attempt
  declaration:
    title: "Attempt 42: island-3 mutation of best-so-far"
    summary: "Mutation of attempt-031 under island-3 search constraints."
    success_criterion: "score > 0.84 (current best)"
  holder:
    mode: hierarchically-held
    parties: [{id: coral-orchestrator, kind: agent}, {id: coral-worker-3, kind: agent}]
  lifetime:
    kind: campaign
    started_at: "2026-05-22T09:14:00Z"
  decomposition:
    parent_id: 01HXYZ-CORAL-CAMPAIGN-001
    children: []
  provenance:
    declared_by: {id: coral-orchestrator, kind: agent}
    declared_at: "2026-05-22T09:14:00Z"
    motivated_by:
      - {kind: intent, target: 01HXYZ-CORAL-ATTEMPT-031, note: "lineage parent"}
  knowledge_refs:
    - {scope: campaign, uri: file://.coral/skills/, role: skills}
    - {scope: inherited, uri: file://.coral/notes/, role: principles, inherited_from: 01HXYZ-CORAL-CAMPAIGN-001}
  state_ref: 01HXYZ-CORAL-ATTEMPT-042-STATE
  extension:
    kind: coral-attempt
    worktree_anchor: {kind: worktree, uri: file://.coral/worktrees/attempt-042, read_only: false}
    score: null
    parent_attempts: [01HXYZ-CORAL-ATTEMPT-031]
```

### Example 3: a feature-development PR

```yaml
intent:
  id: 01HXYZ-FEATURE-PR-007
  schema_version: "0.1.0"
  kind: feature-pr
  declaration:
    title: "Add intent-state projection cache (PR #1247)"
    summary: "Implements zoom-level projection caching for IntentState."
    success_criterion: "PR merged + CI green + invariant `projection-cache-bounded` upheld"
  holder:
    mode: hierarchically-held
    parties: [{id: sri, kind: human}, {id: code-reviewer-bot, kind: agent}]
  lifetime:
    kind: campaign
    started_at: "2026-05-20T10:00:00Z"
    expected_termination: {description: "PR merge or close"}
  decomposition:
    parent_id: 01HXYZ-FEATURE-CAMPAIGN-INTEGRAL-V0
    children: []
  provenance:
    declared_by: {id: sri, kind: human}
    declared_at: "2026-05-20T10:00:00Z"
    motivated_by:
      - {kind: intent, target: 01HXYZ-FEATURE-CAMPAIGN-INTEGRAL-V0}
  knowledge_refs:
    - {scope: project, uri: file://CLAUDE.md, role: conventions}
    - {scope: inherited, uri: file://CLAUDE.md, role: conventions, inherited_from: 01HXYZ-FEATURE-CAMPAIGN-INTEGRAL-V0}
  state_ref: 01HXYZ-FEATURE-PR-007-STATE
  extension:
    kind: feature-pr
    github_pr_anchor: {kind: github-pr, uri: "https://github.com/integral/integral/pull/1247", read_only: false}
    ci_status: passing
    review_status: requested
    diff_summary: "Adds ProjectionCache class; wires it into IntentState getters."
```

### Example 4: a paper claim with cross-intent evidence

```yaml
intent:
  id: 01HXYZ-PAPER-CLAIM-019
  schema_version: "0.1.0"
  kind: paper-claim
  declaration:
    title: "Claim: principle-conditioned mutation outperforms unconditioned by ≥ 12%"
    summary: ""
    success_criterion: "claim defended in §4.2 with ≥ 1 supporting evidence link of strength ≥ moderate"
  holder:
    mode: jointly-held
    parties: [{id: sri, kind: human}, {id: paper-drafter, kind: agent}]
  lifetime:
    kind: campaign
    started_at: "2026-05-18T16:00:00Z"
    expected_termination: {description: "paper submission to NeurIPS 2026"}
  decomposition:
    parent_id: 01HXYZ-PAPER-SECTION-004
    children: []
  provenance:
    declared_by: {id: sri, kind: human}
    declared_at: "2026-05-18T16:00:00Z"
    motivated_by:
      - {kind: intent, target: 01HXYZ-NOUS-CAMPAIGN-001, note: "claim grounded in this campaign"}
  knowledge_refs:
    - {scope: global, uri: file://paper-conventions/neurips.md, role: conventions}
    - {scope: campaign, uri: file://papers/2026-neurips/refs.bib, role: citations}
  state_ref: 01HXYZ-PAPER-CLAIM-019-STATE
  extension:
    kind: paper-claim
    claim_text: "Conditioning the mutation operator on the principles ledger produces ≥ 12% score improvement over unconditioned mutation across n=14 tasks."
    citation_status: self-evidence

# separate edge collection:
evidence_links:
  - id: 01HXYZ-EDGE-001
    from_intent: 01HXYZ-PAPER-CLAIM-019
    to_intent: 01HXYZ-NOUS-ITER-002
    relation: derived-from
    asserted_by: {id: sri, kind: human}
    asserted_at: "2026-05-19T11:00:00Z"
    strength: strong
  - id: 01HXYZ-EDGE-002
    from_intent: 01HXYZ-PAPER-CLAIM-019
    to_intent: 01HXYZ-CORAL-ATTEMPT-042
    relation: replicates
    asserted_by: {id: paper-drafter, kind: agent}
    asserted_at: "2026-05-19T14:30:00Z"
    strength: moderate
```

The four examples above exercise every section of the schema. If any of them is awkward to express, the schema needs revision before adapter code is written.

---

## Operations (informative, not normative in v0.1)

The schema describes the *shape* of intent objects. The operations that mutate them — `declare`, `refine`, `delegate`, `advance`, `gate`, `propose-transition`, `accept-proposal`, `satisfy`, `revoke` — are deferred to v0.2 once the shape has been validated against real adapters. Until then, adapters MAY implement these operations ad hoc.

The one operation that v0.1 implementations SHOULD support: **read-at-zoom-level**. Given an `IntentId` and a `ZoomLevel`, return the corresponding `Projection`, regenerating if stale. This is the load-bearing operation for the navigation surface and is the single most important thing to validate early.

### Shaping operations (informative)

While `Status == draft`, the following operations are valid on an intent. All are logged as `StateTransition` events with the corresponding `cause` from the recommended shaping vocabulary.

| Operation | Mutates | Cause | Hierarchical? |
|---|---|---|---|
| **refine** | declaration fields (title, summary, success_criterion) | `shaping-clarification` | no |
| **choose-kind** | `kind` (and resets `extension` to the new kind's defaults) | `shaping-clarification` | no |
| **bind-knowledge** | `knowledge_refs` | `shaping-clarification` | no |
| **decompose** | `decomposition.children` (creates new draft sub-intents) | `shaping-restructure` | **yes** — recursive shaping |
| **fork** | splits this draft into ≥ 2 sibling drafts | `shaping-restructure` | yes |
| **merge** | absorbs this draft as a child of an existing intent | `shaping-restructure` | yes |
| **reframe** | `kind` change mid-shaping (drops kind-specific extension data; logged) | `shaping-restructure` | no |
| **probe** | appends a typed clarifying question to history | `shaping-probe` | no |
| **clarify** | answers a probe; updates one or more declaration fields | `shaping-clarification` | possibly — clarification can reveal sub-intents |
| **commit** | `Status: draft → active`. Declaration freezes thereafter. | `shaping-commit` | no — terminal for shaping |

`commit` SHOULD be gated by adapters on a per-kind readiness check (e.g., a `nous-campaign` requires non-empty `success_criterion` and at least one bound `methodology` `KnowledgeRef`; a `paper-claim` requires non-empty `claim_text`). Adapters MAY allow override (commit-anyway) but MUST log the override with `cause: shaping-commit` and an explicit override note.

**Recursive shaping.** `decompose` during shaping creates child intents in `Status: draft`. Each child is itself shape-able with the same operations. This produces hierarchical refinement: a parent vague idea shapes into a typed parent intent whose children are themselves drafts awaiting their own shaping. A child's `commit` is independent of its parent's; the parent may commit while children are still in draft, or vice versa, depending on the kind's readiness rules.

---

## Non-goals for v0.1 (deferred, not forgotten)

Listed explicitly so the v0.1 → v0.2 diff is legible.

1. **Typed proposal/approval workflow.** v0.1 has `gated` status and `awaiting_party` but does not specify the proposal envelope, signature, or conflict-resolution rules for joint-held writes.
2. **Persistent agent identity / capability declaration.** `Party` is a thin record; v0.1 does not constrain how an agent identifies itself across sessions or declares its capabilities.
3. **`InvariantIntent` as its own kind.** v0.1 represents standing invariants only as `Reference`s from feature campaigns. Promoting them to a first-class `kind` (with watcher/remediation/escalation extensions) is a v0.2 concern.
4. **Cross-workspace federation.** All `IntentId`s in v0.1 are workspace-unique, not globally unique. Federation across workspaces (e.g., a paper's claim citing a Nous iteration in someone else's workspace) requires URI-shaped IntentIds and is deferred.
5. **Real-time event stream.** v0.1 is read-pull. A pub/sub layer for "notify me when intent X advances" is v0.2.
6. **Conflict resolution for concurrent state mutations.** v0.1 assumes a single writer per state object at any given time (an adapter constraint, not a schema feature).
7. **Schema for `HandoffSpec.parent_owes_children` / `children_owe_parent`.** v0.1 leaves this as opaque `Schema?`. v0.2 will pin to JSON Schema.
8. **Pinned `EvidenceRelation` taxonomy.** v0.1's enum is provisional; expect refinement once we see what relation kinds adapters actually need.
9. **Knowledge corpus *write-back* protocol.** v0.1 says intents *reference* corpora; how an iteration writes a new principle into the campaign's principles ledger is adapter-defined for now.
10. **Standing-intent watcher/remediation runtime.** When `InvariantIntent` arrives in v0.2, it will need typed watcher trigger schemas and bounded remediation envelopes; deferred until the four-kind shape stabilizes.

11. **System-generated tags and tag taxonomies.** v0.1's `tags` field is free-form and user-controlled. Auto-tagging from analysis ("contains-cluster-jobs", "long-running", "blocked-on-data") and tag namespaces / taxonomies are v0.2.

12. **Saved views, filter presets, and rich query language.** v0.1 supports a small fixed set of UX-layer filters (by kind, by tag, by "awaiting me"); saved filter presets and a query language over intent fields are v0.2.

13. **Text search over title/summary.** Out of scope for v0.1; navigation is structural + tag-based. Full-text search is v0.2.

14. **Agent-driven shaping suggestions.** v0.1 agents may `probe` and `clarify` during shaping; *suggesting* `decompose` / `fork` / `merge` / `reframe` moves (the agent volunteering "this draft should split") is v0.2.

15. **Reusable shaping templates per kind.** Standard probe sets per kind ("Nous campaign shaping template," "paper campaign shaping template") are obviously useful but premature — let real shaping conversations accumulate before templating them.

16. **Typed clarification taxonomies.** v0.1 keeps probe/clarification content as free text in `cause` notes and history. Typing the questions themselves (`question-about-success-criterion`, `question-about-kind`, etc.) is v0.2.

17. **Shaping checkpoints, time-outs, and GC.** v0.1 drafts persist indefinitely. Auto-archival of stale drafts, explicit checkpoint UI, and "you have 7 unresolved drafts" digests are v0.2.

---

## Candidate v0.2 additions

If v0.1 survives contact with all four adapters, the most likely v0.2 additions, in priority order:

1. **`InvariantIntent` as a kind**, with watcher/remediation/escalation extension. Promotes #15 from the catalog into the schema.
2. **Typed proposal envelope** for joint-held intents. Specifies the shape of a "next-iteration proposal" or "next-claim proposal" and the matching accept/refine/reject responses.
3. **Pinned `HandoffSpec` schemas** in JSON Schema, especially for the four most common handoff edges (campaign → iteration, campaign → attempt, campaign → PR, section → claim).
4. **`Capability` declarations on `Party`**, so the projection layer can render "who can advance this gate" without consulting an external party registry.
5. **`KnowledgeRef.write_policy`** (read-only / append / replace) so corpus contributions are auditable.
6. **First-class projection regeneration triggers** — a small set of typed events that mark a projection stale (state transition, child added, evidence-link created).

---

## Open questions for v0.1 review

These are not promises; they're the questions we'd most want to resolve before promoting any of v0.1's shapes to v1.0:

- Is `EvidenceLink` rich enough? (Strength enum may be too coarse; relation enum may be too narrow.)
- Should `KnowledgeScope.inherited` really be its own scope, or is it always derivable from the parent chain?
- Is `Status: gated` distinct enough from `Status: active`-with-an-awaiting-party? Could be unified.
- Should `Projection` be append-only history (a list at each zoom level) rather than a single cached value? Auditability vs. simplicity tradeoff.
- Is the `nous-iteration` extension's `HypothesisBundle` shape too specific to the H-main / H-ablation / H-super-additivity / H-control-negative / H-robustness convention? Could become a v0.2 generalization once we see how robust that convention is.
