import { useState } from "react";
import { sendPasswordResetEmail } from "firebase/auth";
import {
  School, Users, UserPlus, RefreshCw, ArrowLeft, TriangleAlert, Plus, Trash2, X, Loader2, Flame,
  Download, Megaphone, Search, Mail, Pencil, CheckCircle2,
} from "lucide-react";
import { auth } from "../Login.jsx";
import { callCollege } from "../collegeApi.js";
import { summarizeGroup, parseRoster, normalizePhone, normalizeEmail, studentsToCsv, MAX_ROSTER_ROWS } from "../../lib/collegeStats.js";
import { INK, TEXT, MUTED, BORDER, PAPER, GREEN, GOLD, EXAMS, card, input, sectionTitle, fmtDate } from "./theme.js";
import { Button, Field, ErrorNote, Modal, StatTile, BarList, StatusTag, CodeBox, AnnouncementItem } from "./ui.jsx";

// Staff portal dashboard (college admin + teachers). Rendered by src/staff/StaffApp.jsx.
// `act` runs a mutation and reloads (alerts on error); modals call `callCollege` directly
// so they can show errors inline, then call `reload`.

function downloadCsv(filename, csv) {
  // BOM so Excel opens Kannada/Hindi names correctly.
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function slug(s) {
  return String(s || "students").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function StatGrid({ summary }) {
  const activePct = summary.students ? Math.round((summary.active7d / summary.students) * 100) : 0;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
      <StatTile label="Students" value={summary.students} />
      <StatTile label="Active this week" value={summary.active7d} hint={summary.students ? `${activePct}% of students` : null} />
      <StatTile label="Avg mock score" value={summary.avgScorePct === null ? "—" : `${summary.avgScorePct}%`} hint="last 10 tests each" />
      <StatTile label="Doubts asked" value={summary.doubts.toLocaleString("en-IN")} />
      <StatTile label="Tests taken" value={summary.tests.toLocaleString("en-IN")} />
      <StatTile label="Study hours" value={Math.round(summary.studyMinutes / 60).toLocaleString("en-IN")} hint="Study With Me" />
    </div>
  );
}

function InsightsRow({ summary }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14 }}>
      <div style={card}>
        <div style={sectionTitle}>Students by average mock score</div>
        <BarList rows={summary.scoreBands.map((b) => ({ label: b.label, value: b.count }))} unit="students" empty="No mock tests taken yet." />
      </div>
      <div style={card}>
        <div style={sectionTitle}>Topics most students get wrong</div>
        <BarList rows={summary.weakTopics.map((t) => ({ label: t.topic, value: t.count }))} unit="students" empty="Weak topics appear once students take mock tests." />
      </div>
    </div>
  );
}

