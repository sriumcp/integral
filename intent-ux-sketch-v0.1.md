# Integral Intent UX Sketch

**Version: 0.1.0 (originally; surfaces survive unchanged into v0.2.0).**
**Status: pre-prototype design exploration. Breaking changes to surfaces and interactions expected.**
**Date: 2026-05-22 (v0.1) · 2026-05-29 (v0.2.0 schema notes)**

## What this document is

A sketch of the visual UX for navigating the intent space. Originally designed against v0.1's four kind families (Nous campaign, Coral optimization, feature dev, paper writing). v0.2.0 narrowed the schema to three live families (Nous, Coral, feature-development); paper- and PR-shaped illustrations below describe surfaces that will return when their adapters ship. Surface decisions (zoom semantics, activity strip, awaiting-me predicate, navigation) are version-stable.

The goal is to give a human a clean, calm view of intent state *while agents are concurrently advancing it* — and to make that concurrent activity transparent without making it overwhelming.

Companion documents:
- `intent-schema-v0.2.md` — current schema source of truth.
- `intent-schema-v0.1.md` — historical reference, includes the paper-* and feature-pr extensions this sketch illustrates.
- `intents-and-harnesses.md` (v2) — the catalog and abstractions this UX is meant to surface.

## Design commitments

1. **Default zoom = `structure`.** Overview is for orientation; detail is for inspection. The *daily-use* zoom level is structure: children + status + pending decisions. This is what the projection layer must do best.

2. **Spatial continuity over temporal recency.** The intent map is a *space* the human inhabits. Activity events point back into that space; they don't replace it. No Slack-shaped firehose.

3. **Typed events, not free-text logs.** Every state mutation carries a typed cause (`proposed-next-iteration`, `gated-pending-human`, `evidence-link-asserted`, `principle-emitted`, `attempt-scored`, `claim-citation-resolved`, `pr-ci-status-changed`, …). Typing makes events filterable, summarizable, and self-explaining.

4. **Presence over polling.** When an agent is actively working on an intent, the human sees a presence indicator on that intent's card. Inspired by Figma's multi-cursor pattern.

5. **Joint-held writes require typed proposals.** Agents do not silently advance jointly-held intents. They submit proposals; humans (or other joint holders) accept, refine, or reject. Hierarchically-held child intents *can* be advanced freely by their delegated holder — that's what makes hierarchy worth having.

6. **Reversibility within a window.** v0.1 design commitment: all state changes are reversible for some configurable window (default 24h). v0.2.0 dropped the placeholder reversibility chip from the AppHeader; the underlying audit-log + undo design is deferred until there are real mutations to undo.

7. **Significance dial, set per-user, per-tree.** Routine / notable / critical. Defaults to *notable* for active trees, *critical* for backgrounded trees.

8. **Projection budgets enforce the right zoom.** Overview projections ≤ 280 chars, structure ≤ 800, detail unbounded. The budget is also a diagnostic: if a generator can't fit, the intent probably needs re-decomposing.

---

## Three primary surfaces

### Surface 1 — The Intent Map (zoom = overview)

