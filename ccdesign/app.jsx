/* app.jsx — top-level shell + routing.
   Layout:
     +-----------------------------------------------+
     |               TOP BAR                         |
     +------+-----------------------------+----------+
     |      |                             |          |
     | LEFT |       MAIN SURFACE          | WORKSPACE|
     | RAIL |                             | ACTIVITY |
     |      |                             |          |
     +------+-----------------------------+----------+
*/

function App() {
  const [view, setView] = React.useState({ kind: "map", treeId: null, zoom: "structure", focusEventId: null });
  const [activityCollapsed, setActivityCollapsed] = React.useState(false);
  const [highlightTree, setHighlightTree] = React.useState(null);

  // Spatial-continuity hook: clicking an activity event jumps to the affected
  // intent on the relevant surface. Falls back to highlighting the tree card
  // when the user is on the map view.
  const goToEvent = React.useCallback((treeId, intentId) => {
    setHighlightTree(treeId);
    setView((v) => ({ ...v, kind: "detail", treeId, focusEventId: intentId }));
    // clear highlight after the transition settles
    setTimeout(() => setHighlightTree(null), 1500);
  }, []);

  const openTree   = (treeId, focusEventId = null) => setView({ kind: "detail", treeId, zoom: "structure", focusEventId });
  const openShape  = (draftId)  => setView({ kind: "shaping", treeId: null, zoom: "structure" });
  const back       = ()         => setView({ kind: "map", treeId: null, zoom: "structure" });

  const currentTree = view.treeId ? TREES[Object.keys(TREES).find((k) => TREES[k].id === view.treeId)] : null;

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "200px minmax(0, 1fr) " + (activityCollapsed ? "44px" : "320px"),
      gridTemplateRows: "auto minmax(0, 1fr)",
      height: "100vh",
      background: "var(--paper)",
      color: "var(--ink)",
    }}>
      <TopBar workspace={WORKSPACE} view={view} onMap={back} />

      <LeftRail view={view} onMap={back} onShape={() => openShape(SHAPING_DRAFT.id)} />

      <main style={{ overflow: "hidden", minWidth: 0 }}>
        {view.kind === "map" && (
          <MapSurface
            onOpen={openTree}
            onShape={openShape}
            highlightId={highlightTree}
          />
        )}
        {view.kind === "detail" && currentTree && (
          <DetailSurface
            tree={currentTree}
            zoom={view.zoom}
            setZoom={(z) => setView((v) => ({ ...v, zoom: z }))}
            onOpen={(treeId, evId) => openTree(treeId, evId)}
            onBack={back}
            onShape={openShape}
            focusEventId={view.focusEventId}
          />
        )}
        {view.kind === "shaping" && (
          <ShapingSurface
            draft={SHAPING_DRAFT}
            onBack={back}
            onCommit={() => {}}
          />
        )}
      </main>

      <WorkspaceActivity
        collapsed={activityCollapsed}
        onToggle={() => setActivityCollapsed((c) => !c)}
        onEventClick={goToEvent}
      />
    </div>
  );
}

// ─── TopBar ──────────────────────────────────────────────────────────────
function TopBar({ workspace, view, onMap }) {
  return (
    <header style={{
      gridColumn: "1 / -1",
      display: "flex", alignItems: "center", gap: 16,
      padding: "10px 20px",
      borderBottom: "1px solid var(--line)",
      background: "var(--paper)",
    }}>
      <Logo />
      <button onClick={onMap} style={{
        fontFamily: "var(--mono)", fontSize: 12, color: "var(--ink-2)", cursor: "pointer",
      }}>
        workspace · <span style={{ color: "var(--ink)" }}>{workspace.name}</span>
      </button>

      <span style={{ fontFamily: "var(--mono)", fontSize: 11.5, color: "var(--mute-2)" }}>·</span>

      <Breadcrumb view={view} />

      <span style={{ marginLeft: "auto", display: "flex", gap: 10, alignItems: "center" }}>
        <Chip mono tone="mute" dot="var(--sage)">schema v0.1.0</Chip>
        <Chip mono tone="mute">
          reversibility · 24h
        </Chip>
        <PartyChip party={workspace.me} />
      </span>
    </header>
  );
}

function Logo() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <svg width="22" height="22" viewBox="0 0 22 22" style={{ display: "block" }}>
        {/* "Integral" mark — an integral sign treated as a structural object */}
        <path d="M 7 4 C 11.5 4, 11 6.5, 11 11 C 11 15.5, 10.5 18, 15 18"
              fill="none" stroke="var(--ink)" strokeWidth="1.6" strokeLinecap="round" />
        <circle cx="7"  cy="4"  r="1.3" fill="var(--ink)" />
        <circle cx="15" cy="18" r="1.3" fill="var(--ink)" />
        <circle cx="11" cy="11" r="0.9" fill="var(--amber)" />
      </svg>
      <span className="serif" style={{ fontSize: 17, fontWeight: 500, letterSpacing: -0.2 }}>Integral</span>
      <span style={{ fontFamily: "var(--mono)", fontSize: 10.5, color: "var(--mute-2)", padding: "1px 5px", border: "1px solid var(--line)", borderRadius: 3 }}>v0.1</span>
    </div>
  );
}