function AttentionList({ summary, classNameById, onOpenStudent }) {
  return (
    <div style={card}>
      <div style={sectionTitle}>Needs attention ({summary.needsAttention.length})</div>
      {summary.needsAttention.length === 0 ? (
        <div style={{ fontSize: 12.5, color: MUTED }}>Everyone is active and scoring above 40%.</div>
      ) : (
        summary.needsAttention.slice(0, 12).map((s) => (
          <div key={s.uid} onClick={() => onOpenStudent(s.uid)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderTop: `1px solid ${BORDER}`, cursor: "pointer" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: TEXT, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</div>
              <div style={{ fontSize: 11.5, color: MUTED }}>{classNameById[s.classId] || "No class"}{s.avgScorePct !== null ? ` · avg ${s.avgScorePct}%` : ""}</div>
            </div>
            <StatusTag status={s.status} daysInactive={s.daysInactive} />
          </div>
        ))
      )}
    </div>
  );
}

const STUDENT_COLUMNS = [
  { key: "name", label: "Student" },
  { key: "rollNo", label: "Roll no" },
  { key: "className", label: "Class", optional: true },
  { key: "avgScorePct", label: "Avg score" },
  { key: "tests", label: "Tests" },
  { key: "doubts", label: "Doubts" },
  { key: "studyMinutes", label: "Study min" },
  { key: "streak", label: "Streak" },
  { key: "xp", label: "XP" },
  { key: "daysInactive", label: "Last active" },
];

function StudentTable({ students, onOpenStudent, classNameById, showClass, emptyText }) {
  const [sort, setSort] = useState({ key: "avgScorePct", dir: 1 });
  const rows = students.map((s) => ({ ...s, className: classNameById[s.classId] || "" }));
  const sorted = rows.sort((a, b) => {
    const av = a[sort.key], bv = b[sort.key];
    if (av === bv) return a.name.localeCompare(b.name);
    if (av === null || av === undefined || av === "") return 1; // missing values always last
    if (bv === null || bv === undefined || bv === "") return -1;
    return (typeof av === "string" ? av.localeCompare(bv, undefined, { numeric: true }) : av - bv) * sort.dir;
  });
  const columns = STUDENT_COLUMNS.filter((c) => !c.optional || showClass);
  const th = { textAlign: "left", fontSize: 11.5, color: MUTED, fontWeight: 600, padding: "8px 10px", cursor: "pointer", whiteSpace: "nowrap", userSelect: "none" };
  const td = { fontSize: 13, color: TEXT, padding: "10px", borderTop: `1px solid ${BORDER}`, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" };

  if (students.length === 0) return <div style={{ fontSize: 12.5, color: MUTED }}>{emptyText}</div>;
  return (
    <div style={{ overflowX: "auto", margin: "0 -6px" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: showClass ? 860 : 760 }}>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} style={th} onClick={() => setSort((s) => ({ key: c.key, dir: s.key === c.key ? -s.dir : ["name", "rollNo", "className"].includes(c.key) ? 1 : -1 }))}>
                {c.label}{sort.key === c.key ? (sort.dir === 1 ? " ↑" : " ↓") : ""}
              </th>
            ))}
            <th style={{ ...th, cursor: "default" }}>Status</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((s) => (
            <tr key={s.uid} onClick={() => onOpenStudent(s.uid)} style={{ cursor: "pointer" }}>
              <td style={{ ...td, fontWeight: 600 }}>{s.name}</td>
              <td style={td}>{s.rollNo || "—"}</td>
              {showClass && <td style={td}>{s.className || <span style={{ color: GOLD }}>No class</span>}</td>}
              <td style={td}>{s.avgScorePct === null ? "—" : `${s.avgScorePct}%`}</td>
              <td style={td}>{s.tests}</td>
              <td style={td}>{s.doubts}</td>
              <td style={td}>{s.studyMinutes}</td>
              <td style={td}>{s.streak > 0 ? <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}><Flame size={12} color="#D9720D" />{s.streak}</span> : 0}</td>
              <td style={td}>{s.xp}</td>
              <td style={td}>{s.daysInactive === null ? "Never" : s.daysInactive === 0 ? "Today" : `${s.daysInactive}d ago`}</td>
              <td style={td}><StatusTag status={s.status} daysInactive={s.daysInactive} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StudentPanel({ student, classes, act, onClose }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(student.name);
  const [rollNo, setRollNo] = useState(student.rollNo || "");
  const className = classes.find((c) => c.id === student.classId)?.name || "No class";

  async function saveDetails(e) {
    e.preventDefault();
    if (await act("updateStudent", { uid: student.uid, name, rollNo })) setEditing(false);
  }

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(23,20,15,0.45)", zIndex: 60, display: "flex", justifyContent: "flex-end" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "min(440px, 100%)", height: "100%", background: "#FAF9F5", overflowY: "auto", padding: 20, boxSizing: "border-box" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 16 }}>
          <div style={{ flex: 1 }}>
            {editing ? (
              <form onSubmit={saveDetails}>
                <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} style={{ ...input, marginBottom: 6 }} placeholder="Name" autoFocus />
                <input value={rollNo} onChange={(e) => setRollNo(e.target.value)} maxLength={20} style={{ ...input, marginBottom: 8 }} placeholder="Roll number" />
                <div style={{ display: "flex", gap: 6 }}>
                  <Button small type="submit">Save</Button>
                  <Button small variant="secondary" onClick={() => setEditing(false)}>Cancel</Button>
                </div>
              </form>
            ) : (
              <>
                <div style={{ fontSize: 18, fontWeight: 800, color: TEXT, display: "flex", alignItems: "center", gap: 8 }}>
                  {student.name}
                  <Pencil size={14} color={MUTED} style={{ cursor: "pointer" }} onClick={() => setEditing(true)} />
                </div>
                <div style={{ fontSize: 12.5, color: MUTED }}>{className}{student.rollNo ? ` · Roll ${student.rollNo}` : ""}</div>
                <div style={{ marginTop: 6 }}><StatusTag status={student.status} daysInactive={student.daysInactive} /></div>
              </>
            )}
          </div>
          <X size={20} color={MUTED} style={{ cursor: "pointer" }} onClick={onClose} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
          <StatTile label="Avg score" value={student.avgScorePct === null ? "—" : `${student.avgScorePct}%`} />
          <StatTile label="XP" value={student.xp} hint={`${student.streak}-day streak`} />
          <StatTile label="Doubts asked" value={student.doubts} />
          <StatTile label="Study minutes" value={student.studyMinutes} />
        </div>
        <div style={{ ...card, marginBottom: 12 }}>
          <div style={sectionTitle}>By subject</div>
          <BarList rows={student.subjects.map((s) => ({ label: `${s.subject} (${s.tests})`, value: s.avgScorePct }))} unit="% average" empty="No mock tests yet." />
        </div>
        <div style={{ ...card, marginBottom: 12 }}>
          <div style={sectionTitle}>Weak topics</div>
          {student.weakTopics.length === 0 ? <div style={{ fontSize: 12.5, color: MUTED }}>None yet.</div> : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {student.weakTopics.map((t) => (
                <span key={t.topic} style={{ fontSize: 12, padding: "4px 10px", borderRadius: 999, background: PAPER, color: TEXT }}>{t.topic} · missed {t.count}×</span>
              ))}
            </div>
          )}
        </div>
        <div style={{ ...card, marginBottom: 12 }}>
          <div style={sectionTitle}>Recent mock tests</div>
          {student.recentTests.length === 0 ? <div style={{ fontSize: 12.5, color: MUTED }}>No tests yet.</div> : student.recentTests.map((t, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12.5, padding: "7px 0", borderTop: i ? `1px solid ${BORDER}` : "none" }}>
              <span style={{ color: TEXT, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.subject}{t.chapter ? ` · ${t.chapter}` : ""}</span>
              <span style={{ color: MUTED, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{t.score}/{t.total} · {fmtDate(t.ts)}</span>
            </div>
          ))}
        </div>
        <div style={{ ...card, marginBottom: 16 }}>
          <div style={sectionTitle}>Manage</div>
          {classes.length > 1 && (
            <Field label="Move to class">
              <select value={student.classId || ""} onChange={(e) => e.target.value && act("updateStudent", { uid: student.uid, classId: e.target.value })} style={input}>
                {!student.classId && <option value="">No class</option>}
                {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
          )}
          <Button variant="danger" small onClick={async () => {
            if (window.confirm(`Remove ${student.name} from the college? They keep their iBuddie account and progress.`) && (await act("removeMember", { uid: student.uid }))) onClose();
          }}><Trash2 size={13} /> Remove from college</Button>
        </div>
      </div>
    </div>
  );
}

