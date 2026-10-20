import { useState, useEffect, useMemo } from "react";
import { Zap, Search, CheckCircle2, XCircle, ChevronDown, ChevronUp, Loader2, Lightbulb, TriangleAlert, Sparkles, Check } from "lucide-react";
import { doc, getDoc, setDoc, arrayUnion, arrayRemove } from "firebase/firestore";
import { db } from "./Login.jsx";
import { renderFormula } from "./renderFormula.jsx";
import { TRICKS, TRICK_SUBJECTS } from "./data/tricksBank.js";

// "Tricks & Shortcuts": a hand-checked Trick Bank (src/data/tricksBank.js) plus an AI
// "find the fastest way" helper that goes through App's askAi (same /api/ask endpoint,
// guest limit and usage counts as Doubt Desk — no extra serverless function).

const INK = "#17140F";
const TEXT = "#2B2018";
const MUTED = "#8C7D6B";
const BORDER = "#E4E2DA";
const PAPER = "#F7F5EF";
const GOLD = "#B8860B";
const GREEN = "#2F6B4A";
const RED = "#B23B3B";

const card = { background: "#FFFFFF", borderRadius: 14, border: `1px solid ${BORDER}`, padding: 16 };

// The section headers the AI is told to use — parsed back out for display.
const AI_SECTIONS = ["TRICK", "WHY IT WORKS", "FAST SOLUTION", "ANSWER", "TIME SAVED", "WATCH OUT"];

function trickSystemPrompt(subjectLabel, exam) {
  const subjectLine = subjectLabel ? `${subjectLabel} ` : "";
  return `You are iBuddie's Shortcut Coach for Indian students preparing for ${exam}. The student pastes a ${subjectLine}question and wants the FASTEST reliable way to solve it in the exam hall — the kind of trick toppers use: option elimination, dimensional analysis, limiting/special cases, symmetry, standard results, ratio methods, mnemonics, or well-known formulas that skip steps.

Rules:
- Solve the question properly yourself first and make sure the final answer is correct. Never present a trick that gives a wrong answer.
- If there is no genuine shortcut, say so plainly under TRICK and give the quickest standard method instead. Do not invent fake tricks.
- Keep it short and exam-focused. Use ^ for powers and _ for subscripts (e.g. v^2, t_1/2). No LaTeX, no markdown symbols like ** or #.
- If the student wrote in Hinglish, Kanglish or another Indian language mix, reply in the same style, but keep the section headers below exactly in English.

Reply using EXACTLY these section headers, each on its own line:
TRICK: <name of the shortcut in a few words>
WHY IT WORKS: <one or two sentences>
FAST SOLUTION:
1. <step>
2. <step>
ANSWER: <final answer>
TIME SAVED: <rough estimate vs. the usual method, e.g. "about 2 minutes">
WATCH OUT: <when this trick fails or a common trap>`;
}

function parseAiSections(text) {
  const pattern = new RegExp(`^(${AI_SECTIONS.join("|")}):\\s*`, "gm");
  const found = [];
  let m;
  while ((m = pattern.exec(text)) !== null) found.push({ key: m[1], start: m.index, bodyStart: pattern.lastIndex });
  if (found.length === 0) return text.trim() ? [{ key: null, body: text.trim() }] : [];
  const out = [];
  if (found[0].start > 0 && text.slice(0, found[0].start).trim()) out.push({ key: null, body: text.slice(0, found[0].start).trim() });
  found.forEach((f, i) => out.push({ key: f.key, body: text.slice(f.bodyStart, i + 1 < found.length ? found[i + 1].start : text.length).trim() }));
  return out;
}

function RichText({ text, style }) {
  return (
    <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.6, ...style }}>
      {text.split("\n").map((line, i) => <div key={i}>{renderFormula(line)}</div>)}
    </div>
  );
}

