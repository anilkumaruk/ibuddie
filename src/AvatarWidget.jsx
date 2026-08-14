import { useEffect, useRef } from "react";

// Matches the app's existing ink/paper palette (see ACCENT/GREEN in App.jsx) so this
// looks like part of the product, not a bolted-on mascot.
export const INK = "#17140F";
export const PAPER = "#F2EFE7";
export const ACTIVE_GREEN = "#2F6B4A";

// A reusable animated face: blinking eyes + a mouth that reacts to real audio volume
// (via analyserRef) when available, or falls back to a generic talking loop when not
// (e.g. free-tier browser voice, which has no accessible waveform). Used by both the
// small per-message "Listen" bubble and the full-screen voice call mode.
export function ReactiveFace({ size = 40, isSpeaking, analyserRef }) {
  const mouthRef = useRef(null);
  const rafRef = useRef(null);

  useEffect(() => {
    if (!isSpeaking) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      return;
    }

    const analyser = analyserRef?.current;
    const dataArray = analyser ? new Uint8Array(analyser.frequencyBinCount) : null;

    function tick() {
      if (mouthRef.current) {
        if (analyser && dataArray) {
          analyser.getByteFrequencyData(dataArray);
          let sum = 0;
          const range = Math.floor(dataArray.length / 2); // voice energy concentrates in the lower half of the spectrum
          for (let i = 0; i < range; i++) sum += dataArray[i];
          const avg = sum / range / 255; // 0..1
          const openness = 0.15 + Math.min(avg * 1.8, 1) * 0.85;
          mouthRef.current.style.transform = `scaleY(${openness.toFixed(2)})`;
        } else {
          const t = Date.now() / 140;
          const openness = 0.25 + Math.abs(Math.sin(t)) * 0.6;
          mouthRef.current.style.transform = `scaleY(${openness.toFixed(2)})`;
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    }
    tick();

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [isSpeaking, analyserRef]);

  const eyeCx1 = size * 0.325;
  const eyeCx2 = size * 0.675;
  const eyeCy = size * 0.375;
  const eyeRx = size * 0.065;
  const eyeRy = size * 0.085;
  const mouthCx = size * 0.5;
  const mouthCy = size * 0.65;
  const mouthRx = size * 0.175;
  const mouthRy = size * 0.1;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <ellipse cx={eyeCx1} cy={eyeCy} rx={eyeRx} ry={eyeRy} fill={PAPER} style={{ transformBox: "fill-box", transformOrigin: "center", animation: "avatarBlink 4.5s ease-in-out infinite" }} />
      <ellipse cx={eyeCx2} cy={eyeCy} rx={eyeRx} ry={eyeRy} fill={PAPER} style={{ transformBox: "fill-box", transformOrigin: "center", animation: "avatarBlink 4.5s ease-in-out infinite" }} />
      <ellipse
        ref={mouthRef}
        cx={mouthCx}
        cy={mouthCy}
        rx={mouthRx}
        ry={mouthRy}
        fill={PAPER}
        style={{ transformBox: "fill-box", transformOrigin: "center", transform: "scaleY(0.15)" }}
      />
    </svg>
  );
}

// Shared keyframes both the bubble and the full-screen modal rely on.
export function AvatarKeyframes() {
  return (
    <style>{`
      @keyframes avatarFadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
      @keyframes avatarBob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
      @keyframes avatarBlink { 0%, 92%, 100% { transform: scaleY(1); } 96% { transform: scaleY(0.1); } }
    `}</style>
  );
}

// The small floating bubble shown next to a per-message "Listen" click — unchanged behavior.
export default function AvatarWidget({ isSpeaking, isLoading, analyserRef }) {
  if (!isSpeaking && !isLoading) return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: 24,
        right: 24,
        zIndex: 50,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8,
        animation: "avatarFadeIn 0.25s ease-out",
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          width: 76,
          height: 76,
          borderRadius: "50%",
          background: INK,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          boxShadow: isSpeaking && !isLoading ? `0 0 0 6px ${ACTIVE_GREEN}33` : "0 4px 14px rgba(0,0,0,0.18)",
          animation: isSpeaking && !isLoading ? "avatarBob 1.6s ease-in-out infinite" : "none",
          transition: "box-shadow 0.3s ease",
        }}
      >
        <ReactiveFace size={40} isSpeaking={isSpeaking && !isLoading} analyserRef={analyserRef} />
        {isLoading && (
          <div
            style={{
              position: "absolute",
              inset: -4,
              borderRadius: "50%",
              border: `2px solid ${ACTIVE_GREEN}`,
              borderTopColor: "transparent",
              animation: "spin 0.8s linear infinite",
            }}
          />
        )}
      </div>
      <div style={{ fontSize: 11, fontWeight: 700, color: INK, background: PAPER, padding: "3px 10px", borderRadius: 999, border: "1px solid #E4E2DA" }}>
        {isLoading ? "Thinking…" : "iBuddie"}
      </div>
      <AvatarKeyframes />
    </div>
  );
}