The default landing view. Shows all active intent trees in the workspace as cards grouped by tree. Cross-intent `EvidenceLink` edges rendered as thin lines between cards. Backgrounded (non-active) trees collapsed into a single sidebar item.

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│ Integral · workspace: research-2026                                          [≡] │
├──────────────────────────────────────────────────────────────────────────────────┤
│  ACTIVE TREES                                              [significance: notable] │
│                                                                                    │
│ ┌────────────────────────────┐    ┌────────────────────────────┐                   │
│ │ Nous · v3 plateau study    │    │ Coral · evaluator search   │                   │
│ │ jointly-held · campaign    │    │ hierarchically · campaign  │                   │
│ │ ● 1 proposal awaiting you  │    │ ● coral-orch working       │                   │
│ │ 3 children · iter-2 active │    │ 47 attempts · best 0.84    │                   │
│ │ last advanced 2m ago       │    │ last advanced 14s ago      │                   │
│ └─────────────┬──────────────┘    └────────────────────────────┘                   │
│               │ evidence (2)                                                       │
│               ▼                                                                    │
│ ┌────────────────────────────┐    ┌────────────────────────────┐                   │
│ │ Paper · NeurIPS 2026       │    │ Feature · Integral v0      │                   │
│ │ jointly-held · terminating │    │ hierarchically · campaign  │                   │
│ │ 4 sections · 23 claims     │    │ 7 PRs · 3 open · 4 merged  │                   │
│ │ 12 unresolved citations    │    │ CI: 1 failing                │                  │
│ │ deadline: 2026-06-15       │    │ last advanced 1h ago        │                   │
│ └────────────────────────────┘    └────────────────────────────┘                   │
│                                                                                    │
│  BACKGROUNDED (4) ▸                                       [show critical only]     │
└──────────────────────────────────────────────────────────────────────────────────┘
```

Per-card overview projection respects the ≤280 char budget. The card shows: kind, holder mode, lifetime, **most material material-change** (proposal awaiting / agent working / count summary), and last-advanced timestamp. Cross-tree evidence edges are visible but de-emphasized.

**What the human is choosing here:** which tree to inhabit next. The card surfaces *enough* for that decision and no more.

---

### Surface 2 — The Intent Detail Pane (zoom = structure, default)

When the human clicks into an intent, this is what they see by default. Three regions: header, structural body, side activity strip.

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│ workspace ▸ Nous ▸ v3 plateau study                                          [≡] │
├──────────────────────────────────────────────┬───────────────────────────────────┤
│ HEADER                                       │ ACTIVITY (this intent)            │
│ ┌──────────────────────────────────────────┐ │                                   │
│ │ Nous Campaign: v3 plateau study          │ │ ● 2m ago · nous-planner          │
│ │ jointly-held · campaign · active         │ │   proposed-next-iteration        │
│ │ holders: sri, nous-planner               │ │   iter-3 [accept] [refine]       │
│ │ "Why does v3 plateau at 71%?"            │ │                                   │
│ │ success: ≥3 falsified H + ≥2 principles  │ │ ◔ 12m ago · paper-drafter        │
│ │ last advanced 2m ago by nous-planner     │ │   evidence-link-asserted          │
│ └──────────────────────────────────────────┘ │   claim-19 → iter-2 (strong)     │
│                                              │                                   │
│ STRUCTURE                                    │ ◔ 47m ago · sri                   │
│ ┌──────────────────────────────────────────┐ │   gate-resolved                   │
│ │ Children (3)                             │ │   iter-2 design → execute        │
│ │  ✓ iter-1  satisfied                     │ │                                   │
│ │  ◔ iter-2  active · execute_analyze      │ │ ── routine (8) ▸ ──────────────   │
│ │      ● running on cluster: 4 conditions  │ │                                   │
│ │  ✎ iter-3  PROPOSED · awaiting you       │ │ filter: [notable]                 │
│ │      proposed by nous-planner 2m ago     │ │ since:  [last visit]              │
│ └──────────────────────────────────────────┘ │                                   │
│                                              │                                   │
│ EVIDENCE EDGES (outgoing)                    │                                   │
│ ┌──────────────────────────────────────────┐ │                                   │
│ │ → paper-claim-19  (derived-from, strong) │ │                                   │
│ │ → paper-claim-22  (derived-from, mod.)   │ │                                   │
│ └──────────────────────────────────────────┘ │                                   │
│                                              │                                   │
│ KNOWLEDGE                                    │                                   │
│ ┌──────────────────────────────────────────┐ │                                   │
│ │ Principles ledger (campaign): 12 entries │ │                                   │
│ │  · "evaluator-shaped reward induces ..." │ │                                   │
│ │  · "principle-conditioned mutation +12%" │ │                                   │
│ │  · [10 more]                             │ │                                   │
│ │ Methodology (global): nous/v3            │ │                                   │
│ └──────────────────────────────────────────┘ │                                   │
│                                              │                                   │
│ [zoom: ▸ overview  ◉ structure  ▸ detail]    │                                   │
└──────────────────────────────────────────────┴───────────────────────────────────┘
```

Structural body composes from the structure-level projection (≤800 chars for the prose summary) plus structured affordances (children list, evidence edges, knowledge refs). The activity strip shows events scoped *to this intent only* — workspace-wide activity lives on Surface 3.

**Pending proposals** appear inline in the children list with a distinct marker (`✎ PROPOSED`) and a duplicate prominent entry at the top of the activity strip with `[accept] [refine]` affordances. This makes proposals impossible to miss while keeping them spatially anchored to the intent they affect.

