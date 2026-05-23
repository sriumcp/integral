// Mock data for the Integral workspace inspector.
// Shapes mirror intent-schema-v0.1.md; not a strict implementation — enough to
// drive the UX surfaces with realistic numbers, times, and prose.

const NOW = new Date("2026-05-22T15:42:00Z").getTime();
const ago = (mins) => new Date(NOW - mins * 60_000).toISOString();
const inDays = (d)  => new Date(NOW + d * 86_400_000).toISOString();

const parties = {
  sri:           { id: "sri",                   kind: "human", display: "sri",                 short: "sri",   tone: "human" },
  nousPlanner:   { id: "nous-planner",          kind: "agent", display: "nous-planner",        short: "n-plan", tone: "agent" },
  coralOrch:     { id: "coral-orch",            kind: "agent", display: "coral-orch",          short: "c-orch", tone: "agent" },
  coralW3:       { id: "coral-worker-3",        kind: "agent", display: "coral-worker-3",      short: "c-w3",  tone: "agent" },
  paperDrafter:  { id: "paper-drafter",         kind: "agent", display: "paper-drafter",       short: "p-drf", tone: "agent" },
  reviewerBot:   { id: "code-reviewer-bot",     kind: "agent", display: "code-reviewer-bot",   short: "rev-b", tone: "agent" },
  integralProbe: { id: "integral-probe",        kind: "agent", display: "integral-probe",      short: "probe", tone: "agent" },
  ciSystem:      { id: "ci-runner",             kind: "system", display: "ci-runner",         short: "ci",    tone: "system" },
};

// ─── Trees ────────────────────────────────────────────────────────────────
// Four kinds. Each tree has a root intent and ≥1 child.
// Activity events live in a separate top-level list and are filtered per-intent.

