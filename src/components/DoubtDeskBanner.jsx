import { useMemo } from "react";
import { Target, Flame, Quote } from "lucide-react";

const INK = "#17140F";
const TEXT = "#2B2018";
const MUTED = "#6B5D4D";
const GOLD = "#B8860B";

// A few short, on-brand lines — this is the one genuinely new piece of content in this
// component (there is no existing quote source anywhere in the app to reuse), picked once
// per mount so it doesn't flicker on every re-render.
const QUOTES = [
  "Discipline today creates the rank you desire tomorrow.",
  "Small progress every day creates extraordinary results.",
  "Stay consistent. Your future self will thank you.",
];

function greetingForHour(hour) {
  if (hour < 5) return "Good night";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  if (hour < 21) return "Good evening";
  return "Good night";
}

function StatChip({ icon: Icon, value, label }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,0.72)", borderRadius: 12, padding: "8px 12px", minWidth: 0 }}>
      <Icon size={16} color={GOLD} style={{ flexShrink: 0 }} />
      <div style={{ lineHeight: 1.2, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 800, color: INK, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{value}</div>
        <div style={{ fontSize: 10, color: MUTED, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</div>
      </div>
    </div>
  );
}

// Doubt Desk empty-state welcome banner — real React/HTML content, not a static image.
// Every value here is either passed in from App.jsx's existing state (same source the
// header already reads from — no second source of truth) or computed from the real
// current time. See the component's call site in App.jsx for exactly which state each
// prop is bound to.
//
// `rank` is intentionally not a prop, and there is deliberately no third stat card: there is
// no persisted per-user rank anywhere in this codebase (searched for it — the only "rank"
// concept is the Rank Predictor tool, which computes an on-demand estimate from manually-typed
// marks and never stores a result), and no existing "progress" metric either (the Firestore
// fields totalDoubtsAsked/totalTestsCompleted/hasPerfectScore are write-only inputs to badge
// logic, never read into any live app state a card could bind to). Rather than invent a number
// or force an unrelated real value into that slot, the reference design's third (rank) card is
// simply omitted — two stat cards, not three. `exam` is still used dynamically, just in the
// subtitle line below, where it's already contextually appropriate.
//
// The supplied banner artwork (public/doubt-desk-banner.webp) had the greeting/stats/quote
// baked into the pixels, so it can't be reused as the whole banner anymore. What's reused is
// a crop of the same file containing only the mountain/student illustration — no baked text —
// saved separately as public/doubt-desk-illustration.webp. Everything else here is layout,
// not artwork.
export default function DoubtDeskBanner({ userName, streak, xp, exam }) {
  const greeting = useMemo(() => greetingForHour(new Date().getHours()), []);
  const firstName = (userName || "there").trim().split(" ")[0];
  const quote = useMemo(() => QUOTES[Math.floor(Math.random() * QUOTES.length)], []);
  const examLabel = exam || "NEET, JEE & KCET";

  return (
    <div
      className="ibuddie-banner"
      style={{
        position: "relative", overflow: "hidden", borderRadius: 18, marginBottom: 18,
        display: "flex", alignItems: "stretch", gap: 16, minHeight: 190,
        border: "1px solid #E4E2DA", boxShadow: "0 6px 20px rgba(23,20,15,0.08)",
        background: "linear-gradient(135deg, #F3D9E8 0%, #E7CFEF 45%, #F6E4CF 100%)",
      }}
    >
      <style>{`
        @media (max-width: 1024px) and (min-width: 769px) {
          .ibuddie-banner { min-height: 160px !important; }
          .ibuddie-banner-heading { font-size: 22px !important; }
          .ibuddie-banner-illustration { width: 110px !important; }
        }
        @media (max-width: 768px) {
          .ibuddie-banner { flex-direction: column !important; min-height: 0 !important; }
          .ibuddie-banner-text { padding: 16px 16px 0 !important; }
          .ibuddie-banner-heading { font-size: 19px !important; }
          .ibuddie-banner-subtitle { font-size: 11.5px !important; }
          .ibuddie-banner-illustration { display: none !important; }
          .ibuddie-banner-stats { gap: 6px !important; flex-wrap: nowrap !important; }
          .ibuddie-banner-stats > div { padding: 6px 8px !important; flex: 1 1 0; min-width: 0; }
          .ibuddie-banner-quote { margin: 12px 16px 16px !important; }
        }
      `}</style>

      <div className="ibuddie-banner-text" style={{ flex: 1, minWidth: 0, padding: "22px 0 22px 24px", display: "flex", flexDirection: "column", justifyContent: "center", gap: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>{greeting}, {firstName}! 👋</div>
        <div className="ibuddie-banner-heading" style={{ fontSize: 26, fontWeight: 800, color: INK, lineHeight: 1.15 }}>
          Stay Curious.<br />Keep Growing.
        </div>
        <div className="ibuddie-banner-subtitle" style={{ fontSize: 13, color: TEXT, fontWeight: 500 }}>
          Your AI study companion for {examLabel}.
        </div>
        <div className="ibuddie-banner-stats" style={{ display: "flex", gap: 10, marginTop: 4, flexWrap: "wrap" }}>
          <StatChip icon={Target} value={streak} label={streak === 1 ? "Day Streak" : "Days Streak"} />
          <StatChip icon={Flame} value={xp} label="XP Points" />
        </div>
      </div>

      <img
        className="ibuddie-banner-illustration"
        src="/doubt-desk-illustration.webp"
        width={183}
        height={272}
        alt=""
        aria-hidden="true"
        style={{ width: 150, flexShrink: 0, objectFit: "cover", display: "block" }}
      />

      <div
        className="ibuddie-banner-quote"
        style={{
          position: "relative", background: "#FFFFFF", borderRadius: 14, margin: "20px 20px 20px 0",
          padding: "16px 18px", display: "flex", flexDirection: "column", gap: 8, justifyContent: "center",
          width: 200, flexShrink: 0, boxShadow: "0 4px 14px rgba(23,20,15,0.12)",
        }}
      >
        <Quote size={16} color={GOLD} />
        <div style={{ fontSize: 13, fontWeight: 600, color: TEXT, lineHeight: 1.5 }}>{quote}</div>
        <div style={{ fontSize: 11.5, color: MUTED, fontWeight: 600 }}>— iBuddie</div>
      </div>
    </div>
  );
}