function AddStudentsModal({ cls, onClose, reload }) {
  const [mode, setMode] = useState("one"); // "one" | "list"
  const [one, setOne] = useState({ name: "", contact: "", rollNo: "" });
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  const preview = mode === "list" ? parseRoster(text) : null;
  const oneContactValid = !!(normalizePhone(one.contact) || normalizeEmail(one.contact));

  async function submit(e) {
    e.preventDefault();
    const rows = mode === "one"
      ? [{ name: one.name, phone: normalizePhone(one.contact), email: normalizeEmail(one.contact), rollNo: one.rollNo }]
      : preview.rows;
    setBusy(true);
    setError("");
    try {
      setResult(await callCollege("addStudents", { classId: cls.id, rows }));
      reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    return (
      <Modal title="Students invited" onClose={onClose}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: GREEN, fontWeight: 600, marginBottom: 8 }}>
          <CheckCircle2 size={18} /> {result.invited} invited{result.updated ? `, ${result.updated} updated` : ""} to {result.className}
        </div>
        <div style={{ fontSize: 12.5, color: MUTED, lineHeight: 1.55, marginBottom: 14 }}>
          Each student sees the invite under <b>My College</b> the next time they sign in to iBuddie with that mobile number (or Google email) and taps Accept.
          You'll see their progress once they accept. Students can also join right away with the class code.
        </div>
        {result.skipped.length > 0 && (
          <div style={{ ...card, padding: 12, marginBottom: 14 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: TEXT, marginBottom: 6 }}>Skipped ({result.skipped.length})</div>
            {result.skipped.map((s, i) => (
              <div key={i} style={{ fontSize: 12, color: TEXT, padding: "4px 0", borderTop: i ? `1px solid ${BORDER}` : "none" }}>
                {s.name} <span style={{ color: MUTED }}>({s.contact})</span> — <span style={{ color: GOLD }}>{s.reason}</span>
              </div>
            ))}
          </div>
        )}
        <div style={{ display: "flex", gap: 8 }}>
          <Button onClick={() => { setResult(null); setOne({ name: "", contact: "", rollNo: "" }); setText(""); }}><Plus size={14} /> Add more</Button>
          <Button variant="secondary" onClick={onClose}>Done</Button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title={`Add students to ${cls.name}`} onClose={onClose} width={600}>
      <div style={{ display: "flex", gap: 4, background: "#FFFFFF", border: `1px solid ${BORDER}`, borderRadius: 10, padding: 3, marginBottom: 14, width: "fit-content" }}>
        {[["one", "One student"], ["list", "Paste a list"]].map(([key, label]) => (
          <div key={key} onClick={() => setMode(key)} style={{ padding: "6px 14px", borderRadius: 7, fontSize: 12.5, fontWeight: 600, cursor: "pointer", background: mode === key ? INK : "transparent", color: mode === key ? "#FFFFFF" : MUTED }}>{label}</div>
        ))}
      </div>
      <ErrorNote>{error}</ErrorNote>
      <form onSubmit={submit}>
        {mode === "one" ? (
          <>
            <Field label="Student name"><input value={one.name} onChange={(e) => setOne({ ...one, name: e.target.value })} maxLength={60} style={input} placeholder="Asha Rao" autoFocus /></Field>
            <Field label="Mobile number or email" hint="The number or Google email the student uses to sign in to iBuddie.">
              <input value={one.contact} onChange={(e) => setOne({ ...one, contact: e.target.value })} style={input} placeholder="98765 43210" />
            </Field>
            <Field label="Roll number (optional)"><input value={one.rollNo} onChange={(e) => setOne({ ...one, rollNo: e.target.value })} maxLength={20} style={input} /></Field>
            <Button type="submit" disabled={busy || one.name.trim().length < 2 || !oneContactValid}>{busy ? <Loader2 size={14} className="spin" /> : <UserPlus size={14} />} Invite student</Button>
          </>
        ) : (
          <>
            <Field label="One student per line: name, mobile or email, roll number" hint={`Paste straight from Excel or Google Sheets. Up to ${MAX_ROSTER_ROWS} at a time.`}>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={8}
                style={{ ...input, fontFamily: "ui-monospace, monospace", fontSize: 12.5, resize: "vertical" }}
                placeholder={"Asha Rao, 9876543210, 12\nBharath K, bharath@gmail.com, 13"}
                autoFocus
              />
            </Field>
            {text.trim() && (
              <div style={{ fontSize: 12.5, marginBottom: 12 }}>
                <span style={{ color: GREEN, fontWeight: 600 }}>{preview.rows.length} ready</span>
                {preview.errors.length > 0 && <span style={{ color: GOLD, fontWeight: 600 }}> · {preview.errors.length} need fixing</span>}
                {preview.errors.slice(0, 5).map((e, i) => (
                  <div key={i} style={{ color: MUTED, marginTop: 3 }}>{e.line ? `Line ${e.line}: ` : ""}{e.reason}{e.text ? ` — "${e.text.slice(0, 40)}"` : ""}</div>
                ))}
              </div>
            )}
            <Button type="submit" disabled={busy || !preview.rows.length}>{busy ? <Loader2 size={14} className="spin" /> : <UserPlus size={14} />} Invite {preview.rows.length || ""} students</Button>
          </>
        )}
      </form>
    </Modal>
  );
}

