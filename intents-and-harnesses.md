# LLM Harnesses by User Intent — A Working Catalog

*Status: v2, 2026-05-22 (v1: 2026-05-22, initial research)*
*Scope: a survey of agentic / LLM-based systems organized by the user intent they serve and the harness mechanics that make that intent reliable. v2 promotes **intent itself** to a first-class object and surfaces the abstractions a harness needs in order to support low-friction intent-space collaboration between humans, agents, and AI-native systems.*

---

## Why this catalog exists

The same model (Claude, GPT, Gemini, Llama) shows up in dozens of products that feel completely different. What differentiates them is not the model — it's the **harness**: everything outside the LLM that shapes it toward a specific intent. v1 of this document cataloged 14 categories of intent and the harness patterns that serve each.

But cataloging intents is not the whole story. The harnesses that hold up beyond toy projects all turn out to share a deeper substructure: **intent itself is treated as a structured object** — held by some party (a human, an agent, or several jointly), decomposed hierarchically into sub-intents, accompanied by an explicit body of reusable knowledge, and stamped against an explicit state of the work in progress. Most categories in the catalog have these features, but they're embedded — different vocabularies, different schemas, no shared substrate across systems. The friction in collaborating with agents — re-stating intent, re-deriving knowledge, reconstructing state every turn — is mostly the cost of these abstractions being implicit.

v2 makes them explicit. It also adds one missing category (invariant maintenance), expands the corresponding substrate category (co-stewardship of agent-facing corpora), and introduces an axis — *collaboration mode × intent lifetime* — that re-cuts the existing rows in a useful way.

The catalog originated from a specific framing question: is **Nous** (`AI-native-Systems-Research/agentic-strategy-evolution`) fairly characterized as "a Claude harness for hypothesis discovery and experimentation"? The answer was yes — and that prompted the broader question of what *other* intents and harnesses exist, and what abstractions a future intent-aware platform would need so that humans, agents, and AI-native systems can collaborate in the intent space with minimal friction.

---

## Definitions

**Intent.** What some party wants accomplished. v1 used "intent" loosely as "the user's goal." v2 promotes it to a structured object with five fields the harness can reason about:

| Field | Meaning |
|---|---|
| **Holder(s)** | Who owns the intent — a human, an agent, several parties jointly, or a parent who has delegated child intents |
| **Scope / success criterion** | What counts as done — a passing test, a merged PR, a saturated principle, an upheld invariant |
| **Lifetime** | One turn (discrete), one bounded campaign, or standing (continuous until revoked) |
| **Decomposition** | Parent intent and child intents, with handoff protocols between holders at each level |
| **Provenance** | Who originated it, when, against what motivating observation or upstream intent |

**Harness.** Everything around the LLM that constrains, scaffolds, and operationalizes it toward an intent: prompts/methodology, schemas/validation, state machines, tool surfaces, memory, gates, retries, sandboxing, evaluators, and orchestration logic.

**Agent framework.** A programming substrate for *building* harnesses (LangGraph, AutoGen, Pydantic AI). Distinct from a harness, which is intent-specific.

**Knowledge corpus.** The body of reusable artifacts — principles, skills, conventions, validators, prior solutions, methodology prompts, evaluator rubrics — that accompanies an intent and **compounds across pursuits**. Distinct from memory (per-session, ephemeral) and from data (the substrate the work operates on). v1 noticed this as "methodology in prompts + methodology in schemas"; v2 names it as a first-class abstraction because the strongest harnesses are the ones whose knowledge corpus survives across sessions, agents, and even projects.

**Work state.** The persistent record of *where intent-pursuit currently stands* — distinct from the artifacts the work produces. Examples:

- **Campaign state** (Nous): which iterations have run, which hypotheses are open, which principles are held, which gates the human has approved.
- **PR state** (review systems): which checks have run, which comments are unresolved, which reviewers have signed off.
- **Plan state** (plan mode): which steps are done, blocked, or pending, what the human last approved.
- **Worktree state** (CORAL, /batch): which branch each sub-agent owns, what each has produced, what's been merged.

Most harnesses encode work state implicitly in scattered files; the strongest encode it explicitly with schemas and an agent-facing API for querying and updating it.

**Three universal harness primitives** (v1, unchanged). Almost every system picks an explicit stance on each:

| Primitive | What it controls |
|---|---|
| **Output structure** | JSON Schema / Pydantic / Zod — turns LLM output from prose into typed artifacts the rest of the system can act on |
| **Tool surface** | What the LLM can read, write, run, observe (MCP, function calling, Agent SDK, Computer Use) |
| **Loop topology** | Single-shot vs. ReAct vs. plan-execute-verify vs. evolutionary vs. multi-agent vs. human-gated |

**Three intent-aware abstractions** (v2 addition). Every mature category in the catalog implicitly has these; few surface them as primitives:

| Abstraction | What it controls |
|---|---|
| **Collaboration mode** | Who holds the intent — human alone, agent alone, jointly negotiated, or hierarchically delegated with explicit handoff |
| **Knowledge corpus binding** | Which body of reusable artifacts the intent draws on and contributes back to |
| **Work state model** | The persistent, queryable record of where intent-pursuit currently stands |

---

## The intent axis

Two questions cut across the catalog and surface its real shape:

**Who holds the intent?**

- **Human-held** — a human supplies and refines the intent each turn; the agent serves it.
- **Agent-held** — the agent received the intent once and operates autonomously toward it.
- **Jointly held** — the intent is negotiated, advanced, and refined by both, often with explicit gates.
- **Hierarchically held** — a parent intent is held by one party; child intents are delegated to others (sub-agents, sibling agents, a downstream human reviewer) with handoff protocols at each level.

**How long does the intent persist?**

- **Discrete** — one turn; terminates on completion.
- **Campaign** — multi-turn, bounded; terminates on satisfaction or abandonment.
- **Standing** — continuous; terminates only on explicit revocation.

The existing catalog re-cut on this axis:

|  | Discrete | Campaign | Standing |
|---|---|---|---|
| **Human-held** | #6 PR review (one diff), #9 run-and-verify | #3 agentic coding, #13 research synthesis | (sparse) |
| **Agent-held** | (rare) | #2 evolutionary search, #10 long-horizon agents | **(empty — the AI-native gap)** |
| **Jointly held** | #4 spec-driven dev (per phase) | #1 hypothesis-driven experimentation, #5 swarms | **(empty — the AI-native gap)** |
| **Hierarchically held** | (rare) | #8 parallel decomposition | **#15 invariant maintenance (new)** |

The empty cells in the **standing** column are where the next twelve months of harness development sit. Standing intents are systematically underdeveloped — yet that's the cell where **AI-native systems** naturally live. An AI-native system is one whose default architecture assumes agents are continuously present participants, not bolted-on consumers; its primary intents are jointly or agent-held, and they persist for the lifetime of the system.

---

## The catalog

Each entry is annotated with **Intent metadata**: a one-line header surfacing the four intent-aware fields (holder, lifetime, knowledge corpus, work state). The metadata is descriptive of the *typical* shape; specific deployments vary.

### 1. Hypothesis-driven experimentation on software systems

**Intent metadata.** *Holder:* jointly held. *Lifetime:* campaign. *Knowledge corpus:* principles ledger, prediction-error taxonomy, hypothesis-bundle templates, methodology prompts. *Work state:* iteration records, open hypotheses, gate status, per-condition worktree state.

**Intent.** Discover *why* a system behaves as it does, by formulating falsifiable predictions, running controlled experiments, and accumulating reusable principles across iterations.

**Harness pattern.** Schema-governed phases (DESIGN → EXECUTE_ANALYZE), human gates between phases, worktree isolation between experimental conditions, prediction-error taxonomy, principles ledger that compounds across iterations, agent-facing artifact validator (`nous validate`).

**Systems.**
- **Nous** (`AI-native-Systems-Research/agentic-strategy-evolution`) — the canonical example.
- Adjacent: parts of **Sakana AI Scientist** when it does ablations; parts of **DSPy** when it does evaluator-driven optimization, though both are closer to category 2.

**Distinguishing trait.** The output is *qualitative principles* about why the system works the way it does, not a better artifact. Hypothesis bundles (H-main, H-ablation, H-super-additivity, H-control-negative, H-robustness) decompose each experiment into multiple falsifiable arms.

---

### 2. Algorithmic / scientific discovery via evolutionary search

**Intent metadata.** *Holder:* agent-held within a human-set scoring function. *Lifetime:* campaign. *Knowledge corpus:* prior solutions database, evaluator rubric, mutation prompts, `EVOLVE-BLOCK` templates, `artifacts` feedback. *Work state:* attempt database, current population, fitness frontier, search-algorithm state (UCB / island / beam).

**Intent.** Find a *better program, algorithm, or configuration* for a problem with a quantitative scoring function, by mutating candidate solutions under LLM guidance.

**Harness pattern.** Pluggable evaluator (Python / Docker / Harbor task dir) + pluggable search algorithm (UCB / island / beam / best-of-N) + LLM mutation operator using `EVOLVE-BLOCK` markers + context builder injecting prior solutions and `artifacts` feedback + checkpointable database of attempts + dashboard for human steering.

**Systems.**
- **SkyDiscover** (UC Berkeley Sky Lab) — unifies multiple discovery algorithms (AdaEvolve, EvoX, OpenEvolve, GEPA, ShinkaEvolve) under a single Harbor-format task interface across ~200 benchmarks.
- **AlphaEvolve** (DeepMind).
- **OpenEvolve**, **FunSearch**, **GEPA**, **ShinkaEvolve**.