const TREES = {
  // (a) Nous campaign — the canonical example from the schema doc.
  nous: {
    id: "01HXYZ-NOUS-CAMPAIGN-001",
    short_id: "nous-c01",
    kind: "nous-campaign",
    kind_label: "Nous · campaign",
    declaration: {
      title:   "v3 plateau study",
      summary: "Investigate the plateau observed in the v3 optimizer. Goal is to extract qualitative principles that explain the ceiling, not to ship a better optimizer.",
      research_question: "Why does the v3 evaluator-driven optimizer plateau at 71%?",
      success: "≥3 falsified hypotheses + ≥2 retained principles in the ledger.",
    },
    holder:   { mode: "jointly-held", parties: [parties.sri, parties.nousPlanner] },
    lifetime: { kind: "campaign", started_at: ago(60 * 24 * 12) },
    status:   "active",
    last_advanced: { at: ago(2),  by: parties.nousPlanner },
    tags:     ["investigation", "v3-optimizer", "principles"],
    knowledge: [
      { scope: "global",   role: "methodology", uri: "file://nous/methodology/v3",            label: "Nous v3 methodology" },
      { scope: "campaign", role: "principles",  uri: "file://campaigns/2026-05-10/principles.md", label: "Principles ledger · 12 entries" },
    ],
    extension: {
      gate_status: { current_gate: "execute_analyze", awaiting: parties.sri, awaiting_since: ago(47) },
      principles_count: 12,
      principles_preview: [
        "evaluator-shaped reward induces premature convergence on local maxima",
        "principle-conditioned mutation outperforms unconditioned by ≥12% (n=14)",
        "the 71% ceiling replicates across 3 evaluator variants — structural",
      ],
    },
    children: [
      {
        id: "01HXYZ-NOUS-ITER-001", short_id: "iter-1", kind: "nous-iteration",
        title: "iter-1 · evaluator-shape ablation",
        status: "satisfied", last_advanced: { at: ago(60*24*5), by: parties.sri },
        extension: {
          iteration_number: 1,
          bundle: { confirmed: 1, refuted: 2, pending: 0, total: 3 },
          principles_emitted: 2,
        },
      },
      {
        id: "01HXYZ-NOUS-ITER-002", short_id: "iter-2", kind: "nous-iteration",
        title: "iter-2 · reward-curvature probe",
        status: "active", gate: "execute_analyze",
        last_advanced: { at: ago(47), by: parties.sri },
        presence: { party: parties.nousPlanner, note: "running on cluster: 4 conditions" },
        extension: {
          iteration_number: 2,
          bundle: { confirmed: 0, refuted: 1, pending: 3, total: 4 },
          principles_emitted: 0,
        },
      },
      {
        id: "01HXYZ-NOUS-ITER-003", short_id: "iter-3", kind: "nous-iteration",
        title: "iter-3 · principle-conditioned mutation",
        status: "proposed", proposed_by: parties.nousPlanner, proposed_at: ago(2),
        proposal_note: "Drafted H-main + 2 ablation hypotheses based on principles ledger entries 7 and 9.",
        extension: { iteration_number: 3, bundle: { confirmed: 0, refuted: 0, pending: 3, total: 3 } },
      },
    ],
  },

  // (b) Coral optimization
  coral: {
    id: "01HXYZ-CORAL-CAMPAIGN-001",
    short_id: "coral-c01",
    kind: "coral-optimization",
    kind_label: "Coral · optimization",
    declaration: {
      title:   "evaluator search · island-3",
      summary: "Search for an evaluator function that breaks the v3 plateau ceiling. Pluggable scoring; island-3 search algorithm.",
      success: "Best-of-population score > 0.90 (current best: 0.84) across ≥3 holdout tasks.",
    },
    holder:   { mode: "hierarchically-held", parties: [parties.coralOrch, parties.coralW3] },
    lifetime: { kind: "campaign", started_at: ago(60*24*9) },
    status:   "active",
    last_advanced: { at: ago(0.25), by: parties.coralW3 },
    tags: ["optimization", "evaluator", "island-3"],
    knowledge: [
      { scope: "campaign", role: "skills", uri: "file://.coral/skills/",   label: "Coral skills" },
      { scope: "campaign", role: "principles", uri: "file://.coral/notes/", label: "Shared notes" },
    ],
    extension: {
      algorithm: "island",
      population_size: 12,
      attempts_total: 47,
      attempts_scored: 41,
      best_score: 0.842,
      best_attempt: "attempt-031",
      recent_scores: [0.42, 0.51, 0.63, 0.58, 0.71, 0.74, 0.69, 0.78, 0.81, 0.79, 0.84, 0.82, 0.83, 0.80, 0.84],
      attempts_db_anchor: "file://.coral/attempts/",
    },
    children: [
      { id: "01HXYZ-CORAL-ATTEMPT-042", short_id: "attempt-042", kind: "coral-attempt",
        title: "attempt-042 · island-3 mutation of best-so-far",
        status: "active", presence: { party: parties.coralW3, note: "evaluating on holdout-2" },
        last_advanced: { at: ago(0.25), by: parties.coralW3 },
        extension: { score: null, parent: "attempt-031", worktree: "file://.coral/worktrees/attempt-042" } },
      { id: "01HXYZ-CORAL-ATTEMPT-031", short_id: "attempt-031", kind: "coral-attempt",
        title: "attempt-031 · island-1 crossover",
        status: "satisfied",
        last_advanced: { at: ago(60*4), by: parties.coralOrch },
        extension: { score: 0.842, parent: "attempt-019", worktree: "file://.coral/worktrees/attempt-031" } },
      { id: "01HXYZ-CORAL-ATTEMPT-040", short_id: "attempt-040", kind: "coral-attempt",
        title: "attempt-040 · island-2 mutation",
        status: "satisfied",
        last_advanced: { at: ago(60*1.2), by: parties.coralOrch },
        extension: { score: 0.797, parent: "attempt-028", worktree: "file://.coral/worktrees/attempt-040" } },
    ],
  },

  // (c) Paper campaign — NeurIPS 2026
  paper: {
    id: "01HXYZ-PAPER-CAMPAIGN-001",
    short_id: "paper-c01",
    kind: "paper-campaign",
    kind_label: "Paper · campaign",
    declaration: {
      title:   "Principle-conditioned mutation in evaluator-driven optimization",
      summary: "Paper drawing claims from the v3 plateau study and the Coral island-3 search. Target venue: NeurIPS 2026.",
      success: "Submission accepted by deadline; ≥1 strong evidence link per primary claim; all citations resolved.",
    },
    holder: { mode: "jointly-held", parties: [parties.sri, parties.paperDrafter] },
    lifetime: { kind: "campaign", started_at: ago(60*24*4), expected_termination: { description: "NeurIPS 2026 submission", at: inDays(24) } },
    status: "active",
    last_advanced: { at: ago(12), by: parties.paperDrafter },
    tags: ["neurips-2026"],
    knowledge: [
      { scope: "global",   role: "conventions", uri: "file://paper-conventions/neurips.md", label: "NeurIPS conventions" },
      { scope: "campaign", role: "citations",   uri: "file://papers/2026-neurips/refs.bib", label: "refs.bib · 84 entries" },
    ],
    extension: {
      venue: "NeurIPS 2026",
      submission_deadline: inDays(24),
      sections_total: 6,
      sections_drafted: 4,
      claims_total: 23,
      claims_supported: 11,
      citations_unresolved: 12,
      draft_anchor: "file://papers/2026-neurips/draft.md",
    },
    children: [
      { id: "01HXYZ-PAPER-SECTION-002", short_id: "§2 background", kind: "paper-section",
        title: "§2 · Background", status: "drafted",
        extension: { section_order: 2, claims: 4, claims_supported: 4 } },
      { id: "01HXYZ-PAPER-SECTION-003", short_id: "§3 method", kind: "paper-section",
        title: "§3 · Method", status: "drafted",
        extension: { section_order: 3, claims: 6, claims_supported: 5 } },
      { id: "01HXYZ-PAPER-SECTION-004", short_id: "§4 results", kind: "paper-section",
        title: "§4 · Results", status: "drafted",
        extension: { section_order: 4, claims: 9, claims_supported: 2,
                     featured_claim: { id: "claim-19", text: "Conditioning the mutation operator on the principles ledger produces ≥12% score improvement (n=14)." } } },
      { id: "01HXYZ-PAPER-SECTION-005", short_id: "§5 discussion", kind: "paper-section",
        title: "§5 · Discussion", status: "outlined",
        extension: { section_order: 5, claims: 4, claims_supported: 0 } },
    ],
  },

  // (d) Feature campaign — Integral itself
  feature: {
    id: "01HXYZ-FEATURE-CAMPAIGN-INTEGRAL-V0",
    short_id: "feat-c01",
    kind: "feature-campaign",
    kind_label: "Feature · campaign",
    declaration: {
      title:   "Integral v0 substrate",
      summary: "Land the v0.1 schema, the four-adapter validation plan, and the read-at-zoom-level operation against the canonical workflows.",
      success: "All four adapters land minimal form; schema survives without v0.2-bump.",
    },
    holder: { mode: "hierarchically-held", parties: [parties.sri, parties.reviewerBot] },
    lifetime: { kind: "campaign", started_at: ago(60*24*30) },
    status: "active",
    last_advanced: { at: ago(60), by: parties.ciSystem },
    tags: ["substrate", "v0.1"],
    knowledge: [
      { scope: "project", role: "conventions", uri: "file://CLAUDE.md", label: "Repo CLAUDE.md" },
    ],
    extension: {
      repo: "integral/integral",
      prs_total: 7,
      prs_open: 3,
      prs_merged: 4,
      ci_failing: 1,
    },
    children: [
      { id: "01HXYZ-FEATURE-PR-007", short_id: "#1247", kind: "feature-pr",
        title: "Add intent-state projection cache",
        status: "active",
        last_advanced: { at: ago(60), by: parties.ciSystem },
        extension: { pr_number: 1247, ci: "failing", review: "changes-requested", diff_summary: "Adds ProjectionCache class; wires it into IntentState getters." } },
      { id: "01HXYZ-FEATURE-PR-008", short_id: "#1251", kind: "feature-pr",
        title: "Schema validator: reject unknown schema_version",
        status: "active",
        last_advanced: { at: ago(60*3), by: parties.sri },
        extension: { pr_number: 1251, ci: "passing", review: "approved", diff_summary: "Adapter rejects objects with mismatched schema_version." } },
      { id: "01HXYZ-FEATURE-PR-009", short_id: "#1253", kind: "feature-pr",
        title: "Nous adapter: read campaign + iteration",
        status: "active",
        last_advanced: { at: ago(60*8), by: parties.sri },
        extension: { pr_number: 1253, ci: "passing", review: "requested", diff_summary: "Minimal Nous adapter: read existing campaign files, project to all three zoom levels." } },
    ],
  },
};

