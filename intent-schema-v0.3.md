# Integral Intent Schema

**Version: 0.3.0**
**Status: pre-stable, breaking changes expected. Promote on any breaking change.**
**Date: 2026-05-29**

## Versioning policy

- Pre-1.0: every breaking change bumps the *minor* (0.1 → 0.2 → 0.3 → …). We do not maintain backward compatibility before 1.0.
- Each version lives in its own file (`intent-schema-v0.1.md`, `intent-schema-v0.2.md`, `intent-schema-v0.3.md`, …) so the diff is legible and old adapters can keep referencing the version they were built against.
- The `schema_version` field on every intent object is authoritative — adapters MUST reject objects whose version they don't understand.
- Non-goals for the current version are listed explicitly at the bottom of this file; deferred concerns are not bugs.

## What v0.3.0 added from v0.2.0

This is a **breaking change** — additive at the kind level, but the bumped `SCHEMA_VERSION` literal forces every consumer to acknowledge it. The headline is one new `IntentKind` plus its extension shape:

| Item | v0.2.0 | v0.3.0 |
|---|---|---|
| `IntentKindSchema` | 5 kinds (nous-campaign, nous-iteration, coral-optimization, coral-attempt, feature-campaign) | **6 kinds** — adds `'research-thread'` |
| `ResearchThreadExtensionSchema` | absent | **new** (kind literal + `root_anchor: ExternalAnchor`) |
| `TypeExtensionSchema` discriminated union | 5 arms | 6 arms |
| `SCHEMA_VERSION` literal | `'0.2.0'` | `'0.3.0'` |
| Default sources (when no `integral.config.json`) | one `nous` source at `~/Documents/Projects/inference-sim` | + a `research-threads` source at `~/Documents/Projects/research-threads` |
| Adapter roster | nous, coral, github-issues | **+ research-thread** (filesystem, read-only, projection-only) |

**No structural-grammar changes elsewhere.** Core types, holder modes, lifetime kinds, status enum, knowledge refs, evidence links, projections, operation log, workspace bundle, shaping operations — all unchanged from v0.2.0. Read `intent-schema-v0.2.md` for the full grammar of those sections; they apply to v0.3.0 as-is.

## What `research-thread` is for

A loose-shaped intent kind for research artifacts that already exist in the user's workspace as filesystem directories — a folder of markdown briefs, run dirs, paper drafts, reconciliation notes — and that the user wants to *navigate and understand*, not shape or execute. The substrate's role is **read + project**, not declare + write.

Three commitments distinguish this kind from the others:

1. **No shaper.** Research-threads are not created through the substrate. They exist out there; Integral discovers and reflects them. The Shaping surface is irrelevant to this kind.
2. **No writeback.** The substrate doesn't author or modify content inside a thread's directory. The directory is the user's workspace; Integral is a window onto it.
3. **No pre-defined inner structure.** A thread might have `README.md` + `runs/iter-N/`, or just `notes.md` + `data/`, or anything in between. The schema doesn't require a brief, paper, iteration count, or any other artifact. The projection plugin reads what's there at navigation time and produces meaning.

This kind covers the case where structure-of-the-research is implicit in the markdown narrative — the schema doesn't try to make it explicit. Future kinds (`paper-campaign` returning, possibly an `experiment-batch` kind) will model more structured workflows; `research-thread` is the loose-shaped escape hatch.

## ResearchThreadExtension

```yaml
ResearchThreadExtension:
  kind:           "research-thread"
  root_anchor:    ExternalAnchor   // filesystem-path; points at the directory
```

That's the entire extension. No iter list, no paper anchor, no required brief. The chrome composes a Detail surface from the projection (LLM reads the directory's markdown + lists subdirs) plus the standard parts (header, evidence edges, knowledge refs — usually empty for this kind).

`decomposition.children` is always `[]` — research-threads are leaf-shaped intents in the workspace tree. They can still participate in `EvidenceLink`s as the `to_intent` (e.g., a future paper-campaign claim could `derived-from` a research-thread).

## Adapter contract

