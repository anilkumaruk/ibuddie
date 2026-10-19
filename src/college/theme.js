// Design tokens and shared styles for the college pages — same palette as the main app (App.jsx).

export const INK = "#17140F";
export const TEXT = "#2B2018";
export const MUTED = "#8C7D6B";
export const BORDER = "#E4E2DA";
export const PAPER = "#F2EFE7";
export const GREEN = "#2F6B4A";
export const RED = "#B23B3B";
export const GOLD = "#8F6A08";
export const BAR = "#3A342A"; // single-series bars: one recessive ink hue, never a status color
export const EXAMS = ["NEET", "JEE", "KCET", "PUC"];

export const card = { background: "#FFFFFF", borderRadius: 14, border: `1px solid ${BORDER}`, padding: 18 };
export const input = { width: "100%", padding: "10px 12px", borderRadius: 10, border: `1px solid ${BORDER}`, fontSize: 13.5, color: TEXT, background: "#FFFFFF", boxSizing: "border-box", fontFamily: "inherit" };
export const sectionTitle = { fontSize: 13, fontWeight: 700, color: TEXT, marginBottom: 12 };
export const SPIN_CSS = `.spin { animation: collegeSpin 0.9s linear infinite; } @keyframes collegeSpin { to { transform: rotate(360deg); } }`;

export function fmtDate(ts, withYear = false) {
  return ts ? new Date(ts).toLocaleDateString("en-IN", { day: "numeric", month: "short", ...(withYear ? { year: "numeric" } : {}) }) : "";
}