function AddTeacherModal({ onClose, reload }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await callCollege("addTeacher", { name, email });
      let emailed = true;
      try {
        // Lets the teacher choose their own password; the admin never sees it.
        await sendPasswordResetEmail(auth, res.email, { url: `${window.location.origin}/staff/` });
      } catch (err) {
        console.error("Password setup email failed:", err);
        emailed = false;
      }
      setDone({ ...res, emailed });
      reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Add a teacher" onClose={onClose}>
      {done ? (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: GREEN, fontWeight: 600, marginBottom: 8 }}><CheckCircle2 size={18} /> {name} is now on your staff</div>
          <div style={{ fontSize: 13, color: TEXT, lineHeight: 1.6, marginBottom: 14 }}>
            {done.emailed
              ? <>We emailed <b>{done.email}</b> a link to set their password. They then sign in at <b>{window.location.origin}/staff/</b> — or with Google if that email is a Gmail/Workspace account.</>
              : <>The account is ready, but the password email couldn't be sent. Ask them to open <b>{window.location.origin}/staff/</b> and use "Forgot password?" with <b>{done.email}</b>.</>}
          </div>
          <Button onClick={onClose}>Done</Button>
        </>
      ) : (
        <form onSubmit={submit}>
          <ErrorNote>{error}</ErrorNote>
          <Field label="Teacher's name"><input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} style={input} placeholder="Meena Kulkarni" autoFocus /></Field>
          <Field label="Email" hint="They'll get an email to set a password for the staff portal.">
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} style={input} placeholder="meena@college.edu.in" />
          </Field>
          <Button type="submit" disabled={busy || name.trim().length < 2 || !normalizeEmail(email)}>{busy ? <Loader2 size={14} className="spin" /> : <Mail size={14} />} Add &amp; send invite</Button>
        </form>
      )}
    </Modal>
  );
}