// Index trees by id for cross-tree lookups.
const TREE_LIST = [TREES.nous, TREES.coral, TREES.paper, TREES.feature];
const ALL_INTENTS = {};
for (const t of TREE_LIST) {
  ALL_INTENTS[t.id] = { ...t, tree_id: t.id, root: true };
  for (const c of t.children) ALL_INTENTS[c.id] = { ...c, tree_id: t.id, root: false };
}

// ─── Evidence links ─────────────────────────────────────────────────────
const EVIDENCE = [
  { id: "edge-001", from: "01HXYZ-PAPER-SECTION-004", to: "01HXYZ-NOUS-ITER-002",
    relation: "derived-from", strength: "strong", note: "claim-19 grounded in iter-2 findings",
    asserted_by: parties.sri, asserted_at: ago(60*3) },
  { id: "edge-002", from: "01HXYZ-PAPER-SECTION-004", to: "01HXYZ-CORAL-ATTEMPT-031",
    relation: "replicates", strength: "moderate", note: "Coral best-so-far validates §4 claim",
    asserted_by: parties.paperDrafter, asserted_at: ago(60*1) },
  { id: "edge-003", from: "01HXYZ-FEATURE-PR-007", to: "01HXYZ-NOUS-CAMPAIGN-001",
    relation: "supports", strength: "moderate",
    asserted_by: parties.sri, asserted_at: ago(60*24*2) },
];

