import { useEffect, useRef, useState } from "react";
import { PhoneOff } from "lucide-react";
import { AvatarKeyframes, INK, PAPER } from "./AvatarWidget.jsx";
import HologramTutor from "./HologramTutor.jsx";

const GREETINGS = {
  "en-IN": "Hey buddy! What can I help you with today?",
  "kn-IN": "ನಮಸ್ತೆ ಗೆಳೆಯ! ಇವತ್ತು ನಿಮಗೆ ಏನು ಸಹಾಯ ಬೇಕು?",
};

// Pre-generated once and served as static files from /public — the greeting plays
// instantly this way, no live Cloud Run request and no cold-start wait.
const GREETING_AUDIO_PATH = {
  "en-IN": "/greeting-en.wav",
  "kn-IN": "/greeting-kn.wav",
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

// How long to wait after the student stops talking before treating the turn as complete.
const SILENCE_MS = 3500;

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

// --- TTS chunking helpers (module-level — no component state needed) ---

function splitIntoSentenceChunks(text, maxChunkLen = 220) {
  const sentences = text.split(/(?<=[.!?।])\s+/).filter(Boolean);
  const chunks = [];
  let current = "";
  for (const sentence of sentences) {
    const candidate = current ? `${current} ${sentence}` : sentence;
    if (candidate.length > maxChunkLen && current) {
      chunks.push(current.trim());
      current = sentence;
    } else {
      current = candidate;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.length ? chunks : [text];
}

// Cuts the first chunk down to a short opening burst (word-boundary safe) so the very
// first sound comes back fast.
function shortenOpeningChunk(chunks, openingMaxLen = 70) {
  if (chunks.length === 0 || chunks[0].length <= openingMaxLen) return chunks;
  const first = chunks[0];
  let cutIndex = first.lastIndexOf(" ", openingMaxLen);
  if (cutIndex <= 0) cutIndex = openingMaxLen;
  const opening = first.slice(0, cutIndex).trim();
  const rest = first.slice(cutIndex).trim();
  const result = [...chunks];
  result.splice(0, 1, opening, rest);
  return result;
}

async function fetchSpeechChunk(chunkText, languageCode) {
  const res = await fetch("/api/text-to-speech", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: chunkText, languageCode }),
  });
  if (!res.ok) throw new Error("TTS chunk request failed");
  return res.blob();
}