**Presence indicators**: any child or peer intent currently being worked on by an agent shows `● working` next to it. The badge clears when the agent commits or steps away.

#### Detail zoom (when invoked)

The same layout, but the structural body expands to show the full extension data — `HypothesisBundle` for a Nous iteration, attempt-DB rows for a Coral campaign, full claim text + every evidence link for a paper claim, full PR diff summary for a feature PR. No prose budget. This is the "I need to see everything" view, not the daily-use view.

---

### Surface 3 — The Workspace Activity Strip

Always visible on the right side of every view (toggleable). Bucketed by significance, ordered by recency within bucket. Critical events surface to the top regardless of recency.

```
┌──────────────────────────────────────┐
│ ACTIVITY · workspace                 │
│                                      │
│ ● CRITICAL (1)                       │
│ ──────────────────────────────────   │
│ 1h ago · feature-pr-007              │
│ ci-status-changed: passing → failing │
│                                      │
│ ● NOTABLE (4)                        │
│ ──────────────────────────────────   │
│ 2m   · nous-planner                  │
│        proposed-next-iteration       │
│        iter-3 in v3-plateau          │
│                                      │
│ 12m  · paper-drafter                 │
│        evidence-link-asserted        │
│        claim-19 → iter-2             │
│                                      │
│ 47m  · sri                           │
│        gate-resolved                 │
│        iter-2 → execute_analyze      │
│                                      │
│ 1h   · coral-orch                    │
│        attempt-scored: 0.84 (best)   │
│                                      │
│ ◔ ROUTINE (28) ▸                     │
│                                      │
│ ──────────────────────────────────   │
│ filter: [all trees] [last 24h]       │
│ significance: [notable+]             │
└──────────────────────────────────────┘
```

Click any event → main view scrolls to and highlights the affected intent (spatial continuity). Hover an event → that intent's card pulses subtly in the main view (preview without committing).

The routine bucket is collapsed by default. The significance taxonomy is enforced at the schema level: each typed event has a default significance (proposed-next-iteration = notable, attempt-scored = routine unless it sets a new best, ci-status-changed = critical when failing).

---

### Surface 4 — Shaping Mode (status = draft)

A structurally distinct surface from Map / Detail / Activity. Shaping mode is for the phase **before** an intent is executable: the human has a vague idea, probes Integral to clarify it, and watches the typed object firm up until it's ready for handoff. Reached by opening any intent whose `Status == draft`, or by declaring a new intent.

Two-pane layout: clarification dialog on the left, live typed intent draft on the right.

```
┌─────────────────────────────────────────────┬───────────────────────────────────┐
│ SHAPING DIALOG                              │ INTENT DRAFT (live)               │
│                                             │                                   │
│ sri (you):                                  │ ┌───────────────────────────────┐ │
│   I want to investigate why our v3          │ │ Status: DRAFT (shaping)        │ │
│   evaluator plateaus around 71%.            │ │                                │ │
│                                             │ │ kind: nous-campaign? ⚠         │ │
│ integral-probe (agent):                     │ │   ↳ tentative                  │ │
│   To shape this, three quick questions:     │ │                                │ │
│   1. Are you trying to learn *why* it       │ │ title: v3 plateau study        │ │
│      plateaus (discovery), or build a       │ │                                │ │
│      better evaluator (optimization)?       │ │ summary: ⚠ pending q1          │ │
│   2. What's your motivating observation?    │ │                                │ │
│   3. Is there an existing principles        │ │ success_criterion: ⚠ pending q1│ │
│      ledger this should draw on?            │ │                                │ │
│                                             │ │ holder: jointly-held           │ │
│ sri:                                        │ │   sri, nous-planner            │ │
│   1) Discovery. Want principles I can       │ │                                │ │
│      reuse, not just a better number.       │ │ knowledge_refs:                │ │
│   2) The 71% number replicated across       │ │   ⚠ pending q3                 │ │
│      three evaluator variants; something    │ │                                │ │
│      structural is going on.                │ │ decomposition:                 │ │
│   3) Yes — file://campaigns/principles.md   │ │   children: (none yet)         │ │
│                                             │ │                                │ │
│ integral-probe:                             │ │ tags: [investigation]          │ │
│   Good — that confirms nous-campaign, not   │ └───────────────────────────────┘ │
│   coral-optimization. Three follow-ups:     │                                   │
│   - Initial hypothesis bundle: would you    │  ✓ q1 resolved → kind locked      │
│     like me to draft H-main + an ablation   │  ⌛ q2-q4 pending                 │
│     skeleton from the principles ledger?    │                                   │
│   - Should this campaign cap iteration      │  [decompose into iter-1 draft]    │
│     count, or run until principle-          │  [fork into 2nd campaign]         │
│     saturation?                             │  [merge into existing campaign]   │
│   - Any conditions on which environments    │  [reframe to different kind]      │
│     this can run on (local-only / cluster / │                                   │
│     either)?                                │  [commit to active] (disabled —   │
│                                             │   3 unresolved questions)         │
│ [type a response, or click a draft field    │                                   │
│  in the right pane to edit it directly]     │                                   │
└─────────────────────────────────────────────┴───────────────────────────────────┘
```