function AnnouncementModal({ classes, isAdmin, defaultClassId, onClose, reload }) {
  const [classId, setClassId] = useState(defaultClassId || (isAdmin ? "" : classes[0]?.id || ""));
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await callCollege("postAnnouncement", { classId: classId || null, title, body });
      reload();
      onClose();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <Modal title="New announcement" onClose={onClose}>
      <form onSubmit={submit}>
        <ErrorNote>{error}</ErrorNote>
        <Field label="Send to">
          <select value={classId} onChange={(e) => setClassId(e.target.value)} style={input}>
            {isAdmin && <option value="">Whole college</option>}
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Title"><input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} style={input} placeholder="Unit test on Friday" autoFocus /></Field>
        <Field label="Message (optional)">
          <textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000} rows={5} style={{ ...input, resize: "vertical" }} placeholder="Revise Chapters 3–5. Take today's Daily Mock Test on Current Electricity." />
        </Field>
        <Button type="submit" disabled={busy || title.trim().length < 2 || (!isAdmin && !classId)}>{busy ? <Loader2 size={14} className="spin" /> : <Megaphone size={14} />} Post</Button>
      </form>
    </Modal>
  );
}

function CreateClassForm({ teachers, isAdmin, onCreate, onCancel }) {
  const [name, setName] = useState("");
  const [exam, setExam] = useState("NEET");
  const [teacherUid, setTeacherUid] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      style={{ ...card, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}
      onSubmit={async (e) => { e.preventDefault(); setBusy(true); await onCreate({ name, exam, teacherUid: teacherUid || null }); setBusy(false); }}
    >
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Class name, e.g. 2nd PUC – Section A" maxLength={60} style={{ ...input, flex: "2 1 220px", width: "auto" }} autoFocus />
      <select value={exam} onChange={(e) => setExam(e.target.value)} style={{ ...input, flex: "0 1 110px", width: "auto" }}>
        {EXAMS.map((x) => <option key={x}>{x}</option>)}
      </select>
      {isAdmin && (
        <select value={teacherUid} onChange={(e) => setTeacherUid(e.target.value)} style={{ ...input, flex: "1 1 160px", width: "auto" }}>
          <option value="">No teacher yet</option>
          {teachers.map((t) => <option key={t.uid} value={t.uid}>{t.name}{t.role === "admin" ? " (admin)" : ""}</option>)}
        </select>
      )}
      <Button type="submit" disabled={busy || name.trim().length < 2}>{busy ? <Loader2 size={14} className="spin" /> : <Plus size={14} />} Create</Button>
      <Button variant="secondary" onClick={onCancel}>Cancel</Button>
    </form>
  );
}

function ClassCard({ cls, pendingInvites, onOpen }) {
  const s = cls.summary;
  return (
    <div onClick={onOpen} style={{ ...card, cursor: "pointer", display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: TEXT, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cls.name}</div>
          <div style={{ fontSize: 12, color: MUTED }}>{cls.exam} · {cls.teacherName || "No teacher assigned"}</div>
        </div>
        <span style={{ fontSize: 12, fontWeight: 700, color: TEXT, fontFamily: "ui-monospace, monospace", letterSpacing: "0.1em" }}>{cls.joinCode}</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6, fontSize: 12, color: MUTED }}>
        <div><div style={{ fontSize: 17, fontWeight: 800, color: TEXT }}>{s.students}</div>students</div>
        <div><div style={{ fontSize: 17, fontWeight: 800, color: TEXT }}>{s.active7d}</div>active 7d</div>
        <div><div style={{ fontSize: 17, fontWeight: 800, color: TEXT }}>{s.avgScorePct === null ? "—" : `${s.avgScorePct}%`}</div>avg score</div>
      </div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 12 }}>
        {s.needsAttention.length > 0 && <span style={{ color: GOLD, display: "inline-flex", alignItems: "center", gap: 5 }}><TriangleAlert size={12} /> {s.needsAttention.length} need attention</span>}
        {pendingInvites > 0 && <span style={{ color: MUTED }}>{pendingInvites} invite{pendingInvites > 1 ? "s" : ""} pending</span>}
      </div>
    </div>
  );
}

