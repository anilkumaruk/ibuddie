import { useEffect, useRef, useState } from "react";
import { PhoneOff } from "lucide-react";
import { ReactiveFace, AvatarKeyframes, INK, PAPER, ACTIVE_GREEN } from "./AvatarWidget.jsx";

const GREETINGS = {
  "en-IN": "Hey buddy! What can I help you with today?",
  "kn-IN": "ನಮಸ್ತೆ ಗೆಳೆಯ! ಇವತ್ತು ನಿಮಗೆ ಏನು ಸಹಾಯ ಬೇಕು?",
};

const CLOSINGS = {
  "en-IN": "You're welcome! All the best with your studies.",
  "kn-IN": "ಸ್ವಾಗತ! ನಿಮ್ಮ ಓದಿಗೆ ಶುಭಾಶಯಗಳು.",
};

// Short utterances only — a real question that happens to contain the word "thanks"
// mid-sentence should never accidentally end the call.
const EXIT_PHRASES = [
  "thank you", "thanks", "bye", "goodbye", "that's all", "that is all", "stop now",
  "ಧನ್ಯವಾದ", "ವಂದನೆ", "ಸಾಕು", "ಬೈ",
];

function isExitPhrase(text) {
  const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
  if (wordCount === 0 || wordCount > 6) return false;
  const lower = text.toLowerCase();
  return EXIT_PHRASES.some((p) => lower.includes(p.toLowerCase()));
}

const STATUS_LABEL = {
  greeting: "Saying hello…",
  listening: "Listening…",
  thinking: "Thinking…",
  speaking: "Speaking…",
  error: "Something went wrong",
};