// ─── Activity events (workspace + per-intent) ───────────────────────────
// `sig` is significance bucket. Default mapping baked into the data.
const EVENTS = [
  { id: "ev-101", at: ago(2),    by: parties.nousPlanner, type: "proposed-next-iteration",
    sig: "notable",   intent_id: "01HXYZ-NOUS-CAMPAIGN-001",
    summary: "iter-3 · principle-conditioned mutation",
    actionable: { kind: "proposal", target_child: "01HXYZ-NOUS-ITER-003" } },
  { id: "ev-100", at: ago(0.25), by: parties.coralW3,    type: "attempt-scored",
    sig: "routine",   intent_id: "01HXYZ-CORAL-ATTEMPT-040", parent_tree: "01HXYZ-CORAL-CAMPAIGN-001",
    summary: "attempt-040 → 0.797" },
  { id: "ev-099", at: ago(12),   by: parties.paperDrafter, type: "evidence-link-asserted",
    sig: "notable",   intent_id: "01HXYZ-PAPER-SECTION-004",
    summary: "claim-19 → iter-2  (derived-from, strong)" },
  { id: "ev-098", at: ago(47),   by: parties.sri,         type: "gate-resolved",
    sig: "notable",   intent_id: "01HXYZ-NOUS-ITER-002",
    summary: "iter-2 · design → execute_analyze" },
  { id: "ev-097", at: ago(60),   by: parties.ciSystem,    type: "ci-status-changed",
    sig: "critical",  intent_id: "01HXYZ-FEATURE-PR-007",
    summary: "PR #1247 · passing → failing  (test: projection_cache_test)" },
  { id: "ev-096", at: ago(60*4), by: parties.coralOrch,   type: "attempt-scored",
    sig: "notable",   intent_id: "01HXYZ-CORAL-ATTEMPT-031", parent_tree: "01HXYZ-CORAL-CAMPAIGN-001",
    summary: "attempt-031 → 0.842  (new best)" },
  { id: "ev-095", at: ago(60*2), by: parties.paperDrafter, type: "claim-citation-resolved",
    sig: "routine",   intent_id: "01HXYZ-PAPER-SECTION-003",
    summary: "claim-12 · citation attached (Kaplan 2022)" },
  { id: "ev-094", at: ago(60*3), by: parties.sri,         type: "evidence-link-asserted",
    sig: "notable",   intent_id: "01HXYZ-PAPER-SECTION-004",
    summary: "claim-19 → iter-2  (re-asserted as strong)" },
  { id: "ev-093", at: ago(60*5), by: parties.nousPlanner, type: "principle-emitted",
    sig: "notable",   intent_id: "01HXYZ-NOUS-ITER-001",
    summary: "principle: \"evaluator-shaped reward induces premature convergence\"" },
  { id: "ev-092", at: ago(60*8), by: parties.sri,         type: "advance",
    sig: "routine",   intent_id: "01HXYZ-FEATURE-PR-009",
    summary: "PR #1253 · review requested" },
  { id: "ev-091", at: ago(60*24*1), by: parties.coralOrch, type: "attempt-scored",
    sig: "routine",   intent_id: "01HXYZ-CORAL-CAMPAIGN-001", parent_tree: "01HXYZ-CORAL-CAMPAIGN-001",
    summary: "12 attempts scored in last 24h · best 0.842" },
];