function PendingInvites({ invites, act }) {
  if (invites.length === 0) return null;
  return (
    <div style={card}>
      <div style={sectionTitle}>Waiting to accept ({invites.length})</div>
      <div style={{ fontSize: 12, color: MUTED, marginBottom: 8 }}>These students see the invite under My College when they sign in with this number or email.</div>
      {invites.map((i) => (
        <div key={i.key} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderTop: `1px solid ${BORDER}`, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 160 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: TEXT }}>{i.name}{i.rollNo ? <span style={{ color: MUTED, fontWeight: 400 }}> · Roll {i.rollNo}</span> : null}</div>
            <div style={{ fontSize: 11.5, color: MUTED }}>{i.contact} · invited {fmtDate(i.createdAt)}</div>
          </div>
          <Button small variant="ghost" onClick={() => act("cancelInvite", { key: i.key })}>Withdraw</Button>
        </div>
      ))}
    </div>
  );
}

function ClassDetail({ cls, data, isAdmin, act, onBack, onOpenStudent, openModal, classNameById }) {
  const students = data.students.filter((s) => s.classId === cls.id);
  const invites = data.invites.filter((i) => i.classId === cls.id);
  const announcements = data.announcements.filter((a) => a.classId === cls.id);
  const summary = summarizeGroup(students);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <Button small variant="secondary" onClick={onBack}><ArrowLeft size={13} /> All classes</Button>
        <div style={{ flex: 1, minWidth: 160 }}>
          <div style={{ fontSize: 19, fontWeight: 800, color: TEXT }}>{cls.name}</div>
          <div style={{ fontSize: 12.5, color: MUTED }}>{cls.exam} · {cls.teacherName || "No teacher assigned"}</div>
        </div>
        <Button small onClick={() => openModal({ type: "addStudents", cls })}><UserPlus size={13} /> Add students</Button>
        <Button small variant="secondary" onClick={() => openModal({ type: "announce", classId: cls.id })}><Megaphone size={13} /> Announce</Button>
        {isAdmin && (
          <>
            <select
              value={cls.teacherUid || ""}
              onChange={(e) => act("updateClass", { classId: cls.id, teacherUid: e.target.value || null })}
              style={{ ...input, width: "auto", padding: "6px 10px", fontSize: 12.5 }}
              title="Assign teacher"
            >
              <option value="">No teacher</option>
              {data.teachers.map((t) => <option key={t.uid} value={t.uid}>{t.name}</option>)}
            </select>
            <Button small variant="danger" onClick={() => {
              if (window.confirm(`Delete ${cls.name}? Students stay in the college but leave this class; pending invites are withdrawn.`)) act("deleteClass", { classId: cls.id }).then((ok) => ok && onBack());
            }}><Trash2 size={13} /> Delete</Button>
          </>
        )}
      </div>
      <CodeBox
        label="CLASS CODE FOR STUDENTS"
        code={cls.joinCode}
        shareText="Students open iBuddie → My College → Join with a code, or tap the invite link."
        onRegenerate={() => { if (window.confirm("Make a new code? The old one stops working; students already in the class stay.")) act("regenerateCode", { target: cls.id }); }}
      />
      <StatGrid summary={summary} />
      <InsightsRow summary={summary} />
      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
          <div style={{ ...sectionTitle, marginBottom: 0, flex: 1 }}>Students ({students.length})</div>
          {students.length > 0 && <Button small variant="secondary" onClick={() => downloadCsv(`${slug(cls.name)}-report.csv`, studentsToCsv(students, classNameById))}><Download size={13} /> Export CSV</Button>}
        </div>
        <StudentTable students={students} onOpenStudent={onOpenStudent} classNameById={classNameById} emptyText="No students yet — add them above or share the class code." />
      </div>
      <PendingInvites invites={invites} act={act} />
      {announcements.length > 0 && (
        <div style={card}>
          <div style={{ ...sectionTitle, marginBottom: 4 }}>Announcements to this class</div>
          {announcements.map((a) => <AnnouncementItem key={a.id} a={a} onDelete={a.canDelete ? () => act("deleteAnnouncement", { id: a.id }) : null} />)}
        </div>
      )}
    </div>
  );
}

