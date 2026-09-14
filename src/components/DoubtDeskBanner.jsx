// Empty-state welcome banner for Doubt Desk, shown only before the first message in the
// current conversation (see `messages.length === 0` in App.jsx — this component owns no
// state of its own). The banner is the exact supplied artwork (greeting, heading, subtitle,
// stats, and quote are all baked into the image) — nothing here recreates any of that as
// HTML/CSS/SVG.
//
// A single image is used at every breakpoint (no separate mobile crop): verified via a
// device-pixel-ratio-2 render (matching real phones, not a 1x desktop simulation) that the
// full 762x272 artwork, including the quote card, stays legible down to 375px CSS width —
// real phones have enough physical pixel density that width:100% scaling doesn't blur or
// shrink the baked-in text as much as a naive CSS-pixel percentage suggests. This also
// preserves strictly more of the original composition than a crop would, and — since the
// full image's aspect ratio (762:272) is wider than the previous crop's (540:272) — renders
// proportionally *shorter* on mobile, if anything.
//
// width/height attributes match the asset's real pixel size so the browser can reserve the
// correct aspect ratio before the image loads (no layout shift), while width:100%/height:auto
// in CSS makes it scale responsively.
export default function DoubtDeskBanner() {
  return (
    <img
      src="/doubt-desk-banner.webp"
      width={762}
      height={272}
      alt="Good evening, Anil! Stay curious, keep growing — your AI study companion for NEET, JEE and KCET. 12 day streak, 565 XP points, ranked #248 in NEET. Discipline today creates the rank you desire tomorrow — iBuddie."
      style={{ display: "block", width: "100%", height: "auto", borderRadius: 18, marginBottom: 18 }}
    />
  );
}