**Design moves in this surface:**

- **The draft updates as the dialog progresses.** Fields are marked `⚠ pending` until clarification resolves them. The human watches the typed object firm up — the load-bearing UX move that makes the relationship between dialog and intent transparent. It also makes shaping output legible without re-reading the whole conversation: the draft pane is a continuously-current summary.
- **Restructure operations are first-class buttons** (`decompose` / `fork` / `merge` / `reframe`). The human can click them mid-dialog; the agent can request them via probe. Either way the result is a typed `shaping-restructure` transition logged in history.
- **Commit is gated by per-kind readiness.** `commit-to-active` is disabled while declaration has unresolved fields or open clarification questions. The human can override (commit-anyway) but the override is logged. This is what enforces "shaping outputs an executable intent, not a half-finished one."
- **Either party can drive.** The agent can probe; the human can answer or edit fields directly without dialog; the human can also ask the agent to draft something (e.g., "draft H-main from the principles ledger"). Bi-actor at every step, just like the rest of v0.1.

**Recursive (hierarchical) shaping.**

When the human clicks `decompose into iter-1 draft`, the surface forks: the parent campaign draft stays in the breadcrumb, and a new shaping pane opens for `iter-1` (also `Status: draft`). The human shapes the iteration with the agent — possibly answering kind-specific probes about the hypothesis bundle, conditions, gates — then commits it (or saves and returns later), then navigates back up to the parent. Each level of the hierarchy gets its own shaping session; each session's output is a typed sub-intent ready for execution or further shaping. A child's `commit` is independent of its parent's: a campaign may commit while its first iteration is still in shaping draft, or vice versa, depending on the kind's readiness rules. **This is what answers "vague idea → typed intent tree" cleanly: shaping is recursive, and each recursion produces an executable typed object at its level.**

**Activity strip behavior during shaping.**

Shaping events surface in the workspace activity strip at *routine* significance by default — they're frequent but rarely require interruption from outside the shaping session. Two exceptions surface at *notable*:
- A `shaping-restructure` (fork / merge / reframe / decompose) on a draft that has cross-tree references — these can affect adjacent campaigns.
- A `shaping-commit` — this is the moment a draft becomes executable, which other agents may be waiting on.

**What shaping mode deliberately does not do in v0.1:**

- Suggest restructure moves itself (e.g., "this draft looks like it should fork because…"). Agents can ask probes, not propose `fork`. Suggestions are v0.2.
- Render a "shaping template" per kind. The probes the agent asks in v0.1 come from per-kind defaults baked into the shaping agent; making them user-editable templates is v0.2.
- Type the probes (`question-about-success-criterion`, etc.). Probes are free text in v0.1; their typing is v0.2.
- Auto-archive stale drafts. v0.1 drafts persist until the human acts on them. Stale-draft GC is v0.2.

---

## Interaction model

### Navigation primitives

| Action | Effect |
|---|---|
| Click intent card | Drill into it (zoom = structure) |
| Click breadcrumb segment | Zoom out to that level |
| Click child in structure body | Drill further |
| Click evidence edge | Jump to linked intent (cross-tree if needed) |
| Click activity event | Scroll to + highlight affected intent |
| Hover activity event | Preview-pulse the affected intent |
| Pin intent (left rail) | Keep it accessible across navigation |
| `Esc` / back | Pop one zoom level |
| `[` / `]` | Cycle zoom: overview ↔ structure ↔ detail |

