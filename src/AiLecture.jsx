import { useRef, useState } from "react";
import { Loader2, Play, Pause, Presentation, GraduationCap, RotateCcw, XCircle } from "lucide-react";

const INK = "#17140F";
const TEXT = "#2B2018";
const MUTED = "#8C7D6B";
const BORDER = "#E4E2DA";
const GOLD = "#B8860B";
const GOLD_DARK = "#8F6A08";
const RED = "#B23B3B";

// Plays a generated lecture (slides + narration audio) like a video: shows the current
// segment's slide, plays its audio, and auto-advances when that audio ends. Follows the
// same setup -> loading -> active -> complete pattern used by Mock Test / Study Plan.
export default function AiLecture({ subject, isGeneral, exam }) {
  const [stage, setStage] = useState("setup"); // "setup" | "loading" | "active" | "complete" | "error"
  const [topic, setTopic] = useState("");
  const [loadingPhase, setLoadingPhase] = useState("script"); // "script" | "audio"
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");
  const [lecture, setLecture] = useState(null); // { topic, segments: [{ id, slide_title, slide_bullets, narration, audio_url }] }
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [needsTapToPlay, setNeedsTapToPlay] = useState(false);

  const audioRef = useRef(null);
  const elapsedTimerRef = useRef(null);

  function playSegmentAt(index, lectureData) {
    const audio = audioRef.current;
    if (!audio || !lectureData?.segments[index]) return;
    setCurrentIndex(index);
    audio.src = lectureData.segments[index].audio_url;
    audio.currentTime = 0;
    audio.play().then(() => setNeedsTapToPlay(false)).catch((err) => {
      // AbortError just means play() was interrupted by a pause()/src change that happened
      // before it resolved (e.g. the student paused right as a segment started) — benign,
      // and audio's own onPause handler already reflects the real state. Only a genuine
      // NotAllowedError means the browser actually blocked autoplay.
      if (err?.name === "NotAllowedError") {
        setIsPlaying(false);
        setNeedsTapToPlay(true);
      }
    });
  }

  async function generateLecture() {
    const trimmedTopic = topic.trim();
    if (!trimmedTopic || !subject) return;

    setStage("loading");
    setLoadingPhase("script");
    setErrorMsg("");
    setElapsedSeconds(0);
    clearInterval(elapsedTimerRef.current);
    elapsedTimerRef.current = setInterval(() => setElapsedSeconds((s) => s + 1), 1000);

    try {
      const scriptRes = await fetch("/api/generate-lecture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: subject.label, topic: trimmedTopic, exam }),
      });
      const scriptData = await scriptRes.json();
      if (!scriptRes.ok || !Array.isArray(scriptData.segments)) {
        throw new Error(scriptData.error || `Server error (${scriptRes.status})`);
      }

      // A cached lecture already carries a playable audio_url on every segment — skip the
      // audio-generation call entirely rather than re-synthesizing narration that already exists.
      if (scriptData.cached) {
        clearInterval(elapsedTimerRef.current);
        setLecture(scriptData);
        setStage("active");
        playSegmentAt(0, scriptData);
        return;
      }

      setLoadingPhase("audio");
      const audioRes = await fetch("/api/generate-lecture-audio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(scriptData),
      });
      const audioData = await audioRes.json();
      if (!audioRes.ok || !Array.isArray(audioData.segments)) {
        throw new Error(audioData.error || `Server error (${audioRes.status})`);
      }

      clearInterval(elapsedTimerRef.current);
      setLecture(audioData);
      setStage("active");
      playSegmentAt(0, audioData);
    } catch (e) {
      console.error("AI Lecture generation failed:", e);
      clearInterval(elapsedTimerRef.current);
      setErrorMsg(e.message || "Something went wrong generating this lecture.");
      setStage("error");
    }
  }

  function handleEnded() {
    if (!lecture) return;
    const nextIndex = currentIndex + 1;
    if (nextIndex >= lecture.segments.length) {
      setStage("complete");
      return;
    }
    playSegmentAt(nextIndex, lecture);
  }

  function togglePlayPause() {
    const audio = audioRef.current;
    if (!audio || !audio.src) return;
    if (audio.paused) {
      audio.play().then(() => setNeedsTapToPlay(false)).catch(() => {});
    } else {
      audio.pause();
    }
  }

  function watchAgain() {
    setStage("active");
    playSegmentAt(0, lecture);
  }

  function startOver() {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
    }
    setStage("setup");
    setLecture(null);
    setCurrentIndex(0);
    setTopic("");
    setNeedsTapToPlay(false);
  }

  const segment = lecture?.segments[currentIndex];

  return (
    <div
      className="ibuddie-chat-card"
      style={{ flex: 1, background: "#FFFFFF", borderRadius: 18, border: `1px solid ${BORDER}`, padding: 28, display: "flex", flexDirection: "column", minHeight: 0, overflowY: "auto" }}
    >
      <audio
        ref={audioRef}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={handleEnded}
        style={{ display: "none" }}
      />

      {isGeneral ? (
        <div style={{ margin: "auto", textAlign: "center", color: MUTED, maxWidth: 320 }}>
          <Presentation size={28} color={GOLD} style={{ marginBottom: 12 }} />
          <div style={{ fontSize: 14.5 }}>Pick a subject (Physics, Chemistry, Biology, or Mathematics) from above to generate an AI lecture.</div>
        </div>
      ) : stage === "setup" ? (
        <div style={{ margin: "auto", maxWidth: 440, width: "100%" }}>
          <div style={{ textAlign: "center", marginBottom: 26 }}>
            <Presentation size={26} color={GOLD} style={{ marginBottom: 10 }} />
            <div style={{ fontSize: 17, fontWeight: 700, color: TEXT, marginBottom: 4 }}>{subject.label} AI Lecture</div>
            <div style={{ fontSize: 12.5, color: MUTED }}>A short spoken lecture with slides, generated just for your topic</div>
          </div>

          <div style={{ fontSize: 12.5, fontWeight: 600, color: MUTED, marginBottom: 10 }}>Topic</div>
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && topic.trim()) generateLecture(); }}
            placeholder="e.g. Newton's Laws of Motion"
            style={{ width: "100%", padding: "12px 14px", borderRadius: 10, border: `1px solid ${BORDER}`, fontSize: 14, color: TEXT, boxSizing: "border-box", marginBottom: 22, fontFamily: "inherit" }}
          />

          <button
            onClick={generateLecture}
            disabled={!topic.trim()}
            style={{
              width: "100%", padding: "13px 0", borderRadius: 12, border: "none",
              background: topic.trim() ? INK : BORDER, color: "#fff", fontWeight: 700, fontSize: 14.5,
              cursor: topic.trim() ? "pointer" : "not-allowed",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            }}
          >
            <GraduationCap size={17} /> Generate Lecture
          </button>
        </div>
      ) : stage === "loading" ? (
        <div style={{ margin: "auto", textAlign: "center", color: MUTED, maxWidth: 340 }}>
          <Loader2 size={28} color={GOLD} style={{ animation: "spin 1s linear infinite", marginBottom: 14 }} />
          <div style={{ fontSize: 14.5, fontWeight: 600, color: TEXT, marginBottom: 6 }}>
            {loadingPhase === "script" ? "Writing your lecture…" : "Recording the narration…"}
          </div>
          <div style={{ fontSize: 12.5, color: MUTED, marginBottom: 4 }}>
            {loadingPhase === "script"
              ? `Planning how to teach "${topic.trim()}" step by step.`
              : "Turning each slide into spoken audio. This can take a couple of minutes."}
          </div>
          <div style={{ fontSize: 11.5, color: "#B0A28C" }}>{elapsedSeconds}s elapsed</div>
        </div>
      ) : stage === "error" ? (
        <div style={{ margin: "auto", textAlign: "center", color: MUTED, maxWidth: 340 }}>
          <XCircle size={28} color={RED} style={{ marginBottom: 12 }} />
          <div style={{ fontSize: 14.5, fontWeight: 600, color: TEXT, marginBottom: 8 }}>Couldn't generate this lecture</div>
          <div style={{ fontSize: 12.5, color: MUTED, marginBottom: 18 }}>{errorMsg}</div>
          <button
            onClick={() => setStage("setup")}
            style={{ padding: "10px 22px", borderRadius: 10, border: `1px solid ${BORDER}`, background: "#FFFFFF", color: TEXT, fontWeight: 700, fontSize: 13.5, cursor: "pointer" }}
          >
            Try Again
          </button>
        </div>
      ) : stage === "active" && segment ? (
        <div style={{ maxWidth: 640, margin: "0 auto", width: "100%" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: MUTED }}>Segment {currentIndex + 1} of {lecture.segments.length}</div>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: GOLD_DARK }}>{lecture.topic}</div>
          </div>
          <div style={{ height: 4, background: "#F2F2F0", borderRadius: 999, marginBottom: 24, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${((currentIndex + 1) / lecture.segments.length) * 100}%`, background: GOLD, transition: "width 0.3s ease" }} />
          </div>

          <div style={{ background: "#FFFFFF", border: `1.5px solid ${BORDER}`, borderRadius: 16, padding: "32px 28px", minHeight: 260, marginBottom: 24 }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: TEXT, marginBottom: 18, lineHeight: 1.35 }}>
              {segment.slide_title}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {segment.slide_bullets.map((bullet, i) => (
                <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: GOLD, marginTop: 8, flexShrink: 0 }} />
                  <div style={{ fontSize: 15, lineHeight: 1.6, color: TEXT }}>{bullet}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
            <button
              onClick={togglePlayPause}
              style={{ width: 56, height: 56, borderRadius: "50%", border: "none", background: INK, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
            >
              {isPlaying ? <Pause size={22} fill="#fff" /> : <Play size={22} fill="#fff" style={{ marginLeft: 2 }} />}
            </button>
            {needsTapToPlay && (
              <div style={{ fontSize: 12.5, color: MUTED }}>Tap play to start the narration.</div>
            )}
          </div>
        </div>
      ) : stage === "complete" ? (
        <div style={{ margin: "auto", textAlign: "center", maxWidth: 360 }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>🎉</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: TEXT, marginBottom: 6 }}>Lecture complete</div>
          <div style={{ fontSize: 13, color: MUTED, marginBottom: 26 }}>{lecture.topic} · {lecture.segments.length} segments</div>
          <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
            <button
              onClick={watchAgain}
              style={{ padding: "11px 20px", borderRadius: 10, border: `1px solid ${BORDER}`, background: "#FFFFFF", color: TEXT, fontWeight: 700, fontSize: 13.5, cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}
            >
              <RotateCcw size={15} /> Watch Again
            </button>
            <button
              onClick={startOver}
              style={{ padding: "11px 20px", borderRadius: 10, border: "none", background: INK, color: "#fff", fontWeight: 700, fontSize: 13.5, cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}
            >
              <GraduationCap size={15} /> New Lecture
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