// ─── Backgrounded trees (collapsed sidebar) ─────────────────────────────
const BACKGROUNDED = [
  { id: "bg-1", title: "Nous · curvature-pretraining replication", kind: "nous-campaign", last: ago(60*24*18) },
  { id: "bg-2", title: "Paper · ICLR 2026 rebuttal",                kind: "paper-campaign", last: ago(60*24*22) },
  { id: "bg-3", title: "Feature · auth migration",                   kind: "feature-campaign", last: ago(60*24*40) },
  { id: "bg-4", title: "Coral · evaluator-bias bake-off",            kind: "coral-optimization", last: ago(60*24*55) },
];

// ─── Shaping draft (the one currently in progress) ──────────────────────
const SHAPING_DRAFT = {
  id: "01HXYZ-DRAFT-NOUS-002",
  short_id: "draft-n02",
  status: "draft",
  kind_tentative: "nous-campaign",
  kind_locked: true,
  declaration: {
    title:   "v3 plateau study · follow-up",
    summary: { value: "Investigate whether the v3 plateau is structural (reward curvature) or measurement (evaluator variance).", pending: false },
    success: { value: null, pending: true, pending_reason: "awaiting q4 (saturation rule)" },
  },
  holder: { mode: "jointly-held", parties: [parties.sri, parties.nousPlanner], pending: false },
  knowledge_refs: [
    { scope: "global",   role: "methodology", uri: "file://nous/methodology/v3" },
    { scope: "campaign", role: "principles",  uri: "file://campaigns/2026-05-10/principles.md", pending: false },
  ],
  decomposition: { children: [], pending: false },
  tags: ["investigation", "v3-followup"],
  open_questions: [
    { id: "q1", resolved: true,  by: parties.sri,         text: "Discovery, not optimization?", answer: "Discovery." },
    { id: "q2", resolved: true,  by: parties.sri,         text: "Motivating observation?",       answer: "71% number replicated across 3 evaluator variants — likely structural." },
    { id: "q3", resolved: true,  by: parties.sri,         text: "Existing principles ledger?",   answer: "Yes — file://campaigns/2026-05-10/principles.md" },
    { id: "q4", resolved: false, by: parties.integralProbe, text: "Cap iteration count, or run until principle-saturation?" },
    { id: "q5", resolved: false, by: parties.integralProbe, text: "Initial bundle: draft H-main + ablation from the ledger now, or wait for shape?" },
    { id: "q6", resolved: false, by: parties.integralProbe, text: "Runtime conditions: local-only / cluster / either?" },
  ],
  dialog: [
    { who: parties.sri, kind: "human", at: ago(34), text: "I want to investigate why our v3 evaluator plateaus around 71% — but as a follow-up to nous-c01, focused on the *cause* not the workaround." },
    { who: parties.integralProbe, kind: "agent", at: ago(33), text: "To shape this, three quick questions:\n  1. Discovery (learn *why* it plateaus) or optimization (build a better evaluator)?\n  2. What's your motivating observation?\n  3. Is there an existing principles ledger this should draw on?" },
    { who: parties.sri, kind: "human", at: ago(29), text: "1) Discovery. Want principles I can reuse, not a better number.\n2) The 71% replicated across three evaluator variants — something structural.\n3) Yes — file://campaigns/2026-05-10/principles.md." },
    { who: parties.integralProbe, kind: "agent", at: ago(28), text: "Good — that confirms nous-campaign, not coral-optimization. Three follow-ups:\n  • Initial hypothesis bundle: draft H-main + ablation from the ledger now, or wait for shape?\n  • Cap iteration count, or run until principle-saturation?\n  • Conditions: local-only / cluster / either?" },
  ],
  transitions: [
    { at: ago(34), cause: "shaping-clarification", from: "draft",  to: "draft", note: "declared from probe" },
    { at: ago(29), cause: "shaping-clarification", from: "draft",  to: "draft", note: "q1–q3 resolved · kind locked → nous-campaign" },
    { at: ago(28), cause: "shaping-probe",         from: "draft",  to: "draft", note: "q4–q6 raised" },
  ],
};

// ─── Workspace meta ─────────────────────────────────────────────────────
const WORKSPACE = {
  name: "research-2026",
  me:   parties.sri,
  parties,
};

// Export to globals — Babel scripts can read these.
Object.assign(window, {
  WORKSPACE, TREES, TREE_LIST, ALL_INTENTS, EVIDENCE, EVENTS, BACKGROUNDED,
  SHAPING_DRAFT, parties, NOW, ago,
});