**Distinguishing trait.** Output is a *better artifact* (a faster kernel, a higher-scoring program), not understanding of why. The fitness landscape is explicit; the LLM is a creative mutation operator inside an outer optimization loop.

**Contrast with #1.** Both are scientific-method-shaped. Evolution optimizes a scalar over a population; Nous designs one targeted experiment per iteration and extracts qualitative principles. Different epistemic outputs.

---

### 3. General agentic coding (SDLC automation)

**Intent metadata.** *Holder:* human-held, refreshed each turn. *Lifetime:* discrete-to-campaign (one turn by default; extends with `/goal`, `/loop`, plan mode). *Knowledge corpus:* `CLAUDE.md`, skills, plugins, hooks, MCP servers — increasingly a portable corpus the user curates. *Work state:* session state, plan state when in plan mode, todo list, git working tree.

**Intent.** Delegate end-to-end engineering tasks — features, fixes, refactors, tests, releases — with the agent reading the codebase, editing files, running commands, managing git.

**Harness pattern.** Persistent CWD-aware session, file/exec/git tools, `CLAUDE.md`-style memory, hooks (pre/post tool), permission modes, MCP for external systems, plan mode + checkpointing, sub-agents for parallelism, scheduled / background runs.

**Systems.** **Claude Code**, **Cursor**, **Aider**, **Codex CLI**, **OpenCode**, **Cline**, **GitHub Copilot CLI**, **Continue**.

**Distinguishing trait.** Broad capability surface, no opinionated methodology — the user supplies the intent each turn. Most other categories are built on top of this one.

---

### 4. Spec-driven development

**Intent metadata.** *Holder:* hierarchically held — human owns the constitution and spec; agent owns plan and tasks; both gate transitions. *Lifetime:* campaign. *Knowledge corpus:* the constitution (project-scoped knowledge), spec templates, methodology slash commands. *Work state:* phase artifacts (`spec.md`, `plan.md`, `tasks.md`), version history per artifact.

**Intent.** Replace vibe-coding with structured intent-first development: write *what* and *why* before *how*, then let an agent generate plans, tasks, and code that conform to the spec.

**Harness pattern.** Constitution → spec → clarification → plan → tasks → analyze → implement, each phase producing a versioned artifact, all anchored by a project "constitution" that constrains downstream phases.

**Systems.**
- **GitHub spec-kit** (`/speckit.constitution`, `/speckit.specify`, `/speckit.clarify`, `/speckit.plan`, `/speckit.tasks`, `/speckit.analyze`, `/speckit.implement`).
- **AWS Kiro**.
- **Aider's `/architect` mode** (lighter-weight variant).

**Distinguishing trait.** Methodology framework first, like Nous — but the artifacts are *requirements documents*, not *hypothesis bundles*. Intent is "build the right thing" not "learn why this thing behaves this way." This is also the clearest existing example of **hierarchical intent refinement** done well: each phase converts a parent intent into child intents that the next phase consumes.

---

### 5. Multi-agent autonomous experimentation (coding-agent swarms)

**Intent metadata.** *Holder:* hierarchically held — orchestrator owns the campaign intent; per-agent intents are delegated. *Lifetime:* campaign. *Knowledge corpus:* shared `.coral/skills/`, `.coral/notes/`, accumulated attempt records. *Work state:* per-agent worktree state, shared scored-attempt database, per-agent generated instructions.

**Intent.** Spawn many independent coding agents, let them iteratively solve / improve on a task, observe what wins.

**Harness pattern.** Per-agent git worktrees + shared state directory for indirect file-based communication + per-agent generated instructions + scored eval loop + dashboard.

**Systems.**
- **CORAL** (`docs.coralxyz.com`) — `.coral/attempts/`, `.coral/notes/`, `.coral/skills/` shared across worktrees; agents communicate by writing files, not message passing.
- Parts of **Sakana AI Scientist v2**.
- **OpenAI Swarm** patterns when used this way.

**Distinguishing trait.** Competitive parallelism with file-based collaboration. The simplification (filesystem instead of message bus) is pragmatic — dramatically easier to debug and replay than full A2A protocols.

---

### 6. Code & PR review

**Intent metadata.** *Holder:* human-held (or jointly with author). *Lifetime:* discrete (one diff). *Knowledge corpus:* role-specific reviewer prompts, project conventions, prior review comments. *Work state:* the PR object itself — comments, threads, check status, approval state.

**Intent.** Catch bugs, security issues, regressions, or style violations in a diff or PR before merge — without editing files.

**Harness pattern.** Read-only diff scope + role-specific reviewer prompts (correctness, security, style, comments, tests) + confidence-thresholded findings + optional GitHub PR comment posting + effort dial for cost/recall trade-off.