export default function VoiceCallModal({ open, onClose, voiceLang, subject, exam, subjectLabel, activeModel }) {
  const [phase, setPhase] = useState("greeting");
  const [lastHeard, setLastHeard] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const phaseRef = useRef("greeting"); // mirrors `phase`, but always current inside async/event callbacks (avoids stale closures)
  const stoppedRef = useRef(false);
  const recognitionRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const audioPlayerRef = useRef(null);

  function updatePhase(next) {
    phaseRef.current = next;
    setPhase(next);
  }

  useEffect(() => {
    if (!open) return;
    stoppedRef.current = false;
    setErrorMsg("");
    setLastHeard("");
    updatePhase("greeting");
    runGreeting();

    return () => {
      hardStop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function hardStop() {
    stoppedRef.current = true;
    try {
      recognitionRef.current?.stop();
    } catch {}
    try {
      audioPlayerRef.current?.pause();
    } catch {}
    window.speechSynthesis?.cancel();
  }

  function handleEndCall() {
    hardStop();
    onClose();
  }

  function ensureAnalyser() {
    if (!audioContextRef.current) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      audioContextRef.current = new AudioCtx();
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
      analyserRef.current.connect(audioContextRef.current.destination);
    }
    if (audioContextRef.current.state === "suspended") {
      audioContextRef.current.resume().catch(() => {});
    }
  }

  // Speaks a line of text via Sarvam AI (falls back to the browser voice if that fails)
  // and resolves once playback has fully finished.
  async function speakText(text) {
    if (stoppedRef.current) return;
    updatePhase("speaking");
    ensureAnalyser();
    try {
      const res = await fetch("/api/text-to-speech", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, languageCode: voiceLang }),
      });
      if (!res.ok) throw new Error("TTS request failed");
      const blob = await res.blob();
      if (stoppedRef.current) return;
      const url = URL.createObjectURL(blob);
      await new Promise((resolve, reject) => {
        const player = new Audio(url);
        audioPlayerRef.current = player;
        try {
          const source = audioContextRef.current.createMediaElementSource(player);
          source.connect(analyserRef.current);
        } catch (e) {
          console.error("Avatar mouth won't be reactive for this clip:", e);
        }
        player.onended = () => {
          URL.revokeObjectURL(url);
          resolve();
        };
        player.onerror = () => {
          URL.revokeObjectURL(url);
          reject(new Error("Playback error"));
        };
        player.play().catch(reject);
      });
    } catch (e) {
      console.error("Sarvam TTS failed in voice call, falling back to browser voice:", e);
      if (stoppedRef.current) return;
      await new Promise((resolve) => {
        if (!window.speechSynthesis) return resolve();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = voiceLang;
        utterance.rate = 0.95;
        utterance.onend = resolve;
        utterance.onerror = resolve;
        window.speechSynthesis.speak(utterance);
      });
    }
  }

  async function runGreeting() {
    await speakText(GREETINGS[voiceLang] || GREETINGS["en-IN"]);
    if (!stoppedRef.current) startListening();
  }

  function startListening() {
    if (stoppedRef.current) return;
    const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) {
      setErrorMsg("Voice input isn't supported in this browser. Try Chrome.");
      updatePhase("error");
      return;
    }
    setLastHeard("");
    updatePhase("listening");

    const recognition = new SpeechRecognitionCtor();
    recognition.lang = voiceLang;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setLastHeard(transcript);
      if (isExitPhrase(transcript)) {
        speakText(CLOSINGS[voiceLang] || CLOSINGS["en-IN"]).then(() => {
          if (!stoppedRef.current) handleEndCall();
        });
        return;
      }
      askAndRespond(transcript);
    };
    recognition.onerror = (event) => {
      if (stoppedRef.current) return;
      if (event.error === "no-speech") {
        // Just silence — keep the conversation going instead of ending the call.
        startListening();
        return;
      }
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        setErrorMsg("Microphone access was blocked. Please allow mic access and try again.");
        updatePhase("error");
        return;
      }
      // Any other transient error — try listening again rather than dying silently.
      if (!stoppedRef.current) startListening();
    };
    recognition.onend = () => {
      // If nothing else has already moved us on (result/error), and we're still meant
      // to be listening, restart — covers browsers that end the session without a result.
      if (!stoppedRef.current && phaseRef.current === "listening" && recognitionRef.current === recognition) {
        startListening();
      }
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch (e) {
      console.error("Could not start recognition:", e);
    }
  }

  async function askAndRespond(question) {
    if (stoppedRef.current) return;
    recognitionRef.current?.stop();
    updatePhase("thinking");

    const isGeneral = subject === "general";
    const systemPrompt = isGeneral
      ? `You are iBuddie, a warm and friendly AI study buddy having a live spoken conversation. Reply the way a supportive friend would speak out loud — natural and conversational, 2-4 sentences unless the student clearly asks for a full detailed explanation. If the student speaks in Kannada, reply in natural Kannada (mixing in English technical terms naturally); otherwise reply in English. Do not use markdown, headers, or any formatting symbols — this will be spoken aloud, not read.`
      : `You are iBuddie, a warm and friendly AI study buddy having a live spoken conversation with a ${exam} student about ${subjectLabel}. Reply the way a supportive senior would speak out loud — natural and conversational, 2-4 sentences unless the student clearly asks for a full detailed explanation. If the student speaks in Kannada, reply in natural Kannada (mixing in English technical terms naturally); otherwise reply in English. Do not use markdown, headers, or any formatting symbols — this will be spoken aloud, not read.`;

    try {
      const response = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, systemPrompt, model: activeModel }),
      });
      if (!response.ok || !response.body) throw new Error("Stream failed");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullText = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        fullText += decoder.decode(value, { stream: true });
      }
      if (stoppedRef.current) return;
      await speakText(fullText.trim() || "Sorry, I didn't catch that clearly — could you say it again?");
    } catch (e) {
      console.error("Voice call ask failed:", e);
      if (stoppedRef.current) return;
      await speakText("Sorry, I couldn't reach the server just now. Could you try again?");
    }
    if (!stoppedRef.current) startListening();
  }

  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        background: INK,
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        fontFamily: "'Inter', system-ui, sans-serif",
      }}
    >
      <ReactiveFace size={200} isSpeaking={phase === "speaking"} analyserRef={analyserRef} />

      <div style={{ marginTop: 28, color: PAPER, fontSize: 18, fontWeight: 700 }}>
        {phase === "error" ? errorMsg : STATUS_LABEL[phase]}
      </div>

      {lastHeard && phase !== "error" && (
        <div style={{ marginTop: 10, color: "#8C7D6B", fontSize: 14, maxWidth: 420, textAlign: "center" }}>
          "{lastHeard}"
        </div>
      )}

      <button
        onClick={handleEndCall}
        style={{
          marginTop: 48, display: "flex", alignItems: "center", gap: 8,
          background: "#B23B3B", color: "#fff", border: "none",
          padding: "12px 28px", borderRadius: 999, fontSize: 15, fontWeight: 700, cursor: "pointer",
        }}
      >
        <PhoneOff size={18} />
        End Call
      </button>

      <AvatarKeyframes />
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}