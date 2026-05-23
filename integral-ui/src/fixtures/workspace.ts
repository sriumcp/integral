/**
 * Minimal typed workspace fixture covering all four v0.1 intent kinds.
 *
 * This is the *falsification fixture* for the schema: it must validate against
 * `WorkspaceSchema` for every intent shape we claim to support. Adding a new
 * kind in v0.2 means adding an example here, and the test in
 * `src/schema/__tests__/validation.test.ts` will fail until the schema accepts
 * it.
 *
 * The data is *minimal* — one campaign + one child per kind, plus three
 * cross-tree evidence links. Richer mock data for the UI lives elsewhere;
 * this fixture exists to validate the schema.
 */

import type {
  EvidenceLink,
  Intent,
  IntentState,
  Party,
  Workspace,
} from '@/schema'

// ─── Parties ───────────────────────────────────────────────────────────────
export const sri: Party = { id: 'sri', kind: 'human', display_name: 'sri' }
export const nousPlanner: Party = {
  id: 'nous-planner',
  kind: 'agent',
  display_name: 'nous-planner',
}
export const coralOrch: Party = {
  id: 'coral-orch',
  kind: 'agent',
  display_name: 'coral-orch',
}
export const paperDrafter: Party = {
  id: 'paper-drafter',
  kind: 'agent',
  display_name: 'paper-drafter',
}
export const reviewerBot: Party = {
  id: 'code-reviewer-bot',
  kind: 'agent',
  display_name: 'code-reviewer-bot',
}

// IDs are stable strings (ULID-shaped in production; literal here for clarity).
export const DRAFT_NOUS_ID = '01HXYZ-DRAFT-NOUS-001'
export const DRAFT_CORAL_ID = '01HXYZ-DRAFT-CORAL-001'
const NID = '01HXYZ-NOUS-CAMPAIGN-001'
const NIID = '01HXYZ-NOUS-ITER-002'
const CID = '01HXYZ-CORAL-CAMPAIGN-001'
const CAID = '01HXYZ-CORAL-ATTEMPT-042'
const PID = '01HXYZ-PAPER-CAMPAIGN-001'
const PSID = '01HXYZ-PAPER-SECTION-004'
const PCID = '01HXYZ-PAPER-CLAIM-019'
const FID = '01HXYZ-FEATURE-CAMPAIGN-001'
const FPRID = '01HXYZ-FEATURE-PR-007'

// ─── (a) Nous campaign + iteration ─────────────────────────────────────────
const nousCampaign: Intent = {
  id: NID,
  schema_version: '0.1.0',
  kind: 'nous-campaign',
  declaration: {
    title: 'v3 plateau study',
    summary:
      'Investigate the plateau observed in the v3 optimizer. Goal is to extract qualitative principles, not ship a better optimizer.',
    success_criterion: '≥3 falsified hypotheses + ≥2 retained principles in the ledger.',
  },
  holder: { mode: 'jointly-held', parties: [sri, nousPlanner] },
  lifetime: { kind: 'campaign', started_at: '2026-05-10T14:00:00Z' },
  decomposition: { children: [NIID] },
  provenance: {
    declared_by: sri,
    declared_at: '2026-05-10T14:00:00Z',
    motivated_by: [],
  },
  knowledge_refs: [
    {
      scope: 'global',
      uri: 'file://nous/methodology/v3',
      role: 'methodology',
    },
    {
      scope: 'campaign',
      uri: 'file://campaigns/2026-05-10/principles.md',
      role: 'principles',
    },
  ],
  tags: ['investigation', 'v3-optimizer', 'principles'],
  state_ref: NID + '-STATE',
  extension: {
    kind: 'nous-campaign',
    research_question: 'Why does the v3 evaluator-driven optimizer plateau at 71%?',
    current_iteration: NIID,
    open_hypothesis_bundles: [NIID],
    gate_status: {
      current_gate: 'execute_analyze',
      awaiting_party: sri,
      awaiting_since: '2026-05-22T15:00:00Z',
    },
  },
}