function AiTrickFinder({ subjectLabel, exam, askAi, seed }) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [status, setStatus] = useState("idle"); // idle | loading | done | error

  // The Doubt Desk "Shortcut" button hands a question over as { text, n }. It's pre-filled
  // rather than auto-sent so the student chooses whether to spend a question on it.
  useEffect(() => {
    if (seed?.text) {
      setQuestion(seed.text);
      setAnswer("");
      setStatus("idle");
    }
  }, [seed]);

  async function run(e) {
    e?.preventDefault();
    const q = question.trim();
    if (!q || status === "loading") return;
    setAnswer("");
    setStatus("loading");
    const result = await askAi(q, trickSystemPrompt(subjectLabel, exam), setAnswer);
    setStatus(result === "ok" ? "done" : result === "blocked" ? "idle" : "error");
  }

  const sections = parseAiSections(answer);
  return (
    <div style={{ ...card, background: "#FFFDF6", borderColor: `${GOLD}55` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14.5, fontWeight: 700, color: TEXT, marginBottom: 4 }}>
        <Sparkles size={17} color={GOLD} /> Find a trick for your question
      </div>
      <div style={{ fontSize: 12.5, color: MUTED, marginBottom: 10 }}>Paste any {subjectLabel || ""} question — iBuddie shows the fastest way to crack it, and when the trick won't work.</div>
      <form onSubmit={run}>
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) run(e); }}
          rows={3}
          placeholder="e.g. A ball is thrown at 30° and lands 40 m away. Where does it land if thrown at 60° with the same speed?"
          style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 10, border: `1px solid ${BORDER}`, fontSize: 13.5, color: TEXT, fontFamily: "inherit", resize: "vertical", background: "#FFFFFF" }}
        />
        <button
          type="submit"
          disabled={!question.trim() || status === "loading"}
          style={{ marginTop: 8, display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 16px", borderRadius: 10, border: "none", background: INK, color: "#FFFFFF", fontSize: 13.5, fontWeight: 600, cursor: question.trim() && status !== "loading" ? "pointer" : "default", opacity: question.trim() && status !== "loading" ? 1 : 0.5, fontFamily: "inherit" }}
        >
          {status === "loading" ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <Zap size={14} />} Show me the trick
        </button>
      </form>
      {status === "error" && <div style={{ marginTop: 10, fontSize: 12.5, color: RED }}>Couldn't reach iBuddie. Please try again.</div>}
      {sections.length > 0 && (
        <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
          {sections.map((s, i) => (
            <div key={i} style={s.key === "ANSWER" ? { background: "#EEF5F0", borderRadius: 10, padding: "8px 12px" } : s.key === "WATCH OUT" ? { background: "#FBF3E6", borderRadius: 10, padding: "8px 12px" } : null}>
              {s.key && <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.05em", color: s.key === "ANSWER" ? GREEN : s.key === "WATCH OUT" ? GOLD : MUTED, marginBottom: 2 }}>{s.key}</div>}
              <RichText text={s.body} style={{ fontSize: s.key === "TRICK" ? 15 : 13.5, fontWeight: s.key === "TRICK" ? 700 : 400, color: TEXT }} />
            </div>
          ))}
          {status === "done" && <div style={{ fontSize: 11.5, color: MUTED }}>AI-generated — double-check with your textbook if something looks off.</div>}
        </div>
      )}
    </div>
  );
}

function PracticeQuestion({ practice, onCorrect }) {
  const [picked, setPicked] = useState(null);
  const done = picked !== null;
  return (
    <div>
      <RichText text={practice.question} style={{ fontSize: 13.5, color: TEXT, marginBottom: 8 }} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 6 }}>
        {practice.options.map((opt, i) => {
          const isAnswer = i === practice.answer;
          const isPicked = i === picked;
          const color = done && isAnswer ? GREEN : done && isPicked ? RED : TEXT;
          return (
            <button
              key={i}
              onClick={() => {
                if (done) return;
                setPicked(i);
                if (isAnswer) onCorrect();
              }}
              style={{
                textAlign: "left", padding: "8px 10px", borderRadius: 9, fontSize: 13, fontFamily: "inherit", cursor: done ? "default" : "pointer",
                border: `1.5px solid ${done && (isAnswer || isPicked) ? color : BORDER}`, background: done && isAnswer ? "#EEF5F0" : done && isPicked ? "#FBEFEF" : "#FFFFFF", color,
                display: "flex", alignItems: "center", gap: 6,
              }}
            >
              {done && isAnswer && <CheckCircle2 size={14} />}
              {done && isPicked && !isAnswer && <XCircle size={14} />}
              <span>{renderFormula(opt)}</span>
            </button>
          );
        })}
      </div>
      {done && (
        <div style={{ marginTop: 8, fontSize: 13, color: picked === practice.answer ? GREEN : TEXT }}>
          <b>{picked === practice.answer ? "Correct! " : "Not quite. "}</b>{renderFormula(practice.explain)}
          {picked !== practice.answer && <span onClick={() => setPicked(null)} style={{ marginLeft: 8, color: MUTED, cursor: "pointer", textDecoration: "underline" }}>Try again</span>}
        </div>
      )}
    </div>
  );
}

