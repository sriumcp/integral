/**
 * Seed workspace — typed test data exercising every IntentKind v0.2.0
 * supports (nous-campaign, nous-iteration, coral-optimization,
 * coral-attempt, feature-campaign).
 *
 * Test scaffolding only. Never loaded at runtime. Lives under `src/test/`
 * (not `src/fixtures/`) to mark the boundary clearly: production reads
 * adapter-emitted data, not bundled fixtures. Same data appears across
 * many tests so the schema invariants get exercised consistently.
 *
 * Schema-version tagged `0.2.0`. v0.1.0 had four extra kinds
 * (`feature-pr`, `paper-campaign`, `paper-section`, `paper-claim`) that
 * v0.2.0 removed; this seed only carries the kinds that survive.
 */

import type {
  EvidenceLink,
  Intent,
  IntentState,
  Operation,
  Party,
  StateTransition,
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

// ─── Intent IDs ────────────────────────────────────────────────────────────
export const DRAFT_NOUS_ID = '01HXYZ-DRAFT-NOUS-001'
const NID = '01HXYZ-NOUS-CAMPAIGN-001'
const NIID = '01HXYZ-NOUS-ITER-002'
const CID = '01HXYZ-CORAL-CAMPAIGN-001'
const CAID = '01HXYZ-CORAL-ATTEMPT-042'
const FID = '01HXYZ-FEATURE-CAMPAIGN-001'

// ─── (a) Nous campaign + iteration ─────────────────────────────────────────
const nousCampaign: Intent = {
  id: NID,
  schema_version: '0.2.0',
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
    { scope: 'global', uri: 'file://nous/methodology/v3', role: 'methodology' },
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
  schema_version: '0.2.0',
  kind: 'nous-iteration',
  declaration: {
    title: 'iter-2 · reward-curvature probe',
    summary: 'Probes reward-curvature as the structural cause of the 71% plateau.',
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
        prediction: 'Smoothing the reward function will lift the ceiling by ≥5%.',
        conditions: [{ kind: 'external', target: 'file://conditions/iter-2-cond-A' }],
        result: 'pending',
      },
      h_ablation: [
        {
          statement: 'Without curvature smoothing, ceiling persists.',
          prediction: 'Score remains within 1% of 0.71.',
          conditions: [{ kind: 'external', target: 'file://conditions/iter-2-cond-B' }],
          result: 'pending',
        },
      ],
    },
  },
}