const nousIteration: Intent = {
  id: NIID,
  schema_version: '0.1.0',
  kind: 'nous-iteration',
  declaration: {
    title: 'iter-2 · reward-curvature probe',
    summary:
      'Probes reward-curvature as the structural cause of the 71% plateau.',
    success_criterion: '≥1 hypothesis arm reaches a definitive result.',
  },
  holder: { mode: 'jointly-held', parties: [sri, nousPlanner] },
  lifetime: { kind: 'campaign', started_at: '2026-05-18T10:00:00Z' },
  decomposition: { parent_id: NID, children: [] },
  provenance: {
    declared_by: nousPlanner,
    declared_at: '2026-05-18T10:00:00Z',
    motivated_by: [{ kind: 'intent', target: NID }],
  },
  knowledge_refs: [
    {
      scope: 'inherited',
      uri: 'file://campaigns/2026-05-10/principles.md',
      role: 'principles',
      inherited_from: NID,
    },
  ],
  state_ref: NIID + '-STATE',
  extension: {
    kind: 'nous-iteration',
    iteration_number: 2,
    hypothesis_bundle: {
      h_main: {
        statement: 'Reward curvature induces premature convergence at 71%.',
        prediction:
          'Smoothing the reward function will lift the ceiling by ≥5%.',
        conditions: [
          { kind: 'external', target: 'file://conditions/iter-2-cond-A' },
        ],
        result: 'pending',
      },
      h_ablation: [
        {
          statement: 'Without curvature smoothing, ceiling persists.',
          prediction: 'Score remains within 1% of 0.71.',
          conditions: [
            { kind: 'external', target: 'file://conditions/iter-2-cond-B' },
          ],
          result: 'pending',
        },
      ],
    },
  },
}

// ─── (b) Coral campaign + attempt ──────────────────────────────────────────
const coralCampaign: Intent = {
  id: CID,
  schema_version: '0.1.0',
  kind: 'coral-optimization',
  declaration: {
    title: 'evaluator search · island-3',
    summary:
      'Search for an evaluator function that breaks the v3 plateau ceiling.',
    success_criterion: 'Best-of-population score > 0.90 across ≥3 holdout tasks.',
  },
  holder: { mode: 'hierarchically-held', parties: [coralOrch] },
  lifetime: { kind: 'campaign', started_at: '2026-05-13T09:00:00Z' },
  decomposition: { children: [CAID] },
  provenance: {
    declared_by: sri,
    declared_at: '2026-05-13T09:00:00Z',
    motivated_by: [{ kind: 'intent', target: NID, note: 'paired with v3 plateau study' }],
  },
  knowledge_refs: [
    {
      scope: 'campaign',
      uri: 'file://.coral/skills/',
      role: 'skills',
    },
  ],
  tags: ['optimization', 'evaluator'],
  state_ref: CID + '-STATE',
  extension: {
    kind: 'coral-optimization',
    scoring_function_ref: 'file://.coral/score.py',
    search_algorithm: 'island',
    population_size: 12,
    attempts_db_anchor: {
      kind: 'coral-shared-dir',
      uri: 'file://.coral/attempts/',
      read_only: false,
    },
    shared_skills_anchor: {
      kind: 'coral-shared-dir',
      uri: 'file://.coral/skills/',
      read_only: false,
    },
    best_score_so_far: 0.842,
  },
}