function TrickCard({ trick, open, onToggle, learned, onLearned, showSubject }) {
  return (
    <div style={{ ...card, padding: 0, overflow: "hidden", borderColor: open ? `${INK}40` : BORDER }}>
      <div onClick={onToggle} style={{ padding: "14px 16px", cursor: "pointer", display: "flex", gap: 12, alignItems: "flex-start" }}>
        <div style={{ width: 30, height: 30, borderRadius: 8, background: learned ? "#EEF5F0" : PAPER, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          {learned ? <Check size={16} color={GREEN} /> : <Zap size={15} color={GOLD} />}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14.5, fontWeight: 700, color: TEXT }}>{renderFormula(trick.title)}</div>
          <div style={{ fontSize: 11.5, color: MUTED, marginTop: 2 }}>
            {[showSubject ? trick.subject : null, trick.chapter, `saves ${trick.saves}`].filter(Boolean).join(" · ")}
          </div>
          {!open && <div style={{ fontSize: 12.5, color: TEXT, marginTop: 6, opacity: 0.85 }}>Use when: {trick.useWhen}</div>}
        </div>
        {open ? <ChevronUp size={18} color={MUTED} /> : <ChevronDown size={18} color={MUTED} />}
      </div>

      {open && (
        <div style={{ padding: "0 16px 16px", display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ fontSize: 13, color: TEXT }}><b>Use when:</b> {trick.useWhen}</div>
          <ol style={{ margin: 0, paddingLeft: 20, fontSize: 13.5, color: TEXT, lineHeight: 1.65 }}>
            {trick.steps.map((s, i) => <li key={i}>{renderFormula(s)}</li>)}
          </ol>

          <div style={{ background: PAPER, borderRadius: 12, padding: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.05em", color: MUTED, marginBottom: 4 }}>EXAMPLE</div>
            <RichText text={trick.example.question} style={{ fontSize: 13.5, color: TEXT, marginBottom: 10 }} />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 8 }}>
              <div style={{ background: "#FFFFFF", borderRadius: 10, padding: 10, border: `1px solid ${BORDER}` }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, marginBottom: 3 }}>USUAL WAY</div>
                <RichText text={trick.example.slow} style={{ fontSize: 12.5, color: MUTED }} />
              </div>
              <div style={{ background: "#FFFFFF", borderRadius: 10, padding: 10, border: `1.5px solid ${GOLD}66` }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: GOLD, marginBottom: 3, display: "flex", alignItems: "center", gap: 4 }}><Zap size={11} /> TRICK WAY</div>
                <RichText text={trick.example.fast} style={{ fontSize: 13, color: TEXT }} />
              </div>
            </div>
            <div style={{ marginTop: 8, fontSize: 13, color: GREEN, fontWeight: 600 }}>Answer: {renderFormula(trick.example.answer)}</div>
          </div>

          <div style={{ display: "flex", gap: 8, background: "#FBF3E6", borderRadius: 10, padding: "8px 12px", fontSize: 12.5, color: TEXT, lineHeight: 1.5 }}>
            <TriangleAlert size={15} color={GOLD} style={{ flexShrink: 0, marginTop: 2 }} />
            <div><b>Watch out:</b> {renderFormula(trick.trap)}</div>
          </div>

          <div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.05em", color: MUTED, marginBottom: 6, display: "flex", alignItems: "center", gap: 5 }}><Lightbulb size={12} /> TRY IT YOURSELF</div>
            <PracticeQuestion key={trick.id} practice={trick.practice} onCorrect={() => !learned && onLearned(true)} />
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <button
              onClick={() => onLearned(!learned)}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 9, fontSize: 12.5, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", border: `1px solid ${learned ? GREEN : BORDER}`, background: learned ? "#EEF5F0" : "#FFFFFF", color: learned ? GREEN : TEXT }}
            >
              <Check size={13} /> {learned ? "Learned" : "Mark as learned"}
            </button>
            <span style={{ fontSize: 11.5, color: MUTED }}>For {trick.exams.join(", ")}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Tricks({ subjectLabel, exam, isMobile, uid, askAi, seedQuestion }) {
  const [subjectFilter, setSubjectFilter] = useState(TRICK_SUBJECTS.includes(subjectLabel) ? subjectLabel : "All");
  const [chapter, setChapter] = useState("");
  const [q, setQ] = useState("");
  const [onlyNew, setOnlyNew] = useState(false);
  const [openId, setOpenId] = useState(null);
  const [learned, setLearned] = useState([]);

  // Follow the subject picked in the top bar.
  useEffect(() => {
    setSubjectFilter(TRICK_SUBJECTS.includes(subjectLabel) ? subjectLabel : "All");
    setChapter("");
  }, [subjectLabel]);

  // "Learned" progress lives on the student's own users/{uid} doc (which they may write).
  useEffect(() => {
    if (!uid) return;
    getDoc(doc(db, "users", uid))
      .then((snap) => setLearned(snap.data()?.tricksLearned || []))
      .catch((e) => console.error("Failed to load learned tricks:", e));
  }, [uid]);

  function setTrickLearned(id, value) {
    setLearned((prev) => (value ? [...new Set([...prev, id])] : prev.filter((x) => x !== id)));
    if (uid) {
      setDoc(doc(db, "users", uid), { tricksLearned: value ? arrayUnion(id) : arrayRemove(id) }, { merge: true }).catch((e) =>
        console.error("Failed to save learned trick:", e)
      );
    }
  }

  const inSubject = TRICKS.filter((t) => subjectFilter === "All" || t.subject === subjectFilter);
  const chapters = [...new Set(inSubject.map((t) => t.chapter))];
  const query = q.trim().toLowerCase();
  const visible = inSubject.filter((t) =>
    (!chapter || t.chapter === chapter) &&
    (!onlyNew || !learned.includes(t.id)) &&
    (!query || [t.title, t.chapter, t.useWhen, ...t.steps].join(" ").toLowerCase().includes(query))
  );
  const learnedInSubject = inSubject.filter((t) => learned.includes(t.id)).length;

  // Same trick for everyone on a given day.
  const trickOfDay = useMemo(() => {
    const pool = TRICKS.filter((t) => t.exams.includes(exam));
    const list = pool.length ? pool : TRICKS;
    const d = new Date();
    return list[(d.getFullYear() * 372 + d.getMonth() * 31 + d.getDate()) % list.length];
  }, [exam]);

  const chip = (active) => ({
    padding: "6px 12px", borderRadius: 999, fontSize: 12.5, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
    border: `1px solid ${active ? INK : BORDER}`, background: active ? INK : "#FFFFFF", color: active ? "#FFFFFF" : TEXT,
  });

  return (
    <div className="ibuddie-chat-card" style={{ flex: 1, background: "#FFFFFF", borderRadius: 18, border: `1px solid ${BORDER}`, padding: isMobile ? 14 : 24, display: "flex", flexDirection: "column", gap: 16, minHeight: 0, overflowY: "auto" }}>
      <style>{"@keyframes spin { to { transform: rotate(360deg); } }"}</style>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ width: 40, height: 40, borderRadius: 12, background: INK, display: "flex", alignItems: "center", justifyContent: "center" }}><Zap size={20} color="#F2C94C" /></div>
        <div style={{ flex: 1, minWidth: 180 }}>
          <div style={{ fontSize: isMobile ? 17 : 20, fontWeight: 800, color: TEXT }}>Tricks &amp; Shortcuts</div>
          <div style={{ fontSize: 12.5, color: MUTED }}>Solve exam questions in seconds — learn when each trick works and when it doesn't.</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: TEXT }}>{learnedInSubject}/{inSubject.length}</div>
          <div style={{ fontSize: 11, color: MUTED }}>learned</div>
        </div>
      </div>

      <AiTrickFinder subjectLabel={TRICK_SUBJECTS.includes(subjectLabel) ? subjectLabel : null} exam={exam} askAi={askAi} seed={seedQuestion} />

      {trickOfDay && !query && !chapter && (
        <div onClick={() => { setSubjectFilter(trickOfDay.subject); setChapter(""); setOnlyNew(false); setOpenId(trickOfDay.id); }} style={{ ...card, background: PAPER, cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }}>
          <Lightbulb size={18} color={GOLD} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.05em", color: GOLD }}>TRICK OF THE DAY</div>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: TEXT }}>{renderFormula(trickOfDay.title)} <span style={{ fontWeight: 400, color: MUTED }}>· {trickOfDay.subject}</span></div>
          </div>
        </div>
      )}

      <div>
        <div style={{ fontSize: 14.5, fontWeight: 700, color: TEXT, marginBottom: 10 }}>Trick Bank</div>
        <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4, marginBottom: 10 }}>
          {["All", ...TRICK_SUBJECTS].map((s) => (
            <div key={s} onClick={() => { setSubjectFilter(s); setChapter(""); }} style={chip(subjectFilter === s)}>{s}</div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <div style={{ position: "relative", flex: "2 1 200px" }}>
            <Search size={14} color={MUTED} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tricks (e.g. projectile, pH, hybridisation)" style={{ width: "100%", boxSizing: "border-box", padding: "9px 12px 9px 30px", borderRadius: 10, border: `1px solid ${BORDER}`, fontSize: 13, color: TEXT, fontFamily: "inherit" }} />
          </div>
          <select value={chapter} onChange={(e) => setChapter(e.target.value)} style={{ flex: "1 1 160px", padding: "9px 10px", borderRadius: 10, border: `1px solid ${BORDER}`, fontSize: 13, color: TEXT, background: "#FFFFFF", fontFamily: "inherit" }}>
            <option value="">All chapters</option>
            {chapters.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <div onClick={() => setOnlyNew((v) => !v)} style={{ ...chip(onlyNew), display: "flex", alignItems: "center" }}>Not learned yet</div>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {visible.length === 0 ? (
          <div style={{ fontSize: 13, color: MUTED, textAlign: "center", padding: 20 }}>
            {onlyNew && inSubject.length && learnedInSubject === inSubject.length ? "You've learned every trick here 🎉" : "No tricks match. Try the AI trick finder above with your question."}
          </div>
        ) : visible.map((t) => (
          <TrickCard
            key={t.id}
            trick={t}
            open={openId === t.id}
            onToggle={() => setOpenId((id) => (id === t.id ? null : t.id))}
            learned={learned.includes(t.id)}
            onLearned={(v) => setTrickLearned(t.id, v)}
            showSubject={subjectFilter === "All"}
          />
        ))}
      </div>
    </div>
  );
}