The reference adapter (`FilesystemResearchThreadSource` + `buildResearchThreadWorkspace`) follows the transport/interpreter split established in v0.1:

- **Transport.** A `ResearchThreadSource` enumerates immediate subdirectories of a parent path. Each subdirectory becomes one descriptor: `{ name, rootPath, lastModified }`.
- **Interpreter.** Pure transformation: each descriptor becomes one `research-thread` Intent + one `IntentState` (status: `'active'`; `last_advanced_at` from the directory mtime so newly-touched threads sort to the top).
- **Discovery.** Configured as a source in `integral.config.json` with `kind: 'research-thread'`. The `path` field is the *parent* directory; each subdir is one thread. Default fallback (no config file): `~/Documents/Projects/research-threads/` — analogous to the Nous default.
- **Holder attribution.** Synthesized as `{id: 'unknown-human', display_name: '(unknown)'}`. Mirrors `gaps.md` G-N-13 — the directory has no holder metadata, and the substrate must not silently mis-attribute.

## Concrete example

```yaml
intent:
  id: "research-thread:research-threads:ea-control-stack"
  schema_version: "0.3.0"
  kind: research-thread
  declaration:
    title: "ea-control-stack"
    summary: ""
    success_criterion: ""
  holder:
    mode: human-held
    parties: [{id: "unknown-human", kind: human, display_name: "(unknown)"}]
  lifetime:
    kind: standing
    started_at: "2026-05-25T09:00:00Z"
  decomposition:
    children: []
  provenance:
    declared_by: {id: "unknown-human", kind: human, display_name: "(unknown)"}
    declared_at: "2026-05-25T09:00:00Z"
    motivated_by: []
    source: "research-threads"
  knowledge_refs: []
  tags: []
  state_ref: "research-thread:research-threads:ea-control-stack-STATE"
  extension:
    kind: research-thread
    root_anchor:
      kind: filesystem-path
      uri: "file:///Users/sri/Documents/Projects/research-threads/ea-control-stack"
      read_only: true
```

## Non-goals for v0.3.0 (deferred)

The 21 non-goals from `intent-schema-v0.1.md` and `intent-schema-v0.2.md` carry forward. v0.3.0 adds:

22. **Typed children inside a research-thread.** Iter-N subdirs, paper sections, run artifacts — none get promoted to typed Intents in v0.3.0. The thread is a leaf; the projection layer surfaces structure as prose, not as navigable typed objects. If a thread needs a navigable iteration list, that promotes to a future schema bump.

23. **Holder + provenance discovery from thread content.** The adapter could read a `.integral.yaml` sentinel or extract `--- holder: sri ---` frontmatter from README.md to attribute the thread. v0.3.0 ships with `unknown-human` placeholder; configurable holder is a future bump.

24. **Cross-thread `EvidenceLink` rendering.** `EvidenceLink` from a thread to an external Nous iteration / Coral attempt is structurally allowed (thread can be a `from_intent` or `to_intent`), but no UI surfaces it explicitly today. Bringing this back happens when paper-campaign returns and "claims grounded in this iteration" becomes a load-bearing flow.