const coralAttempt: Intent = {
  id: CAID,
  schema_version: '0.1.0',
  kind: 'coral-attempt',
  declaration: {
    title: 'attempt-042 · island-3 mutation of best-so-far',
    summary: 'Mutation of attempt-031 under island-3 search constraints.',
    success_criterion: 'score > 0.84 (current best)',
  },
  holder: { mode: 'hierarchically-held', parties: [coralOrch] },
  lifetime: { kind: 'campaign', started_at: '2026-05-22T09:14:00Z' },
  decomposition: { parent_id: CID, children: [] },
  provenance: {
    declared_by: coralOrch,
    declared_at: '2026-05-22T09:14:00Z',
    motivated_by: [{ kind: 'intent', target: '01HXYZ-CORAL-ATTEMPT-031', note: 'lineage parent' }],
  },
  knowledge_refs: [],
  state_ref: CAID + '-STATE',
  extension: {
    kind: 'coral-attempt',
    worktree_anchor: {
      kind: 'worktree',
      uri: 'file://.coral/worktrees/attempt-042',
      read_only: false,
    },
    score: null,
    parent_attempts: ['01HXYZ-CORAL-ATTEMPT-031'],
  },
}

// ─── (c) Feature campaign + PR ─────────────────────────────────────────────
const featureCampaign: Intent = {
  id: FID,
  schema_version: '0.1.0',
  kind: 'feature-campaign',
  declaration: {
    title: 'Integral v0 substrate',
    summary:
      'Land the v0.1 schema and the four-adapter validation plan against the canonical workflows.',
    success_criterion:
      'All four adapters land minimal form; schema survives without v0.2-bump.',
  },
  holder: { mode: 'hierarchically-held', parties: [sri, reviewerBot] },
  lifetime: { kind: 'campaign', started_at: '2026-04-22T10:00:00Z' },
  decomposition: { children: [FPRID] },
  provenance: {
    declared_by: sri,
    declared_at: '2026-04-22T10:00:00Z',
    motivated_by: [],
  },
  knowledge_refs: [
    {
      scope: 'project',
      uri: 'file://CLAUDE.md',
      role: 'conventions',
    },
  ],
  tags: ['substrate', 'v0.1'],
  state_ref: FID + '-STATE',
  extension: {
    kind: 'feature-campaign',
    repo_anchor: {
      kind: 'git-branch',
      uri: 'file:///Users/sri/Documents/Projects/integral',
      read_only: false,
    },
    inherited_conventions: [
      {
        scope: 'project',
        uri: 'file://CLAUDE.md',
        role: 'conventions',
      },
    ],
    standing_invariants: [
      { kind: 'external', target: 'invariant://ci-must-be-green' },
    ],
  },
}

const featurePR: Intent = {
  id: FPRID,
  schema_version: '0.1.0',
  kind: 'feature-pr',
  declaration: {
    title: 'Add intent-state projection cache',
    summary: 'Implements zoom-level projection caching for IntentState.',
    success_criterion:
      'PR merged + CI green + invariant `projection-cache-bounded` upheld.',
  },
  holder: { mode: 'hierarchically-held', parties: [sri, reviewerBot] },
  lifetime: {
    kind: 'campaign',
    started_at: '2026-05-20T10:00:00Z',
    expected_termination: { description: 'PR merge or close' },
  },
  decomposition: { parent_id: FID, children: [] },
  provenance: {
    declared_by: sri,
    declared_at: '2026-05-20T10:00:00Z',
    motivated_by: [{ kind: 'intent', target: FID }],
  },
  knowledge_refs: [
    {
      scope: 'inherited',
      uri: 'file://CLAUDE.md',
      role: 'conventions',
      inherited_from: FID,
    },
  ],
  state_ref: FPRID + '-STATE',
  extension: {
    kind: 'feature-pr',
    github_pr_anchor: {
      kind: 'github-pr',
      uri: 'https://github.com/integral/integral/pull/1247',
      read_only: false,
    },
    ci_status: 'failing',
    review_status: 'changes-requested',
    diff_summary:
      'Adds ProjectionCache class; wires it into IntentState getters.',
  },
}

