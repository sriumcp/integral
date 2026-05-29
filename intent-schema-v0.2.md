# Integral Intent Schema

**Version: 0.2.0**
**Status: superseded by v0.3.0 on 2026-05-29. Kept for historical reference.**
**Date: 2026-05-29**

> **Read this for the v0.2.0 grammar.** v0.3.0 added the `research-thread` kind on top of v0.2.0's five kinds. Most of this document — core types, holder, lifetime, status, knowledge refs, evidence links, projections, operation log, workspace bundle, shaping operations — applies unchanged to v0.3.0. See `intent-schema-v0.3.md` for the diff and current authoritative kind enum.

## Versioning policy

- Pre-1.0: every breaking change bumps the *minor* (0.1 → 0.2 → 0.3). We do not maintain backward compatibility before 1.0.
- Each version lives in its own file (`intent-schema-v0.1.md`, `intent-schema-v0.2.md`, …) so the diff is legible and old adapters can keep referencing the version they were built against.
- The `schema_version` field on every intent object is authoritative — adapters MUST reject objects whose version they don't understand.
- Non-goals for the current version are listed explicitly at the bottom of this file; deferred concerns are not bugs.

## What v0.2.0 changed from v0.1.0

This is a **breaking change**. The headline is a narrowing of `IntentKindSchema` from nine kinds to five. The kinds dropped were `feature-pr`, `paper-campaign`, `paper-section`, `paper-claim` — none had a working adapter; all four survived only via the bundled fixture, which was also removed in this bump (it was a demo affordance, not a production data source).

| Item | v0.1.0 | v0.2.0 |
|---|---|---|
| `IntentKindSchema` | 9 kinds (nous-campaign/iteration, coral-optimization/attempt, feature-campaign/pr, paper-campaign/section/claim) | **5 kinds** (nous-campaign/iteration, coral-optimization/attempt, feature-campaign) |
| `FeaturePRExtensionSchema` | present | **removed** |
| `PaperCampaignExtensionSchema` | present | **removed** |
| `PaperSectionExtensionSchema` | present | **removed** |
| `PaperClaimExtensionSchema` | present | **removed** |
| `CIStatusSchema` | present (used by `feature-pr`) | **removed** |
| `ReviewStatusSchema` | present (used by `feature-pr`) | **removed** |
| `PaperSectionStatusSchema` | present (used by `paper-section`) | **removed** |
| `ClaimCitationStatusSchema` | present (used by `paper-claim`) | **removed** |
| `SCHEMA_VERSION` literal | `'0.1.0'` | `'0.2.0'` |
| Bundled runtime fixture (`src/fixtures/workspace.ts`) | present | **removed** |
| Visual-regression Playwright project | present | **removed** (every baseline depended on `?sources=fixture`) |
| Configurable identity (`me`) | hardcoded `{id: 'sri'}` | **read from `integral.config.json` or `os.userInfo()`** |
| Adapter-synthesized human holder when source has no holder | hardcoded `{id: 'sri'}` (silently misattributed) | **`{id: 'unknown-human', display_name: '(unknown)'}`** (see `gaps.md` § G-N-13) |

**No structural-grammar changes.** Core types (`IntentId`, `Party`, `Reference`), holder modes, lifetime kinds, status enum, knowledge refs, evidence links, projections, operation log — all unchanged from v0.1.0. Read `intent-schema-v0.1.md` for the full grammar of those sections; they apply to v0.2.0 as-is. The v0.1 examples for `nous-campaign`, `coral-attempt`, etc. (Examples 1, 2, 4 from the v0.1 doc) remain valid v0.2.0 instances modulo the `schema_version` literal.

**What didn't survive the cut returns when its adapter ships.** Paper kinds come back when the paper adapter lands. `feature-pr` comes back when full feature-dev (PR/CI/review reading) ships — separately from the existing read-only GitHub-issues adapter, which only emits `feature-campaign`. Each return is a fresh schema bump.

## Companion document

This schema is the substrate behind the catalog in `intents-and-harnesses.md` (v2). The two documents evolve together: the catalog identifies *what* needs to be expressed; this schema specifies *how*.

---

## Design principles

The nine principles from `intent-schema-v0.1.md` § Design principles all carry over unchanged. The most load-bearing for v0.2.0:

1. **Intent is a typed, persistent, queryable object.** Five core fields — holder, scope/criterion, lifetime, decomposition, provenance — are common to every intent regardless of kind.
2. **State is separate from intent.** The intent object declares *what is being pursued*; the state object records *where pursuit currently stands*.
3. **External anchors, not mirrors.** When authoritative state lives in another system, Integral *points at it* via typed `ExternalAnchor` references.
4. **Discriminated extension by `kind`.** Different intent shapes share one core schema; intent-type-specific data lives in a typed `extension` field selected by `kind`. Adding a kind extends the union; it does not change the core.
5. **Cross-intent edges are first-class.** `EvidenceLink` connects intents across kinds. Without this, parallel schemas; with it, one substrate.
6. **Knowledge corpus references are scoped.** Scope is required on every `KnowledgeRef`.
7. **Projection at multiple zoom levels is part of the schema.** Cached projections at `overview` / `structure` / `detail`.
8. **Bi-actor by default.** Every operation accepts either a human or an agent.
9. **Shaping is a typed phase with mutable declaration.** While `Status == draft`, declaration fields are mutable; `commit` freezes them.

---

## Core types — unchanged from v0.1.0

`IntentId`, `StateId`, `PartyId`, `URI`, `Timestamp`, `Party`, `Reference` — all identical to v0.1.0. See `intent-schema-v0.1.md` § Core types.

---

## The `Intent` object

Identical to v0.1.0 in shape; only the `kind` enum and the `extension` discriminated union narrow. See `intent-schema-v0.1.md` § The `Intent` object for the full field list. The `schema_version` literal MUST be `"0.2.0"` for any v0.2.0 instance.

### Enum: `IntentKind` (v0.2.0)

```yaml
IntentKind: enum {
  // (a) Nous-shaped
  nous-campaign
  nous-iteration

  // (b) Coral-shaped
  coral-optimization
  coral-attempt

  // (c) Feature-development-shaped (campaign only — feature-pr returns when
  //     full feature-dev / PR-reading adapter lands in v0.3+)
  feature-campaign
}
// Adding or removing a kind is a breaking change; bumps to a new schema file.
```

### Enum: `HolderMode`, `LifetimeKind`, `Status` — unchanged

See `intent-schema-v0.1.md` § Enum: HolderMode / LifetimeKind / Status (in IntentState section). `Status` keeps the same six values: `draft`, `active`, `gated`, `satisfied`, `abandoned`, `revoked`.

---

## The `IntentState` object — unchanged from v0.1.0

Same shape, same status enum, same external-anchor enum (with `'github-repo'` still present from the v0.1.0 additive amendment), same projection model. The `schema_version` literal MUST be `"0.2.0"`.

See `intent-schema-v0.1.md` § The `IntentState` object.

---

## `KnowledgeRef`, `EvidenceLink`, `ExternalAnchor`, `ZoomLevel`, `Projection`

All unchanged from v0.1.0. See the respective sections in `intent-schema-v0.1.md`.

`EvidenceLink` remains the load-bearing primitive; the four examples in v0.1.0 § EvidenceLink that involve removed kinds (paper-claim → nous-iteration; feature-pr → nous-iteration) cannot be expressed under v0.2.0. They return when the corresponding adapters ship.

---

## Type extensions (one per `kind`)

### (a) Nous-shaped — unchanged

```yaml
NousCampaignExtension:
  kind:                       "nous-campaign"
  research_question:          string
  current_iteration:          IntentId?
  open_hypothesis_bundles:    list[IntentId]
  gate_status:                GateStatus

NousIterationExtension:
  kind:                       "nous-iteration"
  iteration_number:           int
  hypothesis_bundle:          HypothesisBundle
  prediction_errors:          list[PredictionError]?
  principles_emitted:         list[Reference]?
```

`HypothesisBundle`, `Hypothesis`, `PredictionError`, `GateStatus` — see `intent-schema-v0.1.md` § Type extensions / (a) Nous-shaped. Unchanged.

### (b) Coral-shaped — unchanged

```yaml
CoralOptimizationExtension:
  kind:                  "coral-optimization"
  scoring_function_ref:  URI
  search_algorithm:      enum { ucb | island | beam | best-of-n | other }
  population_size:       int
  attempts_db_anchor:    ExternalAnchor
  shared_skills_anchor:  ExternalAnchor
  best_score_so_far:     float?

CoralAttemptExtension:
  kind:                  "coral-attempt"
  worktree_anchor:       ExternalAnchor
  score:                 float?
  artifact_uri:          URI?
  parent_attempts:       list[IntentId]
  evaluator_log_uri:     URI?
```

### (c) Feature-development-shaped — campaign only

```yaml
FeatureCampaignExtension:
  kind:                       "feature-campaign"
  repo_anchor:                ExternalAnchor      // canonical repo identifier
  inherited_conventions:      list[KnowledgeRef]  // SHOULD include the repo's CLAUDE.md, scoped `project`
  standing_invariants:        list[Reference]
  primary_pr_anchor:          ExternalAnchor?
```

