import { useEffect, useRef } from "react";

const FUR = "#E08D45";
const FUR_DARK = "#C96B32";
const FUR_LIGHT = "#F7C9A0";
const CREAM = "#F2EFE7";
const INK = "#17140F";
const PAW = "#3A2A1A";

export default function WalkingMascot({ isSpeaking, analyserRef, size = 200 }) {
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
          const range = Math.floor(dataArray.length / 2);
          for (let i = 0; i < range; i++) sum += dataArray[i];
          const avg = sum / range / 255;
          const openness = 0.2 + Math.min(avg * 1.8, 1) * 0.9;
          mouthRef.current.style.transform = `scaleY(${openness.toFixed(2)})`;
        } else {
          const t = Date.now() / 140;
          const openness = 0.3 + Math.abs(Math.sin(t)) * 0.7;
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

  return (
    <div style={{ animation: isSpeaking ? "mascotPace 4s linear infinite" : "none" }}>
      <div style={{ animation: isSpeaking ? "mascotBob 0.5s ease-in-out infinite" : "none" }}>
        <svg width={size} height={size * 1.25} viewBox="0 0 200 250">
          {/* legs — alternate opposite phase for a walk-cycle illusion */}
          <g style={{ transformBox: "fill-box", transformOrigin: "115px 205px", animation: isSpeaking ? "mascotLegSwing 0.5s ease-in-out infinite reverse" : "none" }}>
            <ellipse cx="115" cy="218" rx="13" ry="22" fill={FUR_DARK} />
            <ellipse cx="115" cy="238" rx="14" ry="8" fill={PAW} />
          </g>
          <g style={{ transformBox: "fill-box", transformOrigin: "85px 205px", animation: isSpeaking ? "mascotLegSwing 0.5s ease-in-out infinite" : "none" }}>
            <ellipse cx="85" cy="218" rx="13" ry="22" fill={FUR} />
            <ellipse cx="85" cy="238" rx="14" ry="8" fill={PAW} />
          </g>

          {/* tail */}
          <g style={{ transformBox: "fill-box", transformOrigin: "right center", animation: isSpeaking ? "mascotTail 0.5s ease-in-out infinite" : "none" }}>
            <path d="M40,175 Q6,150 12,105 Q18,82 48,90 Q32,125 55,165 Z" fill={FUR} />
            <ellipse cx="22" cy="98" rx="11" ry="15" fill={CREAM} />
          </g>

          {/* body */}
          <ellipse cx="100" cy="182" rx="46" ry="42" fill={FUR} />
          <ellipse cx="100" cy="196" rx="28" ry="23" fill={CREAM} />

          {/* ears */}
          <path d="M56,58 L38,8 L82,48 Z" fill={FUR} />
          <path d="M61,50 L49,22 L77,45 Z" fill={FUR_LIGHT} />
          <path d="M144,58 L162,8 L118,48 Z" fill={FUR} />
          <path d="M139,50 L151,22 L123,45 Z" fill={FUR_LIGHT} />

          {/* head */}
          <ellipse cx="100" cy="98" rx="60" ry="54" fill={FUR} />
          <ellipse cx="100" cy="118" rx="35" ry="29" fill={CREAM} />

          {/* eyes — always gently blinking, independent of speech */}
          <ellipse cx="77" cy="90" rx="8" ry="10" fill={INK} style={{ transformBox: "fill-box", transformOrigin: "center", animation: "mascotBlink 4.5s ease-in-out infinite" }} />
          <ellipse cx="123" cy="90" rx="8" ry="10" fill={INK} style={{ transformBox: "fill-box", transformOrigin: "center", animation: "mascotBlink 4.5s ease-in-out infinite" }} />

          {/* nose */}
          <path d="M91,106 L109,106 L100,117 Z" fill={INK} />

          {/* mouth — reacts to real speech volume when speaking */}
          <ellipse
            ref={mouthRef}
            cx="100"
            cy="132"
            rx="11"
            ry="6"
            fill={INK}
            style={{ transformBox: "fill-box", transformOrigin: "center", transform: "scaleY(0.15)" }}
          />
        </svg>
      </div>
      <style>{`
        @keyframes mascotPace {
          0%   { transform: translateX(-90px) scaleX(1); }
          49%  { transform: translateX(90px) scaleX(1); }
          50%  { transform: translateX(90px) scaleX(-1); }
          99%  { transform: translateX(-90px) scaleX(-1); }
          100% { transform: translateX(-90px) scaleX(1); }
        }
        @keyframes mascotBob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
        @keyframes mascotLegSwing { 0%, 100% { transform: rotate(20deg); } 50% { transform: rotate(-20deg); } }
        @keyframes mascotTail { 0%, 100% { transform: rotate(0deg); } 50% { transform: rotate(-10deg); } }
        @keyframes mascotBlink { 0%, 92%, 100% { transform: scaleY(1); } 96% { transform: scaleY(0.1); } }
      `}</style>
    </div>
  );
}