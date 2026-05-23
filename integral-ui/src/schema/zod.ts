/**
 * Integral Intent Schema — runtime validators (zod) and inferred TS types.
 *
 * Mirrors `intent-schema-v0.1.md` at the project root. zod schemas are the
 * source of truth; TS types below are inferred via `z.infer` — edit the
 * schema, not the type.
 *
 * Schema version: 0.1.0 (additive `tags` field included — additive fields
 * stay at the current minor version per CLAUDE.md).
 */

import { z } from 'zod'

export const SCHEMA_VERSION = '0.1.0' as const

// ─── Primitive / branded scalars ───────────────────────────────────────────
// We keep these as zod strings rather than branded types to avoid friction
// when constructing fixtures. Branded types can be re-introduced at v0.2 if
// confusion between IntentId / StateId / PartyId becomes a real problem.
export const IntentIdSchema = z.string().min(1)
export const StateIdSchema = z.string().min(1)
export const PartyIdSchema = z.string().min(1)
export const URISchema = z.string().min(1)
export const TimestampSchema = z.string().regex(
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/,
  'must be RFC3339 timestamp'
)

// ─── Party + Reference ─────────────────────────────────────────────────────
export const PartyKindSchema = z.enum(['human', 'agent', 'system'])
export const PartySchema = z.object({
  id: PartyIdSchema,
  kind: PartyKindSchema,
  display_name: z.string().min(1),
})

export const ReferenceKindSchema = z.enum(['intent', 'document', 'observation', 'external'])
export const ReferenceSchema = z.object({
  kind: ReferenceKindSchema,
  target: z.string().min(1), // URI or IntentId
  note: z.string().optional(),
})

// ─── Enums ─────────────────────────────────────────────────────────────────
export const HolderModeSchema = z.enum([
  'human-held',
  'agent-held',
  'jointly-held',
  'hierarchically-held',
])

export const LifetimeKindSchema = z.enum(['discrete', 'campaign', 'standing'])

export const IntentKindSchema = z.enum([
  // (a) Nous-shaped
  'nous-campaign',
  'nous-iteration',
  // (b) Coral-shaped
  'coral-optimization',
  'coral-attempt',
  // (c) Feature-development-shaped
  'feature-campaign',
  'feature-pr',
  // (d) Paper-shaped
  'paper-campaign',
  'paper-section',
  'paper-claim',
])

export const StatusSchema = z.enum([
  'draft',
  'active',
  'gated',
  'satisfied',
  'abandoned',
  'revoked',
])

export const KnowledgeScopeSchema = z.enum([
  'global',
  'project',
  'campaign',
  'iteration',
  'inherited',
])

export const KnowledgeRoleSchema = z.enum([
  'methodology',
  'principles',
  'conventions',
  'citations',
  'templates',
  'skills',
  'other',
])

export const ZoomLevelSchema = z.enum(['overview', 'structure', 'detail'])

export const ExternalAnchorKindSchema = z.enum([
  'git-branch',
  'github-pr',
  'filesystem-path',
  'markdown-doc',
  'bibliography',
  'worktree',
  'nous-campaign-dir',
  'coral-shared-dir',
  'other',
])

export const EvidenceRelationSchema = z.enum([
  'supports',
  'contradicts',
  'partially-supports',
  'replicates',
  'derived-from',
  'cites',
])

// ─── Knowledge / external anchor / handoff ─────────────────────────────────
// KnowledgeRef as a discriminated union over `scope`. The `inherited` arm
// requires `inherited_from`; every other scope rejects it. This expresses
// the invariant at the type level instead of the runtime-only refinement
// the prior shape used.
const KnowledgeRefBaseSchema = z.object({
  uri: URISchema,
  role: KnowledgeRoleSchema,
  version: z.string().optional(),
})

export const InheritedKnowledgeRefSchema = KnowledgeRefBaseSchema.extend({
  scope: z.literal('inherited'),
  inherited_from: IntentIdSchema,
})

export const ScopedKnowledgeRefSchema = KnowledgeRefBaseSchema.extend({
  scope: z.enum(['global', 'project', 'campaign', 'iteration']),
})

export const KnowledgeRefSchema = z.discriminatedUnion('scope', [
  InheritedKnowledgeRefSchema,
  ScopedKnowledgeRefSchema,
])

export const ExternalAnchorSchema = z.object({
  kind: ExternalAnchorKindSchema,
  uri: URISchema,
  read_only: z.boolean(),
  last_synced: TimestampSchema.optional(),
  notes: z.string().optional(),
})