// ─── (d) Paper campaign + section + claim ──────────────────────────────────
const paperCampaign: Intent = {
  id: PID,
  schema_version: '0.1.0',
  kind: 'paper-campaign',
  declaration: {
    title: 'Principle-conditioned mutation in evaluator-driven optimization',
    summary: 'Paper drawing claims from the v3 plateau study and Coral search.',
    success_criterion:
      'Submission accepted by deadline; ≥1 strong evidence link per primary claim; all citations resolved.',
  },
  holder: { mode: 'jointly-held', parties: [sri, paperDrafter] },
  lifetime: {
    kind: 'campaign',
    started_at: '2026-05-18T16:00:00Z',
    expected_termination: {
      description: 'NeurIPS 2026 submission',
      at: '2026-06-15T23:59:59Z',
    },
  },
  decomposition: { children: [PSID] },
  provenance: {
    declared_by: sri,
    declared_at: '2026-05-18T16:00:00Z',
    motivated_by: [{ kind: 'intent', target: NID, note: 'campaign source' }],
  },
  knowledge_refs: [
    {
      scope: 'global',
      uri: 'file://paper-conventions/neurips.md',
      role: 'conventions',
    },
    {
      scope: 'campaign',
      uri: 'file://papers/2026-neurips/refs.bib',
      role: 'citations',
    },
  ],
  state_ref: PID + '-STATE',
  extension: {
    kind: 'paper-campaign',
    venue: 'NeurIPS 2026',
    submission_deadline: '2026-06-15T23:59:59Z',
    draft_anchor: {
      kind: 'markdown-doc',
      uri: 'file://papers/2026-neurips/draft.md',
      read_only: false,
    },
    citation_library_anchor: {
      kind: 'bibliography',
      uri: 'file://papers/2026-neurips/refs.bib',
      read_only: false,
    },
    sections: [PSID],
  },
}

const paperSection: Intent = {
  id: PSID,
  schema_version: '0.1.0',
  kind: 'paper-section',
  declaration: {
    title: '§4 · Results',
    summary: 'Reports principle-conditioned mutation results.',
    success_criterion: 'all featured claims have ≥1 evidence link of strength ≥ moderate.',
  },
  holder: { mode: 'jointly-held', parties: [sri, paperDrafter] },
  lifetime: { kind: 'campaign', started_at: '2026-05-19T11:00:00Z' },
  decomposition: { parent_id: PID, children: [PCID] },
  provenance: {
    declared_by: paperDrafter,
    declared_at: '2026-05-19T11:00:00Z',
    motivated_by: [{ kind: 'intent', target: PID }],
  },
  knowledge_refs: [],
  state_ref: PSID + '-STATE',
  extension: {
    kind: 'paper-section',
    section_title: 'Results',
    section_order: 4,
    draft_anchor: {
      kind: 'markdown-doc',
      uri: 'file://papers/2026-neurips/draft.md#section-4',
      read_only: false,
    },
    claims: [PCID],
    status: 'drafted',
  },
}

const paperClaim: Intent = {
  id: PCID,
  schema_version: '0.1.0',
  kind: 'paper-claim',
  declaration: {
    title: 'Claim 19 · principle-conditioned mutation +12%',
    summary: '',
    success_criterion: 'claim defended in §4.2 with ≥1 evidence link of strength ≥ moderate.',
  },
  holder: { mode: 'jointly-held', parties: [sri, paperDrafter] },
  lifetime: { kind: 'campaign', started_at: '2026-05-19T11:30:00Z' },
  decomposition: { parent_id: PSID, children: [] },
  provenance: {
    declared_by: sri,
    declared_at: '2026-05-19T11:30:00Z',
    motivated_by: [{ kind: 'intent', target: NID, note: 'claim grounded in this campaign' }],
  },
  knowledge_refs: [],
  state_ref: PCID + '-STATE',
  extension: {
    kind: 'paper-claim',
    claim_text:
      'Conditioning the mutation operator on the principles ledger produces ≥12% score improvement over unconditioned mutation across n=14 tasks.',
    citation_status: 'self-evidence',
  },
}

