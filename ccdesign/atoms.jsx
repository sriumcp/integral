/* atoms.jsx — small reusable building blocks. No styles file: per-component
   inline style objects, named with unique prefixes (atom*) per the rule. */

const atomStyles = {
  // Status dot — a 6px circle. Color expresses status, ring expresses presence.
  dotBase: {
    display: "inline-block",
    width: 8, height: 8, borderRadius: 999,
    flex: "none",
    verticalAlign: "middle",
  },

  // Kind label — tiny mono label, slight letterspacing.
  kindLabel: {
    fontFamily: "var(--mono)",
    fontSize: 10.5,
    fontWeight: 500,
    letterSpacing: 0.04,
    color: "var(--mute)",
    textTransform: "lowercase",
  },

  // ID pill — mono, near-monochrome.
  idPill: {
    fontFamily: "var(--mono)",
    fontSize: 11.5,
    color: "var(--mute)",
    background: "var(--paper-3)",
    padding: "1px 6px",
    borderRadius: 3,
    border: "1px solid var(--line)",
    whiteSpace: "nowrap",
  },

  // Chip — small status pill with optional dot.
  chipBase: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontSize: 11.5,
    lineHeight: 1,
    padding: "4px 7px",
    borderRadius: 3,
    border: "1px solid var(--line)",
    background: "var(--paper-2)",
    color: "var(--ink-2)",
    whiteSpace: "nowrap",
  },

  // Section header — small caps, mono-feel, used to label structural regions.
  sectionLabel: {
    fontFamily: "var(--mono)",
    fontSize: 10.5,
    fontWeight: 600,
    letterSpacing: 0.08,
    textTransform: "uppercase",
    color: "var(--mute)",
    marginBottom: 8,
  },

  // Divider — thin horizontal rule.
  divider: { height: 1, background: "var(--line)", border: 0, margin: 0 },

  // Tag.
  tag: {
    fontFamily: "var(--mono)",
    fontSize: 11,
    color: "var(--mute)",
    padding: "2px 6px",
    borderRadius: 999,
    border: "1px dashed var(--line)",
    background: "transparent",
  },
};

// Color by status. Hand-picked — docs are silent on this and want them muted.
const STATUS_COLORS = {
  draft:      { dot: "var(--mute-2)", fg: "var(--mute)",  bg: "var(--paper-3)", border: "var(--line)" },
  active:     { dot: "var(--ink)",    fg: "var(--ink)",   bg: "var(--paper-2)", border: "var(--line)" },
  gated:      { dot: "var(--amber)",  fg: "oklch(0.42 0.11 65)", bg: "var(--amber-soft)", border: "oklch(0.86 0.08 75)" },
  proposed:   { dot: "var(--amber)",  fg: "oklch(0.42 0.11 65)", bg: "var(--amber-soft)", border: "oklch(0.86 0.08 75)" },
  satisfied:  { dot: "var(--sage)",   fg: "oklch(0.40 0.06 155)", bg: "var(--sage-soft)", border: "oklch(0.86 0.05 150)" },
  abandoned:  { dot: "var(--mute-2)", fg: "var(--mute)",  bg: "var(--paper-3)", border: "var(--line)" },
  revoked:    { dot: "var(--mute-2)", fg: "var(--mute)",  bg: "var(--paper-3)", border: "var(--line)" },
};

// CI / review state colors — mapped to the same palette.
const CI_COLORS = {
  passing:  { dot: "var(--sage)",  label: "ci passing" },
  failing:  { dot: "var(--rose)",  label: "ci failing" },
  pending:  { dot: "var(--amber)", label: "ci pending" },
  "not-run":{ dot: "var(--mute-2)",label: "ci not run" },
};
const REVIEW_COLORS = {
  approved:           { dot: "var(--sage)",  label: "approved" },
  requested:          { dot: "var(--amber)", label: "review requested" },
  "changes-requested":{ dot: "var(--rose)",  label: "changes requested" },
  merged:             { dot: "var(--sage)",  label: "merged" },
  unrequested:        { dot: "var(--mute-2)",label: "no reviewer" },
  closed:             { dot: "var(--mute-2)",label: "closed" },
};

const SIG_COLORS = {
  critical: { dot: "var(--rose)",  label: "critical" },
  notable:  { dot: "var(--amber)", label: "notable"  },
  routine:  { dot: "var(--mute-2)",label: "routine"  },
};

// ─── StatusDot ──────────────────────────────────────────────────────────
function StatusDot({ status, presence, size = 8 }) {
  const c = STATUS_COLORS[status] || STATUS_COLORS.active;
  const style = { ...atomStyles.dotBase, width: size, height: size, background: c.dot };
  if (presence) {
    // Add a soft ring to indicate active agent presence.
    style.boxShadow = `0 0 0 3px ${c.dot.replace(")", " / 0.18)")}`;
  }
  return <span className={presence ? "presence-dot" : ""} style={style} />;
}

