import { useState, useRef, useEffect } from "react";
import { sendPasswordResetEmail } from "firebase/auth";
import {
  Users, UserPlus, ArrowLeft, TriangleAlert, Plus, Trash2, X, Loader2, Flame,
  Download, Megaphone, Search, Mail, Pencil, CheckCircle2, MoreHorizontal, RefreshCw, School, BarChart3,
} from "lucide-react";
import { auth } from "../Login.jsx";
import { callCollege } from "../collegeApi.js";
import { summarizeGroup, parseRoster, normalizePhone, normalizeEmail, studentsToCsv, MAX_ROSTER_ROWS } from "../../lib/collegeStats.js";
import { INK, TEXT, MUTED, BORDER, PAPER, GREEN, GOLD, EXAMS, card, panel, input, sectionTitle, fmtDate } from "./theme.js";
import { Button, Field, ErrorNote, Modal, StatTile, BarList, StatusTag, CodeBox, AnnouncementItem } from "./ui.jsx";
import { Sidebar, TopBar } from "./StaffChrome.jsx";
import {
  StatCards, TrendCard, SubjectCard, ActivityCard, AttentionCard, QuickActions,
  ClassOverviewCard, TeacherOverviewCard, AnnouncementsCard,
} from "./OverviewWidgets.jsx";

// Staff portal (college admin + teachers): sidebar layout with Overview, Classes, Students,
// Teachers and Announcements pages. Rendered by src/staff/StaffApp.jsx.
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

function InsightsRow({ summary }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
      <div style={panel}>
        <div style={sectionTitle}>Students by average mock score</div>
        <BarList rows={summary.scoreBands.map((b) => ({ label: b.label, value: b.count }))} unit="students" empty="No mock tests taken yet." />
      </div>
      <div style={panel}>
        <div style={sectionTitle}>Topics most students get wrong</div>
        <BarList rows={summary.weakTopics.map((t) => ({ label: t.topic, value: t.count }))} unit="students" empty="Weak topics appear once students take mock tests." />
      </div>
    </div>
  );
}

function PageHeader({ title, subtitle, actions, onBack }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 12, flexWrap: "wrap", marginBottom: 4 }}>
      {onBack && <Button small variant="secondary" onClick={onBack} style={{ alignSelf: "center" }}><ArrowLeft size={13} /> Back</Button>}
      <div style={{ flex: 1, minWidth: 200 }}>
        <div style={{ fontSize: 26, fontWeight: 800, color: TEXT, letterSpacing: "-0.01em" }}>{title}</div>
        {subtitle && <div style={{ fontSize: 14, color: MUTED, marginTop: 2 }}>{subtitle}</div>}
      </div>
      {actions && <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{actions}</div>}
    </div>
  );
}