// ─── States (minimal — one per intent) ─────────────────────────────────────
import type { StateTransition } from '@/schema'

function makeState(
  id: StateRef,
  status: IntentState['status'],
  advancedBy: Party,
  advancedAt: string,
  history: StateTransition[] = []
): IntentState {
  return {
    id: id.stateId,
    intent_id: id.intentId,
    schema_version: '0.1.0',
    status,
    last_advanced_at: advancedAt,
    last_advanced_by: advancedBy,
    history,
    external_anchors: [],
  }
}

type StateRef = { intentId: string; stateId: string }
const ref = (intentId: string): StateRef => ({ intentId, stateId: intentId + '-STATE' })

// History entries — the activity heuristic in `src/lib/activity.ts` reads
// `cause` strings + the target intent's extension.kind to bucket significance.
// Causes are free-form in v0.1; the typed event schema lands in v0.2.

const nousHistory: StateTransition[] = [
  {
    at: '2026-05-22T14:13:00Z',
    by: sri,
    from_status: 'active',
    to_status: 'gated',
    cause: 'gate-resolved: design → execute_analyze',
  },
]

const coralHistory: StateTransition[] = [
  {
    at: '2026-05-22T15:42:00Z',
    by: coralOrch,
    from_status: 'active',
    to_status: 'active',
    cause: 'attempt-scored: 0.842 (new best)',
  },
  {
    at: '2026-05-22T13:21:00Z',
    by: coralOrch,
    from_status: 'active',
    to_status: 'active',
    cause: 'attempt-scored: 0.812',
  },
]

const featurePRHistory: StateTransition[] = [
  {
    at: '2026-05-22T14:42:00Z',
    by: reviewerBot,
    from_status: 'active',
    to_status: 'active',
    cause: 'ci-status-changed: passing → failing',
  },
  {
    at: '2026-05-22T14:00:00Z',
    by: reviewerBot,
    from_status: 'active',
    to_status: 'active',
    cause: 'review-status-changed: requested → changes-requested',
  },
]

const paperSectionHistory: StateTransition[] = [
  {
    at: '2026-05-22T15:30:00Z',
    by: paperDrafter,
    from_status: 'active',
    to_status: 'active',
    cause: 'section-status-changed: outlined → drafted',
  },
]

const nousIterHistory: StateTransition[] = [
  {
    at: '2026-05-21T11:14:00Z',
    by: nousPlanner,
    from_status: 'draft',
    to_status: 'active',
    cause: 'iteration-started',
  },
]

// ─── Drafts (shaping mode targets) ─────────────────────────────────────────
// Two drafts surfacing on the Map; clicking either routes to ShapingSurface.
// Companion data — dialog turns + resolved-field sets — lives in
// `src/fixtures/shaping.ts` so the workspace stays a pure schema fixture.

const draftNous: Intent = {
  id: DRAFT_NOUS_ID,
  schema_version: '0.1.0',
  kind: 'nous-campaign',
  declaration: {
    title: 'evaluator-aware mutation study',
    summary:
      'Investigate whether mutations conditioned on evaluator output produce structurally different optimization paths.',
    success_criterion:
      '≥1 mechanism confirmed via ≥2 ablations + retained principle in the ledger.',
  },
  holder: { mode: 'jointly-held', parties: [sri, nousPlanner] },
  lifetime: { kind: 'campaign', started_at: '2026-05-22T16:00:00Z' },
  decomposition: { children: [] },
  provenance: {
    declared_by: sri,
    declared_at: '2026-05-22T16:00:00Z',
    motivated_by: [],
  },
  knowledge_refs: [
    {
      scope: 'global',
      uri: 'file://nous/methodology/v3',
      role: 'methodology',
    },
  ],
  tags: ['investigation', 'evaluator-conditioning'],
  state_ref: DRAFT_NOUS_ID + '-STATE',
  extension: {
    kind: 'nous-campaign',
    research_question:
      'Does conditioning the mutation operator on evaluator-output structure alter the qualitative shape of the optimization frontier?',
    open_hypothesis_bundles: [],
    gate_status: { current_gate: 'none' },
  },
}