// ─── Chip ───────────────────────────────────────────────────────────────
// Dot rules: shown only when `status` is set, when `dot` is truthy, or when
// `pulse` is set. Pass `dot="<color>"` to override. Default = no dot.
function Chip({ status, dot, pulse, children, mono = false, soft = false, tone, title }) {
  const tones = {
    amber: { bg: "var(--amber-soft)", border: "oklch(0.86 0.08 75)",  fg: "oklch(0.42 0.11 65)",  accent: "var(--amber)" },
    sage:  { bg: "var(--sage-soft)",  border: "oklch(0.86 0.05 150)", fg: "oklch(0.40 0.06 155)", accent: "var(--sage)" },
    rose:  { bg: "var(--rose-soft)",  border: "oklch(0.86 0.07 30)",  fg: "oklch(0.42 0.11 25)",  accent: "var(--rose)" },
    blue:  { bg: "var(--blue-soft)",  border: "oklch(0.86 0.05 245)", fg: "oklch(0.40 0.08 245)", accent: "oklch(0.55 0.08 245)" },
    mute:  { bg: "var(--paper-3)",    border: "var(--line)",          fg: "var(--mute)",           accent: "var(--mute-2)" },
  };
  let style = { ...atomStyles.chipBase };
  let accent = "var(--mute-2)";
  if (tone && tones[tone]) {
    style.background = tones[tone].bg; style.borderColor = tones[tone].border; style.color = tones[tone].fg;
    accent = tones[tone].accent;
  } else if (status && STATUS_COLORS[status]) {
    const c = STATUS_COLORS[status];
    style.background = c.bg; style.borderColor = c.border; style.color = c.fg;
    accent = c.dot;
  }
  if (soft) { style.background = "transparent"; }
  if (mono) { style.fontFamily = "var(--mono)"; style.fontSize = 11; }
  const showDot = status || dot || pulse;
  const dotBg   = typeof dot === "string" ? dot : (status ? STATUS_COLORS[status]?.dot : accent);
  return (
    <span style={style} title={title}>
      {showDot && (
        <span
          className={pulse ? "presence-dot" : ""}
          style={{ ...atomStyles.dotBase, width: 6, height: 6, background: dotBg, flex: "none" }}
        />
      )}
      {children}
    </span>
  );
}

// ─── IdPill ─────────────────────────────────────────────────────────────
function IdPill({ id, short }) {
  return <span style={atomStyles.idPill} title={id}>{short || id}</span>;
}

// ─── SectionLabel ───────────────────────────────────────────────────────
function SectionLabel({ children, right }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
      <div style={atomStyles.sectionLabel}>{children}</div>
      {right && <div style={{ ...atomStyles.kindLabel, fontSize: 11 }}>{right}</div>}
    </div>
  );
}

// ─── KindBadge ──────────────────────────────────────────────────────────
// A small typeset label for kind. Each kind gets a single character glyph in
// monochrome — not a colorful icon, just a typographic anchor.
const KIND_GLYPHS = {
  "nous-campaign":      "N",
  "nous-iteration":     "n",
  "coral-optimization": "C",
  "coral-attempt":      "c",
  "paper-campaign":     "P",
  "paper-section":      "§",
  "paper-claim":        "·",
  "feature-campaign":   "F",
  "feature-pr":         "↗",
};
function KindBadge({ kind, label, size = 18 }) {
  const glyph = KIND_GLYPHS[kind] || "?";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <span style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: size, height: size, borderRadius: 3,
        background: "var(--paper-3)", border: "1px solid var(--line)",
        fontFamily: "var(--mono)", fontSize: 11, fontWeight: 600, color: "var(--ink-2)",
        lineHeight: 1,
      }}>{glyph}</span>
      {label && <span style={atomStyles.kindLabel}>{label}</span>}
    </span>
  );
}

// ─── PartyChip ──────────────────────────────────────────────────────────
function PartyChip({ party, dim = false }) {
  if (!party) return null;
  const c = party.kind === "human"
    ? { fg: "var(--ink-2)", border: "var(--line)", bg: "var(--paper-2)" }
    : party.kind === "agent"
    ? { fg: "oklch(0.38 0.08 245)", border: "oklch(0.86 0.04 245)", bg: "var(--blue-soft)" }
    : { fg: "var(--mute)", border: "var(--line)", bg: "var(--paper-3)" };
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      fontFamily: "var(--mono)", fontSize: 11.5,
      padding: "2px 6px 2px 5px", borderRadius: 3,
      background: dim ? "transparent" : c.bg,
      border: `1px solid ${dim ? "transparent" : c.border}`,
      color: c.fg,
    }}>
      <span style={{
        width: 6, height: 6, borderRadius: 999,
        background: party.kind === "human" ? "var(--ink-2)" : party.kind === "agent" ? "oklch(0.55 0.08 245)" : "var(--mute-2)",
      }} />
      {party.display}
    </span>
  );
}