`feature-pr` was the natural child kind under a `feature-campaign`; in v0.2.0 a `feature-campaign` either has no children (the GitHub-issues adapter's leaf-issue case) or has child `feature-campaign`s (sub-issues, the tracking-issue case). PR reading returns when v0.3+ ships the full feature-dev adapter.

### (d) Paper-shaped — removed in v0.2.0

`PaperCampaignExtension`, `PaperSectionExtension`, `PaperClaimExtension` were specified in v0.1.0 but had no working adapter. They return when the paper adapter ships. See `intent-schema-v0.1.md` § Type extensions / (d) Paper-shaped for the v0.1.0 spec, which is the starting point for the eventual v0.3+ design.

---

## Operation log — unchanged from v0.1.0

The 16 operation kinds (9 lifecycle + 7 shaping) remain. Adapters EMIT operations; the UI RENDERS them. Users do NOT FIRE operations directly (writeback / orchestration is deferred).

See `intent-schema-v0.1.md` § Operation log for the full discriminated-union spec, op-kind catalog, and emission discipline.

---

## Workspace bundle — unchanged from v0.1.0

`Workspace = { intents, states, evidence_links, operations }` with the 1:1 Intent↔IntentState bijection enforced via `WorkspaceSchema.refine`. See `intent-schema-v0.1.md` § Workspace bundle.

---

## Concrete examples — surviving from v0.1.0

The v0.1.0 doc's Example 1 (Nous campaign), Example 2 (Coral attempt), and Example 4 (feature-campaign) remain valid v0.2.0 instances when the `schema_version` literal is updated to `"0.2.0"`. v0.1.0 Examples 3 (feature-pr) and 5 (paper-claim) cannot be expressed in v0.2.0; they return with their adapters.

See also `integral-ui/src/test/seed-workspace.ts` for the live, schema-validated seed used by the test suite — the same five kinds covered, end-to-end through `WorkspaceSchema.safeParse`.

---

## Shaping operations — unchanged from v0.1.0

Refinement, restructure, and probe/clarify/commit operations remain identical. `commit` gates per-kind on adapter-defined readiness checks.

See `intent-schema-v0.1.md` § Shaping operations.

---

## Non-goals for v0.2.0 (deferred)

The 17 non-goals from `intent-schema-v0.1.md` § Non-goals for v0.1 carry forward. v0.2.0 adds:

18. **Paper kinds.** `paper-campaign`, `paper-section`, `paper-claim` come back when the paper adapter ships. The v0.1.0 extension shapes are the starting point; final design will reflect what real paper-authoring workflows actually need (which v0.1.0's spec couldn't validate without an adapter).

19. **`feature-pr` kind.** Returns when the full feature-dev adapter (PR reading + CI + review status) ships in v0.3+. The v0.1.0 extension shape is the starting point.

20. **Visual regression coverage.** Removed in v0.2.0 because every baseline depended on `?sources=fixture` for deterministic data. Returns when a deterministic data-seeding mechanism (or the paper / feature-pr adapters reintroduce kinds we want pixel-locked) ships.

21. **A first-launch onboarding flow.** v0.2.0 falls back to a single default Nous source pointing at `~/Documents/Projects/inference-sim/` when no `integral.config.json` is configured. A friendly "configure a source" empty state for fresh checkouts is deferred.

---

## Candidate later additions

If v0.2.0 survives contact with paper-authoring + execution-orchestrator work, the most likely next additions:

1. **The paper kinds, post-adapter.** Returning paper-campaign / -section / -claim with whatever shape the adapter actually needs.
2. **`InvariantIntent` as a kind** (deferred from v0.1.0).
3. **Typed proposal envelope** for joint-held intents.
4. **`Capability` declarations on `Party`**, so the projection layer can render "who can advance this gate" without consulting an external party registry.
5. **`KnowledgeRef.write_policy`** (read-only / append / replace) so corpus contributions are auditable.
6. **First-class projection regeneration triggers** — a small set of typed events that mark a projection stale.

---

## Open questions for v0.2.0 review

The five open questions from `intent-schema-v0.1.md` § Open questions all survive. The v0.2.0-specific addition:

- **Is the v0.2.0 narrowing the right shape?** v0.1.0 declared nine kinds upfront on the bet that adapters would mostly ratify them. Three out of four families ratified (Nous, Coral, GitHub-issues-as-feature-campaign); the paper family + `feature-pr` didn't ship. The v0.2.0 stance is *don't pre-declare kinds for adapters that don't exist* — re-introduce on adapter delivery, with a fresh schema bump per. Whether this discipline holds when paper-* and feature-pr return (does paper still split into campaign/section/claim, or does the adapter want a different cut?) is the load-bearing question.