const draftCoral: Intent = {
  id: DRAFT_CORAL_ID,
  schema_version: '0.1.0',
  kind: 'coral-optimization',
  declaration: {
    title: 'evaluator-search candidate scan',
    summary: '',
    success_criterion: '',
  },
  holder: { mode: 'hierarchically-held', parties: [coralOrch] },
  lifetime: { kind: 'campaign', started_at: '2026-05-22T16:30:00Z' },
  decomposition: { children: [] },
  provenance: {
    declared_by: sri,
    declared_at: '2026-05-22T16:30:00Z',
    motivated_by: [],
  },
  knowledge_refs: [],
  tags: ['optimization', 'shaping'],
  state_ref: DRAFT_CORAL_ID + '-STATE',
  extension: {
    kind: 'coral-optimization',
    // Placeholder URI — schema requires a non-empty string. The
    // resolved-field set in `src/fixtures/shaping.ts` flags this as
    // pending so the IntentDraftPane renders the ⚠ pending chip.
    scoring_function_ref: 'file://drafts/coral-2/PENDING',
    search_algorithm: 'beam',
    population_size: 8,
    attempts_db_anchor: {
      kind: 'coral-shared-dir',
      uri: 'file://drafts/coral-2/attempts/',
      read_only: false,
    },
    shared_skills_anchor: {
      kind: 'coral-shared-dir',
      uri: 'file://drafts/coral-2/skills/',
      read_only: false,
    },
  },
}

const states: IntentState[] = [
  makeState(ref(NID), 'gated', sri, '2026-05-22T15:00:00Z', nousHistory),
  makeState(ref(NIID), 'active', sri, '2026-05-22T15:00:00Z', nousIterHistory),
  makeState(ref(CID), 'active', coralOrch, '2026-05-22T15:42:00Z', coralHistory),
  makeState(ref(CAID), 'active', coralOrch, '2026-05-22T15:42:00Z'),
  makeState(ref(FID), 'active', sri, '2026-05-22T14:00:00Z'),
  makeState(ref(FPRID), 'active', reviewerBot, '2026-05-22T14:42:00Z', featurePRHistory),
  makeState(ref(PID), 'active', paperDrafter, '2026-05-22T15:30:00Z'),
  makeState(ref(PSID), 'active', paperDrafter, '2026-05-22T15:30:00Z', paperSectionHistory),
  makeState(ref(PCID), 'active', paperDrafter, '2026-05-22T15:30:00Z'),
  makeState(ref(DRAFT_NOUS_ID), 'draft', sri, '2026-05-22T16:00:00Z'),
  makeState(ref(DRAFT_CORAL_ID), 'draft', sri, '2026-05-22T16:30:00Z'),
]

// ─── Cross-tree evidence links ─────────────────────────────────────────────
const evidence: EvidenceLink[] = [
  {
    id: 'edge-001',
    from_intent: PCID,
    to_intent: NIID,
    relation: 'derived-from',
    asserted_by: sri,
    asserted_at: '2026-05-19T12:00:00Z',
    strength: 'strong',
    note: 'Claim 19 grounded in iter-2 findings.',
  },
  {
    id: 'edge-002',
    from_intent: PCID,
    to_intent: '01HXYZ-CORAL-ATTEMPT-031', // an attempt outside the fixture
    relation: 'replicates',
    asserted_by: paperDrafter,
    asserted_at: '2026-05-19T14:30:00Z',
    strength: 'moderate',
  },
  {
    id: 'edge-003',
    from_intent: FPRID,
    to_intent: NID,
    relation: 'supports',
    asserted_by: sri,
    asserted_at: '2026-05-20T10:00:00Z',
    strength: 'moderate',
  },
]

