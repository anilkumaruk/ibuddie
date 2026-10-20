// Pure aggregation helpers for the college / teacher dashboards (api/college.js).
// Kept free of Firestore so they can be unit-tested with `npm test`.

const DAY_MS = 86400000;
export const INACTIVE_AFTER_DAYS = 7;
export const STRUGGLING_BELOW_PCT = 40;

// No 0/O/1/I/L — codes get read aloud in classrooms and typed on phones.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function generateCode(length = 6, random = Math.random) {
  let code = "";
  for (let i = 0; i < length; i++) code += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)];
  return code;
}

export function normalizeCode(raw) {
  return String(raw || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

// Indian mobile numbers as E.164 ("+919876543210") — the same form Firebase stores for
// phone sign-ins (api/verify-otp.js). Returns null for anything that isn't 10 digits
// after dropping a +91 / 91 / 0 prefix.
export function normalizePhone(raw) {
  let digits = String(raw || "").replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  return /^[6-9]\d{9}$/.test(digits) ? `+91${digits}` : null;
}

export function normalizeEmail(raw) {
  const email = String(raw || "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

// Invite doc ids — one pending invite per phone/email.
export function inviteKey({ phone, email }) {
  return phone ? `phone:${phone}` : `email:${email}`;
}

export const MAX_ROSTER_ROWS = 200;

// Parses a pasted roster: one student per line, "Name, phone or email, roll no".
// Commas, tabs (spreadsheet paste) or semicolons all work; the roll number is optional.
export function parseRoster(text) {
  const rows = [];
  const errors = [];
  const seen = new Set();
  String(text || "").split(/\r?\n/).forEach((line, i) => {
    if (!line.trim()) return;
    const cells = line.split(/[,\t;]/).map((c) => c.trim());
    const contactIdx = cells.findIndex((c) => normalizePhone(c) || normalizeEmail(c));
    if (contactIdx === -1) {
      errors.push({ line: i + 1, text: line.trim(), reason: "No valid 10-digit mobile number or email" });
      return;
    }
    const phone = normalizePhone(cells[contactIdx]);
    const email = phone ? null : normalizeEmail(cells[contactIdx]);
    const rest = cells.filter((c, j) => j !== contactIdx && c);
    const name = (rest[0] || "").replace(/\s+/g, " ").slice(0, 60);
    const rollNo = (rest[1] || "").slice(0, 20);
    const key = inviteKey({ phone, email });
    if (seen.has(key)) {
      errors.push({ line: i + 1, text: line.trim(), reason: "Duplicate of an earlier line" });
      return;
    }
    seen.add(key);
    rows.push({ name: name || "Student", phone, email, rollNo });
  });
  if (rows.length > MAX_ROSTER_ROWS) {
    errors.push({ line: null, text: "", reason: `Only ${MAX_ROSTER_ROWS} students can be added at once` });
    rows.length = MAX_ROSTER_ROWS;
  }
  return { rows, errors };
}

// CSV for spreadsheet export of a student list (summarizeStudent results).
export function studentsToCsv(students, classNameById = {}) {
  const header = ["Name", "Roll no", "Class", "Avg mock score %", "Tests", "Doubts", "Study minutes", "Streak", "XP", "Last active", "Status", "Weak topics"];
  const esc = (v) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = students.map((s) => [
    s.name, s.rollNo || "", classNameById[s.classId] || "", s.avgScorePct ?? "", s.tests, s.doubts, s.studyMinutes,
    s.streak, s.xp, s.lastActiveDate || "never", s.status, s.weakTopics.map((t) => t.topic).join("; "),
  ].map(esc).join(","));
  return [header.join(","), ...lines].join("\n");
}

// lastActiveDate is the student's local "YYYY-MM-DD" (see localDateStr in App.jsx).
// Compared at UTC midnight, so it can be off by a day around midnight IST — fine for
// "active this week" style signals.
export function daysSince(dateStr, now = Date.now()) {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  const then = Date.parse(`${dateStr}T00:00:00Z`);
  const today = Date.parse(new Date(now).toISOString().slice(0, 10) + "T00:00:00Z");
  return Math.max(0, Math.round((today - then) / DAY_MS));
}

function pct(score, total) {
  return total > 0 ? (score / total) * 100 : null;
}

function topTopics(counter, n) {
  return Object.entries(counter)
    .map(([topic, count]) => ({ topic, count }))
    .sort((a, b) => b.count - a.count || a.topic.localeCompare(b.topic))
    .slice(0, n);
}

// userDoc: users/{uid} data (may be undefined if the student never opened the app).
// mockResults: newest-first mockTestResults docs ({ subject, score, total, wrongTopics, chapter, ts }).
export function summarizeStudent({ uid, name, classId, rollNo, joinedAt }, userDoc = {}, mockResults = [], now = Date.now()) {
  const scored = mockResults.filter((r) => r && r.total > 0);
  const totalScore = scored.reduce((s, r) => s + r.score, 0);
  const totalQuestions = scored.reduce((s, r) => s + r.total, 0);
  const avgScorePct = totalQuestions > 0 ? Math.round(pct(totalScore, totalQuestions)) : null;

  const wrong = {};
  for (const r of scored) {
    for (const t of r.wrongTopics || []) {
      const key = String(t).trim();
      if (key) wrong[key] = (wrong[key] || 0) + 1;
    }
  }

  const bySubject = {};
  for (const r of scored) {
    const s = (bySubject[r.subject || "General"] ||= { score: 0, total: 0, tests: 0 });
    s.score += r.score;
    s.total += r.total;
    s.tests += 1;
  }

  const lastActiveDate = userDoc?.streak?.lastActiveDate || null;
  const daysInactive = daysSince(lastActiveDate, now);

  let status = "ok";
  if (daysInactive === null || daysInactive > INACTIVE_AFTER_DAYS) status = "inactive";
  else if (avgScorePct !== null && scored.length >= 2 && avgScorePct < STRUGGLING_BELOW_PCT) status = "struggling";

  return {
    uid,
    name: name || "Student",
    rollNo: rollNo || "",
    classId: classId || null,
    joinedAt: joinedAt || null,
    xp: userDoc?.xp || 0,
    streak: userDoc?.streak?.current || 0,
    doubts: userDoc?.totalDoubtsAsked || 0,
    tests: userDoc?.totalTestsCompleted || 0,
    studyMinutes: userDoc?.totalStudyMinutes || 0,
    lastActiveDate,
    daysInactive,
    avgScorePct,
    status,
    subjects: Object.entries(bySubject).map(([subject, s]) => ({
      subject, tests: s.tests, avgScorePct: Math.round(pct(s.score, s.total)),
    })),
    weakTopics: topTopics(wrong, 5),
    recentTests: scored.slice(0, 10).map((r) => ({
      subject: r.subject || "General", chapter: r.chapter || null, score: r.score, total: r.total, ts: r.ts || null,
    })),
  };
}

export const SCORE_BANDS = [
  { label: "Below 40%", min: 0, max: 40 },
  { label: "40–59%", min: 40, max: 60 },
  { label: "60–79%", min: 60, max: 80 },
  { label: "80%+", min: 80, max: 101 },
];

// Aggregates a list of summarizeStudent() results — used for a class and for a whole college.
// `weakTopicCounts` are summed from each student's top weak topics, so a topic shows up when
// many students repeatedly miss it rather than one student missing it many times.
export function summarizeGroup(students) {
  const withScore = students.filter((s) => s.avgScorePct !== null);
  const weak = {};
  for (const s of students) for (const w of s.weakTopics) weak[w.topic] = (weak[w.topic] || 0) + 1;

  return {
    students: students.length,
    active7d: students.filter((s) => s.daysInactive !== null && s.daysInactive <= INACTIVE_AFTER_DAYS).length,
    avgScorePct: withScore.length ? Math.round(withScore.reduce((a, s) => a + s.avgScorePct, 0) / withScore.length) : null,
    doubts: students.reduce((a, s) => a + s.doubts, 0),
    tests: students.reduce((a, s) => a + s.tests, 0),
    studyMinutes: students.reduce((a, s) => a + s.studyMinutes, 0),
    scoreBands: SCORE_BANDS.map((b) => ({
      label: b.label,
      count: withScore.filter((s) => s.avgScorePct >= b.min && s.avgScorePct < b.max).length,
    })),
    weakTopics: topTopics(weak, 8),
    needsAttention: students
      .filter((s) => s.status !== "ok")
      .sort((a, b) => (a.status === b.status ? (b.daysInactive ?? 9999) - (a.daysInactive ?? 9999) : a.status === "struggling" ? -1 : 1))
      .map((s) => ({ uid: s.uid, name: s.name, classId: s.classId, status: s.status, daysInactive: s.daysInactive, avgScorePct: s.avgScorePct })),
  };
}

// ---- staff dashboard charts & feed (built from summarizeStudent results) ----

function dayKey(ts) {
  return new Date(ts).toISOString().slice(0, 10);
}

// One point per day for the last `days` days (oldest first): tests taken that day and the
// average score of those tests. Built from each student's recentTests, so it reflects their
// most recent tests rather than complete history.
export function dailyTrend(students, days = 7, now = Date.now()) {
  const points = [];
  for (let i = days - 1; i >= 0; i--) points.push({ date: dayKey(now - i * DAY_MS), tests: 0, score: 0, total: 0 });
  const byDate = Object.fromEntries(points.map((p) => [p.date, p]));
  for (const s of students) {
    for (const t of s.recentTests) {
      const p = t.ts && byDate[dayKey(t.ts)];
      if (!p) continue;
      p.tests += 1;
      p.score += t.score;
      p.total += t.total;
    }
  }
  return points.map(({ date, tests, score, total }) => ({ date, tests, avgScorePct: total > 0 ? Math.round((score / total) * 100) : null }));
}

export function testsSince(students, sinceTs) {
  return students.reduce((n, s) => n + s.recentTests.filter((t) => t.ts && t.ts >= sinceTs).length, 0);
}

// Average score per subject across all students' recent tests, weighted by questions.
export function subjectBreakdown(students) {
  const acc = {};
  for (const s of students) {
    for (const t of s.recentTests) {
      const a = (acc[t.subject] ||= { score: 0, total: 0, tests: 0 });
      a.score += t.score;
      a.total += t.total;
      a.tests += 1;
    }
  }
  return Object.fromEntries(Object.entries(acc).map(([subject, a]) => [subject, { tests: a.tests, avgScorePct: Math.round((a.score / a.total) * 100) }]));
}

// Newest-first feed of real events: tests completed, students joining, announcements, invites.
export function activityFeed({ students = [], announcements = [], invites = [] }, limit = 8) {
  const events = [];
  for (const s of students) {
    if (s.joinedAt) events.push({ type: "joined", ts: s.joinedAt, uid: s.uid, name: s.name, classId: s.classId });
    for (const t of s.recentTests) {
      if (t.ts) events.push({ type: "test", ts: t.ts, uid: s.uid, name: s.name, classId: s.classId, subject: t.subject, chapter: t.chapter, score: t.score, total: t.total });
    }
  }
  for (const a of announcements) events.push({ type: "announcement", ts: a.ts, title: a.title, authorName: a.authorName, classId: a.classId || null });
  for (const i of invites) if (i.createdAt) events.push({ type: "invite", ts: i.createdAt, name: i.name, classId: i.classId });
  return events.sort((a, b) => b.ts - a.ts).slice(0, limit);
}