### Joint-held proposal flow

```
   AGENT                          INTEGRAL                       HUMAN
     │                               │                            │
     │  POST /intents/{id}/propose   │                            │
     ├──────────────────────────────▶│                            │
     │  (typed: next-iteration,      │                            │
     │   payload: hypothesis bundle) │                            │
     │                               │  emit: proposed-next-iter  │
     │                               ├───────────────────────────▶│
     │                               │  (visible in activity +    │
     │                               │   inline in children list) │
     │                               │                            │
     │                               │       click [accept]       │
     │                               │◀───────────────────────────┤
     │                               │  intent state: gated→active│
     │                               │  child intent: created     │
     │  notify: proposal-accepted    │                            │
     │◀──────────────────────────────┤                            │
     │  (agent proceeds to execute)  │                            │
```

Refinement is the same flow but with a `refine` action that returns the proposal to the agent with annotations. Reject closes the proposal and notifies the agent.

### Hierarchically-held advance flow (no human in the loop)

```
   PARENT-AGENT                    INTEGRAL                    CHILD-AGENT
     │                                │                            │
     │  delegate child intent X to    │                            │
     ├───────────────────────────────▶│                            │
     │  child-agent (typed handoff)   │                            │
     │                               │   notify: delegated         │
     │                               ├───────────────────────────▶│
     │                               │                            │
     │                               │   POST /intents/X/advance   │
     │                               │◀───────────────────────────┤
     │                               │   (state transitions emit   │
     │                               │    typed events at routine  │
     │                               │    significance — visible   │
     │                               │    but not interruptive)    │
     │                               │                            │
     │                               │   POST /intents/X/satisfy   │
     │                               │◀───────────────────────────┤
     │                               │   (typed report bound to   │
     │                               │    handoff schema)         │
     │   notify: child satisfied     │                            │
     │◀──────────────────────────────┤                            │
     │   + typed report attached     │                            │
```

Routine events from child agents do not surface above `routine` significance — the human sees them only when they ask. The handoff-completion event is `notable` because it's the moment the parent intent advances.

---

## Per-kind UX specializations

The four kinds share the same surfaces but differ in what's prominent in the structural body.

### Nous campaign / iteration

- Iteration cards show `HypothesisBundle` summary in structure zoom (H-main statement + counts of confirmed/refuted/pending across the bundle).
- Principles ledger always visible in the campaign-level structural body, scrollable.
- Gate status (design / execute_analyze) prominent — colored badge.
- Per-condition runtime status surfaced on the iteration card when active (cluster jobs visible).

### Coral optimization / attempt

- The campaign body shows the **scored-attempts panel** prominently — scatter plot of attempts by score over time, click to drill into an attempt.
- Best-so-far prominently displayed; "new best" is a notable event, not routine.
- Worktree links are always one click from the attempt card (external anchor).
- Population view replaces "children list" — attempts are not a flat list but a population.

### Feature campaign / PR

- The campaign body lists PRs with CI + review status as colored badges.
- Repo-scoped knowledge ref ("conventions: CLAUDE.md") visible at the top of the campaign body and inherited automatically into each PR's view.
- Standing invariants (CI rules, lint) shown as pinned chips above the PR list — clicking jumps to invariant intents (when v0.2 adds them).
- GitHub PR external anchor always one click away.

### Paper / section / claim

- The paper body shows sections in document order, claims nested under each section.
- Each claim card shows: claim text + citation status + count of evidence links by relation (`derived-from: 2`, `replicates: 1`).
- Click a claim → detail zoom shows the claim text + every evidence link rendered as a navigable card (clicking a `derived-from` link scrolls to the source Nous iteration in the cross-tree map view).
- Submission deadline shown in header — countdown turns red within 7 days.
- Unresolved citations bucket on the campaign body (must be empty before submission).

---

## Filtering, grouping, tagging (v0.1 scope)

Tags are a `list[string]` field on every intent (added to schema v0.1.0 as a non-breaking optional field). They are free-form and user-controlled. System-generated tags and tag taxonomies are deferred to v0.2.