export const HandoffSpecSchema = z.object({
  parent_owes_children: z.unknown().optional(),
  children_owe_parent: z.unknown().optional(),
})

// ─── Holder ────────────────────────────────────────────────────────────────
export const HolderSchema = z.object({
  mode: HolderModeSchema,
  parties: z.array(PartySchema).min(1),
})

// ─── Lifetime ──────────────────────────────────────────────────────────────
export const ExpectedTerminationSchema = z.object({
  description: z.string().min(1),
  at: TimestampSchema.optional(),
})

export const LifetimeSchema = z.object({
  kind: LifetimeKindSchema,
  started_at: TimestampSchema,
  expected_termination: ExpectedTerminationSchema.optional(),
})

// ─── Decomposition ─────────────────────────────────────────────────────────
export const DecompositionSchema = z.object({
  parent_id: IntentIdSchema.optional(),
  children: z.array(IntentIdSchema),
  handoff: HandoffSpecSchema.optional(),
})

// ─── Provenance ────────────────────────────────────────────────────────────
// `source` is the v0.1.0 additive amendment that records which workspace
// data source (a registered fixture or adapter, see `src/lib/sources.ts`)
// produced this intent. Optional because pre-amendment fixtures and
// hand-written test data don't carry it; the loader decorates each
// workspace with its source ID at fetch time.
export const ProvenanceSchema = z.object({
  declared_by: PartySchema,
  declared_at: TimestampSchema,
  motivated_by: z.array(ReferenceSchema),
  source: z.string().min(1).optional(),
})

// ─── Declaration ───────────────────────────────────────────────────────────
export const DeclarationSchema = z.object({
  title: z.string().min(1).max(80),
  summary: z.string().min(0).max(2000),
  success_criterion: z.string().min(0).max(2000),
})

// ─── Hypothesis bundle (for nous-iteration) ────────────────────────────────
export const HypothesisResultSchema = z.enum([
  'pending',
  'confirmed',
  'refuted',
  'inconclusive',
])

export const HypothesisSchema = z.object({
  statement: z.string().min(1),
  prediction: z.string().min(1),
  conditions: z.array(ReferenceSchema),
  result: HypothesisResultSchema.optional(),
  notes: z.string().optional(),
})

export const HypothesisBundleSchema = z.object({
  h_main: HypothesisSchema,
  h_ablation: z.array(HypothesisSchema),
  h_super_additivity: HypothesisSchema.optional(),
  h_control_negative: HypothesisSchema.optional(),
  h_robustness: z.array(HypothesisSchema).optional(),
})

export const PredictionErrorTaxonomySchema = z.enum([
  'missing-mechanism',
  'wrong-mechanism',
  'scope-mismatch',
  'measurement-noise',
  'spurious-correlation',
  'other',
])

export const PredictionErrorSchema = z.object({
  hypothesis_id: z.string().min(1),
  predicted: z.string().min(1),
  observed: z.string().min(1),
  taxonomy: PredictionErrorTaxonomySchema,
})

// ─── Per-kind extensions ───────────────────────────────────────────────────

// (a) Nous
export const NousCampaignExtensionSchema = z.object({
  kind: z.literal('nous-campaign'),
  research_question: z.string().min(1),
  current_iteration: IntentIdSchema.optional(),
  open_hypothesis_bundles: z.array(IntentIdSchema),
  gate_status: z.object({
    current_gate: z.enum(['design', 'execute_analyze', 'none']).optional(),
    awaiting_party: PartySchema.optional(),
    awaiting_since: TimestampSchema.optional(),
  }),
})

export const NousIterationExtensionSchema = z.object({
  kind: z.literal('nous-iteration'),
  iteration_number: z.number().int().nonnegative(),
  hypothesis_bundle: HypothesisBundleSchema,
  prediction_errors: z.array(PredictionErrorSchema).optional(),
  principles_emitted: z.array(ReferenceSchema).optional(),
})

// (b) Coral
export const CoralSearchAlgorithmSchema = z.enum([
  'ucb',
  'island',
  'beam',
  'best-of-n',
  'other',
])

export const CoralOptimizationExtensionSchema = z.object({
  kind: z.literal('coral-optimization'),
  scoring_function_ref: URISchema,
  search_algorithm: CoralSearchAlgorithmSchema,
  population_size: z.number().int().positive(),
  attempts_db_anchor: ExternalAnchorSchema,
  shared_skills_anchor: ExternalAnchorSchema,
  best_score_so_far: z.number().optional(),
})

