/* surface-detail.jsx — the Intent Detail Pane.
   Three regions:
     1. Header (uniform chrome) — title, holder, success criterion, anchors
     2. Structural body (per-kind specialization happens here)
     3. Right strip — activity scoped to this intent
*/

function DetailSurface({ tree, zoom, setZoom, onOpen, onBack, onShape, focusEventId }) {
  // Scroll target for activity-event spatial continuity.
  const targetRef = React.useRef(null);
  React.useEffect(() => {
    if (focusEventId && targetRef.current) {
      targetRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [focusEventId]);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 320px", height: "100%" }}>
      {/* Main column */}
      <div style={{ overflow: "auto", borderRight: "1px solid var(--line)" }}>
        <DetailHeader tree={tree} zoom={zoom} setZoom={setZoom} onBack={onBack} />
        <div style={{ padding: "0 28px 60px" }}>
          <DetailBody tree={tree} zoom={zoom} onOpen={onOpen} focusEventId={focusEventId} targetRef={targetRef} />
        </div>
      </div>
      {/* Per-intent activity */}
      <IntentActivityStrip tree={tree} onOpen={onOpen} onShape={onShape} />
    </div>
  );
}

// ─── DetailHeader ────────────────────────────────────────────────────────
function DetailHeader({ tree, zoom, setZoom, onBack }) {
  return (
    <div style={{ padding: "20px 28px 18px", borderBottom: "1px solid var(--line)", background: "var(--paper)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <button onClick={onBack} style={{
          fontFamily: "var(--mono)", fontSize: 11.5, color: "var(--mute)",
          padding: "3px 7px", border: "1px solid var(--line)", borderRadius: 3,
          background: "var(--paper-2)",
        }}>← map</button>
        <span style={{ fontFamily: "var(--mono)", fontSize: 11.5, color: "var(--mute)" }}>
          workspace ▸ {tree.kind_label} ▸ <span style={{ color: "var(--ink-2)" }}>{tree.declaration.title}</span>
        </span>
        <span style={{ marginLeft: "auto", display: "flex", gap: 4, alignItems: "center" }}>
          <ZoomToggle zoom={zoom} setZoom={setZoom} />
        </span>
      </div>

      <div style={{ display: "flex", alignItems: "flex-start", gap: 16, marginTop: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <KindBadge kind={tree.kind} label={tree.kind_label} />
            <Chip status={tree.status} mono>{tree.status}</Chip>
            <Chip mono tone="mute">{HOLDER_GLYPHS[tree.holder.mode]}</Chip>
            <Chip mono tone="mute">{tree.lifetime.kind}</Chip>
            <IdPill short={tree.short_id} id={tree.id} />
          </div>
          <h1 className="serif" style={{ margin: "4px 0 8px", fontSize: 30, lineHeight: 1.15, fontWeight: 500, letterSpacing: -0.4, color: "var(--ink)" }}>
            {tree.declaration.title}
          </h1>
          <div style={{ fontSize: 14, lineHeight: 1.55, color: "var(--ink-2)", maxWidth: 720 }}>
            {tree.declaration.summary}
          </div>
        </div>
      </div>

      {/* Holder + success criterion + last advanced — uniform across kinds */}
      <div style={{
        marginTop: 16, paddingTop: 14, borderTop: "1px dashed var(--line)",
        display: "grid", gridTemplateColumns: "max-content 1fr max-content 1fr", columnGap: 18, rowGap: 8,
        fontSize: 12.5,
      }}>
        <MetaKey>holder</MetaKey>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {tree.holder.parties.map((p) => <PartyChip key={p.id} party={p} />)}
        </div>
        <MetaKey>last advanced</MetaKey>
        <div style={{ fontFamily: "var(--mono)", fontSize: 12.5, color: "var(--ink-2)" }}>
          {relTime(tree.last_advanced.at)} <span style={{ color: "var(--mute)" }}>by</span> {tree.last_advanced.by.display}
        </div>

        <MetaKey>success</MetaKey>
        <div style={{ color: "var(--ink-2)" }}>{tree.declaration.success}</div>
        <MetaKey>tags</MetaKey>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {tree.tags?.map((t) => <Tag key={t}>{t}</Tag>)}
        </div>

        {tree.kind === "nous-campaign" && tree.declaration.research_question && (
          <>
            <MetaKey>question</MetaKey>
            <div style={{ color: "var(--ink-2)", gridColumn: "2 / span 3", fontStyle: "italic" }}>
              "{tree.declaration.research_question}"
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function MetaKey({ children }) {
  return <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--mute)", textTransform: "uppercase", letterSpacing: 0.06, paddingTop: 2 }}>{children}</div>;
}

// ─── ZoomToggle ──────────────────────────────────────────────────────────
function ZoomToggle({ zoom, setZoom }) {
  const opts = ["overview", "structure", "detail"];
  return (
    <div style={{
      display: "inline-flex", border: "1px solid var(--line)", borderRadius: 3, overflow: "hidden",
      background: "var(--paper-2)",
    }}>
      {opts.map((o) => (
        <button key={o} onClick={() => setZoom(o)} style={{
          fontFamily: "var(--mono)", fontSize: 11.5,
          padding: "4px 10px",
          background: zoom === o ? "var(--paper)" : "transparent",
          color: zoom === o ? "var(--ink)" : "var(--mute)",
          borderRight: o !== "detail" ? "1px solid var(--line)" : "none",
          fontWeight: zoom === o ? 600 : 400,
        }}>{o}</button>
      ))}
    </div>
  );
}

// ─── DetailBody — main per-kind region. ──────────────────────────────────
function DetailBody({ tree, zoom, onOpen, focusEventId, targetRef }) {
  return (
    <div style={{ paddingTop: 22 }}>
      {/* Structure: children list (kind-specialized) */}
      <ChildrenSection tree={tree} zoom={zoom} onOpen={onOpen} focusEventId={focusEventId} targetRef={targetRef} />

      {/* Evidence edges */}
      <EvidenceSection tree={tree} onOpen={onOpen} />

      {/* Knowledge */}
      <KnowledgeSection tree={tree} />

      {/* Standing invariants — only on feature campaign */}
      {tree.kind === "feature-campaign" && <InvariantsSection tree={tree} />}
    </div>
  );
}

// ─── ChildrenSection — branches by kind. ─────────────────────────────────
function ChildrenSection({ tree, zoom, onOpen, focusEventId, targetRef }) {
  return (
    <section style={{ marginBottom: 32 }}>
      <SectionLabel right={`${tree.children.length} child intent${tree.children.length === 1 ? "" : "s"}`}>
        {tree.kind === "coral-optimization" ? "population" : "children"}
      </SectionLabel>

      {tree.kind === "nous-campaign"      && <NousChildren tree={tree} onOpen={onOpen} focusEventId={focusEventId} targetRef={targetRef} />}
      {tree.kind === "coral-optimization" && <CoralPopulation tree={tree} onOpen={onOpen} />}
      {tree.kind === "paper-campaign"     && <PaperSections tree={tree} onOpen={onOpen} />}
      {tree.kind === "feature-campaign"   && <FeaturePRs tree={tree} onOpen={onOpen} />}
    </section>
  );
}

// ─── Nous children ───────────────────────────────────────────────────────
function NousChildren({ tree, onOpen, focusEventId, targetRef }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 1, border: "1px solid var(--line)", borderRadius: 4, overflow: "hidden", background: "var(--paper-2)" }}>
      {tree.children.map((c) => {
        const isProposed = c.status === "proposed";
        const isActive   = c.status === "active";
        const focused    = focusEventId && (c.id === focusEventId || (c.short_id === "iter-2" && focusEventId === "01HXYZ-NOUS-ITER-002"));
        return (
          <div
            key={c.id}
            ref={focused ? targetRef : null}
            onClick={() => !isProposed && onOpen(c.id)}
            style={{
              padding: "12px 16px",
              background: focused ? "var(--amber-soft)" : "var(--paper)",
              cursor: isProposed ? "default" : "pointer",
              transition: "background 140ms ease",
              borderLeft: isProposed ? "3px solid var(--amber)" : "3px solid transparent",
            }}
            onMouseEnter={(e) => { if (!focused && !isProposed) e.currentTarget.style.background = "var(--paper-2)"; }}
            onMouseLeave={(e) => { if (!focused) e.currentTarget.style.background = isProposed ? "var(--paper)" : "var(--paper)"; }}
          >
            {/* Top row: status / id / title / time-or-actions */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, flex: "1 1 360px" }}>
                <StatusDot status={c.status} presence={!!c.presence} />
                <IdPill short={c.short_id} id={c.id} />
                <span style={{ fontSize: 13.5, color: "var(--ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.title}</span>
              </div>

              {/* right cluster: either time, or proposal actions */}
              {isProposed ? (
                <div style={{ display: "flex", alignItems: "center", gap: 6, flex: "none" }}>
                  <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--mute)" }}>
                    ✎ proposed · {relTime(c.proposed_at)}
                  </span>
                  <button style={btnPrimary}>accept</button>
                  <button style={btnGhost}>refine</button>
                </div>
              ) : (
                <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--mute)", flex: "none" }}>
                  {relTime(c.last_advanced.at)}
                </span>
              )}
            </div>

            {/* Sub-row: structural badges (skipped on proposed since no real data) */}
            {!isProposed && (
              <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 10, fontFamily: "var(--mono)", fontSize: 11.5, color: "var(--mute)", flexWrap: "wrap" }}>
                {c.extension?.bundle && <HypothesisBars bundle={c.extension.bundle} />}
                {isActive && c.gate && <Chip tone="amber" mono dot>gate · {c.gate}</Chip>}
                {c.presence && (
                  <Chip tone="blue" mono pulse>{c.presence.party.display} · {c.presence.note}</Chip>
                )}
                {c.extension?.principles_emitted > 0 && (
                  <span>+{c.extension.principles_emitted} principle{c.extension.principles_emitted > 1 ? "s" : ""}</span>
                )}
              </div>
            )}

            {isProposed && (
              <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px dashed var(--line)", fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.5 }}>
                <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--mute)" }}>proposed by {c.proposed_by.display}:</span>{" "}
                {c.proposal_note}
                <div style={{ marginTop: 6, fontFamily: "var(--mono)", fontSize: 11, color: "var(--mute)" }}>
                  bundle skeleton · {c.extension.bundle.total} hypotheses (all pending)
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Coral population ────────────────────────────────────────────────────
function CoralPopulation({ tree, onOpen }) {
  const e = tree.extension;
  const all = e.recent_scores;
  const best = Math.max(...all);
  return (
    <div>
      {/* Scatter-ish view of scored attempts */}
      <div style={{ border: "1px solid var(--line)", borderRadius: 4, background: "var(--paper-2)", padding: 16, marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10 }}>
          <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--mute)", textTransform: "uppercase", letterSpacing: 0.06 }}>
            scored attempts · last 24h
          </div>
          <div style={{ fontFamily: "var(--mono)", fontSize: 11.5, color: "var(--mute)" }}>
            n={e.attempts_scored} · best <span style={{ color: "oklch(0.40 0.06 155)" }}>{e.best_score.toFixed(3)}</span> · target 0.90
          </div>
        </div>
        <CoralScatter scores={all} best={best} />
      </div>

      {/* Child attempt rows */}
      <div style={{ display: "flex", flexDirection: "column", gap: 1, border: "1px solid var(--line)", borderRadius: 4, overflow: "hidden" }}>
        {tree.children.map((c) => (
          <button key={c.id} onClick={() => onOpen(c.id)} style={{
            display: "grid", gridTemplateColumns: "auto 1fr auto auto", gap: 14, alignItems: "center",
            padding: "12px 16px",
            background: "var(--paper)", textAlign: "left", cursor: "pointer",
            transition: "background 140ms ease",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "var(--paper-2)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "var(--paper)"; }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <StatusDot status={c.status} presence={!!c.presence} />
              <IdPill short={c.short_id} id={c.id} />
            </div>
            <span style={{ fontSize: 13.5 }}>{c.title}</span>
            <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--mute)", display: "flex", alignItems: "center", gap: 10 }}>
              {c.presence && (
                <Chip tone="blue" mono pulse>{c.presence.note}</Chip>
              )}
              <span>← {c.extension.parent}</span>
            </div>
            <ScoreGauge score={c.extension.score} best={best} />
          </button>
        ))}
      </div>
    </div>
  );
}

function CoralScatter({ scores, best }) {
  const W = 760, H = 120;
  const pad = { l: 30, r: 16, t: 10, b: 18 };
  const yMin = 0.3, yMax = 1.0;
  const n = scores.length;
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: "block" }}>
      {/* axis lines */}
      {[0.3, 0.5, 0.7, 0.9].map((v) => {
        const y = pad.t + ((yMax - v) / (yMax - yMin)) * (H - pad.t - pad.b);
        return (
          <g key={v}>
            <line x1={pad.l} x2={W - pad.r} y1={y} y2={y} stroke="var(--line)" />
            <text x={pad.l - 6} y={y + 3} textAnchor="end" style={{ fontFamily: "var(--mono)", fontSize: 9.5, fill: "var(--mute)" }}>{v.toFixed(1)}</text>
          </g>
        );
      })}
      {/* target line at 0.90 */}
      <line x1={pad.l} x2={W - pad.r}
        y1={pad.t + ((yMax - 0.9) / (yMax - yMin)) * (H - pad.t - pad.b)}
        y2={pad.t + ((yMax - 0.9) / (yMax - yMin)) * (H - pad.t - pad.b)}
        stroke="var(--sage)" strokeDasharray="3 3" />
      <text x={W - pad.r} y={pad.t + ((yMax - 0.9) / (yMax - yMin)) * (H - pad.t - pad.b) - 4}
        textAnchor="end" style={{ fontFamily: "var(--mono)", fontSize: 9.5, fill: "var(--sage)" }}>target 0.90</text>

      {/* points */}
      {scores.map((v, i) => {
        const x = pad.l + (i / Math.max(1, n - 1)) * (W - pad.l - pad.r);
        const y = pad.t + ((yMax - v) / (yMax - yMin)) * (H - pad.t - pad.b);
        const isBest = v === best;
        return (
          <g key={i}>
            <circle cx={x} cy={y} r={isBest ? 4 : 2.5} fill={isBest ? "var(--sage)" : "var(--ink-2)"} opacity={isBest ? 1 : 0.7} />
            {isBest && <text x={x} y={y - 7} textAnchor="middle" style={{ fontFamily: "var(--mono)", fontSize: 9.5, fill: "var(--sage)" }}>best</text>}
          </g>
        );
      })}
    </svg>
  );
}

// ─── Paper sections ─────────────────────────────────────────────────────
function PaperSections({ tree, onOpen }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {tree.children.map((s) => {
        const pct = s.extension.claims_supported / Math.max(1, s.extension.claims);
        return (
          <div key={s.id} style={{
            border: "1px solid var(--line)", borderRadius: 4, padding: "12px 16px", background: "var(--paper-2)",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Chip status={s.extension.section_order >= 5 ? "draft" : "active"} mono>{s.status}</Chip>
              <span className="serif" style={{ fontSize: 16, color: "var(--ink)" }}>{s.title}</span>
              <span style={{ marginLeft: "auto", fontFamily: "var(--mono)", fontSize: 11, color: "var(--mute)" }}>
                {s.extension.claims_supported}/{s.extension.claims} claims supported
              </span>
            </div>
            <div style={{ marginTop: 8, height: 4, background: "var(--paper-3)", borderRadius: 2, overflow: "hidden" }}>
              <div style={{ width: `${pct*100}%`, height: "100%", background: pct === 1 ? "var(--sage)" : pct === 0 ? "var(--mute-2)" : "var(--ink-2)" }} />
            </div>
            {s.extension.featured_claim && (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px dashed var(--line)" }}>
                <div style={{ fontFamily: "var(--mono)", fontSize: 10.5, color: "var(--mute)", textTransform: "uppercase", letterSpacing: 0.06, marginBottom: 4 }}>
                  featured claim · {s.extension.featured_claim.id}
                </div>
                <div className="serif" style={{ fontSize: 14, lineHeight: 1.45, color: "var(--ink-2)", fontStyle: "italic" }}>
                  "{s.extension.featured_claim.text}"
                </div>
                <div style={{ marginTop: 6, display: "flex", gap: 6 }}>
                  <Chip tone="sage" mono>derived-from iter-2 · strong</Chip>
                  <Chip tone="sage" mono soft>replicates attempt-031 · moderate</Chip>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Feature PRs ────────────────────────────────────────────────────────
function FeaturePRs({ tree, onOpen }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 1, border: "1px solid var(--line)", borderRadius: 4, overflow: "hidden" }}>
      {tree.children.map((c) => {
        const ci  = CI_COLORS[c.extension.ci];
        const rev = REVIEW_COLORS[c.extension.review];
        return (
          <button key={c.id} onClick={() => onOpen(c.id)} style={{
            display: "grid", gridTemplateColumns: "auto 1fr auto auto auto", gap: 14, alignItems: "center",
            padding: "12px 16px", background: "var(--paper)", textAlign: "left", cursor: "pointer", transition: "background 140ms ease",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "var(--paper-2)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "var(--paper)"; }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <StatusDot status="active" />
              <IdPill short={c.short_id} id={c.id} />
            </div>
            <div>
              <div style={{ fontSize: 13.5 }}>{c.title}</div>
              <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--mute)", marginTop: 2 }}>
                {c.extension.diff_summary}
              </div>
            </div>
            <Chip tone={c.extension.ci === "failing" ? "rose" : c.extension.ci === "passing" ? "sage" : "amber"} mono dot={ci.dot}>
              {ci.label}
            </Chip>
            <Chip tone={c.extension.review === "approved" || c.extension.review === "merged" ? "sage" : c.extension.review === "changes-requested" ? "rose" : "amber"} mono dot={rev.dot}>
              {rev.label}
            </Chip>
            <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--mute)" }}>{relTime(c.last_advanced.at)}</span>
          </button>
        );
      })}
    </div>
  );
}

// ─── EvidenceSection ────────────────────────────────────────────────────
function EvidenceSection({ tree, onOpen }) {
  // Outgoing: this tree (or any descendant) is the FROM end of an edge.
  // Incoming: this tree is the TO end.
  const childIds = new Set([tree.id, ...tree.children.map((c) => c.id)]);
  const outgoing = EVIDENCE.filter((e) => childIds.has(e.from));
  const incoming = EVIDENCE.filter((e) => childIds.has(e.to));
  if (!outgoing.length && !incoming.length) return null;

  return (
    <section style={{ marginBottom: 32 }}>
      <SectionLabel right="cross-tree links · click to jump">evidence edges</SectionLabel>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <EdgeColumn title="outgoing →" edges={outgoing} dir="out" onOpen={onOpen} />
        <EdgeColumn title="← incoming" edges={incoming} dir="in" onOpen={onOpen} />
      </div>
    </section>
  );
}

function EdgeColumn({ title, edges, dir, onOpen }) {
  return (
    <div>
      <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--mute)", marginBottom: 6 }}>{title}</div>
      {edges.length === 0
        ? <div style={{ fontFamily: "var(--mono)", fontSize: 11.5, color: "var(--mute-2)", padding: "10px 12px", border: "1px dashed var(--line)", borderRadius: 4 }}>none</div>
        : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {edges.map((e) => {
              const other = dir === "out" ? ALL_INTENTS[e.to] : ALL_INTENTS[e.from];
              return (
                <button key={e.id} onClick={() => other && onOpen(other.tree_id)} style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "10px 12px", border: "1px solid var(--line)", borderRadius: 4,
                  background: "var(--paper-2)", textAlign: "left", cursor: "pointer", transition: "background 140ms ease",
                }}
                onMouseEnter={(ev) => { ev.currentTarget.style.background = "var(--paper-3)"; }}
                onMouseLeave={(ev) => { ev.currentTarget.style.background = "var(--paper-2)"; }}>
                  <KindBadge kind={other?.kind || "nous-campaign"} />
                  <IdPill short={other?.short_id || (dir === "out" ? e.to : e.from)} />
                  <span style={{ fontSize: 12.5, color: "var(--ink-2)", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {other?.title || other?.declaration?.title}
                  </span>
                  <Chip tone={e.strength === "strong" ? "sage" : "mute"} mono>
                    {e.relation} · {e.strength}
                  </Chip>
                </button>
              );
            })}
          </div>
        )
      }
    </div>
  );
}

// ─── KnowledgeSection ───────────────────────────────────────────────────
function KnowledgeSection({ tree }) {
  return (
    <section style={{ marginBottom: 32 }}>
      <SectionLabel right={`${tree.knowledge.length} ref${tree.knowledge.length > 1 ? "s" : ""}`}>knowledge corpus</SectionLabel>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {tree.knowledge.map((k) => (
          <div key={k.uri} style={{
            border: "1px solid var(--line)", borderRadius: 4, padding: "10px 14px",
            background: "var(--paper-2)",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <Chip mono tone="mute">scope · {k.scope}</Chip>
              <Chip mono tone="mute">role · {k.role}</Chip>
            </div>
            <div style={{ fontFamily: "var(--mono)", fontSize: 11.5, color: "var(--ink-2)" }}>{k.uri}</div>
            <div style={{ fontSize: 12, color: "var(--mute)", marginTop: 2 }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* Nous: principles preview */}
      {tree.kind === "nous-campaign" && tree.extension.principles_preview && (
        <div style={{ marginTop: 14, border: "1px solid var(--line)", borderRadius: 4, padding: 14, background: "var(--paper-2)" }}>
          <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--mute)", marginBottom: 8 }}>
            principles ledger preview · {tree.extension.principles_count} entries total
          </div>
          {tree.extension.principles_preview.map((p, i) => (
            <div key={i} className="serif" style={{ fontSize: 13.5, lineHeight: 1.5, color: "var(--ink-2)", padding: "5px 0", borderBottom: i < 2 ? "1px dashed var(--line)" : "none" }}>
              <span style={{ fontFamily: "var(--mono)", color: "var(--mute)" }}>p{i+1}.</span> {p}
            </div>
          ))}
          <div style={{ marginTop: 8, fontFamily: "var(--mono)", fontSize: 11, color: "var(--mute)" }}>
            + 9 more · written-back via <span style={{ color: "var(--ink-2)" }}>nous validate</span>
          </div>
        </div>
      )}
    </section>
  );
}

// ─── Invariants (feature only) ──────────────────────────────────────────
function InvariantsSection({ tree }) {
  // Placeholder list — invariants land as a first-class kind in v0.2 per the
  // schema doc, but the campaign references them via `standing_invariants`.
  const items = [
    { name: "ci must remain green",         status: "violating",  detail: "PR #1247 failing projection_cache_test" },
    { name: "lint conventions (CLAUDE.md)", status: "upheld" },
    { name: "schema_version must match",    status: "upheld" },
  ];
  return (
    <section style={{ marginBottom: 32 }}>
      <SectionLabel right="standing · v0.2 will promote these to first-class kind">invariants</SectionLabel>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {items.map((i) => (
          <Chip key={i.name} tone={i.status === "violating" ? "rose" : "sage"} mono dot>
            {i.name}{i.detail && <span style={{ marginLeft: 6, color: "oklch(0.55 0.06 25)" }}>· {i.detail}</span>}
          </Chip>
        ))}
      </div>
    </section>
  );
}

// ─── IntentActivityStrip — events scoped to this intent or its descendants
function IntentActivityStrip({ tree, onOpen, onShape }) {
  const childIds = new Set([tree.id, ...tree.children.map((c) => c.id)]);
  const events = EVENTS
    .filter((e) => childIds.has(e.intent_id) || e.parent_tree === tree.id)
    .sort((a, b) => new Date(b.at) - new Date(a.at));
  const notable = events.filter((e) => e.sig === "notable" || e.sig === "critical");
  const routine = events.filter((e) => e.sig === "routine");
  const proposal = events.find((e) => e.actionable?.kind === "proposal");

  return (
    <aside style={{ background: "var(--paper-2)", padding: "20px 18px 28px", overflow: "auto" }}>
      <SectionLabel right="this intent">activity</SectionLabel>

      {/* Pinned proposal */}
      {proposal && (
        <div style={{
          background: "var(--amber-soft)", border: "1px solid oklch(0.86 0.08 75)", borderRadius: 4,
          padding: "12px 14px", marginBottom: 16,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <span style={{ ...atomStyles.dotBase, width: 6, height: 6, background: "var(--amber)" }} />
            <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "oklch(0.42 0.11 65)", textTransform: "uppercase", letterSpacing: 0.06 }}>
              awaiting you
            </span>
            <span style={{ marginLeft: "auto", fontFamily: "var(--mono)", fontSize: 11, color: "var(--mute)" }}>{relTime(proposal.at)}</span>
          </div>
          <div style={{ fontSize: 13, color: "var(--ink)", marginBottom: 6 }}>
            <PartyChip party={proposal.by} dim /> · <span style={{ fontFamily: "var(--mono)" }}>{proposal.type}</span>
          </div>
          <div className="serif" style={{ fontSize: 14, color: "var(--ink-2)", marginBottom: 10 }}>
            {proposal.summary}
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button style={btnPrimary}>accept</button>
            <button style={btnGhost}>refine</button>
            <button style={btnGhost}>reject</button>
          </div>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {notable.filter((e) => !e.actionable).map((e) => (
          <EventRow key={e.id} ev={e} onOpen={onOpen} />
        ))}
      </div>

      <div style={{ marginTop: 18 }}>
        <button style={{
          fontFamily: "var(--mono)", fontSize: 11, color: "var(--mute)",
          padding: "4px 0", display: "flex", alignItems: "center", gap: 6,
        }}>
          <span>▸</span>
          routine ({routine.length})
        </button>
      </div>

      <div style={{ marginTop: 24, paddingTop: 18, borderTop: "1px dashed var(--line)" }}>
        <SectionLabel>filters</SectionLabel>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ fontFamily: "var(--mono)", fontSize: 11.5, color: "var(--mute)" }}>significance: <span style={{ color: "var(--ink-2)" }}>notable+</span></div>
          <div style={{ fontFamily: "var(--mono)", fontSize: 11.5, color: "var(--mute)" }}>since: <span style={{ color: "var(--ink-2)" }}>last visit</span></div>
        </div>
      </div>
    </aside>
  );
}

function EventRow({ ev, onOpen }) {
  const sig = SIG_COLORS[ev.sig];
  const target = ALL_INTENTS[ev.intent_id];
  return (
    <button
      onClick={() => target && onOpen(target.tree_id, ev.intent_id)}
      style={{
        display: "block", width: "100%", textAlign: "left",
        background: "transparent", padding: 0, cursor: "pointer",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 3 }}>
        <span style={{ ...atomStyles.dotBase, width: 6, height: 6, background: sig.dot, marginRight: 2 }} />
        <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--mute)" }}>{relTime(ev.at)}</span>
        <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--ink-2)" }}>{ev.by.display}</span>
      </div>
      <div style={{ fontFamily: "var(--mono)", fontSize: 11.5, color: "var(--ink)", marginBottom: 2 }}>
        {ev.type}
      </div>
      <div style={{ fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.45 }}>
        {ev.summary}
      </div>
    </button>
  );
}

const btnPrimary = {
  fontFamily: "var(--mono)", fontSize: 11.5, fontWeight: 600,
  padding: "4px 10px", borderRadius: 3,
  background: "var(--ink)", color: "var(--paper)",
  border: "1px solid var(--ink)",
  cursor: "pointer",
};
const btnGhost = {
  fontFamily: "var(--mono)", fontSize: 11.5,
  padding: "4px 10px", borderRadius: 3,
  background: "var(--paper)", color: "var(--ink-2)",
  border: "1px solid var(--line)",
  cursor: "pointer",
};

Object.assign(window, { DetailSurface, btnPrimary, btnGhost });