**Systems.**
- Bundled: Claude Code's `/code-review`, `/security-review`, `/review`.
- Commercial: **Greptile**, **CodeRabbit**, **Diamond (Graphite)**, **Sourcery**, **GitHub Copilot review**.
- Plugin-shaped: `pr-review-toolkit` (silent-failure-hunter, type-design-analyzer, comment-analyzer, pr-test-analyzer).

**Distinguishing trait.** Read-only scope is load-bearing — review agents that can edit are doing #3, not #6. Note that PR state is one of the cleanest existing examples of an **explicit work-state model** in the wild: GitHub's PR object schema is exactly the shape v2's "work state" abstraction is gesturing at.

---

### 7. Intent persistence across turns

**Intent metadata.** *Holder:* persists across turns within whatever mode held it originally. *Lifetime:* campaign-to-standing. *Knowledge corpus:* the goal/condition itself, plus whatever the underlying agent has access to. *Work state:* the persistence mechanism — Stop hook condition, schedule, plan checkpoint.

**Intent.** Tell the agent a goal, then let it work autonomously across many turns until the goal is satisfied — without having to keep saying "keep going."

**Harness pattern.** Goal stored as a session-scoped Stop hook that blocks the "done" state until a condition holds; auto-paced wake-ups for self-pacing; plan mode for explicit step approval; `--auto-approve` style flags for unattended runs.

**Systems.**
- **Claude Code's `/goal`** — goal as a Stop hook condition; the model keeps working until satisfied.
- **Claude Code's `/loop`** — recurring task with self-pacing.
- **Claude Code's `/plan`** + plan mode.
- **Cursor's agent mode**, **Aider's `--auto-commits`**.
- **Nous's `--auto-approve`** is the same primitive applied to a multi-iteration campaign.

**Distinguishing trait.** Not a feature — a *property* a harness has. v2 reading: this category is where the "lifetime" axis became visible to the field. Most existing systems max out at "campaign" persistence; the truly standing version (continuous, multi-day, multi-session) is still rare.

---

### 8. Parallel decomposition of large changes

**Intent metadata.** *Holder:* hierarchically held — orchestrator owns the parent change; sub-agents own per-unit intents. *Lifetime:* campaign. *Knowledge corpus:* the decomposition plan + shared codebase research. *Work state:* per-worktree branch state, per-sub-agent PR state, merge/conflict status.

**Intent.** A change too big for one session — migrate a directory, refactor an API, port a framework — broken into independent units that can run concurrently and merge cleanly.

**Harness pattern.** Codebase research → decompose into 5–30 units → spawn one background sub-agent per unit in an isolated git worktree → each sub-agent implements + tests + opens a PR.

**Systems.**
- **Claude Code's `/batch`** — the cleanest example.
- **CORAL** (different framing — competitive rather than divide-and-conquer, but same worktree primitive).
- The `superpowers:dispatching-parallel-agents` skill.

**Distinguishing trait.** The hard problem is *decomposition into independent units*, not the parallel execution. Worktree isolation is what keeps merges sane. This is the cleanest existing example of **intent decomposition with handoff** — the parent intent is genuinely refined into typed child intents that are independently held.

---

### 9. "Run and verify" / closed-loop UI validation

**Intent metadata.** *Holder:* human-held, often invoked at the tail of #3. *Lifetime:* discrete. *Knowledge corpus:* the recorded launch recipe (install / env / launch / exercise). *Work state:* observation log (screenshots, console output, DOM snapshots).

**Intent.** Confirm a code change actually works *in the running app*, not just in unit tests or type checks. Critical for UI/UX work where tests-pass / types-pass tells you nothing about whether the button is wired up.

**Harness pattern.** Inferred or recorded launch recipe → start the app → exercise the changed feature → observe via screenshot / console / browser DOM → report.

**Systems.**
- **Claude Code's `/run`, `/verify`, `/run-skill-generator`** — the recipe-recording variant captures install/env/launch once and reuses forever.
- **Browser-use**, **Anthropic Computer Use**, **OpenAI Operator**, **Skyvern**, **Stagehand**.

**Distinguishing trait.** Tests verify code; this verifies *features*. Different signal, different failure modes.

**Why under-appreciated:** `/run-skill-generator`'s "record the recipe once, reuse forever" idea is a clean example of **knowledge-corpus accumulation** — both this and Nous's "extract principle once, reuse forever" turn expensive one-time agent work into cheap repeated reads.

---

### 10. Long-horizon autonomous task agents

**Intent metadata.** *Holder:* agent-held after handoff; human-held at provisioning and (rarely) at escalation. *Lifetime:* campaign (often multi-day). *Knowledge corpus:* persistent memory + per-agent skill/tool inventory. *Work state:* checkpointed task graph, sub-agent inventory, escalation queue.