25. **Modifying thread content from the substrate.** Read-only by commitment. If/when this changes (e.g., a user wants to annotate a thread from Integral's chrome), it will require a new typed `ResearchThreadAnnotation` shape and a writeback handler — substantial new surface area.

## Candidate later additions

If v0.3.0 survives contact with real research-thread navigation, the most likely next additions:

1. **Cross-kind `EvidenceLink` UI.** Render a thread's "this finding rests on iter-3 of nous-campaign-X" as a clickable chip, mirroring how the existing chrome surfaces Nous → Coral edges.
2. **Holder discovery.** A small sentinel file (`.integral.yaml`) or markdown frontmatter extracted at adapter read time — replacing `unknown-human` with the real declared holder.
3. **Navigable inner structure.** Optionally promote `runs/iter-N/` (or analogous) to typed child Intents (`research-iteration`?) when a thread opts in via sentinel. Keeps the loose default while letting structured threads get more chrome.
4. **Paper-campaign return.** Independently of research-thread; a paper-campaign intent could `derived-from` one or more research-threads via `EvidenceLink`. Composes cleanly with the current shape.

## Open questions for v0.3.0 review

- Is one `'research-thread'` kind enough, or will real-world threads pressure us to split into "research-thread" (loose) + something more structured (e.g., `study-batch`) once the chrome lands? v0.3.0 commits to the loose-only shape; the answer comes from use.
- Should `external_anchors` on `IntentState` reflect richer thread structure (one anchor per significant subdir / file) instead of just the root? v0.3.0 emits one root anchor; v0.4 may expand.
- Is the projection plugin's selection heuristic (README → brief → PAPER → reconciliation → notes → alphabetical fill) the right ranking? Real threads will adjust.

---

## Projection contract addendum (v0.3.x amendment, 2026-05-29)

The projection layer ships a typed-evidence + spec/execution pipeline shared by
every projection-bearing kind (today: `nous-campaign`, `nous-iteration`,
`research-thread`; future kinds slot in by writing one parser pack). This is an
*internal* contract — `Intent` and `IntentState` shapes are unchanged, so this
amendment does **not** bump the schema_version. It does change the on-the-wire
shape of `/api/projection`, and it changes the disk cache namespace from
`~/.cache/integral/projections/` to `~/.cache/integral/projections-v2/`.

### Pipeline

```
adapter source files
  → ParserPack (deterministic; mdast / yaml / json / csv parsers; no LLM, no inference)
  → TypedEvidence { datasets, excerpts, files_seen, fingerprint }
  → LLMComposer (sees schemas + ≤6-row samples + excerpt index — never bulk numerics)
  → ProjectionSpec { figures: PlotSpec[], scalars: ScalarRequest[], prose_template }
  → SpecExecutor (deterministic; runs Plot transforms + scalar reducers over TypedEvidence)
  → ExecutedProjection { figures: PreparedFigure[], quoted_numerics, prose, cite_index }
  → Lint (rejects any digit in prose not in quoted_numerics; falls back on rejection)
  → cache write
```

### Zero-hallucination invariant

The LLM is an **analyst**, never a calculator. It declares which aggregations,
groupings, bins, windows, and named scalars it wants — the deterministic
executor computes them against typed evidence, then substitutes them into the
prose template. The lint enforces by regex that every digit in the rendered
prose appears verbatim in `quoted_numerics`. If any does not, the projection
falls back to a deterministic raw-fields render — never to the LLM's prose
verbatim.

This means:
- "best score climbed from 0.12 to 0.55" — fine; both digits are computed
  scalars (`first_score`, `best_score`) substituted from `{scalar:...}` placeholders.
- "iteration 3 was the breakthrough" — the literal `3` must be a scalar
  (`{scalar:best_iter}`); the LLM cannot hardcode it.
- "the campaign began in 2026" — the literal `2026` must be requested as a
  `const_string` scalar with provenance, otherwise the lint rejects.

### Token economy

Projections cache on disk keyed by `(intent_id, zoom, state.last_advanced_at)`.
The cache survives dev-server restarts; only an explicit `?refresh=true`
(triggered by the regenerate button) or a real change to underlying state
causes a fresh LLM call. The composer prompt includes dataset *schemas* +
≤6-row samples + ≤120-char excerpt previews — never bulk row data.

### Adding a new projection-bearing kind

A new kind opts into the pipeline by:
1. Writing a parser pack at `integral-ui/vite-plugin-nous-adapter/parser-packs/<kind>.ts`
   that produces `TypedEvidence` from the adapter's source data.
2. Writing a thin plugin at `integral-ui/vite-plugin-nous-adapter/projection-plugins-v2/<kind>.ts`
   that exports a `KindProjectionPlugin` with `evidence(ctx)` and
   `intentSummary(ctx)`. ~30 lines.
3. Registering the plugin in `projection-plugins-v2/index.ts`.

The composer's narrative-arc instructions are kind-aware
(`integral-ui/src/lib/projection/composer.ts § narrativeArcInstruction`); add a
per-kind branch there to nudge the LLM toward the most informative story for
that kind.

No schema bump is required to add a new parser pack or plugin — the contract
is internal.
