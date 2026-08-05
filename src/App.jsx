import { useState, useRef, useEffect } from "react";

const SUBJECTS = [
  { id: "physics", label: "Physics", ink: "#8A3B12" },
  { id: "chemistry", label: "Chemistry", ink: "#2F6F5E" },
  { id: "biology", label: "Biology", ink: "#1B4D2E" },
  { id: "math", label: "Mathematics", ink: "#1B2A4A" },
];

const EXAMS = ["NEET", "JEE", "KCET"];

function parseReply(raw) {
  const lines = raw.split("\n");
  let topic = "";
  let difficulty = "";
  let body = raw;
  const topicLine = lines.find((l) => l.trim().toUpperCase().startsWith("TOPIC:"));
  const diffLine = lines.find((l) => l.trim().toUpperCase().startsWith("DIFFICULTY:"));
  if (topicLine) topic = topicLine.split(":").slice(1).join(":").trim();
  if (diffLine) difficulty = diffLine.split(":").slice(1).join(":").trim();
  if (topicLine || diffLine) {
    body = lines
      .filter((l) => l !== topicLine && l !== diffLine)
      .join("\n")
      .trim();
  }
  return { topic, difficulty, body };
}

export default function App() {
  const [subject, setSubject] = useState("physics");
  const [exam, setExam] = useState("NEET");
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  const currentSubject = SUBJECTS.find((s) => s.id === subject);

  async function sendMessage() {
    const question = input.trim();
    if (!question || loading) return;
    setInput("");
    const nextMessages = [...messages, { role: "user", content: question, subject }];
    setMessages(nextMessages);
    setLoading(true);

    const systemPrompt = `You are iBuddie's AI Mentor, an expert ${currentSubject.label} tutor for Indian Class 11-12 students preparing for ${exam}. 
Answer the student's doubt clearly and step by step, matched to the ${exam} syllabus and difficulty level.
Format your response EXACTLY as:
TOPIC: <short topic name, e.g. "Optics — Refraction at Curved Surfaces">
DIFFICULTY: <Easy, Medium, or Hard for ${exam}>
<then a blank line, then your full explanation in plain text with clear steps. Use short paragraphs or numbered steps. No markdown symbols like ** or #.>`;

    try {
      const response = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          systemPrompt,
        }),
      });
      const data = await response.json();
      const textBlock = (data.content || []).find((b) => b.type === "text");
      const raw = textBlock ? textBlock.text : "Sorry, I couldn't work through that one. Try rephrasing your question.";
      const parsed = parseReply(raw);
      setMessages((prev) => [...prev, { role: "assistant", ...parsed, subject }]);
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", topic: "", difficulty: "", body: "Something went wrong reaching the AI Mentor. Please try again.", subject },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        width: "100%",
        background: "#EEF2F0",
        backgroundImage:
          "linear-gradient(#D7E0DC 1px, transparent 1px), linear-gradient(90deg, #D7E0DC 1px, transparent 1px)",
        backgroundSize: "28px 28px",
        fontFamily: "'IBM Plex Sans', system-ui, sans-serif",
        display: "flex",
        justifyContent: "center",
        padding: "24px 12px",
      }}
    >
      <div style={{ width: "100%", maxWidth: 720, display: "flex", flexDirection: "column", height: "88vh" }}>
        {/* Header */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
            <span
              style={{
                fontFamily: "'Spectral', Georgia, serif",
                fontSize: 30,
                fontWeight: 600,
                color: "#1B2A4A",
                letterSpacing: "-0.01em",
              }}
            >
              iBuddie
            </span>
            <span
              style={{
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: 12,
                color: "#5A6B75",
                letterSpacing: "0.06em",
                textTransform: "uppercase",
              }}
            >
              AI Mentor · Doubt Desk
            </span>
          </div>
          <div style={{ fontSize: 13, color: "#5A6B75", marginTop: 4 }}>
            Ask any {currentSubject.label.toLowerCase()} doubt — get an exam-mapped explanation, instantly.
          </div>
        </div>

        {/* Controls: exam + subject tabs */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
          <div style={{ display: "flex", gap: 6 }}>
            {SUBJECTS.map((s) => (
              <button
                key={s.id}
                onClick={() => setSubject(s.id)}
                style={{
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontSize: 12,
                  padding: "6px 12px",
                  borderRadius: 3,
                  border: `1.5px solid ${subject === s.id ? s.ink : "#C7D4DE"}`,
                  background: subject === s.id ? s.ink : "#FBFCFB",
                  color: subject === s.id ? "#FBFCFB" : "#405058",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
              >
                {s.label}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 4, background: "#FBFCFB", border: "1.5px solid #C7D4DE", borderRadius: 3, padding: 2 }}>
            {EXAMS.map((ex) => (
              <button
                key={ex}
                onClick={() => setExam(ex)}
                style={{
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontSize: 11,
                  padding: "5px 10px",
                  borderRadius: 2,
                  border: "none",
                  background: exam === ex ? "#E8A33D" : "transparent",
                  color: exam === ex ? "#2A1E0A" : "#5A6B75",
                  cursor: "pointer",
                  fontWeight: exam === ex ? 600 : 400,
                }}
              >
                {ex}
              </button>
            ))}
          </div>
        </div>

        {/* Chat area */}
        <div
          ref={scrollRef}
          style={{
            flex: 1,
            overflowY: "auto",
            background: "#FBFCFB",
            border: "1.5px solid #C7D4DE",
            borderRadius: 6,
            padding: 18,
            display: "flex",
            flexDirection: "column",
            gap: 14,
          }}
        >
          {messages.length === 0 && (
            <div style={{ color: "#8B99A0", fontSize: 14, textAlign: "center", marginTop: 40, lineHeight: 1.6 }}>
              No doubts yet. Try asking something like:
              <br />
              <span style={{ fontStyle: "italic" }}>
                "Why does the direction of induced current oppose the change in flux?"
              </span>
            </div>
          )}

          {messages.map((m, i) =>
            m.role === "user" ? (
              <div key={i} style={{ alignSelf: "flex-end", maxWidth: "80%" }}>
                <div
                  style={{
                    background: "#1B2A4A",
                    color: "#F2F5F3",
                    padding: "10px 14px",
                    borderRadius: "10px 10px 2px 10px",
                    fontSize: 14.5,
                    lineHeight: 1.5,
                  }}
                >
                  {m.content}
                </div>
              </div>
            ) : (
              <div key={i} style={{ alignSelf: "flex-start", maxWidth: "88%" }}>
                {m.topic && (
                  <div style={{ display: "flex", gap: 6, marginBottom: 6, alignItems: "center" }}>
                    <span
                      style={{
                        fontFamily: "'IBM Plex Mono', monospace",
                        fontSize: 10.5,
                        padding: "3px 8px",
                        borderRadius: 3,
                        background: "#E8F0EC",
                        color: SUBJECTS.find((s) => s.id === m.subject)?.ink || "#2F6F5E",
                        border: `1px solid ${SUBJECTS.find((s) => s.id === m.subject)?.ink || "#2F6F5E"}33`,
                        fontWeight: 600,
                      }}
                    >
                      {m.topic}
                    </span>
                    {m.difficulty && (
                      <span
                        style={{
                          fontFamily: "'IBM Plex Mono', monospace",
                          fontSize: 10.5,
                          padding: "3px 8px",
                          borderRadius: 3,
                          background: "#FBF0DD",
                          color: "#8A5A0D",
                        }}
                      >
                        {m.difficulty}
                      </span>
                    )}
                  </div>
                )}
                <div
                  style={{
                    background: "#F3F6F4",
                    border: "1px solid #DCE5E0",
                    padding: "12px 14px",
                    borderRadius: "2px 10px 10px 10px",
                    fontSize: 14.5,
                    lineHeight: 1.6,
                    color: "#2A3438",
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {m.body}
                </div>
              </div>
            )
          )}

          {loading && (
            <div style={{ alignSelf: "flex-start", fontSize: 13, color: "#8B99A0", fontFamily: "'IBM Plex Mono', monospace" }}>
              working through it…
            </div>
          )}
        </div>

        {/* Input */}
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Type your ${currentSubject.label.toLowerCase()} doubt…`}
            rows={2}
            style={{
              flex: 1,
              resize: "none",
              border: "1.5px solid #C7D4DE",
              borderRadius: 6,
              padding: "10px 12px",
              fontFamily: "'IBM Plex Sans', system-ui, sans-serif",
              fontSize: 14,
              outline: "none",
              background: "#FBFCFB",
              color: "#1B2A4A",
            }}
          />
          <button
            onClick={sendMessage}
            disabled={loading || !input.trim()}
            style={{
              padding: "0 20px",
              borderRadius: 6,
              border: "none",
              background: loading || !input.trim() ? "#C7D4DE" : "#1B2A4A",
              color: "#FBFCFB",
              fontWeight: 600,
              fontSize: 13.5,
              cursor: loading || !input.trim() ? "default" : "pointer",
            }}
          >
            Ask
          </button>
        </div>
      </div>
    </div>
  );
}