export const CoralAttemptExtensionSchema = z.object({
  kind: z.literal('coral-attempt'),
  worktree_anchor: ExternalAnchorSchema,
  score: z.number().nullable(),
  artifact_uri: URISchema.optional(),
  parent_attempts: z.array(IntentIdSchema),
  evaluator_log_uri: URISchema.optional(),
})

// (c) Feature
export const CIStatusSchema = z.enum(['pending', 'passing', 'failing', 'not-run'])
export const ReviewStatusSchema = z.enum([
  'unrequested',
  'requested',
  'changes-requested',
  'approved',
  'merged',
  'closed',
])

export const FeatureCampaignExtensionSchema = z.object({
  kind: z.literal('feature-campaign'),
  repo_anchor: ExternalAnchorSchema,
  inherited_conventions: z.array(KnowledgeRefSchema),
  standing_invariants: z.array(ReferenceSchema),
  primary_pr_anchor: ExternalAnchorSchema.optional(),
})

export const FeaturePRExtensionSchema = z.object({
  kind: z.literal('feature-pr'),
  github_pr_anchor: ExternalAnchorSchema,
  ci_status: CIStatusSchema,
  review_status: ReviewStatusSchema,
  diff_summary: z.string().optional(),
})

// (d) Paper
export const PaperSectionStatusSchema = z.enum([
  'outlined',
  'drafted',
  'revised',
  'finalized',
])

export const ClaimCitationStatusSchema = z.enum([
  'unsourced',
  'citation-attached',
  'self-evidence',
  'unsupported',
])

export const PaperCampaignExtensionSchema = z.object({
  kind: z.literal('paper-campaign'),
  venue: z.string().optional(),
  submission_deadline: TimestampSchema.optional(),
  draft_anchor: ExternalAnchorSchema,
  citation_library_anchor: ExternalAnchorSchema,
  sections: z.array(IntentIdSchema),
})

export const PaperSectionExtensionSchema = z.object({
  kind: z.literal('paper-section'),
  section_title: z.string().min(1),
  section_order: z.number().int().nonnegative(),
  draft_anchor: ExternalAnchorSchema,
  claims: z.array(IntentIdSchema),
  status: PaperSectionStatusSchema,
})

export const PaperClaimExtensionSchema = z.object({
  kind: z.literal('paper-claim'),
  claim_text: z.string().min(1),
  citation_status: ClaimCitationStatusSchema,
})

// Discriminated union of all extensions, keyed by `kind`.
export const TypeExtensionSchema = z.discriminatedUnion('kind', [
  NousCampaignExtensionSchema,
  NousIterationExtensionSchema,
  CoralOptimizationExtensionSchema,
  CoralAttemptExtensionSchema,
  FeatureCampaignExtensionSchema,
  FeaturePRExtensionSchema,
  PaperCampaignExtensionSchema,
  PaperSectionExtensionSchema,
  PaperClaimExtensionSchema,
])

// ─── Intent (the core object) ──────────────────────────────────────────────
export const IntentSchema = z
  .object({
    id: IntentIdSchema,
    schema_version: z.literal(SCHEMA_VERSION),
    kind: IntentKindSchema,
    declaration: DeclarationSchema,
    holder: HolderSchema,
    lifetime: LifetimeSchema,
    decomposition: DecompositionSchema,
    provenance: ProvenanceSchema,
    knowledge_refs: z.array(KnowledgeRefSchema),
    tags: z.array(z.string().min(1)).optional(),
    state_ref: StateIdSchema,
    extension: TypeExtensionSchema,
  })
  .refine((v) => v.kind === v.extension.kind, {
    message: 'Intent.kind must equal Intent.extension.kind',
    path: ['extension', 'kind'],
  })

// ─── State ─────────────────────────────────────────────────────────────────
export const StateTransitionSchema = z.object({
  at: TimestampSchema,
  by: PartySchema,
  from_status: StatusSchema,
  to_status: StatusSchema,
  cause: z.string().min(1),
  evidence: z.array(ReferenceSchema).optional(),
})

export const ProjectionSchema = z.object({
  zoom: ZoomLevelSchema,
  rendered_at: TimestampSchema,
  rendered_by: PartySchema,
  body: z.string(),
  stale_after: TimestampSchema.optional(),
})

const projectionBudgets: Record<z.infer<typeof ZoomLevelSchema>, number | null> = {
  overview: 280,
  structure: 800,
  detail: null, // unbounded
}