function Breadcrumb({ view }) {
  if (view.kind === "map") {
    return <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--mute)" }}>map</span>;
  }
  if (view.kind === "shaping") {
    return <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--mute)" }}>shaping ▸ <span style={{ color: "var(--ink-2)" }}>{SHAPING_DRAFT.short_id}</span></span>;
  }
  const tree = ALL_INTENTS[view.treeId];
  if (!tree) return null;
  return (
    <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--mute)" }}>
      detail ▸ {tree.kind_label} ▸ <span style={{ color: "var(--ink-2)" }}>{tree.declaration.title}</span>
    </span>
  );
}

// ─── LeftRail ───────────────────────────────────────────────────────────
function LeftRail({ view, onMap, onShape }) {
  const isMap = view.kind === "map";
  const isShape = view.kind === "shaping";
  return (
    <nav style={{
      borderRight: "1px solid var(--line)",
      padding: "20px 14px",
      background: "var(--paper-2)",
      overflow: "auto",
    }}>
      <SectionLabel>navigate</SectionLabel>
      <RailItem active={isMap} onClick={onMap} label="map" hint="zoom = overview" />
      <RailItem disabled label="forest" hint="planned · v0.2" />
      <RailItem disabled label="provenance" hint="planned · v0.2" />

      <div style={{ marginTop: 18 }}>
        <SectionLabel>queue</SectionLabel>
        <RailItem label="awaiting me" count={1} accent="amber" />
        <RailItem label="my drafts"   count={1} accent="amber-soft" onClick={onShape} active={isShape} />
        <RailItem label="watched"     count={3} />
      </div>

      <div style={{ marginTop: 18 }}>
        <SectionLabel>active trees</SectionLabel>
        {TREE_LIST.map((t) => {
          const isCurrent = view.kind === "detail" && view.treeId === t.id;
          return (
            <button key={t.id} onClick={() => { /* handled by parent via tree card click */ }} style={{
              display: "flex", alignItems: "center", gap: 8,
              width: "100%", padding: "5px 6px", borderRadius: 3,
              textAlign: "left", cursor: "default",
              background: isCurrent ? "var(--paper)" : "transparent",
              border: `1px solid ${isCurrent ? "var(--line)" : "transparent"}`,
              marginBottom: 2,
            }}>
              <KindBadge kind={t.kind} />
              <span style={{ fontSize: 12, color: "var(--ink-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {t.declaration.title}
              </span>
            </button>
          );
        })}
      </div>

      <div style={{ marginTop: 18 }}>
        <SectionLabel>backgrounded</SectionLabel>
        <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--mute)" }}>4 trees · show ▸</div>
      </div>

      <div style={{ marginTop: 24, paddingTop: 16, borderTop: "1px dashed var(--line)" }}>
        <SectionLabel>settings</SectionLabel>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, fontFamily: "var(--mono)", fontSize: 11, color: "var(--mute)" }}>
          <div>significance · <span style={{ color: "var(--ink-2)" }}>notable+</span></div>
          <div>reversibility · <span style={{ color: "var(--ink-2)" }}>24h</span></div>
          <div>density · <span style={{ color: "var(--ink-2)" }}>compact</span></div>
        </div>
      </div>
    </nav>
  );
}

function RailItem({ label, hint, count, active, disabled, accent, onClick }) {
  const accents = {
    amber:      { dot: "var(--amber)", color: "oklch(0.42 0.11 65)" },
    "amber-soft": { dot: "var(--amber)", color: "var(--ink-2)" },
  };
  return (
    <button onClick={onClick} disabled={disabled} style={{
      display: "flex", alignItems: "center", gap: 8,
      width: "100%", padding: "5px 8px", marginBottom: 2,
      borderRadius: 3,
      background: active ? "var(--paper)" : "transparent",
      border: `1px solid ${active ? "var(--line)" : "transparent"}`,
      cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.5 : 1,
      textAlign: "left",
    }}>
      {accent && accents[accent] && <span style={{ ...atomStyles.dotBase, width: 6, height: 6, background: accents[accent].dot }} />}
      <span style={{ fontSize: 12.5, color: active ? "var(--ink)" : (accent === "amber" ? accents.amber.color : "var(--ink-2)") }}>
        {label}
      </span>
      {count != null && (
        <span style={{ marginLeft: "auto", fontFamily: "var(--mono)", fontSize: 11, color: "var(--mute)" }}>{count}</span>
      )}
      {hint && !count && <span style={{ marginLeft: "auto", fontFamily: "var(--mono)", fontSize: 10.5, color: "var(--mute-2)" }}>{hint}</span>}
    </button>
  );
}