// ─── HolderModeLabel ────────────────────────────────────────────────────
const HOLDER_GLYPHS = {
  "human-held":          "human",
  "agent-held":          "agent",
  "jointly-held":        "joint",
  "hierarchically-held": "hierarchy",
};

// ─── RelTime ────────────────────────────────────────────────────────────
function relTime(iso) {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  const diffMs = NOW - t;
  if (diffMs < 0) {
    const d = Math.round(-diffMs / 86_400_000);
    return d <= 0 ? "today" : `in ${d}d`;
  }
  const s = Math.round(diffMs / 1000);
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.round(d / 30);
  return `${mo}mo ago`;
}

// ─── Tag ────────────────────────────────────────────────────────────────
function Tag({ children }) { return <span style={atomStyles.tag}>{children}</span>; }

// ─── Sparkline ──────────────────────────────────────────────────────────
function Sparkline({ values, width = 120, height = 28, best }) {
  if (!values || values.length < 2) return null;
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 1);
  const n = values.length;
  const xstep = width / (n - 1);
  const pts = values.map((v, i) => {
    const x = i * xstep;
    const y = height - ((v - min) / (max - min)) * (height - 2) - 1;
    return [x, y];
  });
  const d = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const last = pts[pts.length - 1];
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: "block" }}>
      <path d={d} fill="none" stroke="var(--ink-2)" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r="2.5" fill="var(--amber)" />
      {best != null && (
        <line x1={0} x2={width}
          y1={height - ((best - min) / (max - min)) * (height - 2) - 1}
          y2={height - ((best - min) / (max - min)) * (height - 2) - 1}
          stroke="var(--sage)" strokeDasharray="2 2" strokeWidth="0.75" opacity="0.7" />
      )}
    </svg>
  );
}

// ─── HypothesisBars ─ horizontal bars for confirmed/refuted/pending counts.
function HypothesisBars({ bundle, width = 120, height = 8 }) {
  if (!bundle || !bundle.total) return null;
  const { confirmed = 0, refuted = 0, pending = 0, total } = bundle;
  const w = (n) => (n / total) * width;
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <svg width={width} height={height} style={{ display: "block", borderRadius: 2, overflow: "hidden", background: "var(--paper-3)" }}>
        <rect x="0"                width={w(confirmed)} height={height} fill="var(--sage)" />
        <rect x={w(confirmed)}     width={w(refuted)}   height={height} fill="var(--rose)" />
        <rect x={w(confirmed)+w(refuted)} width={w(pending)} height={height} fill="var(--mute-2)" opacity="0.45" />
      </svg>
      <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--mute)" }}>
        {confirmed}c · {refuted}r · {pending}p
      </span>
    </div>
  );
}

// ─── ScoreGauge ─────────────────────────────────────────────────────────
function ScoreGauge({ score, best, width = 96 }) {
  if (score == null) return <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--mute)" }}>—</span>;
  const pct = Math.min(1, Math.max(0, score));
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <div style={{ width, height: 6, background: "var(--paper-3)", borderRadius: 2, position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${pct*100}%`, background: best ? "var(--sage)" : "var(--ink-2)" }} />
        {best != null && best !== score && (
          <div style={{ position: "absolute", left: `${best*100}%`, top: -2, bottom: -2, width: 1, background: "var(--sage)", opacity: 0.6 }} />
        )}
      </div>
      <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--ink)" }}>{score.toFixed(3)}</span>
    </div>
  );
}

// ─── Helpers — figure thresholds (per UX sketch). ───────────────────────
function figureFor(intent) {
  // Returns a render hint or null. Cards consult this to know whether to draw a figure.
  if (intent.kind === "coral-optimization") {
    return intent.extension.attempts_scored >= 10 ? "coral-spark" : null;
  }
  if (intent.kind === "nous-campaign") {
    const itersCompleted = (intent.children || []).filter((c) => c.status === "satisfied").length;
    return itersCompleted >= 3 ? "nous-gates" : null;
  }
  if (intent.kind === "paper-campaign")   return intent.extension.sections_drafted >= 3 ? "paper-section-bars" : null;
  if (intent.kind === "feature-campaign") return intent.extension.prs_total >= 5 ? "feature-pr-bars" : null;
  return null;
}

// Expose to other scripts (Babel files don't share scope automatically).
Object.assign(window, {
  atomStyles, STATUS_COLORS, CI_COLORS, REVIEW_COLORS, SIG_COLORS, HOLDER_GLYPHS, KIND_GLYPHS,
  StatusDot, Chip, IdPill, SectionLabel, KindBadge, PartyChip, Tag, Sparkline, HypothesisBars, ScoreGauge,
  relTime, figureFor,
});
