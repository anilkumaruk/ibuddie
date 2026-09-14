import { useEffect, useRef, useState } from "react";
import { Loader2, Play, Pause, Presentation, GraduationCap, RotateCcw, XCircle, Search, Clock } from "lucide-react";
import { PUC_SYLLABUS } from "./data/pucSyllabus.js";

const INK = "#17140F";
const TEXT = "#2B2018";
const MUTED = "#8C7D6B";
const BORDER = "#E4E2DA";
const GOLD = "#B8860B";
const GOLD_DARK = "#8F6A08";
const RED = "#B23B3B";
const GREEN = "#2F6B4A";

// Plays a pre-generated lecture (slides + narration audio) like a video: shows the current
// segment's slide, plays its audio, and auto-advances when that audio ends. Follows the
// same setup -> loading -> active -> complete pattern used by Mock Test / Study Plan.
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
  const [lecture, setLecture] = useState(null); // { topic, segments: [{ id, slide_title, slide_bullets, narration, audio_url }] }
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [needsTapToPlay, setNeedsTapToPlay] = useState(false);

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

  // Looks up the exact cached lecture for the selected chapter and plays it. Never reaches
  // this point for a chapter the catalog doesn't already list as available — see
  // selectTopic() below — so this never triggers a live Anthropic or TTS call.
  async function playLecture(selectedTopic) {
    setStage("loading");
    setErrorMsg("");

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
      playSegmentAt(0, data);
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
      <style>{`.ailecture-topic-option:hover { background: #F9F9F7; }`}</style>

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