function greeting(now = new Date()) {
  const h = now.getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
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

// Opened from a class page (cls given) or from the overview (pick the class here).
function AddStudentsModal({ cls: fixedClass, classes, onClose, reload, onCreateClass }) {
  const [classId, setClassId] = useState(fixedClass?.id || classes[0]?.id || "");
  const cls = fixedClass || classes.find((c) => c.id === classId);
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

  if (!cls) {
    return (
      <Modal title="Add students" onClose={onClose}>
        <div style={{ fontSize: 13.5, color: TEXT, lineHeight: 1.6, marginBottom: 14 }}>Students are added to a class. Create your first class, then add students to it.</div>
        <Button onClick={onCreateClass}><Plus size={14} /> Create a class</Button>
      </Modal>
    );
  }

  return (
    <Modal title={fixedClass ? `Add students to ${cls.name}` : "Add students"} onClose={onClose} width={600}>
      {!fixedClass && (
        <Field label="Class">
          <select value={classId} onChange={(e) => setClassId(e.target.value)} style={input}>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
      )}
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
      <StatCards summary={summary} students={students} />
      <InsightsRow summary={summary} />
      <div style={panel}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
          <div style={{ ...sectionTitle, marginBottom: 0, flex: 1 }}>Students ({students.length})</div>
          {students.length > 0 && <Button small variant="secondary" onClick={() => downloadCsv(`${slug(cls.name)}-report.csv`, studentsToCsv(students, classNameById))}><Download size={13} /> Export CSV</Button>}
        </div>
        <StudentTable students={students} onOpenStudent={onOpenStudent} classNameById={classNameById} emptyText="No students yet — add them above or share the class code." />
      </div>
      <PendingInvites invites={invites} act={act} />
      {announcements.length > 0 && (
        <div style={panel}>
          <div style={{ ...sectionTitle, marginBottom: 4 }}>Announcements to this class</div>
          {announcements.map((a) => <AnnouncementItem key={a.id} a={a} onDelete={a.canDelete ? () => act("deleteAnnouncement", { id: a.id }) : null} />)}
        </div>
      )}
    </div>
  );
}

function AllStudents({ data, classNameById, onOpenStudent, initialStatus = "" }) {
  const [q, setQ] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState(initialStatus);
  const query = q.trim().toLowerCase();
  const filtered = data.students.filter((s) =>
    (!query || s.name.toLowerCase().includes(query) || (s.rollNo || "").toLowerCase().includes(query)) &&
    (!classFilter || (classFilter === "none" ? !classNameById[s.classId] : s.classId === classFilter)) &&
    (!statusFilter || (statusFilter === "attention" ? s.status !== "ok" : s.status === statusFilter))
  );
  return (
    <div style={panel}>
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
          <option value="attention">Needs attention</option>
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

function MoreMenu({ items }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <Button variant="secondary" onClick={() => setOpen((v) => !v)}><MoreHorizontal size={15} /> More</Button>
      {open && (
        <div style={{ position: "absolute", right: 0, top: "calc(100% + 6px)", width: 220, background: "#FFFFFF", border: `1px solid ${BORDER}`, borderRadius: 14, boxShadow: "0 12px 32px rgba(20,16,60,0.14)", padding: 6, zIndex: 30 }}>
          {items.map((it) => (
            <button key={it.label} disabled={it.disabled} onClick={() => { setOpen(false); it.onClick(); }} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "9px 12px", border: "none", background: "transparent", borderRadius: 10, cursor: it.disabled ? "default" : "pointer", opacity: it.disabled ? 0.5 : 1, fontSize: 13, color: TEXT, textAlign: "left", fontFamily: "inherit" }}>
              <it.icon size={15} color={INK} /> {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function StaffDashboard({ data, act, reload, isMobile, busy, user, onSignOut }) {
  const isAdmin = data.role === "admin";
  const [page, setPage] = useState("overview");
  const [menuOpen, setMenuOpen] = useState(false);
  const [openClassId, setOpenClassId] = useState(null);
  const [openStudentUid, setOpenStudentUid] = useState(null);
  const [creating, setCreating] = useState(false);
  const [studentFilter, setStudentFilter] = useState({ status: "", n: 0 }); // n remounts the list so a preset applies
  const [modal, setModal] = useState(null); // { type: "addStudents", cls? } | { type: "announce", classId? } | { type: "addTeacher" }
  const mainRef = useRef(null);

  const summary = summarizeGroup(data.students);
  const teachers = data.teachers || [];
  const classNameById = Object.fromEntries(data.classes.map((c) => [c.id, c.name]));
  const openClass = data.classes.find((c) => c.id === openClassId);
  const openStudent = data.students.find((s) => s.uid === openStudentUid);
  const invitesByClass = data.invites.reduce((acc, i) => ({ ...acc, [i.classId]: (acc[i.classId] || 0) + 1 }), {});
  const firstName = (data.me?.name || user.displayName || "").split(" ")[0] || "there";

  function go(next) {
    setPage(next);
    setOpenClassId(null);
    setCreating(false);
    mainRef.current?.scrollTo?.(0, 0);
    window.scrollTo(0, 0);
  }
  const openClassPage = (id) => { go("classes"); setOpenClassId(id); };
  const startCreateClass = () => { setModal(null); go("classes"); setCreating(true); };
  const showAttention = () => { go("students"); setStudentFilter((f) => ({ status: "attention", n: f.n + 1 })); };
  const exportAll = () => downloadCsv(`${slug(data.college.name)}-students.csv`, studentsToCsv(data.students, classNameById));

  function onSearchPick(r) {
    if (r.kind === "student") setOpenStudentUid(r.id);
    else if (r.kind === "class") openClassPage(r.id);
    else go("teachers");
  }

  const quickActions = [
    { label: "Add Student", icon: UserPlus, onClick: () => setModal({ type: "addStudents" }) },
    { label: "Create Class", icon: School, onClick: startCreateClass },
    isAdmin
      ? { label: "Add Teacher", icon: Users, onClick: () => setModal({ type: "addTeacher" }) }
      : { label: "View Students", icon: Users, onClick: () => go("students") },
    { label: "Post Announcement", icon: Megaphone, onClick: () => setModal({ type: "announce" }), disabled: !isAdmin && data.classes.length === 0 },
    { label: "Export Report", icon: Download, onClick: exportAll, disabled: data.students.length === 0 },
    { label: "Needs Attention", icon: BarChart3, onClick: showAttention },
  ];

  let content;
  if (page === "overview") {
    content = (
      <>
        <PageHeader
          title={<>{greeting()}, {firstName}! <span role="img" aria-label="wave">👋</span></>}
          subtitle={`Here's what's happening at ${data.college.name} this week.`}
          actions={
            <>
              <Button onClick={() => setModal({ type: "addStudents" })}><Plus size={15} /> Add Student</Button>
              {!isMobile && <Button variant="secondary" onClick={startCreateClass}><Plus size={15} /> Create Class</Button>}
              {isAdmin && !isMobile && <Button variant="secondary" onClick={() => setModal({ type: "addTeacher" })}><Plus size={15} /> Add Teacher</Button>}
              <MoreMenu items={[
                ...(isMobile ? [{ label: "Create class", icon: School, onClick: startCreateClass }] : []),
                ...(isMobile && isAdmin ? [{ label: "Add teacher", icon: Users, onClick: () => setModal({ type: "addTeacher" }) }] : []),
                { label: "Post announcement", icon: Megaphone, onClick: () => setModal({ type: "announce" }), disabled: !isAdmin && data.classes.length === 0 },
                { label: "Export students (CSV)", icon: Download, onClick: exportAll, disabled: data.students.length === 0 },
                { label: "Refresh data", icon: RefreshCw, onClick: reload },
              ]} />
            </>
          }
        />
        {isAdmin && data.unassignedStudents > 0 && (
          <div onClick={() => go("students")} style={{ ...card, padding: "10px 14px", fontSize: 13, color: GOLD, cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}>
            <TriangleAlert size={15} /> {data.unassignedStudents} student(s) aren't in any class — open Students and filter by "No class" to move them.
          </div>
        )}
        <StatCards summary={summary} students={data.students} />
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 1.55fr) minmax(0, 1fr)", gap: 16 }}>
          <TrendCard students={data.students} classes={data.classes} />
          <SubjectCard students={data.students} classes={data.classes} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16 }}>
          <ActivityCard data={data} classNameById={classNameById} onOpenStudent={setOpenStudentUid} />
          <AttentionCard summary={summary} classNameById={classNameById} onOpenStudent={setOpenStudentUid} onViewAll={showAttention} />
          <QuickActions actions={quickActions} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16 }}>
          <ClassOverviewCard classes={data.classes} onOpenClass={openClassPage} onViewAll={() => go("classes")} onCreate={startCreateClass} />
          {isAdmin && <TeacherOverviewCard teachers={teachers} onViewAll={() => go("teachers")} />}
          <AnnouncementsCard announcements={data.announcements} classNameById={classNameById} onNew={() => setModal({ type: "announce" })} onViewAll={() => go("announcements")} />
        </div>
      </>
    );
  } else if (page === "classes" && openClass) {
    content = (
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
    );
  } else if (page === "classes") {
    content = (
      <>
        <PageHeader
          title={isAdmin ? "Classes" : "My Classes"}
          subtitle="Each class has a join code students use in the iBuddie app."
          actions={!creating && <Button onClick={() => setCreating(true)}><Plus size={15} /> New class</Button>}
        />
        {creating && (
          <CreateClassForm
            teachers={teachers}
            isAdmin={isAdmin}
            onCancel={() => setCreating(false)}
            onCreate={async (payload) => { if (await act("createClass", payload)) setCreating(false); }}
          />
        )}
        {data.classes.length === 0 ? (
          <div style={{ ...panel, fontSize: 13.5, color: MUTED }}>No classes yet. Create one for each section, then add students or share its code.</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}>
            {data.classes.map((c) => <ClassCard key={c.id} cls={c} pendingInvites={invitesByClass[c.id] || 0} onOpen={() => setOpenClassId(c.id)} />)}
          </div>
        )}
      </>
    );
  } else if (page === "students") {
    content = (
      <>
        <PageHeader
          title="Students"
          subtitle={`${data.students.length} student${data.students.length === 1 ? "" : "s"}${data.invites.length ? ` · ${data.invites.length} invite${data.invites.length === 1 ? "" : "s"} pending` : ""}`}
          actions={<Button onClick={() => setModal({ type: "addStudents" })}><UserPlus size={15} /> Add Student</Button>}
        />
        <AllStudents key={studentFilter.n} data={data} classNameById={classNameById} onOpenStudent={setOpenStudentUid} initialStatus={studentFilter.status} />
      </>
    );
  } else if (page === "teachers" && isAdmin) {
    content = (
      <>
        <PageHeader title="Teachers" subtitle="Staff who can manage classes in the portal." actions={<Button onClick={() => setModal({ type: "addTeacher" })}><UserPlus size={15} /> Add Teacher</Button>} />
        <div style={panel}>
          {teachers.map((t, i) => (
            <div key={t.uid} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderTop: i ? `1px solid ${BORDER}` : "none", flexWrap: "wrap" }}>
              <div style={{ width: 40, height: 40, borderRadius: "50%", background: "#E8F7EE", color: "#15803D", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, flexShrink: 0 }}>{t.name[0]?.toUpperCase()}</div>
              <div style={{ flex: 1, minWidth: 180 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: TEXT }}>{t.name} {t.role === "admin" && <span style={{ fontSize: 10.5, fontWeight: 700, color: "#A15C07", background: "#FFF3DD", borderRadius: 999, padding: "1px 7px", marginLeft: 4 }}>Admin</span>}</div>
                <div style={{ fontSize: 12.5, color: MUTED }}>{[t.email, t.classes.length ? t.classes.join(", ") : "No classes yet"].filter(Boolean).join(" · ")}</div>
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
    );
  } else {
    content = (
      <>
        <PageHeader
          title="Announcements"
          subtitle="Students see these under My College in the iBuddie app."
          actions={<Button disabled={!isAdmin && data.classes.length === 0} onClick={() => setModal({ type: "announce" })}><Megaphone size={15} /> New announcement</Button>}
        />
        <div style={panel}>
          {data.announcements.length === 0 ? (
            <div style={{ fontSize: 13, color: MUTED }}>Nothing posted yet.</div>
          ) : data.announcements.map((a) => (
            <AnnouncementItem
              key={a.id}
              a={a}
              classLabel={a.classId ? classNameById[a.classId] || "Removed class" : "Whole college"}
              onDelete={a.canDelete ? () => act("deleteAnnouncement", { id: a.id }) : null}
            />
          ))}
        </div>
      </>
    );
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "var(--ib-page, #F7F7FB)" }}>
      <Sidebar data={data} page={page} onNavigate={go} open={menuOpen} onClose={() => setMenuOpen(false)} isMobile={isMobile} />
      <div ref={mainRef} style={{ flex: 1, minWidth: 0 }}>
        <TopBar
          data={data}
          user={user}
          isMobile={isMobile}
          onOpenMenu={() => setMenuOpen(true)}
          onSearchPick={onSearchPick}
          onRefresh={reload}
          onSignOut={onSignOut}
          attentionCount={summary.needsAttention.length}
          onAttention={showAttention}
          onInvites={() => go("classes")}
        />
        <main style={{ padding: isMobile ? "18px 12px 40px" : "28px 28px 48px", display: "flex", flexDirection: "column", gap: 18, maxWidth: 1400, opacity: busy ? 0.7 : 1, transition: "opacity 0.15s" }}>
          {content}
        </main>
      </div>

      {openStudent && (
        <StudentPanel key={openStudent.uid + openStudent.name + openStudent.rollNo} student={openStudent} classes={data.classes} act={act} onClose={() => setOpenStudentUid(null)} />
      )}
      {modal?.type === "addStudents" && <AddStudentsModal cls={modal.cls} classes={data.classes} onClose={() => setModal(null)} reload={reload} onCreateClass={startCreateClass} />}
      {modal?.type === "addTeacher" && <AddTeacherModal onClose={() => setModal(null)} reload={reload} />}
      {modal?.type === "announce" && (
        <AnnouncementModal classes={data.classes} isAdmin={isAdmin} defaultClassId={modal.classId} onClose={() => setModal(null)} reload={reload} />
      )}
    </div>
  );
}