export const ProjectionWithBudgetSchema = ProjectionSchema.refine(
  (p) => {
    const budget = projectionBudgets[p.zoom]
    return budget == null || p.body.length <= budget
  },
  { message: 'projection body exceeds zoom-level budget' }
)

// Projections are a partial map keyed by ZoomLevel — any subset may be cached.
// (zod 4's `z.record(enum, value)` requires *all* enum keys; we want partial,
// so we use a typed object with optional keys instead.)
export const ProjectionsByZoomSchema = z.object({
  overview: ProjectionWithBudgetSchema.optional(),
  structure: ProjectionWithBudgetSchema.optional(),
  detail: ProjectionWithBudgetSchema.optional(),
})

export const IntentStateSchema = z.object({
  id: StateIdSchema,
  intent_id: IntentIdSchema,
  schema_version: z.literal(SCHEMA_VERSION),
  status: StatusSchema,
  last_advanced_at: TimestampSchema,
  last_advanced_by: PartySchema,
  history: z.array(StateTransitionSchema),
  external_anchors: z.array(ExternalAnchorSchema),
  projections: ProjectionsByZoomSchema.optional(),
})

// ─── EvidenceLink ──────────────────────────────────────────────────────────
export const EvidenceStrengthSchema = z.enum(['weak', 'moderate', 'strong'])

export const EvidenceLinkSchema = z.object({
  id: z.string().min(1),
  from_intent: IntentIdSchema,
  to_intent: z.union([IntentIdSchema, ReferenceSchema]),
  relation: EvidenceRelationSchema,
  asserted_by: PartySchema,
  asserted_at: TimestampSchema,
  strength: EvidenceStrengthSchema.optional(),
  note: z.string().optional(),
})

// ─── Operation log ─────────────────────────────────────────────────────────
// Operations are the "intent calculus" verbs — typed records emitted by
// adapters when they detect transitions in source state. v0.1 ships them
// as a parallel collection on `Workspace` (siblings to `evidence_links`)
// rather than embedded in intents, so cross-cutting queries don't traverse
// intent objects (same discipline as edges).
//
// The 16 op kinds split into:
//  - Lifecycle (9): declare, refine, delegate, advance, gate,
//    propose-transition, accept-proposal, satisfy, revoke.
//  - Shaping (7): decompose, fork, merge, reframe, probe, clarify, commit.
//
// v0.1 = adapters EMIT operations; the UI RENDERS them; users do NOT FIRE
// them (that's writeback, deferred to v0.2). Per `roadmap.md` Path 2.

export const OperationKindSchema = z.enum([
  // Lifecycle
  'declare',
  'refine',
  'delegate',
  'advance',
  'gate',
  'propose-transition',
  'accept-proposal',
  'satisfy',
  'revoke',
  // Shaping
  'decompose',
  'fork',
  'merge',
  'reframe',
  'probe',
  'clarify',
  'commit',
])

// Kind-specific payload shapes — each lives in its own arm of the
// discriminated union so TS narrows on `kind`.
const BaseOperationFields = {
  id: z.string().min(1),
  at: TimestampSchema,
  by: PartySchema,
  /** The intent the operation acts on (parent for `decompose`,
   *  source for `fork`/`merge`, target for `gate`/`satisfy`/etc). */
  target_intent_id: IntentIdSchema,
  cause: z.string().min(1),
}

// Lifecycle operation arms
export const DeclareOperationSchema = z.object({
  ...BaseOperationFields,
  kind: z.literal('declare'),
})

export const RefineOperationSchema = z.object({
  ...BaseOperationFields,
  kind: z.literal('refine'),
  /** Which declaration field was refined (free-form path in v0.1). */
  field: z.string().min(1).optional(),
})

export const DelegateOperationSchema = z.object({
  ...BaseOperationFields,
  kind: z.literal('delegate'),
  to_party: PartySchema,
})

export const AdvanceOperationSchema = z.object({
  ...BaseOperationFields,
  kind: z.literal('advance'),
  from_status: StatusSchema,
  to_status: StatusSchema,
})

export const GateOperationSchema = z.object({
  ...BaseOperationFields,
  kind: z.literal('gate'),
  gate: z.string().min(1),
  awaiting_party: PartySchema.optional(),
})

export const ProposeTransitionOperationSchema = z.object({
  ...BaseOperationFields,
  kind: z.literal('propose-transition'),
  /** Free-form description of the proposal in v0.1; typed in v0.2. */
  proposal: z.string().min(1),
})

