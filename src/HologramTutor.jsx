import { useEffect, useRef } from "react";

export default function HologramTutor({ isSpeaking, analyserRef, imageSrc = "/tutor-face.png", size = 320 }) {
  const imgRef = useRef(null);
  const mouthGlowRef = useRef(null);
  const rafRef = useRef(null);

  useEffect(() => {
    if (!isSpeaking) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (imgRef.current) imgRef.current.style.filter = "brightness(1) drop-shadow(0 0 18px rgba(80,180,255,0.3))";
      if (mouthGlowRef.current) {
        mouthGlowRef.current.style.opacity = "0.12"; // faint idle presence instead of fully off
        mouthGlowRef.current.style.transform = "translate(-50%, -50%) scale(0.7)";
      }
      return;
    }

    const analyser = analyserRef?.current;
    const dataArray = analyser ? new Uint8Array(analyser.frequencyBinCount) : null;

    function tick() {
      let level;
      if (analyser && dataArray) {
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        const range = Math.floor(dataArray.length / 2); // voice energy concentrates in the lower half of the spectrum
        for (let i = 0; i < range; i++) sum += dataArray[i];
        level = sum / range / 255; // 0..1
      } else {
        // No waveform access (e.g. a fallback path) — gentle generic pulse instead
        level = 0.35 + Math.abs(Math.sin(Date.now() / 140)) * 0.35;
      }

      if (imgRef.current) {
        const brightness = 1 + level * 0.5;
        const glowSize = 18 + level * 42;
        const glowAlpha = (0.3 + level * 0.45).toFixed(2);
        imgRef.current.style.filter = `brightness(${brightness.toFixed(2)}) drop-shadow(0 0 ${glowSize.toFixed(0)}px rgba(80,180,255,${glowAlpha}))`;
      }
      if (mouthGlowRef.current) {
        mouthGlowRef.current.style.opacity = Math.min(0.15 + level * 1.5, 1).toFixed(2);
        mouthGlowRef.current.style.transform = `translate(-50%, -50%) scale(${(0.8 + level * 0.7).toFixed(2)})`;
      }
      rafRef.current = requestAnimationFrame(tick);
    }
    tick();

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [isSpeaking, analyserRef]);

  return (
    <div style={{ position: "relative", width: size, display: "flex", justifyContent: "center", animation: "hologramBreathe 3s ease-in-out infinite" }}>
      <img
        ref={imgRef}
        src={imageSrc}
        alt="AI tutor"
        style={{
          width: size,
          height: "auto",
          display: "block",
          filter: "brightness(1) drop-shadow(0 0 18px rgba(80,180,255,0.3))",
          transition: "filter 0.08s linear",
        }}
      />

      {/* Blink overlays — soft dark patches that briefly cover each glowing eye, always running */}
      <div style={{ position: "absolute", left: "39%", top: "42.5%", width: "9%", height: "6%", transform: "translate(-50%, -50%)", borderRadius: "50%", background: "radial-gradient(circle, rgba(4,7,13,0.95) 0%, rgba(4,7,13,0.7) 55%, rgba(4,7,13,0) 100%)", animation: "hologramBlink 4.8s ease-in-out infinite", pointerEvents: "none" }} />
      <div style={{ position: "absolute", left: "61%", top: "42%", width: "9%", height: "6%", transform: "translate(-50%, -50%)", borderRadius: "50%", background: "radial-gradient(circle, rgba(4,7,13,0.95) 0%, rgba(4,7,13,0.7) 55%, rgba(4,7,13,0) 100%)", animation: "hologramBlink 4.8s ease-in-out infinite", pointerEvents: "none" }} />

      {/* Localized glow right at the mouth, intensifies with real speech volume; faint even when idle */}
      <div
        ref={mouthGlowRef}
        style={{
          position: "absolute",
          left: "49%",
          top: "63%",
          width: "22%",
          height: "9%",
          transform: "translate(-50%, -50%) scale(0.7)",
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(120,200,255,0.9) 0%, rgba(120,200,255,0) 72%)",
          opacity: 0.12,
          pointerEvents: "none",
          transition: "opacity 0.08s linear, transform 0.08s linear",
        }}
      />
      <style>{`
        @keyframes hologramBreathe { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.015); } }
        @keyframes hologramBlink {
          0%, 93%, 100% { opacity: 0; transform: translate(-50%, -50%) scaleY(1); }
          95% { opacity: 0.95; transform: translate(-50%, -50%) scaleY(0.15); }
          97% { opacity: 0; transform: translate(-50%, -50%) scaleY(1); }
        }
      `}</style>
    </div>
  );
}