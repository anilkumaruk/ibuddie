// Templated React/SVG diagram components for the AI Lecture board. The lecture-generation
// prompt only ever chooses a TYPE + PARAMS for a diagram it wants — it never generates an
// image. Add a new template here, then add its type to both DIAGRAM_COMPONENTS below and
// SUPPORTED_DIAGRAM_TYPES in api/generate-lecture.js (they must stay in sync).

const COLOR_MAP = {
  gold: "#B8860B",
  red: "#B23B3B",
  green: "#2F6B4A",
  blue: "#3B7FB2",
};

// A free-body / force diagram: one labeled object at the center, with force vectors drawn
// as arrows radiating out at their given angle, sized (within a fixed visual range) by
// relative magnitude, each labeled with its name and value.
export function ForceDiagram({ params }) {
  const { objectLabel = "Object", forces = [] } = params || {};
  const size = 320;
  const cx = size / 2;
  const cy = size / 2;
  // The model is asked for a short 1-3 word label, but defend against a longer one anyway —
  // a fixed-size circle would let it overflow and collide with the force arrows/labels.
  // Truncate extreme outliers, then size the circle and font to what's left.
  const displayLabel = objectLabel.length > 16 ? objectLabel.slice(0, 15) + "…" : objectLabel;
  const objectR = Math.min(50, Math.max(32, 16 + displayLabel.length * 2.4));
  const labelFontSize = displayLabel.length > 12 ? 10 : displayLabel.length > 7 ? 11.5 : 13;

  const magnitudes = forces.map((f) => Number(f.magnitudeN) || 0);
  const maxMag = Math.max(...magnitudes, 1);
  const minLen = 46;
  // Leave enough margin past the arrow tip for its label text (see labelX/labelY below) —
  // otherwise a full-length arrow puts the label right at (or past) the SVG's edge.
  const maxLen = size / 2 - objectR - 58;
  const edgePad = 8;
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  return (
    <svg width="100%" height={size} viewBox={`0 0 ${size} ${size}`} style={{ maxWidth: 420, display: "block", margin: "0 auto" }}>
      <defs>
        {forces.map((f, i) => {
          const color = COLOR_MAP[f.color] || COLOR_MAP.gold;
          return (
            <marker key={i} id={`force-arrow-${i}`} markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
              <path d="M0,0 L8,4 L0,8 Z" fill={color} />
            </marker>
          );
        })}
      </defs>

      <circle cx={cx} cy={cy} r={objectR} fill="#F2EFE7" stroke="#B8860B" strokeWidth={2} />
      <text x={cx} y={cy + 5} textAnchor="middle" fontSize={labelFontSize} fontWeight={700} fill="#17140F">
        {displayLabel}
      </text>

      {forces.map((f, i) => {
        const color = COLOR_MAP[f.color] || COLOR_MAP.gold;
        const label = String(f.label || "").length > 12 ? String(f.label).slice(0, 11) + "…" : f.label;
        const angleRad = (Number(f.directionDeg) || 0) * (Math.PI / 180);
        const mag = Number(f.magnitudeN) || 0;
        const len = minLen + (maxMag > 0 ? (mag / maxMag) * (maxLen - minLen) : 0);
        const startR = objectR + 4;
        const x1 = cx + Math.cos(angleRad) * startR;
        const y1 = cy - Math.sin(angleRad) * startR;
        const x2 = cx + Math.cos(angleRad) * (startR + len);
        const y2 = cy - Math.sin(angleRad) * (startR + len);
        // Approximate half the label's rendered width so the clamp keeps the whole
        // (center-anchored) text inside the viewBox, not just its anchor point.
        const halfTextWidth = (label?.length || 0) * 3.2 + 6;
        const labelX = clamp(cx + Math.cos(angleRad) * (startR + len + 18), halfTextWidth + edgePad, size - halfTextWidth - edgePad);
        const labelY = clamp(cy - Math.sin(angleRad) * (startR + len + 18), 14 + edgePad, size - edgePad);

        return (
          <g key={i}>
            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={2.5} markerEnd={`url(#force-arrow-${i})`} />
            <text x={labelX} y={labelY} textAnchor="middle" fontSize={11.5} fontWeight={700} fill={color}>
              {label}
            </text>
            <text x={labelX} y={labelY + 14} textAnchor="middle" fontSize={10.5} fill="#B0A28C">
              {mag} N
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export const DIAGRAM_COMPONENTS = {
  force_diagram: ForceDiagram,
};
