import { useEffect, useRef, useState } from "react";
import {
  Loader2, Play, Pause, Presentation, GraduationCap, RotateCcw, XCircle,
  BookOpen, Shapes, ListChecks, Sigma, StickyNote, MessageCircle, Sparkles,
  Send, ChevronDown, ChevronUp, CheckCircle2, Rewind, FastForward, Search, Clock,
} from "lucide-react";
import { ReactiveFace, AvatarKeyframes, PAPER } from "./AvatarWidget.jsx";
import { renderFormula } from "./renderFormula.jsx";
import { DIAGRAM_COMPONENTS } from "./LectureDiagrams.jsx";
import { PUC_SYLLABUS } from "./data/pucSyllabus.js";
import { authHeaders } from "./apiAuth.js";

const INK = "#17140F";
const TEXT = "#2B2018";
const MUTED = "#8C7D6B";
const BORDER = "#E4E2DA";
const GOLD = "#B8860B";
const GOLD_DARK = "#8F6A08";
const RED = "#B23B3B";
const GREEN = "#2F6B4A";

// The one place a different visual treatment fits, per design brief: the board itself
// reuses the app's own ink/paper palette (same as VoiceCallModal's full-screen surface),
// just applied as a full "chalkboard" background instead of button accents.
const BOARD_BG = INK;
const BOARD_TEXT = PAPER;
const BOARD_MUTED = "#9C9082";

const TAB_DEFS = [
  { key: "board", label: "Board", icon: BookOpen, has: (s) => Boolean(s.board || s.slide_bullets?.length) },
  { key: "diagram", label: "Diagram", icon: Shapes, has: (s) => Boolean(s.diagram?.type && DIAGRAM_COMPONENTS[s.diagram.type] && s.diagram.params?.forces?.length > 0) },
  { key: "example", label: "Example", icon: ListChecks, has: (s) => Boolean(s.example) },
  { key: "formula", label: "Formula", icon: Sigma, has: (s) => Boolean(s.formula) },
  { key: "notes", label: "Notes", icon: StickyNote, has: (s) => Boolean(s.notes) },
];

const EXPLAIN_STYLES = [
  { key: "simpler", label: "Simpler Explanation" },
  { key: "real-world", label: "With Real-World Example" },
  { key: "exam", label: "Exam-Oriented" },
  { key: "derivation", label: "Show Derivation" },
];

const SPEEDS = [0.75, 1, 1.25, 1.5, 2];

