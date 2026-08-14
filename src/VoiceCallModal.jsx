import { useEffect, useRef, useState } from "react";
import { PhoneOff } from "lucide-react";
import { ReactiveFace, AvatarKeyframes, INK, PAPER } from "./AvatarWidget.jsx";

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

export default function VoiceCallModal({ open, onClose, voiceLang, subject, exam, subjectLabel, activeModel }) {
  const [phase, setPhase] = useState("greeting");
  const [lastHeard, setLastHeard] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const phaseRef = useRef("greeting");
  const stoppedRef = useRef(false);
  const recognitionRef = useRef(null);
  const silenceTimerRef = useRef(null);
  const finalTranscriptRef = useRef("");
  const deliberateStopRef = useRef(false);
  const currentUtteranceRef = useRef(null);

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
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    try {
      recognitionRef.current?.stop();
    } catch {}
    window.speechSynthesis?.cancel();
  }

  function handleEndCall() {
    hardStop();
    onClose();
  }

  // Speaks a list of sentences back-to-back on the free browser voice, one at a time,
  // resolving once the last one finishes. No network calls, no cost.
  function speakSentences(sentences) {
    return new Promise((resolve) => {
      if (!window.speechSynthesis || sentences.length === 0) {
        resolve();
        return;
      }
      let index = 0;
      function speakNext() {
        if (stoppedRef.current || index >= sentences.length) {
          resolve();
          return;
        }
        const utterance = new SpeechSynthesisUtterance(sentences[index]);
        utterance.lang = voiceLang;
        utterance.rate = 0.95;
        currentUtteranceRef.current = utterance;
        index++;
        utterance.onend = speakNext;
        utterance.onerror = speakNext;
        window.speechSynthesis.speak(utterance);
      }
      speakNext();
    });
  }

  async function speakText(text) {
    if (stoppedRef.current) return;
    updatePhase("speaking");
    await speakSentences([text]); // one known, complete string — no need to split it
  }

  async function runGreeting() {
    await speakText(GREETINGS[voiceLang] || GREETINGS["en-IN"]);
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
    finalTranscriptRef.current = carryOverText ? carryOverText + " " : "";
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
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const piece = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalTranscriptRef.current += piece + " ";
        else interim += piece;
      }
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
        startListening();
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
      let spokenAnySentence = false;
      let speakChain = Promise.resolve();

      // Peel off complete sentences as they stream in and start speaking them right
      // away — we don't wait for the whole reply to finish generating first, which is
      // what made this feel slow before. speakChain keeps them playing strictly in order.
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
          if (sentence) {
            if (!spokenAnySentence) {
              spokenAnySentence = true;
              updatePhase("speaking");
            }
            speakChain = speakChain.then(() => (stoppedRef.current ? undefined : speakSentences([sentence])));
          }
        }
      }
      const trailing = buffer.trim();
      if (trailing) {
        if (!spokenAnySentence) updatePhase("speaking");
        speakChain = speakChain.then(() => (stoppedRef.current ? undefined : speakSentences([trailing])));
      }

      if (stoppedRef.current) return;

      if (!spokenAnySentence && !trailing) {
        await speakText(fullText.trim() || "Sorry, I didn't catch that clearly — could you say it again?");
      } else {
        await speakChain;
      }
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
      <ReactiveFace size={200} isSpeaking={phase === "speaking"} analyserRef={null} />

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
    </div>
  );
}