function AllStudents({ data, classNameById, onOpenStudent }) {
  const [q, setQ] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const query = q.trim().toLowerCase();
  const filtered = data.students.filter((s) =>
    (!query || s.name.toLowerCase().includes(query) || (s.rollNo || "").toLowerCase().includes(query)) &&
    (!classFilter || (classFilter === "none" ? !classNameById[s.classId] : s.classId === classFilter)) &&
    (!statusFilter || s.status === statusFilter)
  );
  return (
    <div style={card}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <div style={{ position: "relative", flex: "2 1 200px" }}>
          <Search size={14} color={MUTED} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or roll number" style={{ ...input, paddingLeft: 30 }} />
        </div>
        <select value={classFilter} onChange={(e) => setClassFilter(e.target.value)} style={{ ...input, flex: "1 1 150px", width: "auto" }}>
          <option value="">All classes</option>
          {data.classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          {data.role === "admin" && <option value="none">No class</option>}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ ...input, flex: "1 1 140px", width: "auto" }}>
          <option value="">Any status</option>
          <option value="ok">On track</option>
          <option value="struggling">Low scores</option>
          <option value="inactive">Inactive</option>
        </select>
        <Button small variant="secondary" disabled={!filtered.length} onClick={() => downloadCsv(`${slug(data.college.name)}-students.csv`, studentsToCsv(filtered, classNameById))}>
          <Download size={13} /> Export {filtered.length}
        </Button>
      </div>
      <StudentTable
        students={filtered}
        onOpenStudent={onOpenStudent}
        classNameById={classNameById}
        showClass
        emptyText={data.students.length ? "No students match these filters." : "No students yet. Open a class and use Add students."}
      />
    </div>
  );
}