**v0.1 filters** (available on every surface — forest, tree, activity strip):

| Filter | Default | Notes |
|---|---|---|
| By kind | all | toggle Nous / Coral / Feature / Paper independently |
| By tag | none | match-any across selected tags |
| Awaiting me | off | derived predicate: `Status == gated AND awaiting_party == me`, OR `holder.mode == jointly-held AND there's an open proposal I haven't responded to` |
| Active vs backgrounded | active | already in v0.1 forest layout; included here for completeness |

**v0.1 grouping** (forest view only):

- **By kind** is the default, already implicit in the forest layout.
- Other groupings (by tag, by status, by holder) are deferred to v0.2 — they restructure layout in ways that can hide things, and we want to learn from real navigation before committing to which groupings the prototype actually needs.

**Deferred to v0.2:** saved filter presets, tag combinations (AND/OR/NOT), text search over title/summary, alternative groupings, system-generated tags. These are listed explicitly as schema non-goals so the v0.1→v0.2 diff stays legible.

The discipline: three filters + group-by-kind is enough to navigate ≤ 100 intents cleanly. If the prototype hits that ceiling and feels cramped, we'll know what v0.2 needs to add — based on observed failure modes, not anticipated ones.

---

## Figures: conditional, not mandatory

Embedded micro-figures are a *reward of accumulated work*, not a default decoration. A card renders a figure in its figure slot **only when all three of the following hold**:

1. **Data threshold met.** Per-kind minimums (see table below). Below threshold → no figure, just typed status + counts.
2. **Information beyond status.** A 1-PR feature campaign or a 0-condition Nous iteration doesn't need a chart — status + counts already say it.
3. **Data present, not stubbed.** If external anchors haven't synced (e.g., GitHub PR data not fetched), the slot shows a "data pending" chip rather than a placeholder figure. We never train the human to ignore figures.

Per-kind defaults:

| Kind | Figure renders when … | Otherwise |
|---|---|---|
| Nous iteration | ≥ 1 condition has resulted | bundle outline + status |
| Nous campaign | ≥ 3 iterations completed | gate dots + counts |
| Coral campaign | ≥ 10 attempts scored | best-so-far chip + count |
| Coral attempt | (never — score gauge is minimal, not a figure) | score gauge + lineage chip |
| Feature campaign | ≥ 5 PRs | PR-status counts |
| Feature PR | (never — CI/review states are categorical) | CI + review badges |
| Paper campaign | ≥ 3 sections drafted | section list + counts |
| Paper claim | ≥ 3 evidence links | link-count chip |

Net effect: in a fresh workspace, almost no figures render — the UX is calm and chrome-light. Figures appear as campaigns earn them. This is what "start simple" looks like at the rendering layer.

A consequence worth flagging: this rule means the **same intent kind looks different at different points in its lifecycle**. A Nous campaign at iteration 1 has no figure; the same campaign at iteration 4 grows a sparkline. This is intentional — it's also a subtle signal to the human that the campaign has accumulated enough state to be worth visualizing.

---

## Multi-actor transparency: what the human always sees

A short list of invariants the UX commits to. If any of these fails in the prototype, the prototype has failed.

1. **Every agent action that affected my view is reachable from the activity strip within the configured window.** No silent mutations.

2. **Every joint-held proposal awaiting me is visible in at least two places**: inline at the affected intent, and prominent in the activity strip.

3. **Every active agent is named.** No "the system did X" — always `coral-orch did X` or `nous-planner did X`.

4. **Every state change shows what reverted it (if reverted) or what supersedes it (if superseded).** History is intact.

5. **The currently-selected significance level is always visible** so the human knows what they're filtering out.

6. **Spatial continuity on every navigation.** Clicking an activity event never loses my place; I can always get back with one `Esc`.

---

## What the v0.1 prototype validates