export const AcceptProposalOperationSchema = z.object({
  ...BaseOperationFields,
  kind: z.literal('accept-proposal'),
  /** Reference to the proposal operation being accepted (id). */
  proposal_id: z.string().min(1).optional(),
})

export const SatisfyOperationSchema = z.object({
  ...BaseOperationFields,
  kind: z.literal('satisfy'),
})

export const RevokeOperationSchema = z.object({
  ...BaseOperationFields,
  kind: z.literal('revoke'),
})

// Shaping operation arms
export const DecomposeOperationSchema = z.object({
  ...BaseOperationFields,
  kind: z.literal('decompose'),
  children: z.array(IntentIdSchema).min(1),
})

export const ForkOperationSchema = z.object({
  ...BaseOperationFields,
  kind: z.literal('fork'),
  /** The newly-created forked intent. */
  forked_intent_id: IntentIdSchema,
})

export const MergeOperationSchema = z.object({
  ...BaseOperationFields,
  kind: z.literal('merge'),
  /** The intents being merged into `target_intent_id`. */
  merged_intent_ids: z.array(IntentIdSchema).min(1),
})

export const ReframeOperationSchema = z.object({
  ...BaseOperationFields,
  kind: z.literal('reframe'),
  from_kind: IntentKindSchema,
  to_kind: IntentKindSchema,
})

export const ProbeOperationSchema = z.object({
  ...BaseOperationFields,
  kind: z.literal('probe'),
})

export const ClarifyOperationSchema = z.object({
  ...BaseOperationFields,
  kind: z.literal('clarify'),
})

export const CommitOperationSchema = z.object({
  ...BaseOperationFields,
  kind: z.literal('commit'),
})

export const OperationSchema = z.discriminatedUnion('kind', [
  DeclareOperationSchema,
  RefineOperationSchema,
  DelegateOperationSchema,
  AdvanceOperationSchema,
  GateOperationSchema,
  ProposeTransitionOperationSchema,
  AcceptProposalOperationSchema,
  SatisfyOperationSchema,
  RevokeOperationSchema,
  DecomposeOperationSchema,
  ForkOperationSchema,
  MergeOperationSchema,
  ReframeOperationSchema,
  ProbeOperationSchema,
  ClarifyOperationSchema,
  CommitOperationSchema,
])

// ─── Workspace bundle (for fixtures + adapter outputs) ─────────────────────
// The .refine enforces the 1:1 Intent↔IntentState bijection at the workspace
// level — a cross-record invariant that no per-record schema can express. It
// catches the silent-drift bugs where state arrays fall out of sync with
// intent arrays (a real risk for adapter code at v0.2).
export const WorkspaceSchema = z
  .object({
    intents: z.array(IntentSchema),
    states: z.array(IntentStateSchema),
    evidence_links: z.array(EvidenceLinkSchema),
    operations: z.array(OperationSchema),
  })
  .refine(
    ({ intents, states }) => {
      if (intents.length !== states.length) return false
      const intentIds = new Set(intents.map((i) => i.id))
      const stateIds = new Set(states.map((s) => s.id))
      // Every intent's state_ref must point at exactly one state, and every
      // state's intent_id must point at exactly one intent. Sets-of-equal-size
      // catch duplicates within each side; the cross-checks catch dangling refs.
      if (intentIds.size !== intents.length) return false
      if (stateIds.size !== states.length) return false
      const intentByStateRef = new Map(intents.map((i) => [i.state_ref, i.id]))
      if (intentByStateRef.size !== intents.length) return false
      for (const s of states) {
        if (!intentIds.has(s.intent_id)) return false
        if (intentByStateRef.get(s.id) !== s.intent_id) return false
      }
      return true
    },
    {
      message:
        'Workspace 1:1 invariant violated — every Intent must have exactly one IntentState linked via state_ref/intent_id',
    }
  )

// ─── Inferred TypeScript types ─────────────────────────────────────────────

export type IntentId = z.infer<typeof IntentIdSchema>
export type StateId = z.infer<typeof StateIdSchema>
export type PartyId = z.infer<typeof PartyIdSchema>
export type URI = z.infer<typeof URISchema>
export type Timestamp = z.infer<typeof TimestampSchema>

export type PartyKind = z.infer<typeof PartyKindSchema>
export type Party = z.infer<typeof PartySchema>
export type Reference = z.infer<typeof ReferenceSchema>