**Intent.** Hand off a sprawling, multi-day task — write a research report, build a small app from scratch, manage a codebase migration end-to-end — and come back to a finished result.

**Harness pattern.** VM/container sandbox + Computer Use or browser tools + persistent memory + sub-agent spawning + checkpointing + human escalation channel + scheduled task runner.

**Systems.** **Devin** (Cognition), **Manus**, **Replit Agent**, **OpenAI Codex cloud**, Anthropic's background-agent + scheduled-tasks combo. Earlier (largely superseded): **AutoGPT**, **BabyAGI**.

**Distinguishing trait.** Optimizes for "wall-clock hours of unattended work," not interactivity. Lives or dies on checkpointing and the cost of recovery from failure — i.e., on its work-state model.

---

### 11. Multi-agent orchestration *frameworks* (the substrate, not the harness)

**Intent metadata.** *Holder:* N/A — this row is about substrates the holder uses to *build* harnesses. *Lifetime:* N/A. *Knowledge corpus:* whatever the developer wires in. *Work state:* whatever the developer schemas.

**Intent.** *Build* a custom multi-agent system with explicit roles, message-passing, and control flow — not consume a pre-built one.

**Harness pattern.** Graph or actor model where each node is an LLM call with role/tools, edges are deterministic Python or LLM-routed transitions, state is typed.

**Systems.** **LangGraph**, **AutoGen** (Microsoft), **CrewAI**, **OpenAI Swarm / Agents SDK**, **Anthropic Agent SDK**, **Pydantic AI**, **Mastra**, **A2A protocol** (cross-vendor agent communication).

**Position in the stack.** These are *what you'd use to build* something like Nous, CORAL, or spec-kit. Intent-agnostic substrate; the intent comes from how you wire them. Most of these substrates do *not* yet expose intent, knowledge corpus, or work state as first-class primitives — they expose nodes, edges, and typed state, leaving the intent-aware abstractions to be reinvented per harness.

---

### 12. Tool / capability substrates and agent-facing corpora

**Intent metadata.** *Holder:* corpus stewards (humans + agents jointly, increasingly). *Lifetime:* standing. *Knowledge corpus:* this row *is* the knowledge corpus, viewed from the platform side. *Work state:* version control, validator status, install/distribution state.

**Intent.** Give *any* agent uniform access to data, tools, and reusable knowledge artifacts without writing N integrations for N agents — and tend that corpus over time so it stays useful for the agents downstream of it.

**Harness pattern.** A standard server protocol (MCP, OpenAPI tools), a portable skill format (Agent Skills `SKILL.md`), or a plugin manifest any compliant client can load — plus the validators, reviewers, and review workflows that keep the corpus healthy.

**Systems.** **MCP** (Anthropic, now widely adopted), **Agent Skills open standard** (`agentskills.io`), **OpenAI tool calling**, **Claude Code Plugins**. Co-stewardship infrastructure: `nous validate`, `plugin-validator`, `skill-reviewer`, the broader `superpowers-developing-for-claude-code` plugin family.

**Distinguishing trait.** Doesn't *do* a task — makes tasks composable across agents, and supports the **co-stewardship of agent-facing corpora** as a standing intent. v1 framed this as "Linux pipes for AI agents"; v2 expands the framing because the *tending* of these corpora — keeping skills accurate, keeping plugins compatible, keeping principles current — is itself an intent category, and it's the one most often held jointly by humans and agents.

---

### 13. Research / knowledge synthesis agents

**Intent metadata.** *Holder:* human-held campaign. *Lifetime:* campaign. *Knowledge corpus:* citation databases, prior reports, retrieval indices. *Work state:* outline, draft, source registry, citation-resolution status.

**Intent.** Investigate a topic across many web/internal sources and produce a report with citations — not just answer a question, but build a sourced argument.

**Harness pattern.** Iterative search → fetch → distill → outline → draft → verify-citations loop, often with a planning agent and one or more research sub-agents.

**Systems.** **OpenAI Deep Research**, **Perplexity Pro Search**, **Anthropic Research**, **Elicit**, **STORM** (Stanford), **GPT Researcher**. Smaller-scope variants: `literature-review`, `paper-lookup` skills.

**Distinguishing trait.** Citation accountability. The output isn't trustworthy without traceable sources, which forces the harness to track provenance through every step — i.e., the work-state model has to track *why each claim is in the document* as first-class.

---

### 14. Eval / benchmark harnesses (the meta-category)

**Intent metadata.** *Holder:* human-held (the benchmark author / consumer). *Lifetime:* standing for the benchmark itself; discrete per task. *Knowledge corpus:* the frozen task suite. *Work state:* run logs, leaderboards, score histories.

**Intent.** Measure whether *any* of the above harnesses actually works, reproducibly, on realistic tasks.