// ─── Operations log ────────────────────────────────────────────────────────
// Representative operations covering 8 of 16 op kinds — enough for the v0.1
// surfaces to render meaningful operation events. Adapter implementations
// in v0.1.next will emit these from real source-state transitions; the
// fixture entries here are the kinetic preview.
import type { Operation } from '@/schema'

const operations: Operation[] = [
  // Drafts being declared (shaping mode entry points)
  {
    id: 'op-001',
    kind: 'declare',
    at: '2026-05-22T16:00:00Z',
    by: sri,
    target_intent_id: DRAFT_NOUS_ID,
    cause: 'declared evaluator-aware mutation study',
  },
  {
    id: 'op-002',
    kind: 'probe',
    at: '2026-05-22T16:01:00Z',
    by: nousPlanner,
    target_intent_id: DRAFT_NOUS_ID,
    cause: 'probed: discovery vs optimization?',
  },
  {
    id: 'op-003',
    kind: 'clarify',
    at: '2026-05-22T16:02:00Z',
    by: sri,
    target_intent_id: DRAFT_NOUS_ID,
    cause: 'clarified: discovery — want reusable principles',
  },
  {
    id: 'op-004',
    kind: 'declare',
    at: '2026-05-22T16:30:00Z',
    by: sri,
    target_intent_id: DRAFT_CORAL_ID,
    cause: 'declared evaluator-search candidate scan',
  },
  // Decompositions on existing campaigns (children created)
  {
    id: 'op-005',
    kind: 'decompose',
    at: '2026-05-18T10:00:00Z',
    by: nousPlanner,
    target_intent_id: NID,
    cause: 'decomposed v3 plateau study into iter-2',
    children: [NIID],
  },
  {
    id: 'op-006',
    kind: 'decompose',
    at: '2026-05-22T09:14:00Z',
    by: coralOrch,
    target_intent_id: CID,
    cause: 'decomposed island-3 search into attempt-042',
    children: [CAID],
  },
  // Gate set on the Nous campaign — matches the awaiting state
  {
    id: 'op-007',
    kind: 'gate',
    at: '2026-05-22T14:13:00Z',
    by: nousPlanner,
    target_intent_id: NID,
    cause: 'gated at execute_analyze, awaiting sri',
    gate: 'execute_analyze',
    awaiting_party: sri,
  },
  // Proposed iter-3 — the human (sri) is awaiting this proposal
  {
    id: 'op-008',
    kind: 'propose-transition',
    at: '2026-05-22T15:42:00Z',
    by: nousPlanner,
    target_intent_id: NID,
    cause: 'proposed iter-3: principle-conditioned mutation',
    proposal: 'iter-3 (principle-conditioned mutation arm)',
  },
  // Cross-tree accept-proposal aligning with the existing edge-001
  {
    id: 'op-009',
    kind: 'accept-proposal',
    at: '2026-05-19T12:00:00Z',
    by: sri,
    target_intent_id: PCID,
    cause: 'accepted: claim 19 derived-from iter-2 (strong)',
  },
  // Paper section committed from outline
  {
    id: 'op-010',
    kind: 'commit',
    at: '2026-05-19T11:00:00Z',
    by: paperDrafter,
    target_intent_id: PSID,
    cause: 'committed §4 Results from outline',
  },
]

// ─── Bundled workspace ─────────────────────────────────────────────────────
export const fixtureWorkspace: Workspace = {
  intents: [
    nousCampaign,
    nousIteration,
    coralCampaign,
    coralAttempt,
    featureCampaign,
    featurePR,
    paperCampaign,
    paperSection,
    paperClaim,
    draftNous,
    draftCoral,
  ],
  states,
  evidence_links: evidence,
  operations,
}
