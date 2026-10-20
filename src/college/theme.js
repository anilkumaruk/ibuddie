// Design tokens and shared styles for the college pages.
// Each token is a CSS variable with the main app's warm palette as the fallback, so the
// student-side "My College" page matches App.jsx while the staff portal sets its own violet
// palette on :root (STAFF_THEME_CSS below). Because tokens are var(...) strings, never build a
// color by appending alpha hex to one — add a dedicated token instead.

export const INK = "var(--ib-ink, #17140F)"; // primary: buttons, active states, key icons
export const TEXT = "var(--ib-text, #2B2018)";
export const MUTED = "var(--ib-muted, #8C7D6B)";
export const BORDER = "var(--ib-border, #E4E2DA)";
export const PAPER = "var(--ib-paper, #F2EFE7)"; // soft fill behind grouped content
export const GREEN = "var(--ib-green, #2F6B4A)";
export const RED = "var(--ib-red, #B23B3B)";
export const RED_SOFT = "var(--ib-red-soft, #FBEFEF)";
export const RED_LINE = "var(--ib-red-line, #EBCACA)";
export const GOLD = "var(--ib-gold, #8F6A08)";
export const INK_SOFT = "var(--ib-ink-soft, #F2EFE7)"; // tinted background for the active nav item, chips
export const INK_LINE = "var(--ib-ink-line, #D8D2C8)"; // border that hints at the primary color
export const BAR = "var(--ib-bar, #3A342A)"; // single-series bars & lines: one hue, never a status color
export const EXAMS = ["NEET", "JEE", "KCET", "PUC"];

// Staff portal palette (from the approved dashboard design): violet primary on a cool page.
export const STAFF_THEME_CSS = `
  :root {
    --ib-ink: #5B3FE0;
    --ib-ink-soft: #EFEBFF;
    --ib-ink-line: #CFC5FA;
    --ib-text: #1C1B29;
    --ib-muted: #6B6A80;
    --ib-border: #E8E7F0;
    --ib-paper: #F5F4FA;
    --ib-green: #15803D;
    --ib-red: #C62828;
    --ib-red-soft: #FDF0F0;
    --ib-red-line: #F2C9C9;
    --ib-gold: #A15C07;
    --ib-bar: #5B3FE0;
    --ib-page: #F7F7FB;
  }
`;

export const card = { background: "#FFFFFF", borderRadius: 14, border: `1px solid ${BORDER}`, padding: 18 };
export const panel = { ...card, padding: 20, borderRadius: 16, minWidth: 0 }; // staff dashboard cards
export const input = { width: "100%", padding: "10px 12px", borderRadius: 10, border: `1px solid ${BORDER}`, fontSize: 13.5, color: TEXT, background: "#FFFFFF", boxSizing: "border-box", fontFamily: "inherit" };
export const sectionTitle = { fontSize: 13, fontWeight: 700, color: TEXT, marginBottom: 12 };
export const SPIN_CSS = `.spin { animation: collegeSpin 0.9s linear infinite; } @keyframes collegeSpin { to { transform: rotate(360deg); } }`;

export function fmtDate(ts, withYear = false) {
  return ts ? new Date(ts).toLocaleDateString("en-IN", { day: "numeric", month: "short", ...(withYear ? { year: "numeric" } : {}) }) : "";
}

export function timeAgo(ts, now = Date.now()) {
  if (!ts) return "";
  const mins = Math.round((now - ts) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return days < 7 ? `${days}d ago` : fmtDate(ts);
}