**Harness pattern.** Containerized task suite + standardized I/O + scoring rubric + leaderboard. Tasks frozen so harness-vs-harness comparison is fair.

**Systems.** **SWE-bench**, **SWE-bench Verified**, **METR task suites**, **AgentBench**, **GAIA**, **Inspect AI** (UK AISI), **HumanEval / LiveCodeBench / BigCodeBench**. SkyDiscover's ~200 benchmarks fit here too.

**Distinguishing trait.** User is not trying to *get work done*; they're trying to *measure capability*. Same models, totally different harness needs (reproducibility > ergonomics, sandboxing > UX, scoring > tool richness).

---

### 15. Invariant / property maintenance *(new in v2)*

**Intent metadata.** *Holder:* hierarchically held — a human (or AI-native system) declares the invariant; a steward agent owns continuous monitoring; a remediation agent is delegated bounded fixes; escalation returns to the human on remediation failure. *Lifetime:* **standing** — terminates only on explicit revocation. *Knowledge corpus:* the invariant specification, prior remediation history, escalation playbooks, the broader project knowledge corpus the remediation agent inherits from. *Work state:* invariant status, last-checked timestamp, remediation queue, escalation queue, change history of the invariant itself.

**Intent.** Keep system S satisfying property P continuously. The "intent" is not to do something once but to ensure something is always true — and to have a bounded, auditable response when it isn't.

**Harness pattern.** Continuous watchers (file watchers, metric watchers, log-tail monitors, repo-state diffs, schema-conformance checkers) → trigger conditions → invariant evaluator → bounded remediation agent (read/write scope explicitly limited) → escalation channel if remediation fails or exceeds bounds → audit log of every detected violation and every remediation attempt.

**Systems.**
- **Schema-drift / dependency bots**: Renovate, Dependabot, especially when wired to an LLM-backed remediation step.
- **SLO / observability guardians**: Honeycomb's BubbleUp + LLM analysis, PagerDuty AIOps, internal SRE assistants.
- **Plugin / skill validators run continuously**: `plugin-validator`, `skill-reviewer`, `nous validate` invoked as a CI guard rather than on demand.
- **Compliance / policy bots**: license-conformance, code-of-conduct enforcement, secret-scanning + auto-remediation.
- **Verification hooks**: the `superpowers:verification-before-completion` skill, when wired into a Stop hook so it *blocks* completion claims rather than reminding the agent to verify.