export default function StaffDashboard({ data, act, reload, isMobile }) {
  const isAdmin = data.role === "admin";
  const [tab, setTab] = useState("overview");
  const [openClassId, setOpenClassId] = useState(null);
  const [openStudentUid, setOpenStudentUid] = useState(null);
  const [creating, setCreating] = useState(false);
  const [modal, setModal] = useState(null); // { type: "addStudents", cls } | { type: "announce", classId } | { type: "addTeacher" }

  const summary = summarizeGroup(data.students);
  const teachers = data.teachers || [];
  const classNameById = Object.fromEntries(data.classes.map((c) => [c.id, c.name]));
  const openClass = data.classes.find((c) => c.id === openClassId);
  const openStudent = data.students.find((s) => s.uid === openStudentUid);
  const invitesByClass = data.invites.reduce((acc, i) => ({ ...acc, [i.classId]: (acc[i.classId] || 0) + 1 }), {});
  const tabs = [
    ["overview", "Overview"],
    ["classes", isAdmin ? "Classes" : "My classes"],
    ["students", "Students"],
    ...(isAdmin ? [["teachers", "Teachers"]] : []),
    ["announcements", "Announcements"],
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 1100, margin: "0 auto", width: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <School size={isMobile ? 22 : 28} color={INK} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: isMobile ? 17 : 21, fontWeight: 800, color: TEXT }}>{data.college.name}</div>
          <div style={{ fontSize: 12.5, color: MUTED }}>{[data.college.city, isAdmin ? "College admin" : "Teacher"].filter(Boolean).join(" · ")}</div>
        </div>
        <Button small variant="secondary" onClick={reload}><RefreshCw size={13} /> Refresh</Button>
      </div>

      {!openClass && (
        <div style={{ display: "flex", gap: 2, borderBottom: `1px solid ${BORDER}`, overflowX: "auto" }}>
          {tabs.map(([key, label]) => (
            <div key={key} onClick={() => setTab(key)} style={{
              padding: "8px 14px", fontSize: 13.5, fontWeight: 600, cursor: "pointer", marginBottom: -1, whiteSpace: "nowrap",
              color: tab === key ? TEXT : MUTED, borderBottom: `2px solid ${tab === key ? INK : "transparent"}`,
            }}>{label}</div>
          ))}
        </div>
      )}

      {openClass ? (
        <ClassDetail
          cls={openClass}
          data={data}
          isAdmin={isAdmin}
          act={act}
          onBack={() => setOpenClassId(null)}
          onOpenStudent={setOpenStudentUid}
          openModal={setModal}
          classNameById={classNameById}
        />
      ) : tab === "overview" ? (
        <>
          {data.classes.length === 0 && (
            <div style={{ ...card, fontSize: 13.5, color: TEXT, lineHeight: 1.6 }}>
              <b>Get started:</b> {isAdmin ? "add your teachers from the Teachers tab, then create a class for each section and add students." : "create a class, then add students or share its code with them."}
              <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Button small onClick={() => { setTab("classes"); setCreating(true); }}><Plus size={13} /> Create a class</Button>
                {isAdmin && <Button small variant="secondary" onClick={() => setModal({ type: "addTeacher" })}><UserPlus size={13} /> Add a teacher</Button>}
              </div>
            </div>
          )}
          <StatGrid summary={summary} />
          {isAdmin && data.unassignedStudents > 0 && (
            <div style={{ fontSize: 12.5, color: GOLD }}>{data.unassignedStudents} student(s) aren't in any class — find them under Students → "No class" and move them.</div>
          )}
          <InsightsRow summary={summary} />
          <AttentionList summary={summary} classNameById={classNameById} onOpenStudent={setOpenStudentUid} />
        </>
      ) : tab === "classes" ? (
        <>
          {creating ? (
            <CreateClassForm
              teachers={teachers}
              isAdmin={isAdmin}
              onCancel={() => setCreating(false)}
              onCreate={async (payload) => { if (await act("createClass", payload)) setCreating(false); }}
            />
          ) : (
            <div><Button small onClick={() => setCreating(true)}><Plus size={13} /> New class</Button></div>
          )}
          {data.classes.length === 0 ? (
            <div style={{ fontSize: 13, color: MUTED }}>No classes yet.</div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: 12 }}>
              {data.classes.map((c) => <ClassCard key={c.id} cls={c} pendingInvites={invitesByClass[c.id] || 0} onOpen={() => setOpenClassId(c.id)} />)}
            </div>
          )}
        </>
      ) : tab === "students" ? (
        <AllStudents data={data} classNameById={classNameById} onOpenStudent={setOpenStudentUid} />
      ) : tab === "teachers" ? (
        <>
          <div style={card}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
              <div style={{ ...sectionTitle, marginBottom: 0, flex: 1 }}><Users size={15} style={{ verticalAlign: -2, marginRight: 6 }} />Staff ({teachers.length})</div>
              <Button small onClick={() => setModal({ type: "addTeacher" })}><UserPlus size={13} /> Add teacher</Button>
            </div>
            {teachers.map((t) => (
              <div key={t.uid} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderTop: `1px solid ${BORDER}`, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: TEXT }}>{t.name} {t.role === "admin" && <span style={{ fontSize: 11, color: GOLD }}>· Admin</span>}</div>
                  <div style={{ fontSize: 12, color: MUTED }}>{[t.email, t.classes.length ? t.classes.join(", ") : "No classes yet"].filter(Boolean).join(" · ")}</div>
                </div>
                {t.role !== "admin" && (
                  <Button small variant="danger" onClick={() => { if (window.confirm(`Remove ${t.name}? Their classes stay but become unassigned.`)) act("removeMember", { uid: t.uid }); }}>
                    <Trash2 size={13} /> Remove
                  </Button>
                )}
              </div>
            ))}
          </div>
          <CodeBox
            label="OR SHARE THE TEACHER CODE"
            code={data.college.teacherCode}
            linkBase="/staff/"
            shareText="Teachers sign up at the staff portal and enter this code. Share only with staff."
            onRegenerate={() => { if (window.confirm("Make a new teacher code? The old one stops working.")) act("regenerateCode", { target: "teacher" }); }}
          />
        </>
      ) : (
        <div style={card}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
            <div style={{ ...sectionTitle, marginBottom: 0, flex: 1 }}>Announcements</div>
            <Button small disabled={!isAdmin && data.classes.length === 0} onClick={() => setModal({ type: "announce" })}><Megaphone size={13} /> New announcement</Button>
          </div>
          <div style={{ fontSize: 12, color: MUTED, marginBottom: 6 }}>Students see these under My College in the iBuddie app.</div>
          {data.announcements.length === 0 ? (
            <div style={{ fontSize: 12.5, color: MUTED, paddingTop: 8 }}>Nothing posted yet.</div>
          ) : data.announcements.map((a) => (
            <AnnouncementItem
              key={a.id}
              a={a}
              classLabel={a.classId ? classNameById[a.classId] || "Removed class" : "Whole college"}
              onDelete={a.canDelete ? () => act("deleteAnnouncement", { id: a.id }) : null}
            />
          ))}
        </div>
      )}

      {openStudent && (
        <StudentPanel key={openStudent.uid + openStudent.name + openStudent.rollNo} student={openStudent} classes={data.classes} act={act} onClose={() => setOpenStudentUid(null)} />
      )}
      {modal?.type === "addStudents" && <AddStudentsModal cls={modal.cls} onClose={() => setModal(null)} reload={reload} />}
      {modal?.type === "addTeacher" && <AddTeacherModal onClose={() => setModal(null)} reload={reload} />}
      {modal?.type === "announce" && (
        <AnnouncementModal classes={data.classes} isAdmin={isAdmin} defaultClassId={modal.classId} onClose={() => setModal(null)} reload={reload} />
      )}
    </div>
  );
}