// ─── (b) Coral campaign + attempt ──────────────────────────────────────────
const coralCampaign: Intent = {
  id: CID,
  schema_version: '0.2.0',
  kind: 'coral-optimization',
  declaration: {
    title: 'evaluator search · island-3',
    summary: 'Search for an evaluator function that breaks the v3 plateau ceiling.',
    success_criterion: 'Best-of-population score > 0.90 across ≥3 holdout tasks.',
  },
  holder: { mode: 'hierarchically-held', parties: [coralOrch] },
  lifetime: { kind: 'campaign', started_at: '2026-05-13T09:00:00Z' },
  decomposition: { children: [CAID] },
  provenance: {
    declared_by: sri,
    declared_at: '2026-05-13T09:00:00Z',
    motivated_by: [
      { kind: 'intent', target: NID, note: 'paired with v3 plateau study' },
    ],
  },
  knowledge_refs: [
    { scope: 'campaign', uri: 'file://.coral/skills/', role: 'skills' },
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
  schema_version: '0.2.0',
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
    motivated_by: [
      {
        kind: 'intent',
        target: '01HXYZ-CORAL-ATTEMPT-031',
        note: 'lineage parent',
      },
    ],
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

// ─── (c) Feature campaign ──────────────────────────────────────────────────
const featureCampaign: Intent = {
  id: FID,
  schema_version: '0.2.0',
  kind: 'feature-campaign',
  declaration: {
    title: 'Integral v0 substrate',
    summary:
      'Land the v0 schema and the four-adapter validation plan against the canonical workflows.',
    success_criterion:
      'All adapters land minimal form; schema survives without breaking changes.',
  },
  holder: { mode: 'hierarchically-held', parties: [sri] },
  lifetime: { kind: 'campaign', started_at: '2026-04-22T10:00:00Z' },
  decomposition: { children: [] },
  provenance: {
    declared_by: sri,
    declared_at: '2026-04-22T10:00:00Z',
    motivated_by: [],
  },
  knowledge_refs: [
    { scope: 'project', uri: 'file://CLAUDE.md', role: 'conventions' },
  ],
  tags: ['substrate', 'v0'],
  state_ref: FID + '-STATE',
  extension: {
    kind: 'feature-campaign',
    repo_anchor: {
      kind: 'git-branch',
      uri: 'file:///Users/sri/Documents/Projects/integral',
      read_only: false,
    },
    inherited_conventions: [
      { scope: 'project', uri: 'file://CLAUDE.md', role: 'conventions' },
    ],
    standing_invariants: [
      { kind: 'external', target: 'invariant://ci-must-be-green' },
    ],
  },
}

// ─── Drafts (shaping mode targets) ─────────────────────────────────────────
const draftNous: Intent = {
  id: DRAFT_NOUS_ID,
  schema_version: '0.2.0',
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
    { scope: 'global', uri: 'file://nous/methodology/v3', role: 'methodology' },
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

// ─── States ────────────────────────────────────────────────────────────────
type StateRef = { intentId: string; stateId: string }
const ref = (intentId: string): StateRef => ({
  intentId,
  stateId: intentId + '-STATE',
})

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
    schema_version: '0.2.0',
    status,
    last_advanced_at: advancedAt,
    last_advanced_by: advancedBy,
    history,
    external_anchors: [],
  }
}

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

const nousIterHistory: StateTransition[] = [
  {
    at: '2026-05-21T11:14:00Z',
    by: nousPlanner,
    from_status: 'draft',
    to_status: 'active',
    cause: 'iteration-started',
  },
]

const states: IntentState[] = [
  makeState(ref(NID), 'gated', sri, '2026-05-22T15:00:00Z', nousHistory),
  makeState(ref(NIID), 'active', sri, '2026-05-22T15:00:00Z', nousIterHistory),
  makeState(ref(CID), 'active', coralOrch, '2026-05-22T15:42:00Z', coralHistory),
  makeState(ref(CAID), 'active', coralOrch, '2026-05-22T15:42:00Z'),
  makeState(ref(FID), 'active', sri, '2026-05-22T14:00:00Z'),
  makeState(ref(DRAFT_NOUS_ID), 'draft', sri, '2026-05-22T16:00:00Z'),
]

// ─── Cross-tree evidence link ──────────────────────────────────────────────
// One link demonstrating cross-kind provenance: the feature campaign
// references the Nous campaign it grew out of. v0.1 had paper-claim →
// nous-iteration as the headline cross-tree case; without paper-* we use
// feature-campaign → nous-campaign instead.
const evidence: EvidenceLink[] = [
  {
    id: 'edge-001',
    from_intent: FID,
    to_intent: NID,
    relation: 'derived-from',
    asserted_by: sri,
    asserted_at: '2026-05-20T10:00:00Z',
    strength: 'moderate',
    note: 'Substrate work motivated by the v3 plateau study.',
  },
]

// ─── Operations log ────────────────────────────────────────────────────────
const operations: Operation[] = [
  // Drafts being declared
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
  // Decompositions on existing campaigns
  {
    id: 'op-004',
    kind: 'decompose',
    at: '2026-05-18T10:00:00Z',
    by: nousPlanner,
    target_intent_id: NID,
    cause: 'decomposed v3 plateau study into iter-2',
    children: [NIID],
  },
  {
    id: 'op-005',
    kind: 'decompose',
    at: '2026-05-22T09:14:00Z',
    by: coralOrch,
    target_intent_id: CID,
    cause: 'decomposed island-3 search into attempt-042',
    children: [CAID],
  },
  // Gate set on the Nous campaign
  {
    id: 'op-006',
    kind: 'gate',
    at: '2026-05-22T14:13:00Z',
    by: nousPlanner,
    target_intent_id: NID,
    cause: 'gated at execute_analyze, awaiting sri',
    gate: 'execute_analyze',
    awaiting_party: sri,
  },
  // Proposed iter-3
  {
    id: 'op-007',
    kind: 'propose-transition',
    at: '2026-05-22T15:42:00Z',
    by: nousPlanner,
    target_intent_id: NID,
    cause: 'proposed iter-3: principle-conditioned mutation',
    proposal: 'iter-3 (principle-conditioned mutation arm)',
  },
]

// ─── Bundled workspace ─────────────────────────────────────────────────────
export const seedWorkspace: Workspace = {
  intents: [
    nousCampaign,
    nousIteration,
    coralCampaign,
    coralAttempt,
    featureCampaign,
    draftNous,
  ],
  states,
  evidence_links: evidence,
  operations,
}