export type HolderMode = z.infer<typeof HolderModeSchema>
export type LifetimeKind = z.infer<typeof LifetimeKindSchema>
export type IntentKind = z.infer<typeof IntentKindSchema>
export type Status = z.infer<typeof StatusSchema>
export type KnowledgeScope = z.infer<typeof KnowledgeScopeSchema>
export type KnowledgeRole = z.infer<typeof KnowledgeRoleSchema>
export type ZoomLevel = z.infer<typeof ZoomLevelSchema>
export type ExternalAnchorKind = z.infer<typeof ExternalAnchorKindSchema>
export type EvidenceRelation = z.infer<typeof EvidenceRelationSchema>
export type EvidenceStrength = z.infer<typeof EvidenceStrengthSchema>

export type KnowledgeRef = z.infer<typeof KnowledgeRefSchema>
export type ExternalAnchor = z.infer<typeof ExternalAnchorSchema>
export type Holder = z.infer<typeof HolderSchema>
export type Lifetime = z.infer<typeof LifetimeSchema>
export type Decomposition = z.infer<typeof DecompositionSchema>
export type Provenance = z.infer<typeof ProvenanceSchema>
export type Declaration = z.infer<typeof DeclarationSchema>

export type Hypothesis = z.infer<typeof HypothesisSchema>
export type HypothesisBundle = z.infer<typeof HypothesisBundleSchema>
export type HypothesisResult = z.infer<typeof HypothesisResultSchema>
export type PredictionError = z.infer<typeof PredictionErrorSchema>

export type NousCampaignExtension = z.infer<typeof NousCampaignExtensionSchema>
export type NousIterationExtension = z.infer<typeof NousIterationExtensionSchema>
export type CoralOptimizationExtension = z.infer<typeof CoralOptimizationExtensionSchema>
export type CoralAttemptExtension = z.infer<typeof CoralAttemptExtensionSchema>
export type FeatureCampaignExtension = z.infer<typeof FeatureCampaignExtensionSchema>
export type FeaturePRExtension = z.infer<typeof FeaturePRExtensionSchema>
export type PaperCampaignExtension = z.infer<typeof PaperCampaignExtensionSchema>
export type PaperSectionExtension = z.infer<typeof PaperSectionExtensionSchema>
export type PaperClaimExtension = z.infer<typeof PaperClaimExtensionSchema>

export type TypeExtension = z.infer<typeof TypeExtensionSchema>
export type Intent = z.infer<typeof IntentSchema>

export type StateTransition = z.infer<typeof StateTransitionSchema>
export type Projection = z.infer<typeof ProjectionSchema>
export type IntentState = z.infer<typeof IntentStateSchema>
export type EvidenceLink = z.infer<typeof EvidenceLinkSchema>

export type OperationKind = z.infer<typeof OperationKindSchema>
export type Operation = z.infer<typeof OperationSchema>
export type DeclareOperation = z.infer<typeof DeclareOperationSchema>
export type RefineOperation = z.infer<typeof RefineOperationSchema>
export type DelegateOperation = z.infer<typeof DelegateOperationSchema>
export type AdvanceOperation = z.infer<typeof AdvanceOperationSchema>
export type GateOperation = z.infer<typeof GateOperationSchema>
export type ProposeTransitionOperation = z.infer<typeof ProposeTransitionOperationSchema>
export type AcceptProposalOperation = z.infer<typeof AcceptProposalOperationSchema>
export type SatisfyOperation = z.infer<typeof SatisfyOperationSchema>
export type RevokeOperation = z.infer<typeof RevokeOperationSchema>
export type DecomposeOperation = z.infer<typeof DecomposeOperationSchema>
export type ForkOperation = z.infer<typeof ForkOperationSchema>
export type MergeOperation = z.infer<typeof MergeOperationSchema>
export type ReframeOperation = z.infer<typeof ReframeOperationSchema>
export type ProbeOperation = z.infer<typeof ProbeOperationSchema>
export type ClarifyOperation = z.infer<typeof ClarifyOperationSchema>
export type CommitOperation = z.infer<typeof CommitOperationSchema>

export type Workspace = z.infer<typeof WorkspaceSchema>

// Helper: narrow an Intent to a specific kind.
export function isIntentOfKind<K extends IntentKind>(
  intent: Intent,
  kind: K
): intent is Intent & { kind: K; extension: Extract<TypeExtension, { kind: K }> } {
  return intent.kind === kind
}