**Distinguishing trait.** Distinct from review (#6, one-shot per diff), eval (#14, measurement not enforcement), and intent persistence (#7, one campaign not standing). The defining property is **standing × hierarchical**: the intent persists indefinitely, and the response to violations is delegated through an explicit chain (watcher → remediation → escalation) with bounded scope at each level.

**Why this is the missing row.** Every mature system grows invariants — "the principles ledger must validate," "the build must stay green," "this metric must stay under threshold," "no skill in the corpus can have invalid frontmatter." These are real intents with real harnesses, but they're scattered across CI configs, hook scripts, monitoring rules, and ad-hoc cron jobs. Naming the category lets the corresponding abstractions (standing intent + hierarchical handoff + bounded remediation) become first-class.

**AI-native angle.** This is the row where AI-native systems most obviously live: a system where agents are continuously present participants will accumulate dozens of invariants the agents themselves help maintain. Without first-class support for this category, every AI-native system reinvents its own watcher/remediator/escalator from scratch.

---

## The missing abstractions (and what an intent-aware platform would expose)

The catalog above is what exists. This section is what's missing: the abstractions that would let humans, agents, and AI-native systems collaborate in the intent space with minimal friction. Most of these are visible in pieces across the catalog but are not yet offered as primitives by any single substrate.

### A. Intent as a first-class object

Today, "intent" is mostly implicit — encoded in a slash-command name, a prompt prefix, a config file, or the user's head. An intent-aware platform would treat intent as a typed, persistent, queryable object with the five fields from Definitions (holder, scope, lifetime, decomposition, provenance). Operations on it: `declare`, `refine`, `delegate`, `hand-off`, `escalate`, `satisfy`, `revoke`. Crucially, the platform would let an *agent* perform any of these operations on its own intents — not just consume an intent the human gave it.

What this unlocks: the agent can say "this child intent is now satisfied," "I need to delegate this sub-intent because it's outside my tool surface," "I need to escalate because the scope no longer matches what I can do." None of those moves are first-class today.

### B. Collaboration in intent space with low friction

The intent axis above shows that the interesting collaboration patterns — jointly held campaigns, hierarchically held standing intents — are exactly the ones with no shared substrate. Each system reinvents its own protocol for *who decides what next*. An intent-aware platform would expose:

- **Holder transitions** as a typed operation. "This intent transitions from human-held to jointly-held at phase boundary X" should be a schema, not a convention.
- **Handoff protocols** between layers of a hierarchical decomposition — what each layer owes the layer above (typed reports) and below (typed sub-intents).
- **Negotiation primitives** for joint intents — proposals, counter-proposals, gates, signed approvals, dissent. Spec-kit's phase artifacts are a primitive form of this; they'd benefit from being first-class.
- **Friction budget**: an explicit cost on each round-trip to the human, with the harness preferring agent-resolvable refinements when possible. (Today this is implicit in "auto-approve" flags, which are too coarse.)

### C. Hierarchical refinement and advancement of intent

Today, intent hierarchy is most visible in spec-kit (constitution → spec → plan → tasks) and `/batch` (parent change → sub-unit changes). In both cases the hierarchy is hardcoded into the workflow, not a general primitive. An intent-aware platform would let any intent declare child intents, attach handoff schemas, and track satisfaction roll-up — so a "sub-agent done" signal cleanly propagates to a "parent intent advanced one step" signal without each system reinventing the bookkeeping.

What this unlocks: cross-harness composition. Today a Nous campaign cannot easily emit a child intent to spec-kit ("design this experimental system") and then consume the resulting artifacts as inputs. With first-class hierarchical refinement, the bridge becomes a typed handoff, not a custom integration.

### D. Knowledge engineering as a co-equal track

The strongest harnesses encode methodology twice (in prompts and in schemas) and accumulate a knowledge corpus that compounds across pursuits. But the *engineering* of that corpus — versioning it, validating it, attributing contributions, decommissioning stale entries, surfacing the right slice for the current intent — is largely manual today.

An intent-aware platform would treat the knowledge corpus as a co-equal track with its own lifecycle:

- **Provenance**: every entry traceable to the intent-pursuit that produced it.
- **Validation**: agent-facing validators that gate corpus entry (the `nous validate` pattern, generalized).
- **Retrieval-by-intent**: surfacing the slice of the corpus relevant to *this* intent, not the whole index.
- **Decommissioning**: explicit lifecycle for stale entries, ideally driven by failed-prediction signals from the same harness that produced them.

This is the "co-stewardship of agent-facing corpora" framing from §12, promoted from a substrate concern to a first-class workflow.

### E. Work state as a typed, queryable object

PR state, campaign state, plan state, worktree state — every category in the catalog has a work-state model, but each one schemas its own. An intent-aware platform would offer a generalized work-state object with:

- **Typed fields** per intent category (extension points, not a one-size schema).
- **Agent-facing query API**: "what's the current state of intent X" should be a tool call, not a filesystem dive.
- **Update primitives**: `advance`, `block`, `unblock`, `branch`, `merge` — the operations the catalog already implies.
- **Replay**: enough history to reconstruct *why* the current state is the current state, for both audit and debugging.

The closest existing thing is GitHub's PR object combined with check-runs and review threads. Generalizing that to other intent categories — campaign state, plan state, invariant status — is the move.

### F. AI-native systems as the natural consumer

An **AI-native system** is one whose architecture assumes agents are continuously present participants — not bolted-on consumers. Its primary intents are jointly or agent-held, persist for the lifetime of the system, and decompose hierarchically into sub-intents that fan out across many agents and a few humans.

Such a system needs all six abstractions above (intent, collaboration, hierarchy, knowledge, state, plus the universal harness primitives) at the platform layer. Building each one inside each AI-native system, as the field does today, is the source of most of the friction. The empty cells in the intent-axis matrix (standing × agent-held, standing × jointly-held) are exactly where that friction shows up most — and exactly where an intent-aware platform would have the highest leverage.

---

## Cross-cutting observations

### A useful diagonal *(retained from v1)*

- Rows **1–5** are **methodology-first** harnesses — schemas/protocol are load-bearing.
- Rows **6–10** are **capability-first** — intent is "do X reliably," not "do X *scientifically*."
- Rows **11–12** are **substrate** — used to build others on top.
- Rows **13–14** are **outputs other people consume** (reports, scores).
- Row **15** is **standing-and-hierarchical** — the structurally distinct shape that motivates v2's intent-axis re-cut.

Knowing which category you're in tells you what to invest in: methodology-first systems live or die on schema design; capability-first systems live or die on tool quality and verification loops; standing systems live or die on their work-state model and escalation paths.

### The schema-governed-artifacts pattern *(retained, expanded)*

Intent-specific harnesses tend to ship with **schema-validated artifacts** as their key innovation. Updated table:

| Harness | Load-bearing artifacts |
|---|---|
| Nous (#1) | hypothesis bundles, prediction-error taxonomy, principles |
| spec-kit (#4) | constitution, spec.md, plan.md, tasks.md |
| SkyDiscover (#2) | Harbor task directories, attempt records |
| CORAL (#5) | scored attempt JSON, shared notes |
| `/batch` (#8) | per-unit task spec, per-worktree branch state |
| Invariant maintenance (#15) | invariant spec, watcher trigger schema, remediation log, escalation envelope |

The schemas are how a *deterministic Python orchestrator* can reason about LLM output reliably — they convert prose into typed state. v2 reading: each row's schemas are doing double duty as both output-structure (a v1 harness primitive) and work-state model (a v2 abstraction).

### "Methodology in prompts + methodology in schemas" *(retained)*

The strongest harnesses encode methodology twice:
1. **At prompt level** (`prompts/methodology/`) — shapes the generative distribution.
2. **At schema level** (JSON Schema validation, agent-facing validators like `nous validate`) — filters the output distribution.

Either alone leaks: prompts get ignored under token pressure; schemas alone produce minimal-compliance outputs that pass validation but lack substance. v2 reading: this dual encoding is the **knowledge corpus** abstraction in action — methodology is one of the kinds of knowledge a harness accumulates, and the strongest harnesses give it two storage classes (loose, generative) and (strict, validating).

### Where Nous sits on the map *(updated)*

Nous is primarily **(1) hypothesis-driven experimentation**, built atop:
- **(3) general agentic coding** — dispatches `claude -p` for code-access work.
- **(7) intent persistence** — multi-iteration campaigns with `--auto-approve`.
- **(11) multi-agent orchestration framework patterns** — planner/executor split.
- **(12) co-stewardship of agent-facing corpora** — the principles ledger *is* a knowledge corpus, with `nous validate` as its agent-facing validator.

On the v2 intent axis: jointly-held × campaign. The natural extension lives in two adjacent cells:
- *Jointly-held × standing* — a Nous-shaped invariant: "the principles ledger must remain self-consistent and falsifiable across all open campaigns."
- *Hierarchically-held × campaign* — a Nous campaign that delegates a child intent to a SkyDiscover (#2) evolutionary search, then ingests its findings as candidate principles. This is an explicit form of cross-harness composition.

Closest *adjacent* system: **SkyDiscover (#2)**. Both are scientific-method-shaped, both target software systems with measurable outcomes, both use LLMs to propose interventions. The split is in epistemic output: evolution gives a *better artifact*; Nous gives *better understanding*. With first-class hierarchical refinement (§C), composition becomes a one-line bridge instead of a research project.

### Under-appreciated categories for the next 12 months *(updated)*

- **(15) Invariant maintenance.** Standing × hierarchical is the structural shape AI-native systems need most, and it's the cell with the least existing tooling.
- **(9) Run and verify.** Tests-pass / types-pass aren't enough for UI work, and the "record the launch recipe once, reuse forever" pattern composes well with everything else in the catalog. Expect this to migrate from a Claude Code feature to a category of standalone tooling.
- **(12) Co-stewardship of agent-facing corpora.** Now that plugin and skill ecosystems exist, the *tending* of those ecosystems is becoming a real intent. Existing tooling (`plugin-validator`, `skill-reviewer`) is one validator deep; a real co-stewardship harness would track provenance, decommission staleness, and surface intent-relevant slices.

### Gaps in the landscape *(updated)*

- **Bracketing the SDLC with experimentation.** Spec-driven dev (#4) constrains *what to build* before code; PR review (#6) constrains *what to ship* after code. Nous-shaped *experimentation* harnesses don't have a widely-adopted analog at either end of their loop yet — there isn't a "spec-kit for hypotheses" or a "PR review for principles."
- **Cross-harness composition.** No standard way to feed (1)'s principles into (2)'s search prior, or (4)'s spec into (1)'s research question. Each system is its own island. First-class hierarchical refinement (§C) is the missing primitive.
- **Eval coverage of methodology-first harnesses.** SWE-bench measures (3); there's no widely-adopted benchmark that measures whether a hypothesis-driven harness actually accumulates correct knowledge over time, or whether an invariant-maintenance harness catches regressions reliably.
- **The standing × jointly-held cell.** Currently empty. AI-native systems will need it, and the field has neither a canonical example nor a substrate built for it.
- **Intent-aware platform layer.** No existing agent framework (#11) exposes intent, collaboration mode, knowledge corpus, or work state as first-class primitives — they all expose nodes/edges/typed-state, leaving the intent-aware abstractions to be reinvented per harness.

---

## Sources

- Claude Code: `https://code.claude.com/docs/en/overview`, `/commands`, `/skills`
- Coral: `https://docs.coralxyz.com/`
- SkyDiscover: `https://skydiscover-ai.github.io/`, `https://github.com/skydiscover-ai/skydiscover`
- spec-kit: `https://github.com/github/spec-kit`
- Agent Skills standard: `https://agentskills.io`
- Nous (this catalog's anchoring system): `AI-native-Systems-Research/agentic-strategy-evolution`