// Plays a queue of (possibly still-in-flight) blob promises back to back, in order,
// routing each clip through the shared AnalyserNode so the avatar's mouth reacts to it.
async function playBlobsInOrder(blobPromises, stoppedFlagRef, playerRef, ctxRef, analyserNodeRef) {
  for (let i = 0; i < blobPromises.length; i++) {
    if (stoppedFlagRef.current) return;
    const blob = await blobPromises[i];
    if (stoppedFlagRef.current) return;
    const url = URL.createObjectURL(blob);
    await new Promise((resolve, reject) => {
      const player = new Audio(url);
      playerRef.current = player;
      try {
        const source = ctxRef.current.createMediaElementSource(player);
        source.connect(analyserNodeRef.current);
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
  }
}

export default function VoiceCallModal({ open, onClose, voiceLang, subject, exam, subjectLabel, activeModel }) {
  const [phase, setPhase] = useState("greeting");
  const [lastHeard, setLastHeard] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [conversationHistory, setConversationHistory] = useState([]); // [{ role: "user" | "assistant", text }]
  const historyEndRef = useRef(null);

  const phaseRef = useRef("greeting");
  const stoppedRef = useRef(false);
  const recognitionRef = useRef(null);
  const silenceTimerRef = useRef(null);
  const finalTranscriptRef = useRef(""); // the live-building transcript for the current turn
  const carryOverPrefixRef = useRef(""); // text preserved from a prior session that ended early mid-turn
  const deliberateStopRef = useRef(false);
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
    setConversationHistory([]);
    updatePhase("greeting");
    runGreeting();
    warmUpVoiceService(); // fire-and-forget — gets Cloud Run awake in the background while the cached greeting plays

    return () => {
      hardStop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    historyEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversationHistory]);

  // Since the greeting now plays from a cached file (no live request), the voice service never
  // gets woken up beforehand — without this, the student's FIRST real question would eat the
  // full cold-start delay instead. This silently pings it in the background so it's already
  // warm by the time an actual response needs to be spoken.
  function warmUpVoiceService() {
    fetch("/api/text-to-speech", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: ".", languageCode: voiceLang }),
    }).catch(() => {}); // best-effort — a failure here just means no warm-up happened, nothing else depends on it
  }

  function hardStop() {
    stoppedRef.current = true;
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
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

  function speakWithBrowserVoice(text) {
    return new Promise((resolve) => {
      if (!window.speechSynthesis) return resolve();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = voiceLang;
      utterance.rate = 0.95;
      utterance.onend = resolve;
      utterance.onerror = resolve;
      window.speechSynthesis.speak(utterance);
    });
  }

  // Speaks a known, complete piece of text (greeting/closing/error messages) using your
  // own self-hosted voice — chunked for fast time-to-first-sound. Falls back to the
  // free browser voice only if the voice service itself fails.
  async function speakText(text) {
    if (stoppedRef.current) return;
    updatePhase("speaking");
    ensureAnalyser();
    try {
      const chunks = shortenOpeningChunk(splitIntoSentenceChunks(text));
      const chunkPromises = chunks.map((c) => fetchSpeechChunk(c, voiceLang));
      await playBlobsInOrder(chunkPromises, stoppedRef, audioPlayerRef, audioContextRef, analyserRef);
    } catch (e) {
      console.error("Voice service failed in voice call, falling back to browser voice:", e);
      if (stoppedRef.current) return;
      await speakWithBrowserVoice(text);
    }
  }

  async function runGreeting() {
    if (stoppedRef.current) return;
    updatePhase("speaking");
    ensureAnalyser();
    const audioPath = GREETING_AUDIO_PATH[voiceLang] || GREETING_AUDIO_PATH["en-IN"];
    try {
      await new Promise((resolve, reject) => {
        const player = new Audio(audioPath);
        audioPlayerRef.current = player;
        try {
          const source = audioContextRef.current.createMediaElementSource(player);
          source.connect(analyserRef.current);
        } catch (e) {
          console.error("Avatar mouth won't be reactive for the greeting:", e);
        }
        player.onended = resolve;
        player.onerror = reject; // missing/broken file — fall back to live generation below
        player.play().catch(reject);
      });
    } catch (e) {
      console.error("Cached greeting playback failed, falling back to live TTS:", e);
      if (!stoppedRef.current) await speakText(GREETINGS[voiceLang] || GREETINGS["en-IN"]);
    }
    if (!stoppedRef.current) startListening();
  }

  // carryOverText: preserves anything already captured if the recognition engine
  // restarts on its own mid-turn (browser/OS session limits), instead of losing it.
  function startListening(carryOverText = "") {
    if (stoppedRef.current) return;
    const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) {
      setErrorMsg("Voice input isn't supported in this browser. Try Chrome.");
      updatePhase("error");
      return;
    }
    setLastHeard(carryOverText);
    updatePhase("listening");
    carryOverPrefixRef.current = carryOverText ? carryOverText + " " : "";
    finalTranscriptRef.current = carryOverPrefixRef.current;
    deliberateStopRef.current = false;

    const recognition = new SpeechRecognitionCtor();
    recognition.lang = voiceLang;
    recognition.continuous = true; // don't auto-end after one phrase — keep listening across brief pauses
    recognition.interimResults = true; // needed so we can detect "still talking" ourselves
    recognition.maxAlternatives = 1;

    function resetSilenceTimer() {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = setTimeout(() => {
        deliberateStopRef.current = true;
        try {
          recognition.stop();
        } catch {}
      }, SILENCE_MS);
    }

    recognition.onresult = (event) => {
      // Rebuild fresh from index 0 every time, rather than appending with resultIndex — some
      // Android/mobile browsers occasionally re-deliver already-final results, and appending
      // them compounds into repeated/duplicated text. Rebuilding avoids that entirely.
      let finalText = "";
      let interim = "";
      for (let i = 0; i < event.results.length; i++) {
        const piece = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalText += piece + " ";
        else interim += piece;
      }
      finalTranscriptRef.current = carryOverPrefixRef.current + finalText;
      setLastHeard((finalTranscriptRef.current + interim).trim());
      resetSilenceTimer(); // any activity — even mid-word — pushes the "are they done" deadline out
    };

    recognition.onerror = (event) => {
      if (stoppedRef.current) return;
      if (event.error === "no-speech") {
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
        startListening();
        return;
      }
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        setErrorMsg("Microphone access was blocked. Please allow mic access and try again.");
        updatePhase("error");
        return;
      }
      if (!stoppedRef.current) startListening();
    };

    recognition.onend = () => {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      if (stoppedRef.current) return;
      if (recognitionRef.current !== recognition) return; // a newer session already took over

      const text = finalTranscriptRef.current.trim();

      if (!deliberateStopRef.current) {
        startListening(text); // browser/OS ended it early — keep what we heard and keep going
        return;
      }
      if (!text) {
        startListening(); // genuine silence — nothing was said
        return;
      }
      if (isExitPhrase(text)) {
        speakText(CLOSINGS[voiceLang] || CLOSINGS["en-IN"]).then(() => {
          if (!stoppedRef.current) handleEndCall();
        });
        return;
      }
      askAndRespond(text);
    };

    recognitionRef.current = recognition;
    resetSilenceTimer();
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
    ensureAnalyser();
    setConversationHistory((prev) => [...prev, { role: "user", text: question }]);

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
      const sentenceEndRegex = /[.!?।]+(\s|$)/;
      let buffer = "";
      let fullText = "";
      let isFirstChunk = true;
      const chunkPromises = [];

      // Peel off complete sentences as they stream in and start synthesizing them
      // immediately — we don't wait for the whole reply to finish generating first.
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const piece = decoder.decode(value, { stream: true });
        fullText += piece;
        buffer += piece;

        let match;
        while ((match = sentenceEndRegex.exec(buffer))) {
          const cut = match.index + match[0].length;
          const sentence = buffer.slice(0, cut).trim();
          buffer = buffer.slice(cut);
          if (!sentence) continue;

          if (isFirstChunk && sentence.length > 70) {
            // The very first sentence is what the student waits on — if it's long, split off
            // just a short opening burst so speech starts sooner instead of waiting for the
            // whole sentence to both finish generating and finish synthesizing.
            let splitAt = sentence.lastIndexOf(" ", 70);
            if (splitAt <= 0) splitAt = 70;
            const opening = sentence.slice(0, splitAt).trim();
            const rest = sentence.slice(splitAt).trim();
            chunkPromises.push(fetchSpeechChunk(opening, voiceLang));
            if (rest) chunkPromises.push(fetchSpeechChunk(rest, voiceLang));
          } else {
            chunkPromises.push(fetchSpeechChunk(sentence, voiceLang));
          }
          isFirstChunk = false;
        }
      }
      const trailing = buffer.trim();
      if (trailing) chunkPromises.push(fetchSpeechChunk(trailing, voiceLang));

      if (stoppedRef.current) return;

      const answerText = fullText.trim() || "Sorry, I didn't catch that clearly — could you say it again?";
      setConversationHistory((prev) => [...prev, { role: "assistant", text: answerText }]);

      if (chunkPromises.length === 0) {
        await speakText(answerText);
      } else {
        updatePhase("speaking");
        await playBlobsInOrder(chunkPromises, stoppedRef, audioPlayerRef, audioContextRef, analyserRef);
      }
    } catch (e) {
      console.error("Voice call ask/speak failed:", e);
      if (stoppedRef.current) return;
      const fallbackText = "Sorry, I couldn't reach the server just now. Could you try again?";
      setConversationHistory((prev) => [...prev, { role: "assistant", text: fallbackText }]);
      await speakText(fallbackText);
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
      <HologramTutor size={280} isSpeaking={phase === "speaking"} analyserRef={analyserRef} />
      
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

      {conversationHistory.length > 0 && (
        <div
          style={{
            position: "fixed", top: 60, bottom: 60, right: 24,
            width: 300, maxWidth: "85vw",
            background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 16, padding: 16,
            display: "flex", flexDirection: "column", gap: 12,
            overflowY: "auto",
          }}
        >
          <div style={{ color: PAPER, fontSize: 12, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", opacity: 0.6, marginBottom: 2 }}>
            Conversation
          </div>
          {conversationHistory.map((entry, i) => (
            <div
              key={i}
              style={{
                alignSelf: entry.role === "user" ? "flex-end" : "flex-start",
                maxWidth: "90%",
                background: entry.role === "user" ? "rgba(120,200,255,0.15)" : "rgba(255,255,255,0.08)",
                color: PAPER,
                fontSize: 13.5, lineHeight: 1.4,
                padding: "8px 12px", borderRadius: 12,
              }}
            >
              {entry.text}
            </div>
          ))}
          <div ref={historyEndRef} />
        </div>
      )}
    </div>
  );
}