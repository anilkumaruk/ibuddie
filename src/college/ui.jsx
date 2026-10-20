import { useState } from "react";
import { TriangleAlert, Clock, Copy, Check, RefreshCw, X } from "lucide-react";
import { TEXT, MUTED, BORDER, PAPER, INK, GREEN, RED, RED_SOFT, RED_LINE, GOLD, BAR, card, fmtDate } from "./theme.js";

// Shared building blocks for the student "My College" page and the staff portal.

export function BrandLogo({ size = 22 }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <span style={{ fontSize: size, fontWeight: 800, letterSpacing: "-0.02em", background: "linear-gradient(90deg, #F08A1C, #E8641B)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>iBuddie</span>
      <span style={{ fontSize: 10.5, fontWeight: 700, color: MUTED, border: `1px solid ${BORDER}`, background: "#FFFFFF", borderRadius: 6, padding: "2px 7px", letterSpacing: "0.06em" }}>STAFF</span>
    </span>
  );
}

export function Button({ children, onClick, variant = "primary", disabled, small, type = "button", style }) {
  const styles = {
    primary: { background: INK, color: "#FFFFFF", border: `1px solid ${INK}` },
    secondary: { background: "#FFFFFF", color: TEXT, border: `1px solid ${BORDER}` },
    danger: { background: "#FFFFFF", color: RED, border: `1px solid ${RED_LINE}` },
    ghost: { background: "transparent", color: MUTED, border: "1px solid transparent" },
  }[variant];
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        ...styles, display: "inline-flex", alignItems: "center", gap: 6, justifyContent: "center",
        padding: small ? "6px 10px" : "10px 16px", borderRadius: 10, fontSize: small ? 12 : 13.5, fontWeight: 600,
        cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.55 : 1, fontFamily: "inherit", whiteSpace: "nowrap", ...style,
      }}
    >
      {children}
    </button>
  );
}

export function Field({ label, children, hint }) {
  return (
    <label style={{ display: "block", marginBottom: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: TEXT, marginBottom: 5 }}>{label}</div>
      {children}
      {hint && <div style={{ fontSize: 11.5, color: MUTED, marginTop: 4 }}>{hint}</div>}
    </label>
  );
}

export function ErrorNote({ children }) {
  if (!children) return null;
  return <div style={{ background: RED_SOFT, border: `1px solid ${RED_LINE}`, color: RED, borderRadius: 10, fontSize: 12.5, padding: "9px 12px", marginBottom: 12 }}>{children}</div>;
}

export function Modal({ title, onClose, children, width = 520 }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(23,20,15,0.45)", zIndex: 70, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: `min(${width}px, 100%)`, maxHeight: "90vh", overflowY: "auto", background: "#FAF9F5", borderRadius: 16, padding: 20, boxSizing: "border-box" }}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 14 }}>
          <div style={{ flex: 1, fontSize: 16, fontWeight: 800, color: TEXT }}>{title}</div>
          <X size={20} color={MUTED} style={{ cursor: "pointer" }} onClick={onClose} />
        </div>
        {children}
      </div>
    </div>
  );
}

export function StatTile({ label, value, hint }) {
  return (
    <div style={{ ...card, padding: "14px 16px" }}>
      <div style={{ fontSize: 11.5, color: MUTED, fontWeight: 600, letterSpacing: "0.02em" }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color: TEXT, marginTop: 4, fontVariantNumeric: "tabular-nums" }}>{value}</div>
      {hint && <div style={{ fontSize: 11.5, color: MUTED, marginTop: 2 }}>{hint}</div>}
    </div>
  );
}

// Horizontal single-series bar list. Values are direct-labeled; title gives the hover readout.
export function BarList({ rows, unit, empty }) {
  if (rows.length === 0 || rows.every((r) => r.value === 0)) return <div style={{ fontSize: 12.5, color: MUTED }}>{empty}</div>;
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
      {rows.map((r) => (
        <div key={r.label} title={`${r.label}: ${r.value} ${unit}`} style={{ display: "grid", gridTemplateColumns: "minmax(90px, 38%) 1fr 34px", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 12.5, color: TEXT, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.label}</span>
          <div style={{ height: 10, background: PAPER, borderRadius: 4 }}>
            <div style={{ width: `${(r.value / max) * 100}%`, minWidth: r.value ? 4 : 0, height: "100%", background: BAR, borderRadius: 4 }} />
          </div>
          <span style={{ fontSize: 12, color: MUTED, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{r.value}</span>
        </div>
      ))}
    </div>
  );
}

export function StatusTag({ status, daysInactive }) {
  if (status === "ok") return <span style={{ fontSize: 11.5, color: GREEN, fontWeight: 600 }}>On track</span>;
  const struggling = status === "struggling";
  const Icon = struggling ? TriangleAlert : Clock;
  const label = struggling ? "Low scores" : daysInactive === null ? "Never active" : `Inactive ${daysInactive}d`;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11.5, fontWeight: 600, color: struggling ? RED : GOLD, whiteSpace: "nowrap" }}>
      <Icon size={12} /> {label}
    </span>
  );
}

// `linkBase` is where the invite link opens: the student app for class codes, the staff portal for teacher codes.
export function CodeBox({ label, code, onRegenerate, shareText, linkBase = "/my-college" }) {
  const [copied, setCopied] = useState(null);
  const link = `${window.location.origin}${linkBase}?join=${code}`;
  function copy(what, value) {
    navigator.clipboard?.writeText(value).then(() => {
      setCopied(what);
      setTimeout(() => setCopied(null), 1600);
    });
  }
  return (
    <div style={{ background: "#F7F5EF", borderRadius: 12, padding: "12px 14px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
      <div style={{ flex: 1, minWidth: 140 }}>
        <div style={{ fontSize: 11, color: MUTED, fontWeight: 600 }}>{label}</div>
        <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: "0.18em", color: TEXT, fontFamily: "ui-monospace, monospace" }}>{code}</div>
        {shareText && <div style={{ fontSize: 11.5, color: MUTED }}>{shareText}</div>}
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <Button small variant="secondary" onClick={() => copy("code", code)}>{copied === "code" ? <Check size={13} /> : <Copy size={13} />} Code</Button>
        <Button small variant="secondary" onClick={() => copy("link", link)}>{copied === "link" ? <Check size={13} /> : <Copy size={13} />} Invite link</Button>
        {onRegenerate && <Button small variant="secondary" onClick={onRegenerate}><RefreshCw size={13} /> New code</Button>}
      </div>
    </div>
  );
}

export function AnnouncementItem({ a, onDelete, classLabel }) {
  return (
    <div style={{ padding: "12px 0", borderTop: `1px solid ${BORDER}` }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: TEXT }}>{a.title}</div>
          <div style={{ fontSize: 11.5, color: MUTED, marginTop: 2 }}>
            {[classLabel, a.authorName, fmtDate(a.ts, true)].filter(Boolean).join(" · ")}
          </div>
        </div>
        {onDelete && <Button small variant="ghost" onClick={onDelete}>Remove</Button>}
      </div>
      {a.body && <div style={{ fontSize: 13, color: TEXT, marginTop: 6, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{a.body}</div>}
    </div>
  );
}
