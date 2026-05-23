/* surface-shaping.jsx — Status: draft.
   Two panes:
     LEFT  — dialog (probes + clarifications), composer at bottom
     RIGHT — live typed Intent draft, fields marked ⚠ pending until resolved
   Below: restructure operations (decompose / fork / merge / reframe / commit)
*/

function ShapingSurface({ draft, onBack, onCommit }) {
  const [composerText, setComposerText] = React.useState("");
  const dialogScrollRef = React.useRef(null);

  React.useEffect(() => {
    if (dialogScrollRef.current) dialogScrollRef.current.scrollTop = dialogScrollRef.current.scrollHeight;
  }, []);

  const unresolved = draft.open_questions.filter((q) => !q.resolved);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.05fr) minmax(0, 1fr)", height: "100%" }}>
      {/* ── LEFT: shaping dialog ───────────────────────────────────────── */}
      <div style={{ display: "flex", flexDirection: "column", borderRight: "1px solid var(--line)", minHeight: 0 }}>
        <div style={{ padding: "20px 28px 12px", borderBottom: "1px solid var(--line)", background: "var(--paper)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button onClick={onBack} style={{
              fontFamily: "var(--mono)", fontSize: 11.5, color: "var(--mute)",
              padding: "3px 7px", border: "1px solid var(--line)", borderRadius: 3,
              background: "var(--paper-2)", cursor: "pointer",
            }}>← map</button>
            <span style={{ fontFamily: "var(--mono)", fontSize: 11.5, color: "var(--mute)" }}>
              workspace ▸ shaping ▸ <span style={{ color: "var(--ink-2)" }}>{draft.short_id}</span>
            </span>
            <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
              <Chip status="draft" mono>status · draft</Chip>
              <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--mute)" }}>
                {draft.open_questions.length - unresolved.length} / {draft.open_questions.length} questions
              </span>
            </span>
          </div>
          <div style={{ marginTop: 10, fontFamily: "var(--mono)", fontSize: 11, color: "var(--mute)", textTransform: "uppercase", letterSpacing: 0.06 }}>
            shaping dialog
          </div>
        </div>

        {/* Dialog turns */}
        <div ref={dialogScrollRef} style={{ flex: 1, overflow: "auto", padding: "16px 28px 24px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 18, maxWidth: 640 }}>
            {draft.dialog.map((t, i) => <DialogTurn key={i} turn={t} />)}

            {/* Open questions block — surfaced inline so they're not just hidden in chat. */}
            {unresolved.length > 0 && (
              <div style={{
                marginTop: 6, paddingTop: 14, borderTop: "1px dashed var(--line)",
              }}>
                <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--mute)", textTransform: "uppercase", letterSpacing: 0.06, marginBottom: 8 }}>
                  open questions
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {unresolved.map((q) => (
                    <div key={q.id} style={{
                      display: "flex", alignItems: "flex-start", gap: 10,
                      padding: "10px 12px", border: "1px solid var(--line)", borderRadius: 4,
                      background: "var(--paper-2)",
                    }}>
                      <span style={{
                        fontFamily: "var(--mono)", fontSize: 11, color: "oklch(0.42 0.11 65)",
                        padding: "2px 5px", borderRadius: 3, background: "var(--amber-soft)",
                        border: "1px solid oklch(0.86 0.08 75)", flex: "none",
                      }}>{q.id}</span>
                      <div style={{ flex: 1, fontSize: 13.5, color: "var(--ink-2)" }}>{q.text}</div>
                      <button style={btnGhost}>answer →</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Composer */}
        <div style={{ padding: "12px 28px 18px", borderTop: "1px solid var(--line)", background: "var(--paper-2)" }}>
          <div style={{
            display: "flex", alignItems: "flex-end", gap: 10,
            background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 4,
            padding: "10px 12px",
          }}>
            <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--mute)", paddingTop: 4 }}>sri</span>
            <textarea
              rows={2}
              value={composerText}
              onChange={(e) => setComposerText(e.target.value)}
              placeholder="type a response, or click a draft field on the right to edit it directly"
              style={{
                flex: 1, border: 0, outline: 0, resize: "none",
                background: "transparent", color: "var(--ink)",
                fontFamily: "var(--sans)", fontSize: 13.5, lineHeight: 1.5,
              }}
            />
            <button style={btnPrimary}>send →</button>
          </div>
          <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button style={chipBtn}>↳ ask agent to draft H-main</button>
            <button style={chipBtn}>↳ answer q4 (saturation)</button>
            <button style={chipBtn}>↳ describe expected outcomes</button>
          </div>
        </div>
      </div>

      {/* ── RIGHT: live typed draft ────────────────────────────────────── */}
      <div style={{ display: "flex", flexDirection: "column", minHeight: 0, background: "var(--paper-2)" }}>
        <div style={{ padding: "20px 28px 12px", borderBottom: "1px solid var(--line)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--mute)", textTransform: "uppercase", letterSpacing: 0.06 }}>
              intent draft · live
            </span>
            <span style={{ marginLeft: "auto", fontFamily: "var(--mono)", fontSize: 11, color: "var(--mute)" }}>
              schema_version "0.1.0"
            </span>
          </div>
        </div>

        <div style={{ flex: 1, overflow: "auto", padding: "16px 28px 18px" }}>
          <DraftView draft={draft} />
        </div>

        {/* Footer — restructure operations + commit */}
        <div style={{ borderTop: "1px solid var(--line)", padding: "14px 28px 18px", background: "var(--paper)" }}>
          <div style={{ fontFamily: "var(--mono)", fontSize: 10.5, color: "var(--mute)", textTransform: "uppercase", letterSpacing: 0.08, marginBottom: 8 }}>
            shaping operations
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
            <button style={opBtn}>decompose into iter-1 draft</button>
            <button style={opBtn}>fork</button>
            <button style={opBtn}>merge into existing campaign</button>
            <button style={opBtn}>reframe to different kind</button>
            <button style={opBtn}>probe</button>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, paddingTop: 10, borderTop: "1px dashed var(--line)" }}>
            <button
              disabled={unresolved.length > 0}
              onClick={onCommit}
              style={{
                ...btnPrimary,
                opacity: unresolved.length > 0 ? 0.4 : 1,
                cursor: unresolved.length > 0 ? "not-allowed" : "pointer",
                padding: "6px 14px",
              }}
            >
              commit to active →
            </button>
            <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--mute)" }}>
              {unresolved.length > 0
                ? `disabled — ${unresolved.length} unresolved question${unresolved.length > 1 ? "s" : ""}`
                : "ready — all readiness checks pass"}
            </div>
            <span style={{ marginLeft: "auto", fontFamily: "var(--mono)", fontSize: 11, color: "var(--mute-2)" }}>
              ↑ logs as <span style={{ color: "var(--ink-2)" }}>shaping-commit</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── DialogTurn ─────────────────────────────────────────────────────────
function DialogTurn({ turn }) {
  const isHuman = turn.kind === "human";
  return (
    <div style={{ display: "grid", gridTemplateColumns: "78px 1fr", gap: 14 }}>
      <div style={{ paddingTop: 2 }}>
        <PartyChip party={turn.who} dim />
        <div style={{ fontFamily: "var(--mono)", fontSize: 10.5, color: "var(--mute-2)", marginTop: 3 }}>{relTime(turn.at)}</div>
      </div>
      <div style={{
        fontFamily: isHuman ? "var(--sans)" : "var(--sans)",
        fontSize: 13.5, lineHeight: 1.55, color: "var(--ink)",
        whiteSpace: "pre-wrap",
        background: isHuman ? "transparent" : "var(--paper-2)",
        border: isHuman ? "0" : "1px solid var(--line)",
        borderRadius: isHuman ? 0 : 4,
        padding: isHuman ? "0" : "10px 12px",
      }}>
        {turn.text}
      </div>
    </div>
  );
}

// ─── DraftView — the typed object as a live document. ───────────────────
function DraftView({ draft }) {
  const F = ({ label, pending, pending_reason, children, lockGlyph }) => (
    <div style={{
      display: "grid", gridTemplateColumns: "110px 1fr",
      columnGap: 14, rowGap: 4,
      padding: "10px 0",
      borderBottom: "1px dashed var(--line)",
      alignItems: "flex-start",
    }}>
      <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--mute)", textTransform: "uppercase", letterSpacing: 0.06, paddingTop: 4 }}>
        {label}{lockGlyph && <span style={{ marginLeft: 4, color: "var(--sage)" }}>✓</span>}
      </div>
      <div style={{ fontSize: 13.5, color: "var(--ink-2)", lineHeight: 1.55 }}>
        {pending
          ? <div style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              fontFamily: "var(--mono)", fontSize: 12, color: "oklch(0.42 0.11 65)",
              background: "var(--amber-soft)", border: "1px solid oklch(0.86 0.08 75)",
              padding: "3px 8px", borderRadius: 3,
            }}>
              <span style={{ ...atomStyles.dotBase, width: 5, height: 5, background: "var(--amber)" }} />
              ⚠ {pending_reason || "pending"}
            </div>
          : children}
      </div>
    </div>
  );

  return (
    <div className="mono" style={{ fontFamily: "var(--mono)", fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.6 }}>
      {/* Header line as YAML-ish */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, paddingBottom: 8, borderBottom: "1px solid var(--line)" }}>
        <KindBadge kind={draft.kind_tentative} label={draft.kind_tentative} />
        <span style={{ color: "var(--mute)" }}>·</span>
        <Chip status="draft" mono>draft (shaping)</Chip>
        {draft.kind_locked && <Chip tone="sage" mono>✓ kind locked</Chip>}
      </div>

      <F label="id" lockGlyph>
        <span style={{ fontFamily: "var(--mono)" }}>{draft.id}</span>
      </F>

      <F label="title" lockGlyph>
        <span className="serif" style={{ fontSize: 16, color: "var(--ink)", letterSpacing: -0.2 }}>
          {draft.declaration.title}
          <span className="caret" style={{ display: "inline-block", width: 7, height: 16, background: "var(--ink-2)", marginLeft: 3, verticalAlign: "-3px" }} />
        </span>
      </F>

      <F label="summary" pending={draft.declaration.summary.pending}>
        {draft.declaration.summary.value}
      </F>

      <F label="success_criterion" pending={draft.declaration.success.pending} pending_reason={draft.declaration.success.pending_reason}>
        {draft.declaration.success.value}
      </F>

      <F label="kind" lockGlyph>
        <span style={{ fontFamily: "var(--mono)", color: "var(--ink)" }}>{draft.kind_tentative}</span>
        <span style={{ color: "var(--mute)" }}> · committed to via q1</span>
      </F>

      <F label="holder">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          <Chip mono tone="mute">{HOLDER_GLYPHS[draft.holder.mode]}</Chip>
          {draft.holder.parties.map((p) => <PartyChip key={p.id} party={p} />)}
        </div>
      </F>

      <F label="knowledge_refs">
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {draft.knowledge_refs.map((k) => (
            <div key={k.uri} style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <Chip mono tone="mute">scope · {k.scope}</Chip>
              <Chip mono tone="mute">role · {k.role}</Chip>
              <span style={{ fontFamily: "var(--mono)", fontSize: 11.5, color: "var(--ink-2)" }}>{k.uri}</span>
            </div>
          ))}
        </div>
      </F>

      <F label="decomposition">
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--mute)" }}>
          children: <span style={{ fontFamily: "var(--mono)", color: "var(--ink-2)" }}>(none yet)</span>
          <button style={{ ...chipBtn, fontSize: 11, padding: "2px 7px" }}>+ decompose</button>
        </div>
      </F>

      <F label="tags">
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {draft.tags.map((t) => <Tag key={t}>{t}</Tag>)}
        </div>
      </F>

      <F label="provenance" lockGlyph>
        <div style={{ fontFamily: "var(--mono)", fontSize: 11.5, color: "var(--mute)" }}>
          declared_by: sri (human) · at {relTime(draft.dialog[0].at)}<br/>
          motivated_by: <span style={{ color: "var(--ink-2)" }}>nous-c01 · "follow-up"</span>
        </div>
      </F>

      {/* Transition log */}
      <div style={{ marginTop: 16 }}>
        <div style={{ fontFamily: "var(--mono)", fontSize: 10.5, color: "var(--mute)", textTransform: "uppercase", letterSpacing: 0.06, marginBottom: 6 }}>
          state transitions
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {draft.transitions.map((t, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "70px 140px 1fr", gap: 8, fontSize: 11.5, fontFamily: "var(--mono)", color: "var(--mute)" }}>
              <span>{relTime(t.at)}</span>
              <span style={{ color: "var(--ink-2)" }}>{t.cause}</span>
              <span>{t.note}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const chipBtn = {
  fontFamily: "var(--mono)", fontSize: 11,
  padding: "3px 8px", borderRadius: 3,
  background: "var(--paper-2)", color: "var(--mute)",
  border: "1px solid var(--line)",
  cursor: "pointer",
};
const opBtn = {
  fontFamily: "var(--mono)", fontSize: 11.5,
  padding: "5px 10px", borderRadius: 3,
  background: "var(--paper-2)", color: "var(--ink-2)",
  border: "1px solid var(--line)",
  cursor: "pointer",
};

Object.assign(window, { ShapingSurface });