// ─── WorkspaceActivity — persistent right rail. ─────────────────────────
function WorkspaceActivity({ collapsed, onToggle, onEventClick }) {
  if (collapsed) {
    return (
      <aside style={{
        borderLeft: "1px solid var(--line)", background: "var(--paper-2)",
        display: "flex", flexDirection: "column", alignItems: "center",
        padding: "20px 0", gap: 12,
      }}>
        <button onClick={onToggle} style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--mute)", padding: "4px 8px", border: "1px solid var(--line)", borderRadius: 3, background: "var(--paper)", cursor: "pointer", writingMode: "vertical-rl" }}>
          activity ◂
        </button>
        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6, alignItems: "center" }}>
          <span style={{ ...atomStyles.dotBase, width: 8, height: 8, background: "var(--rose)" }} title="1 critical" />
          <span style={{ ...atomStyles.dotBase, width: 8, height: 8, background: "var(--amber)" }} title="4 notable" />
          <span style={{ ...atomStyles.dotBase, width: 8, height: 8, background: "var(--mute-2)" }} title="routine collapsed" />
        </div>
      </aside>
    );
  }

  const critical = EVENTS.filter((e) => e.sig === "critical").sort((a, b) => new Date(b.at) - new Date(a.at));
  const notable  = EVENTS.filter((e) => e.sig === "notable").sort((a, b) => new Date(b.at) - new Date(a.at));
  const routine  = EVENTS.filter((e) => e.sig === "routine");

  return (
    <aside style={{
      borderLeft: "1px solid var(--line)",
      background: "var(--paper-2)",
      overflow: "auto",
      padding: "16px 16px 28px",
      minHeight: 0,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div>
          <div style={{ fontFamily: "var(--mono)", fontSize: 10.5, color: "var(--mute)", textTransform: "uppercase", letterSpacing: 0.08 }}>activity</div>
          <div style={{ fontSize: 13, color: "var(--ink-2)", marginTop: 2 }}>workspace · last 24h</div>
        </div>
        <button onClick={onToggle} style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--mute)", padding: "3px 6px", border: "1px solid var(--line)", borderRadius: 3, background: "var(--paper)", cursor: "pointer" }}>▸</button>
      </div>

      {/* Critical */}
      {critical.length > 0 && (
        <ActivityBucket label="critical" tone="rose" count={critical.length}>
          {critical.map((e) => <ActivityEventCard key={e.id} ev={e} onClick={onEventClick} />)}
        </ActivityBucket>
      )}

      {notable.length > 0 && (
        <ActivityBucket label="notable" tone="amber" count={notable.length}>
          {notable.map((e) => <ActivityEventCard key={e.id} ev={e} onClick={onEventClick} />)}
        </ActivityBucket>
      )}

      <ActivityBucket label="routine" tone="mute" count={routine.length} collapsed>
        {routine.slice(0, 0).map((e) => <ActivityEventCard key={e.id} ev={e} onClick={onEventClick} />)}
      </ActivityBucket>

      <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px dashed var(--line)", display: "flex", flexDirection: "column", gap: 4, fontFamily: "var(--mono)", fontSize: 11, color: "var(--mute)" }}>
        <div>filter · <span style={{ color: "var(--ink-2)" }}>all trees</span></div>
        <div>since · <span style={{ color: "var(--ink-2)" }}>24h</span></div>
        <div>significance · <span style={{ color: "var(--ink-2)" }}>notable+</span></div>
      </div>
    </aside>
  );
}

function ActivityBucket({ label, tone, count, collapsed, children }) {
  const [open, setOpen] = React.useState(!collapsed);
  const tones = { rose: "var(--rose)", amber: "var(--amber)", mute: "var(--mute-2)" };
  return (
    <div style={{ marginBottom: 14 }}>
      <button onClick={() => setOpen((o) => !o)} style={{
        display: "flex", alignItems: "center", gap: 8,
        width: "100%", padding: "5px 0", cursor: "pointer",
        fontFamily: "var(--mono)", fontSize: 11, color: "var(--mute)",
        textTransform: "uppercase", letterSpacing: 0.08,
      }}>
        <span style={{ ...atomStyles.dotBase, width: 6, height: 6, background: tones[tone] }} />
        <span style={{ color: "var(--ink-2)" }}>{label}</span>
        <span>· {count}</span>
        <span style={{ marginLeft: "auto" }}>{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 10 }}>
          {children}
        </div>
      )}
    </div>
  );
}

function ActivityEventCard({ ev, onClick }) {
  const target = ALL_INTENTS[ev.intent_id];
  const tree   = target ? ALL_INTENTS[target.tree_id] : null;
  return (
    <button onClick={() => onClick(target?.tree_id, ev.intent_id)} style={{
      display: "block", width: "100%", textAlign: "left", padding: 0, cursor: "pointer",
      background: "transparent",
    }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 3 }}>
        <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--mute)" }}>{relTime(ev.at)}</span>
        <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--ink-2)" }}>{ev.by.display}</span>
      </div>
      <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--ink)" }}>{ev.type}</div>
      <div style={{ fontSize: 12.5, color: "var(--ink-2)", marginTop: 2, lineHeight: 1.4 }}>{ev.summary}</div>
      {tree && (
        <div style={{ fontFamily: "var(--mono)", fontSize: 10.5, color: "var(--mute)", marginTop: 4 }}>
          in {tree.declaration.title}
        </div>
      )}
    </button>
  );
}

// Mount.
ReactDOM.createRoot(document.getElementById("root")).render(<App />);
