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

// Purpose-specific framing for Voice Viva mode's oral-exam style — used to flavor the
// system prompt, not to change the underlying mechanics.
const VIVA_PURPOSE_TEXT = {
  neet: "a NEET oral drilling session",
  jee: "a JEE oral drilling session",
  kcet: "a KCET oral drilling session",
  boards: "a school Boards oral exam",
  college: "a college viva-voce",
  interview: "an interview preparation session",
};

export default function VoiceCallModal({
  open, onClose, voiceLang, subject, exam, subjectLabel, activeModel,
  mode = "chat", // "chat" | "viva"
  vivaSubjectLabel, vivaTopic, vivaPurpose,
}) {
  const [phase, setPhase] = useState("greeting");
  const [lastHeard, setLastHeard] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [conversationHistory, setConversationHistory] = useState([]); // [{ role: "user" | "assistant", text }]
  const [questionCount, setQuestionCount] = useState(0); // viva mode only — number of questions asked so far
  const [showSummary, setShowSummary] = useState(false); // viva mode only — session ended, showing feedback
  const [vivaSummary, setVivaSummary] = useState(null); // null while loading, then the feedback text
  const historyEndRef = useRef(null);

  const phaseRef = useRef("greeting");
  const stoppedRef = useRef(false);
  const recognitionRef = useRef(null);
  const silenceTimerRef = useRef(null);
  const finalTranscriptRef = useRef(""); // the live-building transcript for the current turn
  const carryOverPrefixRef = useRef(""); // text preserved from a prior session that ended early mid-turn
  const deliberateStopRef = useRef(false);
  const vivaEndedRef = useRef(false); // viva mode only — permanently true once endViva() starts, so an
  // in-flight askAndRespond/startViva call that resolves after the student ended the session
  // can't resurrect listening underneath the summary screen.
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
    setQuestionCount(0);
    setShowSummary(false);
    setVivaSummary(null);
    vivaEndedRef.current = false;
    updatePhase("greeting");
    if (mode === "viva") {
      startViva();
    } else {
      runGreeting();
    }
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
      if (!stoppedRef.current && !vivaEndedRef.current) startListening();
    };

    recognition.onend = () => {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      if (stoppedRef.current || vivaEndedRef.current) return;
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
        if (mode === "viva") {
          endViva();
        } else {
          speakText(CLOSINGS[voiceLang] || CLOSINGS["en-IN"]).then(() => {
            if (!stoppedRef.current) handleEndCall();
          });
        }
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

  function buildVivaSystemPrompt(isOpening) {
    const purposeText = VIVA_PURPOSE_TEXT[vivaPurpose] || "an oral exam";
    const topicPart = vivaTopic ? ` (focused specifically on: ${vivaTopic})` : "";
    if (isOpening) {
      return `You are about to conduct ${purposeText} with a student, live and spoken aloud, on the subject of ${vivaSubjectLabel}${topicPart}. In 1-2 short spoken sentences: briefly greet the student, then ask your first question. Speak naturally, the way a real examiner talks out loud — no markdown, no lists, no headers. Default to English unless the conversation clearly continues in Kannada.`;
    }
    return `You are conducting ${purposeText} with a student, live and spoken aloud, on the subject of ${vivaSubjectLabel}${topicPart}. You have just heard the student's spoken answer to your previous question. Respond in 2-4 short spoken sentences: first briefly say whether their answer was correct, partially correct, or incorrect, and why, in one sentence; then immediately ask exactly one new question that naturally follows up — either probing their last answer more deeply, or moving to a closely related point. Never ask more than one question in a turn, and never skip asking a question. Speak the way a real examiner talks out loud — warm but exacting, no markdown, no lists, no headers. If the student answers in Kannada, continue in natural Kannada; otherwise use English.`;
  }

  // Streams a reply from /api/ask, synthesizing and speaking complete sentences as they
  // arrive (rather than waiting for the whole reply), and returns the full text once done.
  // Shared by the general chat flow and Voice Viva mode — only the prompt/history differ.
  async function streamAndSpeak(question, systemPrompt, historyForRequest) {
    const response = await fetch("/api/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, systemPrompt, model: activeModel, history: historyForRequest }),
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

    if (stoppedRef.current) return fullText.trim();

    const answerText = fullText.trim() || "Sorry, I didn't catch that clearly — could you say it again?";
    if (chunkPromises.length === 0) {
      await speakText(answerText);
    } else {
      updatePhase("speaking");
      await playBlobsInOrder(chunkPromises, stoppedRef, audioPlayerRef, audioContextRef, analyserRef);
    }
    return answerText;
  }

  // Kicks off Voice Viva mode — the AI opens with a greeting + its first question,
  // instead of the general call's canned "what can I help with" greeting.
  async function startViva() {
    if (stoppedRef.current) return;
    updatePhase("thinking");
    ensureAnalyser();
    try {
      const answerText = await streamAndSpeak(
        "Begin the viva now.",
        buildVivaSystemPrompt(true),
        []
      );
      if (stoppedRef.current || vivaEndedRef.current) return;
      setConversationHistory((prev) => [...prev, { role: "assistant", text: answerText }]);
      setQuestionCount(1);
    } catch (e) {
      console.error("Voice Viva opening failed:", e);
      if (stoppedRef.current || vivaEndedRef.current) return;
      const fallbackText = "Sorry, I couldn't get the viva started just now. Let's try again.";
      setConversationHistory((prev) => [...prev, { role: "assistant", text: fallbackText }]);
      await speakText(fallbackText);
    }
    if (!stoppedRef.current && !vivaEndedRef.current) startListening();
  }

  // Wraps up Voice Viva mode: speaks a short closing line, then fetches a brief written
  // performance summary from the transcript and shows it on screen (not auto-closed —
  // the student reads it and taps Done when ready).
  async function endViva() {
    if (stoppedRef.current || vivaEndedRef.current) return;
    vivaEndedRef.current = true;
    // Briefly borrow the same guard hardStop() uses so recognition's onend handler
    // doesn't try to restart listening (or process leftover partial speech) once we've
    // decided the session is over — then release it so speaking/fetching below can proceed.
    stoppedRef.current = true;
    try {
      recognitionRef.current?.stop();
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
    stoppedRef.current = false;

    setShowSummary(true);
    setVivaSummary(null);
    try {
      await speakText("That wraps up our viva. Let me put together some quick feedback for you.");
    } catch {}
    if (stoppedRef.current) return;
    try {
      const transcriptText = conversationHistory
        .map((entry) => `${entry.role === "user" ? "Student" : "Examiner"}: ${entry.text}`)
        .join("\n");
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: `Here is the transcript of the viva:\n\n${transcriptText}\n\nIn 2-3 sentences, summarize how the student performed overall and name one specific topic they should review.`,
          systemPrompt: "You are an oral examiner writing a short private note to a student after their viva. Be honest, specific, and encouraging. Plain text only, no markdown.",
          model: activeModel,
        }),
      });
      const text = await res.text();
      setVivaSummary(text.trim() || "Good effort today — keep practicing out loud, it really helps for the real exam.");
    } catch (e) {
      console.error("Viva summary failed:", e);
      setVivaSummary("Good effort today — keep practicing out loud, it really helps for the real exam.");
    }
  }

  async function askAndRespond(question) {
    if (stoppedRef.current) return;
    recognitionRef.current?.stop();
    updatePhase("thinking");
    ensureAnalyser();

    const isGeneral = subject === "general";
    const systemPrompt = mode === "viva"
      ? buildVivaSystemPrompt(false)
      : isGeneral
      ? `You are iBuddie, a warm and friendly AI study buddy having a live spoken conversation. Reply the way a supportive friend would speak out loud — natural and conversational, 2-4 sentences unless the student clearly asks for a full detailed explanation. If the student speaks in Kannada, reply in natural Kannada (mixing in English technical terms naturally); otherwise reply in English. Do not use markdown, headers, or any formatting symbols — this will be spoken aloud, not read.`
      : `You are iBuddie, a warm and friendly AI study buddy having a live spoken conversation with a ${exam} student about ${subjectLabel}. Reply the way a supportive senior would speak out loud — natural and conversational, 2-4 sentences unless the student clearly asks for a full detailed explanation. If the student speaks in Kannada, reply in natural Kannada (mixing in English technical terms naturally); otherwise reply in English. Do not use markdown, headers, or any formatting symbols — this will be spoken aloud, not read.`;

    // Snapshot prior turns BEFORE appending this one — Viva mode needs the AI to remember
    // what it already asked so it doesn't repeat itself or lose the thread.
    const historyForRequest = mode === "viva"
      ? conversationHistory.map((entry) => ({ role: entry.role, content: entry.text }))
      : undefined;
    setConversationHistory((prev) => [...prev, { role: "user", text: question }]);

    try {
      const answerText = await streamAndSpeak(question, systemPrompt, historyForRequest);
      if (stoppedRef.current || vivaEndedRef.current) return;
      setConversationHistory((prev) => [...prev, { role: "assistant", text: answerText }]);
      if (mode === "viva") setQuestionCount((n) => n + 1);
    } catch (e) {
      console.error("Voice call ask/speak failed:", e);
      if (stoppedRef.current || vivaEndedRef.current) return;
      const fallbackText = "Sorry, I couldn't reach the server just now. Could you try again?";
      setConversationHistory((prev) => [...prev, { role: "assistant", text: fallbackText }]);
      await speakText(fallbackText);
    }
    if (!stoppedRef.current && !vivaEndedRef.current) startListening();
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

      {mode === "viva" && !showSummary && (
        <div style={{ marginTop: 18, color: "#B8860B", fontSize: 12.5, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase" }}>
          Question {questionCount || 1}
        </div>
      )}

      {showSummary ? (
        <div style={{ marginTop: 20, maxWidth: 420, width: "100%", padding: "0 24px", textAlign: "center" }}>
          <div style={{ color: PAPER, fontSize: 20, fontWeight: 700, marginBottom: 10 }}>🎉 Viva complete</div>
          <div style={{ color: "#8C7D6B", fontSize: 13, marginBottom: 18 }}>{questionCount} question{questionCount === 1 ? "" : "s"} covered</div>
          <div style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 14, padding: 18, color: PAPER, fontSize: 14, lineHeight: 1.6, marginBottom: 24, minHeight: 60 }}>
            {vivaSummary === null ? "Preparing your feedback…" : vivaSummary}
          </div>
          <button
            onClick={handleEndCall}
            style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              background: "#B23B3B", color: "#fff", border: "none",
              padding: "12px 28px", borderRadius: 999, fontSize: 15, fontWeight: 700, cursor: "pointer",
            }}
          >
            Done
          </button>
        </div>
      ) : (
        <>
          <div style={{ marginTop: 12, color: PAPER, fontSize: 18, fontWeight: 700 }}>
            {phase === "error" ? errorMsg : phase === "greeting" && mode === "viva" ? "Starting your viva…" : STATUS_LABEL[phase]}
          </div>

          {lastHeard && phase !== "error" && (
            <div style={{ marginTop: 10, color: "#8C7D6B", fontSize: 14, maxWidth: 420, textAlign: "center" }}>
              "{lastHeard}"
            </div>
          )}

          <button
            onClick={mode === "viva" ? endViva : handleEndCall}
            style={{
              marginTop: 48, display: "flex", alignItems: "center", gap: 8,
              background: "#B23B3B", color: "#fff", border: "none",
              padding: "12px 28px", borderRadius: 999, fontSize: 15, fontWeight: 700, cursor: "pointer",
            }}
          >
            <PhoneOff size={18} />
            {mode === "viva" ? "End Viva" : "End Call"}
          </button>
        </>
      )}

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