- Whether the three zoom levels (overview / structure / detail) are the right ones, or if real workspaces want more (e.g., a "tree-of-trees" zoom above overview) or different (e.g., a population-centric zoom for Coral).
- Whether the typed event taxonomy is rich enough to drive significance bucketing without ad hoc rules.
- Whether the projection budget (≤280 / ≤800 / unbounded) produces useful summaries — and what kinds of intent kinds chronically blow the budget.
- Whether agent-presence indicators feel reassuring (Figma-shaped) or surveillance-shaped. This is a UX risk, not a technical one.
- Whether the joint-held proposal flow keeps humans in the loop without making agents wait so long they're useless.
- Whether cross-tree evidence-edge navigation (paper claim → Nous iteration → Coral attempt → external citation) feels coherent or disorienting. This is the riskiest UX bet in v0.1.
- Whether shaping mode produces *executable* intents — i.e., whether the typed-object-firms-up-as-dialog-progresses pattern actually converges, or whether real users keep editing past commit. Watch for: how often `commit-anyway` overrides fire; how often committed intents get re-opened to draft; how deep the recursive shaping tree goes before users feel lost.

## What it deliberately doesn't validate

- Multi-human collaboration (deferred until single-human + agents works).
- Real-time pub/sub for activity (v0.1 polls every N seconds; "live cursor" presence is approximated, not true real-time).
- Mobile or small-screen layouts.
- Visualizations of large workspaces (>~50 active intents). Initial prototype targets workspaces small enough to fit on one screen at overview zoom.
- The proposal-refinement protocol (v0.2 — for v0.1, refine = reject + new proposal).
- Standing-invariant intent surfaces (these arrive with `InvariantIntent` in v0.2).
- Agent-initiated shaping suggestions (`fork` / `merge` / `reframe` recommendations from agents). v0.1 agents can probe; restructure is human-initiated.
- Per-kind shaping templates and typed clarification taxonomies (v0.2).
- Stale-draft auto-archival or "you have N unresolved drafts" digests (v0.2).

---

## Open design questions

These are the questions I'd most want resolved before any pixels are committed:

1. **Is the activity strip persistent across views, or only on the map view?** Always-visible keeps transparency continuous; only-on-map keeps detail zoom uncluttered. I currently lean *always-visible-but-collapsible*, but it needs testing with a real campaign.

2. **Do we render cross-tree evidence edges in the map view, or only on demand?** Always-visible makes the substrate's unifying claim self-evident; on-demand keeps the map readable. Probably gated by edge count: ≤ N visible always, > N on demand.

3. **Where does the human author proposals?** Agents post via API. Humans need a way to author their own proposals (a structured form per typed-event-kind, or a free-text "what should we do next" that an agent shapes into a typed proposal). v0.1 should pick one and learn from it.

4. **How do we render `Status: gated`?** Right now I've been showing it as a colored badge on the intent card. But a gate that's awaiting a *specific human* is more like an inbox item than a status — should gates also surface in a dedicated "your queue" view? Probably yes for v0.2, but v0.1 should at least pin gates-awaiting-you to the top of the activity strip.

5. **Per-kind specialization vs. shared UX.** I've sketched per-kind variations in the structural body. The risk: if every kind specializes too much, the substrate's value proposition (one UX for many intent shapes) erodes. The discipline: per-kind specialization is allowed in the *structural body content*, but **never** in the surrounding chrome (header, activity strip, navigation). That keeps the substrate identity intact while letting each kind show what matters.

6. **Reversibility window default.** 24h is my guess; could be 1h or 1 week depending on the workflow. Should be per-tree configurable. Worth measuring once the prototype runs.

7. **What does "the human is here" feel like to the agents?** Agents may want to know whether the human is currently looking at an intent before posting a proposal vs. queuing it for later. v0.1 punts; v0.2 may need a `human_present` signal on intent state.

8. **How does shaping mode handle interruption?** A human shaping a draft may step away mid-dialog. v0.1 just persists the draft and reopens to the same state — but a real workflow probably needs a "where we were" summary on return (the projection layer applied to the dialog itself, not just the typed object). Worth measuring how often shaping sessions span multiple sittings before adding chrome.

9. **Should commit-anyway require a typed override reason?** v0.1 logs the override but doesn't require a reason. The risk: commit-anyway becomes the default escape hatch and shaping discipline degrades. The opposite risk: requiring a reason makes the override feel heavy enough that humans don't commit at all. Probably needs A/B testing once there's something to test.

10. **Do agent-driven probes inherit per-kind defaults, or come from a system prompt?** v0.1 says probes come from per-kind defaults baked into the shaping agent. Whether those defaults live in code (frozen) or in a knowledge corpus (editable) is a v0.1 implementation choice that affects how easily the prototype iterates.