function formatTime(seconds) {
  if (!isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// Plays a pre-generated lecture (slides + narration audio) like a video, with a three-panel
// "AI Teacher" board view: a left tab rail for the content types a segment actually has,
// a chalkboard-style center card, and a right sidebar with Ask iBuddie + Explain Again.
// Follows the same setup -> loading -> active -> complete pattern used by Mock Test.
//
// The AI Lecture library is built entirely offline (scripts/pregenerate-lectures.js) — this
// component never generates a lecture itself. Its job is: let the student pick a chapter from
// the same syllabus data Mock Test/PYQ Bank use, and either play the existing cached lecture
// for it or say plainly that it isn't ready yet.
export default function AiLecture({ subject, isGeneral, exam }) {
  const [stage, setStage] = useState("setup"); // "setup" | "loading" | "active" | "complete" | "unavailable" | "error"
  const [topic, setTopic] = useState("");
  const [pucYear, setPucYear] = useState("2nd"); // matches the default used by Mock Test / PYQ Bank / Formula Bank
  const [topicDropdownOpen, setTopicDropdownOpen] = useState(false);
  const [availableTopics, setAvailableTopics] = useState(null); // Set of exact topic strings with a cached lecture, or null while unknown
  const [errorMsg, setErrorMsg] = useState("");
  const [lecture, setLecture] = useState(null); // { topic, segments: [...] }
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [needsTapToPlay, setNeedsTapToPlay] = useState(false);
  const [activeTab, setActiveTab] = useState("board");

  const [checkpointAnswers, setCheckpointAnswers] = useState({}); // { [segmentId]: { selectedIndex, correct } }
  const [showCheckpoint, setShowCheckpoint] = useState(false);

  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [autoPlay, setAutoPlay] = useState(true);

  const [askOpen, setAskOpen] = useState(true);
  const [askMessages, setAskMessages] = useState([]); // [{ role: "user"|"assistant", text }]
  const [askInput, setAskInput] = useState("");
  const [askLoading, setAskLoading] = useState(false);

  const [explainOpen, setExplainOpen] = useState(true);
  const [explainLoadingStyle, setExplainLoadingStyle] = useState(null);

  const audioRef = useRef(null);

  // A topic picked for one subject doesn't carry over sensibly if the student switches
  // subjects on the shared top bar — only clears the pending setup-screen selection, never
  // an already-active lecture.
  useEffect(() => {
    setTopic("");
    setTopicDropdownOpen(false);
  }, [subject?.id]);

  // Which chapters already have a pre-generated lecture for this subject+exam — a single
  // read-only Firestore lookup (see api/lecture-library.js), never Anthropic or TTS. Drives
  // the Available/Coming Soon badge on every chapter before the student picks one.
  useEffect(() => {
    if (isGeneral || !subject) return;
    let cancelled = false;
    setAvailableTopics(null);
    fetch("/api/lecture-library", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject: subject.label, exam }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setAvailableTopics(new Set(Array.isArray(data.topics) ? data.topics : []));
      })
      .catch(() => {
        if (!cancelled) setAvailableTopics(new Set());
      });
    return () => { cancelled = true; };
  }, [subject?.label, exam, isGeneral]);

  const topicList = PUC_SYLLABUS[subject?.label]?.[pucYear] || [];
  const filteredTopics = topic.trim()
    ? topicList.filter((t) => t.toLowerCase().includes(topic.trim().toLowerCase()))
    : topicList;
  const isKnownTopic = topicList.includes(topic);
  const isTopicAvailable = availableTopics?.has(topic) ?? false;
  const askScrollRef = useRef(null);

  // Explain Again can take a while (a cold TTS instance can add 30-60s+) and the student
  // may well keep listening/advancing in the meantime. When that slow response finally
  // lands, it must only resume playback if they're STILL on the segment it was for —
  // otherwise it would yank them backward mid-lecture. currentIndex alone isn't enough
  // since it's stale inside the async closure; this ref always holds the live value.
  const currentIndexRef = useRef(0);

  function playSegmentAt(index, segmentData) {
    const audio = audioRef.current;
    if (!audio || !segmentData) return;
    setCurrentIndex(index);
    currentIndexRef.current = index;
    setShowCheckpoint(false);
    setCurrentTime(0);
    setDuration(0);
    setActiveTab((prev) => {
      const available = TAB_DEFS.filter((t) => t.has(segmentData));
      return available.some((t) => t.key === prev) ? prev : (available[0]?.key || "board");
    });
    audio.src = segmentData.audio_url;
    audio.currentTime = 0;
    audio.playbackRate = speed;
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

  // Looks up the exact cached lecture for the selected chapter and plays it. Never reaches
  // this point for a chapter the catalog doesn't already list as available — see
  // selectTopic() below — so this never triggers a live Anthropic or TTS call.
  async function playLecture(selectedTopic) {
    setStage("loading");
    setErrorMsg("");
    setCheckpointAnswers({});
    setAskMessages([]);

    try {
      const res = await fetch("/api/generate-lecture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: subject.label, topic: selectedTopic, exam }),
      });
      const data = await res.json();
      if (!res.ok || !Array.isArray(data.segments)) {
        // The catalog said this was available but the lookup came back empty (a race with
        // the library changing, or a stale catalog fetch) — fail into Coming Soon rather
        // than an opaque error, and never fall back to generating one live.
        setStage("unavailable");
        return;
      }
      setLecture(data);
      setStage("active");
      playSegmentAt(0, data.segments[0]);
    } catch (e) {
      console.error("Loading the lecture failed:", e);
      setErrorMsg(e.message || "Something went wrong loading this lecture.");
      setStage("error");
    }
  }

  function selectTopic(t) {
    setTopic(t);
    setTopicDropdownOpen(false);
  }

  function goToLecture() {
    if (!isKnownTopic) return;
    if (isTopicAvailable) {
      playLecture(topic);
    } else {
      setStage("unavailable");
    }
  }

  // After a segment's audio ends: if it has an unanswered checkpoint, block on that first
  // (regardless of Auto Play) — otherwise either auto-advance or just load the next segment
  // paused, so the existing play button becomes "continue" when Auto Play is off.
  function handleEnded() {
    if (!lecture) return;
    const seg = lecture.segments[currentIndex];
    if (seg.checkpoint && checkpointAnswers[seg.id] === undefined) {
      setShowCheckpoint(true);
      return;
    }
    advanceOrStop();
  }

  function advanceOrStop() {
    const nextIndex = currentIndex + 1;
    if (!lecture || nextIndex >= lecture.segments.length) {
      setStage("complete");
      return;
    }
    if (autoPlay) {
      playSegmentAt(nextIndex, lecture.segments[nextIndex]);
    } else {
      setShowCheckpoint(false);
      setCurrentIndex(nextIndex);
      currentIndexRef.current = nextIndex;
      setCurrentTime(0);
      setDuration(0);
      const audio = audioRef.current;
      if (audio) {
        audio.src = lecture.segments[nextIndex].audio_url;
        audio.currentTime = 0;
      }
    }
  }

  function answerCheckpoint(segmentId, selectedIndex, correctIndex) {
    if (checkpointAnswers[segmentId] !== undefined) return;
    setCheckpointAnswers((prev) => ({ ...prev, [segmentId]: { selectedIndex, correct: selectedIndex === correctIndex } }));
  }

  function continueAfterCheckpoint() {
    setShowCheckpoint(false);
    advanceOrStop();
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

  function skip(deltaSeconds) {
    const audio = audioRef.current;
    if (!audio || !audio.duration) return;
    audio.currentTime = Math.max(0, Math.min(audio.duration, audio.currentTime + deltaSeconds));
  }

  function setPlaybackSpeed(value) {
    setSpeed(value);
    if (audioRef.current) audioRef.current.playbackRate = value;
  }

  async function sendAskQuestion() {
    const question = askInput.trim();
    if (!question || !lecture || askLoading) return;
    const seg = lecture.segments[currentIndex];
    setAskInput("");
    setAskMessages((prev) => [...prev, { role: "user", text: question }]);
    setAskLoading(true);

    const systemPrompt = `You are iBuddie, a helpful AI study assistant. The student is in the middle of an AI-generated lecture on ${subject.label} — "${lecture.topic}"${exam ? ` (${exam} level)` : ""}. They are currently on the segment titled "${seg.slide_title}", which covers: ${seg.board || seg.slide_bullets.join(" ")}. Answer their question about this concept clearly and directly, in 2-5 sentences unless real depth is needed. Plain text only, no markdown, no headers — this is shown in a compact chat panel.`;
    const history = askMessages.map((m) => ({ role: m.role, content: m.text }));

    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({ question, systemPrompt, model: "haiku", history }),
      });
      if (!res.ok || !res.body) throw new Error("Ask iBuddie failed");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let text = "";
      setAskMessages((prev) => [...prev, { role: "assistant", text: "" }]);
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        text += decoder.decode(value, { stream: true });
        setAskMessages((prev) => {
          const next = [...prev];
          next[next.length - 1] = { role: "assistant", text };
          return next;
        });
        if (askScrollRef.current) askScrollRef.current.scrollTop = askScrollRef.current.scrollHeight;
      }
    } catch (e) {
      console.error("Ask iBuddie failed:", e);
      setAskMessages((prev) => [...prev, { role: "assistant", text: "Sorry, I couldn't answer that just now — please try again." }]);
    } finally {
      setAskLoading(false);
    }
  }

  async function requestExplainAgain(styleKey) {
    if (!lecture || explainLoadingStyle) return;
    const requestedIndex = currentIndex;
    const seg = lecture.segments[requestedIndex];
    setExplainLoadingStyle(styleKey);
    try {
      const res = await fetch("/api/explain-segment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: subject.label, topic: lecture.topic, exam, segment: seg, style: styleKey }),
      });
      const data = await res.json();
      if (!res.ok || !data.audio_url) throw new Error(data.error || `Server error (${res.status})`);

      const mergedSegment = { ...seg, ...data };
      setLecture((prev) => ({ ...prev, segments: prev.segments.map((s, i) => (i === requestedIndex ? mergedSegment : s)) }));

      // Only jump playback to the refreshed narration if the student is still on this
      // exact segment — if they've moved on while this was in flight, the content is
      // saved for later (e.g. Watch Again) but their current playback is left alone.
      if (currentIndexRef.current === requestedIndex) {
        playSegmentAt(requestedIndex, mergedSegment);
      }
    } catch (e) {
      console.error("Explain Again failed:", e);
      alert(`Couldn't re-explain this segment: ${e.message}`);
    } finally {
      setExplainLoadingStyle(null);
    }
  }

  function watchAgain() {
    setCheckpointAnswers({});
    setStage("active");
    playSegmentAt(0, lecture.segments[0]);
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
    setCheckpointAnswers({});
    setAskMessages([]);
  }

  const segment = lecture?.segments[currentIndex];
  const availableTabs = segment ? TAB_DEFS.filter((t) => t.has(segment)) : [];
  const effectiveTab = availableTabs.some((t) => t.key === activeTab) ? activeTab : availableTabs[0]?.key;
  const answeredCount = Object.keys(checkpointAnswers).length;
  const correctCount = Object.values(checkpointAnswers).filter((a) => a.correct).length;
  const understandingPct = answeredCount > 0 ? Math.round((correctCount / answeredCount) * 100) : null;

  return (
    <div
      className="ibuddie-chat-card"
      style={{ flex: 1, background: "#FFFFFF", borderRadius: 18, border: `1px solid ${BORDER}`, padding: 28, display: "flex", flexDirection: "column", minHeight: 0, overflowY: "auto" }}
    >
      <style>{`
        .ailecture-topic-option:hover { background: #F9F9F7; }
        @media (max-width: 900px) {
          .ailecture-three-panel { flex-direction: column; }
          .ailecture-rail { flex-direction: row !important; width: 100% !important; overflow-x: auto; }
          .ailecture-rail button { flex-shrink: 0; }
          .ailecture-side { width: 100% !important; }
        }
      `}</style>

      <audio
        ref={audioRef}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={handleEnded}
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        style={{ display: "none" }}
      />

      {isGeneral ? (
        <div style={{ margin: "auto", textAlign: "center", color: MUTED, maxWidth: 320 }}>
          <Presentation size={28} color={GOLD} style={{ marginBottom: 12 }} />
          <div style={{ fontSize: 14.5 }}>Pick a subject (Physics, Chemistry, Biology, or Mathematics) from above to open an AI lecture.</div>
        </div>
      ) : stage === "setup" ? (
        <div style={{ margin: "auto", maxWidth: 440, width: "100%" }}>
          <div style={{ textAlign: "center", marginBottom: 26 }}>
            <Presentation size={26} color={GOLD} style={{ marginBottom: 10 }} />
            <div style={{ fontSize: 17, fontWeight: 700, color: TEXT, marginBottom: 4 }}>{subject.label} AI Lecture</div>
            <div style={{ fontSize: 12.5, color: MUTED }}>Pick a chapter to watch its lecture ({exam} level)</div>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: MUTED }}>Chapter</div>
            <div style={{ display: "flex", gap: 6 }}>
              {[{ id: "1st", label: "1st PUC" }, { id: "2nd", label: "2nd PUC" }].map((p) => (
                <div
                  key={p.id}
                  onMouseDown={(e) => e.preventDefault()} // keep the topic input focused so the dropdown stays open across a PUC year switch
                  onClick={() => { setPucYear(p.id); setTopic(""); }}
                  style={{ padding: "3px 11px", borderRadius: 999, cursor: "pointer", fontSize: 11, fontWeight: 700, border: pucYear === p.id ? `1.5px solid ${GOLD}` : `1px solid ${BORDER}`, background: pucYear === p.id ? "#B8860B14" : "#FFFFFF", color: pucYear === p.id ? GOLD_DARK : TEXT }}
                >
                  {p.label}
                </div>
              ))}
            </div>
          </div>

          <div style={{ position: "relative", marginBottom: 22 }}>
            <Search size={15} color={MUTED} style={{ position: "absolute", left: 13, top: 13.5, pointerEvents: "none" }} />
            <input
              value={topic}
              onChange={(e) => { setTopic(e.target.value); setTopicDropdownOpen(true); }}
              onFocus={() => setTopicDropdownOpen(true)}
              onBlur={() => setTimeout(() => setTopicDropdownOpen(false), 150)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && isKnownTopic) { setTopicDropdownOpen(false); goToLecture(); }
                if (e.key === "Escape") setTopicDropdownOpen(false);
              }}
              placeholder={`Search ${subject.label} chapters…`}
              style={{ width: "100%", padding: "12px 14px 12px 36px", borderRadius: 10, border: `1px solid ${BORDER}`, fontSize: 14, color: TEXT, boxSizing: "border-box", fontFamily: "inherit" }}
            />
            {topicDropdownOpen && (
              <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, background: "#FFFFFF", border: `1px solid ${BORDER}`, borderRadius: 10, boxShadow: "0 8px 24px rgba(20,15,5,0.14)", maxHeight: 260, overflowY: "auto", zIndex: 5 }}>
                {filteredTopics.length > 0 ? (
                  filteredTopics.map((t) => {
                    const available = availableTopics?.has(t) ?? null; // null while the catalog is still loading
                    return (
                      <div
                        key={t}
                        className="ailecture-topic-option"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => selectTopic(t)}
                        style={{ padding: "10px 14px", fontSize: 13.5, color: TEXT, cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}
                      >
                        <span>{t}</span>
                        {available === true ? (
                          <span style={{ fontSize: 10, fontWeight: 700, color: GREEN, whiteSpace: "nowrap" }}>Available</span>
                        ) : available === false ? (
                          <span style={{ fontSize: 10, fontWeight: 700, color: MUTED, whiteSpace: "nowrap" }}>Coming Soon</span>
                        ) : null}
                      </div>
                    );
                  })
                ) : (
                  <div style={{ padding: "10px 14px", fontSize: 12, color: MUTED }}>
                    No matching {subject.label} chapter for {pucYear} PUC.
                  </div>
                )}
              </div>
            )}
          </div>

          <button
            onClick={goToLecture}
            disabled={!isKnownTopic}
            style={{
              width: "100%", padding: "13px 0", borderRadius: 12, border: "none",
              background: isKnownTopic ? INK : BORDER, color: "#fff", fontWeight: 700, fontSize: 14.5,
              cursor: isKnownTopic ? "pointer" : "not-allowed",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            }}
          >
            <GraduationCap size={17} /> {isKnownTopic && !isTopicAvailable ? "View Chapter" : "Play Lecture"}
          </button>
        </div>
      ) : stage === "loading" ? (
        <div style={{ margin: "auto", textAlign: "center", color: MUTED, maxWidth: 340 }}>
          <Loader2 size={28} color={GOLD} style={{ animation: "spin 1s linear infinite", marginBottom: 14 }} />
          <div style={{ fontSize: 14.5, fontWeight: 600, color: TEXT, marginBottom: 6 }}>Loading your lecture…</div>
          <div style={{ fontSize: 12.5, color: MUTED }}>Fetching "{topic}" from the lecture library.</div>
        </div>
      ) : stage === "unavailable" ? (
        <div style={{ margin: "auto", textAlign: "center", color: MUTED, maxWidth: 360 }}>
          <Clock size={28} color={GOLD} style={{ marginBottom: 12 }} />
          <div style={{ fontSize: 14.5, fontWeight: 600, color: TEXT, marginBottom: 8 }}>Coming Soon</div>
          <div style={{ fontSize: 12.5, color: MUTED, marginBottom: 18, lineHeight: 1.6 }}>
            "{topic}" isn't in the AI Lecture library yet for {exam}. Pick another chapter, or check back later.
          </div>
          <button
            onClick={() => setStage("setup")}
            style={{ padding: "10px 22px", borderRadius: 10, border: `1px solid ${BORDER}`, background: "#FFFFFF", color: TEXT, fontWeight: 700, fontSize: 13.5, cursor: "pointer" }}
          >
            Choose Another Chapter
          </button>
        </div>
      ) : stage === "error" ? (
        <div style={{ margin: "auto", textAlign: "center", color: MUTED, maxWidth: 340 }}>
          <XCircle size={28} color={RED} style={{ marginBottom: 12 }} />
          <div style={{ fontSize: 14.5, fontWeight: 600, color: TEXT, marginBottom: 8 }}>Couldn't load this lecture</div>
          <div style={{ fontSize: 12.5, color: MUTED, marginBottom: 18 }}>{errorMsg}</div>
          <button
            onClick={() => setStage("setup")}
            style={{ padding: "10px 22px", borderRadius: 10, border: `1px solid ${BORDER}`, background: "#FFFFFF", color: TEXT, fontWeight: 700, fontSize: 13.5, cursor: "pointer" }}
          >
            Try Again
          </button>
        </div>
      ) : stage === "active" && segment ? (
        <div style={{ maxWidth: 1180, margin: "0 auto", width: "100%" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: MUTED }}>Segment {currentIndex + 1} of {lecture.segments.length}</div>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: GOLD_DARK }}>{lecture.topic}</div>
          </div>
          <div style={{ height: 4, background: "#F2F2F0", borderRadius: 999, marginBottom: 10, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${((currentIndex + 1) / lecture.segments.length) * 100}%`, background: GOLD, transition: "width 0.3s ease" }} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 20 }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: understandingPct === null ? "#C7C2B6" : understandingPct >= 70 ? GREEN : understandingPct >= 40 ? GOLD : RED }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: MUTED }}>
              Lecture Understanding: {answeredCount < 2 ? "Building understanding…" : `${understandingPct}%`}
            </span>
            {answeredCount > 0 && (
              <span style={{ fontSize: 10.5, color: "#B0A28C" }}>(session estimate from {answeredCount} quick check{answeredCount === 1 ? "" : "s"})</span>
            )}
          </div>

          <div className="ailecture-three-panel" style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
            {/* LEFT: content-type tab rail */}
            <div className="ailecture-rail" style={{ display: "flex", flexDirection: "column", gap: 8, width: 72, flexShrink: 0 }}>
              {availableTabs.map((tab) => {
                const isActive = tab.key === effectiveTab;
                return (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    style={{
                      display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                      padding: "10px 4px", borderRadius: 10, cursor: "pointer",
                      border: isActive ? "none" : `1px solid ${BORDER}`,
                      background: isActive ? INK : "#FFFFFF", color: isActive ? "#fff" : MUTED,
                      fontSize: 9.5, fontWeight: 700,
                    }}
                  >
                    <tab.icon size={17} />
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {/* CENTER: chalkboard content card + controls + presenter */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ background: BOARD_BG, borderRadius: 16, padding: "26px 26px", minHeight: 300, marginBottom: 18 }}>
                {!showCheckpoint && (
                  <div style={{ fontSize: 19, fontWeight: 800, color: "#fff", marginBottom: 18, lineHeight: 1.3 }}>{segment.slide_title}</div>
                )}

                {showCheckpoint ? (
                  <div data-testid="lecture-checkpoint">
                    <div style={{ fontSize: 11, fontWeight: 700, color: GOLD, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 14 }}>Quick Check</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: BOARD_TEXT, marginBottom: 18, lineHeight: 1.4 }}>{segment.checkpoint.question}</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
                      {segment.checkpoint.options.map((opt, oi) => {
                        const answer = checkpointAnswers[segment.id];
                        const answered = answer !== undefined;
                        const isSelected = answer?.selectedIndex === oi;
                        const isCorrectOpt = oi === segment.checkpoint.correctIndex;
                        let bg = "rgba(255,255,255,0.06)", border = "rgba(255,255,255,0.16)";
                        if (answered && isCorrectOpt) { bg = "rgba(47,107,74,0.28)"; border = GREEN; }
                        else if (answered && isSelected && !isCorrectOpt) { bg = "rgba(178,59,59,0.28)"; border = RED; }
                        return (
                          <div
                            key={oi}
                            data-testid="checkpoint-option"
                            onClick={() => !answered && answerCheckpoint(segment.id, oi, segment.checkpoint.correctIndex)}
                            style={{ padding: "12px 14px", borderRadius: 10, border: `1.5px solid ${border}`, background: bg, color: BOARD_TEXT, cursor: answered ? "default" : "pointer", fontSize: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}
                          >
                            {opt}
                            {answered && isCorrectOpt && <CheckCircle2 size={16} color={GREEN} />}
                            {answered && isSelected && !isCorrectOpt && <XCircle size={16} color={RED} />}
                          </div>
                        );
                      })}
                    </div>
                    {checkpointAnswers[segment.id] && (
                      <>
                        <div style={{ fontSize: 13, color: checkpointAnswers[segment.id].correct ? "#7FBF9E" : "#E08A8A", fontWeight: 700, marginBottom: 6 }}>
                          {checkpointAnswers[segment.id].correct ? "Correct!" : "Not quite."}
                        </div>
                        <div style={{ fontSize: 12.5, color: BOARD_MUTED, lineHeight: 1.5, marginBottom: 18 }}>{segment.checkpoint.explanation}</div>
                        <button
                          data-testid="checkpoint-continue"
                          onClick={continueAfterCheckpoint}
                          style={{ padding: "10px 22px", borderRadius: 10, border: "none", background: GOLD, color: INK, fontWeight: 700, fontSize: 13.5, cursor: "pointer" }}
                        >
                          Continue
                        </button>
                      </>
                    )}
                  </div>
                ) : effectiveTab === "board" ? (
                  <div>
                    {segment.board && <div style={{ fontSize: 14.5, lineHeight: 1.7, color: BOARD_TEXT, marginBottom: 16 }}>{segment.board}</div>}
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {segment.slide_bullets.map((bullet, i) => (
                        <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                          <div style={{ width: 6, height: 6, borderRadius: "50%", background: GOLD, marginTop: 8, flexShrink: 0 }} />
                          <div style={{ fontSize: 14.5, lineHeight: 1.6, color: BOARD_TEXT }}>{bullet}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : effectiveTab === "diagram" ? (
                  (() => {
                    const DiagramComp = DIAGRAM_COMPONENTS[segment.diagram?.type];
                    return DiagramComp ? (
                      <div style={{ background: PAPER, borderRadius: 14, padding: 18 }}>
                        <DiagramComp params={segment.diagram.params} />
                      </div>
                    ) : (
                      <div style={{ color: BOARD_MUTED, fontSize: 13 }}>Diagram unavailable.</div>
                    );
                  })()
                ) : effectiveTab === "example" ? (
                  <div>
                    {segment.example.title && <div style={{ fontSize: 14, fontWeight: 700, color: GOLD, marginBottom: 14 }}>{segment.example.title}</div>}
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {segment.example.steps?.map((step, i) => (
                        <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                          <div style={{ width: 20, height: 20, borderRadius: "50%", background: "rgba(184,134,11,0.25)", color: GOLD, fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>
                            {i + 1}
                          </div>
                          <div style={{ fontSize: 14, lineHeight: 1.6, color: BOARD_TEXT }}>{renderFormula(step)}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : effectiveTab === "formula" ? (
                  <div style={{ textAlign: "center", padding: "10px 4px" }}>
                    <div style={{ fontSize: 23, fontWeight: 800, color: GOLD, marginBottom: 20, fontFamily: "'SF Mono', Consolas, monospace" }}>
                      {renderFormula(segment.formula.expression)}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, textAlign: "left", maxWidth: 340, margin: "0 auto" }}>
                      {segment.formula.variables?.map((v, i) => (
                        <div key={i} style={{ display: "flex", gap: 8, fontSize: 13 }}>
                          <span style={{ fontWeight: 700, color: GOLD, minWidth: 30 }}>{renderFormula(v.symbol)}</span>
                          <span style={{ color: BOARD_MUTED }}>{v.meaning}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : effectiveTab === "notes" ? (
                  <div style={{ borderLeft: `3px solid ${GOLD}`, background: "rgba(184,134,11,0.1)", padding: "14px 16px", borderRadius: 8, fontSize: 13.5, lineHeight: 1.6, color: BOARD_TEXT }}>
                    {segment.notes}
                  </div>
                ) : null}
              </div>

              {!showCheckpoint && (
                <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 11, color: MUTED, width: 32, textAlign: "right" }}>{formatTime(currentTime)}</span>
                    <input
                      type="range"
                      min={0}
                      max={duration || 0}
                      step={0.1}
                      value={Math.min(currentTime, duration || 0)}
                      onChange={(e) => {
                        const t = Number(e.target.value);
                        setCurrentTime(t);
                        if (audioRef.current) audioRef.current.currentTime = t;
                      }}
                      style={{ flex: 1, accentColor: GOLD }}
                    />
                    <span style={{ fontSize: 11, color: MUTED, width: 32 }}>{formatTime(duration)}</span>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 22 }}>
                    <button onClick={() => skip(-10)} title="Back 10 seconds" style={{ background: "none", border: "none", cursor: "pointer", color: TEXT, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                      <Rewind size={19} />
                      <span style={{ fontSize: 9, fontWeight: 700, color: MUTED }}>10s</span>
                    </button>
                    <button
                      onClick={togglePlayPause}
                      style={{ width: 56, height: 56, borderRadius: "50%", border: "none", background: INK, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
                    >
                      {isPlaying ? <Pause size={22} fill="#fff" /> : <Play size={22} fill="#fff" style={{ marginLeft: 2 }} />}
                    </button>
                    <button onClick={() => skip(10)} title="Forward 10 seconds" style={{ background: "none", border: "none", cursor: "pointer", color: TEXT, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                      <FastForward size={19} />
                      <span style={{ fontSize: 9, fontWeight: 700, color: MUTED }}>10s</span>
                    </button>
                  </div>

                  <div style={{ display: "flex", justifyContent: "center", gap: 6, flexWrap: "wrap" }}>
                    {SPEEDS.map((v) => (
                      <button
                        key={v}
                        onClick={() => setPlaybackSpeed(v)}
                        style={{ padding: "5px 10px", borderRadius: 999, fontSize: 11.5, fontWeight: 700, cursor: "pointer", border: speed === v ? `1.5px solid ${GOLD}` : `1px solid ${BORDER}`, background: speed === v ? "#B8860B1F" : "#FFFFFF", color: speed === v ? GOLD_DARK : MUTED }}
                      >
                        {v}x
                      </button>
                    ))}
                    <button
                      onClick={() => setAutoPlay((v) => !v)}
                      style={{ padding: "5px 12px", borderRadius: 999, fontSize: 11.5, fontWeight: 700, cursor: "pointer", border: autoPlay ? `1.5px solid ${GOLD}` : `1px solid ${BORDER}`, background: autoPlay ? "#B8860B1F" : "#FFFFFF", color: autoPlay ? GOLD_DARK : MUTED }}
                    >
                      Auto Play {autoPlay ? "On" : "Off"}
                    </button>
                  </div>

                  {needsTapToPlay && (
                    <div style={{ textAlign: "center", fontSize: 12.5, color: MUTED }}>Tap play to start the narration.</div>
                  )}
                  <div style={{ textAlign: "center", fontSize: 10.5, color: "#B0A28C" }}>Scrubber covers this segment's clip only — segments are separate audio files, not one continuous track.</div>
                </div>
              )}

              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                <div
                  style={{
                    width: 52, height: 52, borderRadius: "50%", background: INK, display: "flex", alignItems: "center", justifyContent: "center",
                    boxShadow: isPlaying ? `0 0 0 5px ${GOLD}22` : "0 2px 8px rgba(0,0,0,0.15)",
                    animation: isPlaying ? "avatarBob 1.8s ease-in-out infinite" : "none",
                  }}
                >
                  <ReactiveFace size={30} isSpeaking={isPlaying} />
                </div>
                <div style={{ fontSize: 10, fontWeight: 700, color: MUTED, letterSpacing: "0.05em", textTransform: "uppercase" }}>AI Teacher</div>
              </div>
              <AvatarKeyframes />
            </div>

            {/* RIGHT: Ask iBuddie + Explain Again */}
            <div className="ailecture-side" style={{ width: 250, flexShrink: 0, display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ border: `1px solid ${BORDER}`, borderRadius: 14, background: "#FFFFFF", overflow: "hidden" }}>
                <div onClick={() => setAskOpen((v) => !v)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px", cursor: "pointer" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 700, color: TEXT }}>
                    <MessageCircle size={15} color={GOLD_DARK} /> Ask iBuddie
                  </div>
                  {askOpen ? <ChevronUp size={15} color={MUTED} /> : <ChevronDown size={15} color={MUTED} />}
                </div>
                {askOpen && (
                  <div style={{ borderTop: `1px solid ${BORDER}`, padding: 12 }}>
                    <div ref={askScrollRef} style={{ maxHeight: 220, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8, marginBottom: 10 }}>
                      {askMessages.length === 0 && <div style={{ fontSize: 12, color: MUTED }}>Ask a question about this segment — I have its context.</div>}
                      {askMessages.map((m, i) => (
                        <div
                          key={i}
                          style={{ alignSelf: m.role === "user" ? "flex-end" : "flex-start", maxWidth: "92%", background: m.role === "user" ? INK : "#F2F2F0", color: m.role === "user" ? "#fff" : TEXT, padding: "8px 10px", borderRadius: 10, fontSize: 12.5, lineHeight: 1.5, whiteSpace: "pre-wrap" }}
                        >
                          {m.text}
                        </div>
                      ))}
                      {askLoading && (
                        <div style={{ fontSize: 12, color: MUTED, display: "flex", alignItems: "center", gap: 5 }}>
                          <Loader2 size={12} style={{ animation: "spin 0.8s linear infinite" }} /> Thinking…
                        </div>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <input
                        value={askInput}
                        onChange={(e) => setAskInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter" && askInput.trim()) sendAskQuestion(); }}
                        placeholder="Ask about this concept…"
                        style={{ flex: 1, minWidth: 0, padding: "8px 10px", borderRadius: 8, border: `1px solid ${BORDER}`, fontSize: 12.5, fontFamily: "inherit" }}
                      />
                      <button
                        onClick={sendAskQuestion}
                        disabled={!askInput.trim() || askLoading}
                        style={{ width: 34, height: 34, flexShrink: 0, borderRadius: 8, border: "none", background: askInput.trim() ? INK : BORDER, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: askInput.trim() ? "pointer" : "default" }}
                      >
                        <Send size={14} />
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div style={{ border: `1px solid ${BORDER}`, borderRadius: 14, background: "#FFFFFF", overflow: "hidden" }}>
                <div onClick={() => setExplainOpen((v) => !v)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px", cursor: "pointer" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 700, color: TEXT }}>
                    <Sparkles size={15} color={GOLD_DARK} /> Explain Again
                  </div>
                  {explainOpen ? <ChevronUp size={15} color={MUTED} /> : <ChevronDown size={15} color={MUTED} />}
                </div>
                {explainOpen && (
                  <div style={{ borderTop: `1px solid ${BORDER}`, padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                    {EXPLAIN_STYLES.map((s) => (
                      <button
                        key={s.key}
                        onClick={() => requestExplainAgain(s.key)}
                        disabled={explainLoadingStyle !== null}
                        style={{ padding: "9px 12px", borderRadius: 9, border: `1px solid ${BORDER}`, background: explainLoadingStyle === s.key ? "#F2F2F0" : "#FFFFFF", color: TEXT, fontSize: 12.5, fontWeight: 600, cursor: explainLoadingStyle ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "space-between" }}
                      >
                        {s.label}
                        {explainLoadingStyle === s.key && <Loader2 size={13} style={{ animation: "spin 0.8s linear infinite" }} />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : stage === "complete" ? (
        <div style={{ margin: "auto", textAlign: "center", maxWidth: 380, width: "100%" }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>🎉</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: TEXT, marginBottom: 6 }}>Lecture complete</div>
          <div style={{ fontSize: 13, color: MUTED, marginBottom: 20 }}>{lecture.topic} · {lecture.segments.length} segments</div>

          <div style={{ background: "#F9F9F7", border: `1px solid ${BORDER}`, borderRadius: 12, padding: 16, marginBottom: 22, textAlign: "left" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 8 }}>
              <span style={{ color: MUTED }}>Concepts covered</span>
              <span style={{ fontWeight: 700, color: TEXT }}>{lecture.segments.length}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 8 }}>
              <span style={{ color: MUTED }}>Understanding (session estimate)</span>
              <span style={{ fontWeight: 700, color: TEXT }}>{answeredCount > 0 ? `${understandingPct}%` : "N/A"}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: lecture.segments.some((s) => s.formula) ? 12 : 0 }}>
              <span style={{ color: MUTED }}>Quick checks correct</span>
              <span style={{ fontWeight: 700, color: TEXT }}>{correctCount}/{answeredCount}</span>
            </div>
            {(() => {
              const formulas = [...new Set(lecture.segments.filter((s) => s.formula).map((s) => s.formula.expression))];
              if (formulas.length === 0) return null;
              return (
                <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: 8 }}>Key formulas</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {formulas.map((f, i) => (
                      <div key={i} style={{ fontSize: 13.5, fontFamily: "'SF Mono', Consolas, monospace", color: TEXT }}>{renderFormula(f)}</div>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>

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
