/* surface-map.jsx — the Intent Map. Default landing view.
   - Active trees as cards, grouped by kind label.
   - Figures conditional on per-kind data threshold.
   - Cross-tree EvidenceLink edges as thin SVG paths between cards.
   - Backgrounded trees collapsed below.
*/

function MapSurface({ onOpen, onShape, highlightId }) {
  const containerRef = React.useRef(null);
  const cardRefs = React.useRef({}); // tree.id -> DOM node
  const [edges, setEdges] = React.useState([]);

  // Recalculate cross-tree edge paths after layout settles + on resize.
  React.useLayoutEffect(() => {
    function compute() {
      if (!containerRef.current) return;
      const containerRect = containerRef.current.getBoundingClientRect();
      // Compute rectangle intersection of the line center→target with the rect edge.
      function edgePoint(rect, tx, ty) {
        const cx = rect.left + rect.width / 2 - containerRect.left;
        const cy = rect.top  + rect.height / 2 - containerRect.top;
        const dx = tx - cx, dy = ty - cy;
        if (dx === 0 && dy === 0) return { x: cx, y: cy };
        const sx = dx === 0 ? Infinity : (rect.width  / 2) / Math.abs(dx);
        const sy = dy === 0 ? Infinity : (rect.height / 2) / Math.abs(dy);
        const s  = Math.min(sx, sy);
        return { x: cx + dx * s, y: cy + dy * s };
      }
      const out = [];
      for (const e of EVIDENCE) {
        const fromTree = ALL_INTENTS[e.from]?.tree_id;
        const toTree   = ALL_INTENTS[e.to]?.tree_id;
        if (!fromTree || !toTree || fromTree === toTree) continue;
        const a = cardRefs.current[fromTree];
        const b = cardRefs.current[toTree];
        if (!a || !b) continue;
        const ar = a.getBoundingClientRect();
        const br = b.getBoundingClientRect();
        const acx = ar.left + ar.width / 2 - containerRect.left;
        const acy = ar.top  + ar.height / 2 - containerRect.top;
        const bcx = br.left + br.width / 2 - containerRect.left;
        const bcy = br.top  + br.height / 2 - containerRect.top;
        const A = edgePoint(ar, bcx, bcy);
        const B = edgePoint(br, acx, acy);
        out.push({ id: e.id, relation: e.relation, strength: e.strength, ax: A.x, ay: A.y, bx: B.x, by: B.y, fromTree, toTree });
      }
      setEdges(out);
    }
    compute();
    const ro = new ResizeObserver(compute);
    if (containerRef.current) ro.observe(containerRef.current);
    window.addEventListener("resize", compute);
    return () => { ro.disconnect(); window.removeEventListener("resize", compute); };
  }, []);

  return (
    <div style={{ padding: "20px 28px 80px", minHeight: "100%" }}>
      {/* Top meta row — significance dial + filters */}
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 18 }}>
        <div>
          <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--mute)", textTransform: "uppercase", letterSpacing: 0.08 }}>
            active trees · zoom = overview
          </div>
          <div style={{ fontSize: 22, fontWeight: 500, marginTop: 2, letterSpacing: -0.2 }}>
            4 active · 1 awaiting you · 2 agents working
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <FilterChip label="awaiting me" count={1} active />
          <FilterChip label="all kinds" />
          <FilterChip label="last 24h" />
          <span style={{ marginLeft: 8, fontFamily: "var(--mono)", fontSize: 11, color: "var(--mute)" }}>
            significance: <span style={{ color: "var(--ink-2)" }}>notable+</span>
          </span>
        </div>
      </div>

      <div ref={containerRef} style={{ position: "relative" }}>
        <div style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 20,
          position: "relative",
          zIndex: 1,
        }}>
          {TREE_LIST.map((tree) => (
            <div
              key={tree.id}
              ref={(el) => { cardRefs.current[tree.id] = el; }}
            >
              <TreeCard tree={tree} highlight={highlightId === tree.id} onOpen={onOpen} />
            </div>
          ))}
        </div>

        {/* Evidence edges SVG overlay — above cards, pointer-events none.
            Lines are anchored at card edges so they sit in the gutters. */}
        <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", overflow: "visible", zIndex: 2 }}>
          <defs>
            <marker id="edge-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 1 L 9 5 L 0 9 Z" fill="var(--mute)" />
            </marker>
          </defs>
          {edges.map((e, i) => {
            const dx = e.bx - e.ax, dy = e.by - e.ay;
            const mx = (e.ax + e.bx) / 2;
            const my = (e.ay + e.by) / 2;
            const d = `M ${e.ax} ${e.ay} L ${e.bx} ${e.by}`;
            const dim = highlightId && highlightId !== e.fromTree && highlightId !== e.toTree;
            // Distribute labels along the line to avoid overlap.
            const labelOffset = (i - (edges.length - 1) / 2) * 22;
            const len = Math.hypot(dx, dy) || 1;
            const lx = mx + (-dy / len) * labelOffset;
            const ly = my + ( dx / len) * labelOffset;
            return (
              <g key={e.id} opacity={dim ? 0.15 : 0.7}>
                <path d={d} fill="none" stroke="var(--mute)" strokeWidth="1" strokeDasharray={e.strength === "moderate" ? "5 4" : "0"} markerEnd="url(#edge-arrow)" />
                <g transform={`translate(${lx} ${ly})`}>
                  <rect x="-44" y="-8" width="88" height="14" rx="3" fill="var(--paper)" stroke="var(--line)" />
                  <text x="0" y="1" textAnchor="middle" dominantBaseline="middle" style={{ fontFamily: "var(--mono)", fontSize: 9.5, fill: "var(--ink-2)" }}>
                    {e.relation} · {e.strength}
                  </text>
                </g>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Shaping drafts row */}
      <div style={{ marginTop: 28 }}>
        <SectionLabel right={`${1} draft · click to resume`}>shaping · drafts</SectionLabel>
        <button
          onClick={() => onShape && onShape(SHAPING_DRAFT.id)}
          style={{
            display: "block", width: "100%", textAlign: "left",
            border: "1px dashed var(--line)", borderRadius: 4,
            padding: "12px 16px", background: "transparent", cursor: "pointer",
            transition: "background 120ms ease, border-color 120ms ease",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "var(--paper-2)"; e.currentTarget.style.borderColor = "var(--mute-2)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent";    e.currentTarget.style.borderColor = "var(--line)"; }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <KindBadge kind={SHAPING_DRAFT.kind_tentative} />
            <Chip status="draft" mono>draft · shaping</Chip>
            <IdPill short={SHAPING_DRAFT.short_id} id={SHAPING_DRAFT.id} />
            <span style={{ marginLeft: "auto", fontFamily: "var(--mono)", fontSize: 11.5, color: "var(--mute)" }}>
              3 / 6 questions resolved · {relTime(SHAPING_DRAFT.dialog[SHAPING_DRAFT.dialog.length - 1].at)}
            </span>
          </div>
          <div className="serif" style={{ fontSize: 16, lineHeight: 1.35, color: "var(--ink)" }}>
            {SHAPING_DRAFT.declaration.title}
          </div>
          <div style={{ fontSize: 12.5, color: "var(--mute)", marginTop: 4 }}>
            {SHAPING_DRAFT.declaration.summary.value}
          </div>
        </button>
      </div>

      {/* Backgrounded */}
      <div style={{ marginTop: 28 }}>
        <SectionLabel right="show critical only">backgrounded · 4</SectionLabel>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {BACKGROUNDED.map((b) => (
            <div key={b.id} style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              padding: "6px 10px", border: "1px solid var(--line)", borderRadius: 4,
              background: "var(--paper-2)",
            }}>
              <KindBadge kind={b.kind} />
              <span style={{ fontSize: 12.5, color: "var(--ink-2)" }}>{b.title}</span>
              <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--mute)" }}>{relTime(b.last)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── TreeCard ─────────────────────────────────────────────────────────────
function TreeCard({ tree, highlight, onOpen }) {
  const [hover, setHover] = React.useState(false);
  const fig = figureFor(tree);
  const awaiting = isAwaitingMe(tree);
  const presenceChild = tree.children.find((c) => c.presence);

  return (
    <button
      onClick={() => onOpen(tree.id)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "block", width: "100%", textAlign: "left", cursor: "pointer",
        background: "var(--paper)",
        border: `1px solid ${highlight ? "var(--amber)" : (hover ? "var(--mute-2)" : "var(--line)")}`,
        borderRadius: 4,
        padding: 0,
        boxShadow: hover ? "0 1px 0 var(--line), 0 6px 24px -20px var(--ink)" : "0 1px 0 var(--line)",
        transition: "border-color 140ms ease, box-shadow 160ms ease",
        overflow: "hidden",
      }}
    >
      {/* card header band */}
      <div style={{ padding: "14px 18px 10px", borderBottom: "1px solid var(--line-2)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, rowGap: 6, flexWrap: "wrap" }}>
          <KindBadge kind={tree.kind} label={tree.kind_label} />
          <Chip mono tone="mute">{HOLDER_GLYPHS[tree.holder.mode]}</Chip>
          <Chip mono tone="mute">{tree.lifetime.kind}</Chip>
          {awaiting && (
            <span style={{ marginLeft: "auto" }}>
              <Chip tone="amber" mono dot>awaiting you</Chip>
            </span>
          )}
          {!awaiting && presenceChild && (
            <span style={{ marginLeft: "auto", maxWidth: "100%" }}>
              <Chip tone="blue" mono pulse title={`${presenceChild.presence.party.display} · ${presenceChild.presence.note}`}>
                {presenceChild.presence.party.display} working
              </Chip>
            </span>
          )}
        </div>
      </div>

      {/* declaration */}
      <div style={{ padding: "16px 18px 14px" }}>
        <div className="serif" style={{ fontSize: 22, lineHeight: 1.2, color: "var(--ink)", letterSpacing: -0.2 }}>
          {tree.declaration.title}
        </div>
        <div style={{ fontSize: 13, color: "var(--ink-2)", marginTop: 6, lineHeight: 1.5 }}>
          {tree.declaration.summary}
        </div>

        {/* per-kind structural summary */}
        <div style={{ marginTop: 14 }}>
          <PerKindSummary tree={tree} />
        </div>

        {/* per-kind figure (conditional) */}
        {fig && (
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px dashed var(--line)" }}>
            <PerKindFigure tree={tree} variant={fig} />
          </div>
        )}
      </div>

      {/* footer */}
      <div style={{
        padding: "10px 18px", borderTop: "1px solid var(--line-2)",
        background: "var(--paper-2)",
        display: "flex", alignItems: "center", gap: 14,
        fontFamily: "var(--mono)", fontSize: 11.5, color: "var(--mute)",
      }}>
        <IdPill short={tree.short_id} id={tree.id} />
        <span>last advanced</span>
        <span style={{ color: "var(--ink-2)" }}>{relTime(tree.last_advanced.at)}</span>
        <span>·</span>
        <span>by {tree.last_advanced.by.display}</span>
        <span style={{ marginLeft: "auto" }}>open →</span>
      </div>
    </button>
  );
}

// ─── PerKindSummary — what each kind shows on the map card. ───────────────
function PerKindSummary({ tree }) {
  const row = { display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", fontSize: 12.5 };
  const k   = { fontFamily: "var(--mono)", fontSize: 11, color: "var(--mute)" };

  if (tree.kind === "nous-campaign") {
    const e = tree.extension;
    const proposed = tree.children.find((c) => c.status === "proposed");
    const active   = tree.children.find((c) => c.status === "active");
    return (
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", rowGap: 6, columnGap: 16 }}>
        <div><span style={k}>children</span> <span style={{ fontFamily: "var(--mono)" }}>{tree.children.length}</span> <span style={{ color: "var(--mute)" }}>·</span> <Chip status="active" mono>iter-2 · execute_analyze</Chip></div>
        <div><span style={k}>principles</span> <span style={{ fontFamily: "var(--mono)" }}>{e.principles_count}</span> <span style={{ color: "var(--mute)" }}>·</span> 2 emitted this campaign</div>
        <div style={{ gridColumn: "1 / span 2", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={k}>gate</span>
          <Chip tone="amber" mono dot>execute_analyze · awaiting sri</Chip>
          {proposed && (
            <Chip tone="amber" mono>✎ {proposed.short_id} proposed · 2m ago</Chip>
          )}
        </div>
      </div>
    );
  }

  if (tree.kind === "coral-optimization") {
    const e = tree.extension;
    return (
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", rowGap: 6, columnGap: 16 }}>
        <div><span style={k}>attempts</span> <span style={{ fontFamily: "var(--mono)" }}>{e.attempts_scored}/{e.attempts_total}</span></div>
        <div><span style={k}>best</span> <span style={{ fontFamily: "var(--mono)", color: "oklch(0.40 0.06 155)" }}>{e.best_score.toFixed(3)}</span> <span style={{ color: "var(--mute)" }}>·</span> {e.best_attempt}</div>
        <div><span style={k}>algorithm</span> {e.algorithm} · pop {e.population_size}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={k}>presence</span>
          <Chip tone="blue" mono pulse>coral-w3 evaluating</Chip>
        </div>
      </div>
    );
  }

  if (tree.kind === "paper-campaign") {
    const e = tree.extension;
    const days = Math.round((new Date(e.submission_deadline) - NOW) / 86_400_000);
    return (
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", rowGap: 6, columnGap: 16 }}>
        <div><span style={k}>sections</span> <span style={{ fontFamily: "var(--mono)" }}>{e.sections_drafted}/{e.sections_total} drafted</span></div>
        <div><span style={k}>claims</span> <span style={{ fontFamily: "var(--mono)" }}>{e.claims_supported}/{e.claims_total} supported</span></div>
        <div><span style={k}>venue</span> {e.venue}</div>
        <div><span style={k}>deadline</span> <span style={{ fontFamily: "var(--mono)", color: days <= 7 ? "var(--rose)" : "var(--ink-2)" }}>{days}d</span></div>
        <div style={{ gridColumn: "1 / span 2", display: "flex", alignItems: "center", gap: 8 }}>
          <Chip tone="rose" mono>{e.citations_unresolved} unresolved citations</Chip>
        </div>
      </div>
    );
  }

  if (tree.kind === "feature-campaign") {
    const e = tree.extension;
    return (
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", rowGap: 6, columnGap: 16 }}>
        <div><span style={k}>PRs</span> <span style={{ fontFamily: "var(--mono)" }}>{e.prs_total} · {e.prs_open} open · {e.prs_merged} merged</span></div>
        <div><span style={k}>repo</span> <span style={{ fontFamily: "var(--mono)" }}>{e.repo}</span></div>
        <div style={{ gridColumn: "1 / span 2", display: "flex", alignItems: "center", gap: 8 }}>
          <Chip tone="rose" mono dot>ci failing · 1 PR</Chip>
          <Chip tone="sage" mono dot>2 reviews complete</Chip>
        </div>
      </div>
    );
  }
  return null;
}

// ─── PerKindFigure ──────────────────────────────────────────────────────
function PerKindFigure({ tree, variant }) {
  if (variant === "coral-spark") {
    const e = tree.extension;
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Sparkline values={e.recent_scores} best={Math.max(...e.recent_scores)} width={160} height={32} />
          <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--mute)" }}>
            last 15 attempts · trend ↗
          </div>
        </div>
        <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--mute)", textAlign: "right" }}>
          <div>min {Math.min(...e.recent_scores).toFixed(3)}</div>
          <div style={{ color: "oklch(0.40 0.06 155)" }}>best {Math.max(...e.recent_scores).toFixed(3)}</div>
        </div>
      </div>
    );
  }
  if (variant === "paper-section-bars") {
    const sections = tree.children;
    return (
      <div>
        <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--mute)", marginBottom: 6 }}>
          claims supported per section
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {sections.map((s) => {
            const pct = s.extension.claims_supported / Math.max(1, s.extension.claims);
            return (
              <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: "var(--mono)", fontSize: 11 }}>
                <span style={{ width: 90, color: "var(--mute)" }}>{s.short_id}</span>
                <div style={{ flex: 1, height: 6, background: "var(--paper-3)", borderRadius: 2, overflow: "hidden" }}>
                  <div style={{ width: `${pct * 100}%`, height: "100%", background: pct === 1 ? "var(--sage)" : pct === 0 ? "var(--rose)" : "var(--ink-2)" }} />
                </div>
                <span style={{ width: 46, textAlign: "right", color: "var(--mute)" }}>{s.extension.claims_supported}/{s.extension.claims}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }
  return null;
}

// ─── FilterChip ─────────────────────────────────────────────────────────
function FilterChip({ label, count, active }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      fontFamily: "var(--mono)", fontSize: 11.5,
      padding: "4px 9px", borderRadius: 3,
      background: active ? "var(--amber-soft)" : "var(--paper-2)",
      border: `1px solid ${active ? "oklch(0.86 0.08 75)" : "var(--line)"}`,
      color: active ? "oklch(0.42 0.11 65)" : "var(--ink-2)",
      cursor: "pointer",
    }}>
      {active && <span style={{ width: 5, height: 5, borderRadius: 999, background: "var(--amber)", display: "inline-block" }} />}
      {label}
      {count != null && <span style={{ color: active ? "oklch(0.42 0.11 65)" : "var(--mute)", opacity: 0.7 }}>· {count}</span>}
    </span>
  );
}

// ─── helpers ────────────────────────────────────────────────────────────
function isAwaitingMe(tree) {
  // Nous: jointly-held + open proposal awaiting me.
  if (tree.children.some((c) => c.status === "proposed")) return true;
  // Feature: CI failing on a PR I own.
  if (tree.kind === "feature-campaign" && tree.extension.ci_failing > 0) return false; // it's critical, not "awaiting" specifically
  return false;
}

Object.assign(window, { MapSurface, TreeCard, PerKindSummary, PerKindFigure });
