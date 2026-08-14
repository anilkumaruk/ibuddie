import { useEffect, useRef } from "react";

// Matches the app's existing ink/paper palette (see ACCENT in App.jsx) so this
// looks like part of the product, not a bolted-on mascot.
const INK = "#17140F";
const PAPER = "#F2EFE7";
const ACTIVE_GREEN = "#2F6B4A";

export default function AvatarWidget({ isSpeaking, isLoading, analyserRef }) {
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
          // Real Sarvam AI audio: read actual volume and open the mouth proportionally.
          analyser.getByteFrequencyData(dataArray);
          let sum = 0;
          const range = Math.floor(dataArray.length / 2); // voice energy concentrates in the lower half of the spectrum
          for (let i = 0; i < range; i++) sum += dataArray[i];
          const avg = sum / range / 255; // 0..1
          const openness = 0.15 + Math.min(avg * 1.8, 1) * 0.85;
          mouthRef.current.style.transform = `scaleY(${openness.toFixed(2)})`;
        } else {
          // Free-tier browser voice: no waveform access available, so use a gentle
          // looping "talk" motion instead — still reads as alive, just not reactive.
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
        <svg width="40" height="40" viewBox="0 0 40 40">
          <ellipse cx="13" cy="15" rx="2.6" ry="3.4" fill={PAPER} style={{ transformBox: "fill-box", transformOrigin: "center", animation: "avatarBlink 4.5s ease-in-out infinite" }} />
          <ellipse cx="27" cy="15" rx="2.6" ry="3.4" fill={PAPER} style={{ transformBox: "fill-box", transformOrigin: "center", animation: "avatarBlink 4.5s ease-in-out infinite" }} />
          <ellipse
            ref={mouthRef}
            cx="20"
            cy="26"
            rx="7"
            ry="4"
            fill={PAPER}
            style={{ transformBox: "fill-box", transformOrigin: "center", transform: "scaleY(0.15)" }}
          />
        </svg>
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
      <style>{`
        @keyframes avatarFadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes avatarBob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
        @keyframes avatarBlink { 0%, 92%, 100% { transform: scaleY(1); } 96% { transform: scaleY(0.1); } }
      `}</style>
    </div>
  );
}