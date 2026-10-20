import { useState, useRef, useLayoutEffect } from "react";
import {
  Users, Activity, BarChart3, HelpCircle, FileText, Clock3, LineChart, BookOpen, Atom, FlaskConical, Calculator, Dna,
  History, TriangleAlert, Zap, UserPlus, GraduationCap, Megaphone, ChevronRight, Mail, Plus,
} from "lucide-react";
import { dailyTrend, subjectBreakdown, activityFeed, testsSince } from "../../lib/collegeStats.js";
import { INK, INK_SOFT, TEXT, MUTED, BORDER, PAPER, BAR, panel, timeAgo } from "./theme.js";
import { StatusTag, Button } from "./ui.jsx";

// Cards for the staff Overview page. Everything is computed from the dashboard payload
// (lib/collegeStats.js helpers) — no extra API calls.

const DAY_MS = 86400000;

// Decorative icon tiles on the stat cards (identity only — values stay in text colors).
const TINTS = {
  indigo: ["#EEF0FF", "#4F46E5"],
  green: ["#E8F7EE", "#15803D"],
  violet: ["#F2ECFF", "#7C3AED"],
  red: ["#FDECEC", "#C62828"],
  amber: ["#FFF3DD", "#B45309"],
  blue: ["#E8F1FF", "#1D4ED8"],
};

function IconTile({ icon: Icon, tint, size = 44 }) {
  const [bg, fg] = TINTS[tint];
  return (
    <div style={{ width: size, height: size, borderRadius: 12, background: bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      <Icon size={size * 0.48} color={fg} />
    </div>
  );
}

export function PanelHeader({ icon: Icon, title, right }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
      {Icon && <Icon size={19} color={INK} />}
      <div style={{ fontSize: 16, fontWeight: 700, color: TEXT, flex: 1, minWidth: 120 }}>{title}</div>
      {right}
    </div>
  );
}

export function LinkButton({ children, onClick }) {
  return (
    <button onClick={onClick} style={{ background: "none", border: "none", color: INK, fontSize: 13, fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 2, padding: 0, fontFamily: "inherit" }}>
      {children} <ChevronRight size={14} />
    </button>
  );
}

function Segmented({ options, value, onChange }) {
  return (
    <div style={{ display: "inline-flex", background: PAPER, borderRadius: 10, padding: 3, gap: 2 }}>
      {options.map(([key, label]) => (
        <button key={key} onClick={() => onChange(key)} style={{
          border: "none", borderRadius: 8, padding: "5px 12px", fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
          background: value === key ? INK : "transparent", color: value === key ? "#FFFFFF" : MUTED,
        }}>{label}</button>
      ))}
    </div>
  );
}

export function ClassSelect({ classes, value, onChange }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} style={{ padding: "6px 10px", borderRadius: 10, border: `1px solid ${BORDER}`, fontSize: 12.5, color: TEXT, background: "#FFFFFF", fontFamily: "inherit", maxWidth: 170 }}>
      <option value="">All classes</option>
      {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
    </select>
  );
}

function Avatar({ name, size = 36 }) {
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", background: "#E8F7EE", color: "#15803D", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: size * 0.42, flexShrink: 0 }}>
      {(name || "?").trim()[0]?.toUpperCase()}
    </div>
  );
}

// ---- stat cards ------------------------------------------------------------

export function StatCards({ summary, students }) {
  const weekTests = testsSince(students, Date.now() - 7 * DAY_MS);
  const activePct = summary.students ? Math.round((summary.active7d / summary.students) * 100) : 0;
  const tiles = [
    { icon: Users, tint: "indigo", label: "Students", value: summary.students, hint: "Total enrolled" },
    { icon: Activity, tint: "green", label: "Active (7 days)", value: summary.active7d, hint: `${activePct}% of students` },
    { icon: BarChart3, tint: "violet", label: "Avg score", value: summary.avgScorePct === null ? "—" : `${summary.avgScorePct}%`, hint: "Last 10 tests" },
    { icon: HelpCircle, tint: "red", label: "Doubts", value: summary.doubts.toLocaleString("en-IN"), hint: "Asked, all time" },
    { icon: FileText, tint: "amber", label: "Tests taken", value: summary.tests.toLocaleString("en-IN"), hint: `${weekTests} this week` },
    { icon: Clock3, tint: "blue", label: "Study hours", value: Math.round(summary.studyMinutes / 60).toLocaleString("en-IN"), hint: "Study With Me" },
  ];
  const oneLine = { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(165px, 1fr))", gap: 14 }}>
      {tiles.map((t) => (
        <div key={t.label} title={`${t.label}: ${t.value} — ${t.hint}`} style={{ ...panel, padding: 14, display: "flex", gap: 12, alignItems: "flex-start" }}>
          <IconTile icon={t.icon} tint={t.tint} size={40} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12.5, color: TEXT, fontWeight: 500, ...oneLine }}>{t.label}</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: TEXT, lineHeight: 1.25, fontVariantNumeric: "tabular-nums" }}>{t.value}</div>
            <div style={{ fontSize: 12, color: MUTED, marginTop: 2, ...oneLine }}>{t.hint}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---- performance trend -----------------------------------------------------

function useWidth() {
  const ref = useRef(null);
  const [width, setWidth] = useState(600);
  useLayoutEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(260, entry.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

function niceMax(v) {
  if (v <= 4) return 4;
  const step = Math.pow(10, Math.floor(Math.log10(v)));
  return Math.ceil(v / step) * step;
}

function shortDate(iso) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
}

// One measure at a time (score is %, tests are a count — they never share an axis).
function TrendChart({ points, metric }) {
  const [ref, width] = useWidth();
  const [hover, setHover] = useState(null);
  const H = 230, padL = 34, padR = 12, padT = 12, padB = 30;
  const plotW = width - padL - padR, plotH = H - padT - padB;
  const isScore = metric === "score";
  const yMax = isScore ? 100 : niceMax(Math.max(...points.map((p) => p.tests), 1));
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(f * yMax));
  const step = plotW / points.length;
  const xAt = (i) => padL + step * (i + 0.5);
  const yAt = (v) => padT + plotH - (v / yMax) * plotH;
  const labelEvery = points.length <= 7 ? 1 : points.length <= 30 ? 5 : 15;

  // Break the line where a day has no tests instead of drawing through zero.
  const segments = [];
  let current = [];
  points.forEach((p, i) => {
    if (p.avgScorePct === null) {
      if (current.length) segments.push(current);
      current = [];
    } else current.push([xAt(i), yAt(p.avgScorePct)]);
  });
  if (current.length) segments.push(current);

  const hasData = points.some((p) => p.tests > 0);
  const hp = hover !== null ? points[hover] : null;
  const barW = Math.max(3, Math.min(28, step * 0.55));

  return (
    <div ref={ref} style={{ position: "relative", width: "100%" }}>
      <svg width={width} height={H} role="img" aria-label={isScore ? "Average mock score by day" : "Mock tests taken by day"} onMouseLeave={() => setHover(null)} style={{ display: "block" }}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={width - padR} y1={yAt(t)} y2={yAt(t)} stroke="#EEEDF4" />
            <text x={padL - 8} y={yAt(t) + 4} textAnchor="end" fontSize="11" fill="#8E8DA3">{isScore ? `${t}` : t}</text>
          </g>
        ))}
        {hp && <line x1={xAt(hover)} x2={xAt(hover)} y1={padT} y2={padT + plotH} stroke="#D9D6EA" strokeDasharray="3 3" />}
        {isScore ? (
          <>
            {segments.map((seg, k) => (
              <polyline key={k} points={seg.map((pt) => pt.join(",")).join(" ")} fill="none" stroke={BAR} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
            ))}
            {points.map((p, i) => p.avgScorePct !== null && (
              <circle key={p.date} cx={xAt(i)} cy={yAt(p.avgScorePct)} r={hover === i ? 5.5 : 4} fill="#FFFFFF" stroke={BAR} strokeWidth="2" />
            ))}
          </>
        ) : (
          points.map((p, i) => p.tests > 0 && (
            <path
              key={p.date}
              d={(() => {
                const x = xAt(i) - barW / 2, y = yAt(p.tests), h = padT + plotH - y, r = Math.min(4, barW / 2, h);
                return `M${x},${padT + plotH} V${y + r} Q${x},${y} ${x + r},${y} H${x + barW - r} Q${x + barW},${y} ${x + barW},${y + r} V${padT + plotH} Z`;
              })()}
              fill={BAR}
              opacity={hover === null || hover === i ? 1 : 0.55}
            />
          ))
        )}
        {points.map((p, i) => (i % labelEvery === 0 || i === points.length - 1) && (
          <text key={p.date} x={xAt(i)} y={H - 8} textAnchor="middle" fontSize="11" fill="#8E8DA3">{shortDate(p.date)}</text>
        ))}
        {/* Hit targets wider than the marks. */}
        {points.map((p, i) => (
          <rect key={p.date} x={padL + step * i} y={padT} width={step} height={plotH} fill="transparent" onMouseEnter={() => setHover(i)} onClick={() => setHover(i)} />
        ))}
      </svg>
      {!hasData && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
          <div style={{ background: "#FFFFFFE6", padding: "6px 12px", borderRadius: 8, fontSize: 12.5, color: MUTED }}>No mock tests in this period yet</div>
        </div>
      )}
      {hp && (
        <div style={{
          position: "absolute", top: 6, left: Math.min(Math.max(xAt(hover) - 70, 0), width - 140), width: 140, pointerEvents: "none",
          background: "#1C1B29", color: "#FFFFFF", borderRadius: 10, padding: "8px 10px", fontSize: 12, boxShadow: "0 6px 16px rgba(20,16,60,0.18)",
        }}>
          <div style={{ fontWeight: 700, marginBottom: 2 }}>{shortDate(hp.date)}</div>
          <div>Avg score: <b>{hp.avgScorePct === null ? "—" : `${hp.avgScorePct}%`}</b></div>
          <div>Tests taken: <b>{hp.tests}</b></div>
        </div>
      )}
    </div>
  );
}

export function TrendCard({ students, classes }) {
  const [range, setRange] = useState("7");
  const [classId, setClassId] = useState("");
  const [metric, setMetric] = useState("score");
  const pool = classId ? students.filter((s) => s.classId === classId) : students;
  const points = dailyTrend(pool, Number(range));
  return (
    <div style={panel}>
      <PanelHeader
        icon={LineChart}
        title="Student Performance Trend"
        right={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Segmented options={[["7", "7D"], ["30", "30D"], ["90", "90D"]]} value={range} onChange={setRange} />
            <ClassSelect classes={classes} value={classId} onChange={setClassId} />
          </div>
        }
      />
      <div style={{ marginBottom: 6 }}>
        <Segmented options={[["score", "Average score %"], ["tests", "Tests taken"]]} value={metric} onChange={setMetric} />
      </div>
      <TrendChart points={points} metric={metric} />
      <div style={{ fontSize: 11.5, color: MUTED, marginTop: 4 }}>Based on each student's 10 most recent mock tests. Hover a day for details.</div>
    </div>
  );
}

// ---- subject-wise performance ---------------------------------------------

const SUBJECT_META = {
  Physics: { icon: Atom, tint: "indigo" },
  Chemistry: { icon: FlaskConical, tint: "violet" },
  Mathematics: { icon: Calculator, tint: "green" },
  Biology: { icon: Dna, tint: "red" },
};

export function SubjectCard({ students, classes }) {
  const [classId, setClassId] = useState("");
  const pool = classId ? students.filter((s) => s.classId === classId) : students;
  const data = subjectBreakdown(pool);
  const subjects = [...new Set([...Object.keys(SUBJECT_META), ...Object.keys(data)])];
  return (
    <div style={panel}>
      <PanelHeader icon={BookOpen} title="Subject-wise Performance" right={<ClassSelect classes={classes} value={classId} onChange={setClassId} />} />
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {subjects.map((name) => {
          const meta = SUBJECT_META[name] || { icon: BookOpen, tint: "blue" };
          const d = data[name];
          return (
            <div key={name} title={d ? `${name}: ${d.avgScorePct}% average over ${d.tests} tests` : `${name}: no tests yet`} style={{ display: "grid", gridTemplateColumns: "36px minmax(80px, 110px) 1fr auto", alignItems: "center", gap: 12 }}>
              <IconTile icon={meta.icon} tint={meta.tint} size={36} />
              <span style={{ fontSize: 13.5, fontWeight: 600, color: TEXT }}>{name}</span>
              <div style={{ height: 8, background: PAPER, borderRadius: 4 }}>
                {d && <div style={{ width: `${d.avgScorePct}%`, minWidth: 4, height: "100%", background: BAR, borderRadius: 4 }} />}
              </div>
              <span style={{ fontSize: 12.5, color: d ? TEXT : MUTED, textAlign: "right", minWidth: 70, fontVariantNumeric: "tabular-nums" }}>
                {d ? <><b>{d.avgScorePct}%</b> <span style={{ color: MUTED }}>· {d.tests}</span></> : "No data"}
              </span>
            </div>
          );
        })}
      </div>
      <div style={{ fontSize: 11.5, color: MUTED, marginTop: 14 }}>Average score · number of tests</div>
    </div>
  );
}

// ---- recent activity -------------------------------------------------------

const EVENT_STYLE = {
  test: { icon: FileText, tint: "green" },
  joined: { icon: UserPlus, tint: "amber" },
  announcement: { icon: Megaphone, tint: "violet" },
  invite: { icon: Mail, tint: "blue" },
};

function describe(e, classNameById) {
  const cls = classNameById[e.classId];
  if (e.type === "test") return { title: `${e.name} scored ${e.score}/${e.total}`, sub: `${e.subject}${e.chapter ? ` · ${e.chapter}` : ""} mock test` };
  if (e.type === "joined") return { title: `${e.name} joined`, sub: cls || "College" };
  if (e.type === "announcement") return { title: `Announcement: ${e.title}`, sub: `${e.authorName || "Staff"} · ${e.classId ? cls || "Class" : "Whole college"}` };
  return { title: `${e.name} was invited`, sub: `${cls || "Class"} · waiting to accept` };
}

export function ActivityCard({ data, classNameById, onOpenStudent }) {
  const feed = activityFeed(data, 6);
  return (
    <div style={panel}>
      <PanelHeader icon={History} title="Recent Activity" />
      {feed.length === 0 ? (
        <div style={{ fontSize: 13, color: MUTED, lineHeight: 1.6 }}>No activity yet. Mock tests, new students, invites and announcements will show up here.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {feed.map((e, i) => {
            const d = describe(e, classNameById);
            return (
              <div key={i} onClick={() => e.uid && onOpenStudent(e.uid)} style={{ display: "flex", gap: 12, alignItems: "flex-start", cursor: e.uid ? "pointer" : "default" }}>
                <IconTile icon={EVENT_STYLE[e.type].icon} tint={EVENT_STYLE[e.type].tint} size={34} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: TEXT, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.title}</div>
                  <div style={{ fontSize: 12, color: MUTED, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.sub}</div>
                </div>
                <span style={{ fontSize: 11.5, color: MUTED, whiteSpace: "nowrap" }}>{timeAgo(e.ts)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---- needs attention -------------------------------------------------------

export function AttentionCard({ summary, classNameById, onOpenStudent, onViewAll }) {
  const list = summary.needsAttention;
  return (
    <div style={panel}>
      <PanelHeader icon={TriangleAlert} title="Needs Attention" right={list.length > 0 && <LinkButton onClick={onViewAll}>View all</LinkButton>} />
      {list.length === 0 ? (
        <div style={{ fontSize: 13, color: MUTED }}>Everyone is active and scoring above 40%. 🎉</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {list.slice(0, 5).map((s, i) => (
            <div key={s.uid} onClick={() => onOpenStudent(s.uid)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderTop: i ? `1px solid ${BORDER}` : "none", cursor: "pointer" }}>
              <Avatar name={s.name} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: TEXT, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</div>
                <div style={{ fontSize: 12, color: MUTED }}>{classNameById[s.classId] || "No class"}{s.avgScorePct !== null ? ` · avg ${s.avgScorePct}%` : ""}</div>
              </div>
              <span style={{ background: s.status === "struggling" ? "#FDECEC" : "#FFF3DD", borderRadius: 999, padding: "3px 9px" }}>
                <StatusTag status={s.status} daysInactive={s.daysInactive} />
              </span>
              <ChevronRight size={16} color={MUTED} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---- quick actions ---------------------------------------------------------

export function QuickActions({ actions }) {
  return (
    <div style={panel}>
      <PanelHeader icon={Zap} title="Quick Actions" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
        {actions.map((a) => (
          <button key={a.label} onClick={a.onClick} disabled={a.disabled} style={{
            border: `1px solid ${BORDER}`, background: "#FFFFFF", borderRadius: 12, padding: "16px 6px", cursor: a.disabled ? "default" : "pointer",
            opacity: a.disabled ? 0.5 : 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 8, fontFamily: "inherit",
          }}>
            <a.icon size={22} color={INK} />
            <span style={{ fontSize: 12.5, color: TEXT, textAlign: "center", lineHeight: 1.3 }}>{a.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ---- class / teacher / announcements overviews -----------------------------

export function ClassOverviewCard({ classes, onOpenClass, onViewAll, onCreate }) {
  return (
    <div style={panel}>
      <PanelHeader icon={GraduationCap} title="Class Overview" right={classes.length > 0 && <LinkButton onClick={onViewAll}>View all</LinkButton>} />
      {classes.length === 0 ? (
        <div style={{ fontSize: 13, color: MUTED }}>
          No classes yet.
          <div style={{ marginTop: 10 }}><Button small onClick={onCreate}><Plus size={13} /> Create a class</Button></div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {classes.slice(0, 2).map((c) => (
            <div key={c.id} onClick={() => onOpenClass(c.id)} style={{ border: `1px solid ${BORDER}`, borderRadius: 12, padding: 14, cursor: "pointer" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14.5, fontWeight: 700, color: TEXT, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</div>
                  <div style={{ fontSize: 12, color: MUTED }}>{c.exam} · {c.teacherName || "No teacher assigned"}</div>
                </div>
                <span style={{ fontSize: 12, fontWeight: 700, color: TEXT, fontFamily: "ui-monospace, monospace", letterSpacing: "0.1em" }}>{c.joinCode}</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", marginTop: 10, fontSize: 12, color: MUTED }}>
                <div><div style={{ fontSize: 17, fontWeight: 800, color: TEXT }}>{c.summary.students}</div>students</div>
                <div><div style={{ fontSize: 17, fontWeight: 800, color: TEXT }}>{c.summary.active7d}</div>active 7d</div>
                <div><div style={{ fontSize: 17, fontWeight: 800, color: TEXT }}>{c.summary.avgScorePct === null ? "—" : `${c.summary.avgScorePct}%`}</div>avg score</div>
              </div>
              {c.summary.needsAttention.length > 0 && (
                <div style={{ fontSize: 12, color: "var(--ib-gold, #8F6A08)", display: "flex", alignItems: "center", gap: 5, marginTop: 8 }}>
                  <TriangleAlert size={12} /> {c.summary.needsAttention.length} need attention
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function TeacherOverviewCard({ teachers, onViewAll }) {
  return (
    <div style={panel}>
      <PanelHeader icon={Users} title="Teacher Overview" right={<LinkButton onClick={onViewAll}>View all</LinkButton>} />
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {teachers.slice(0, 3).map((t) => (
          <div key={t.uid} onClick={onViewAll} style={{ display: "flex", alignItems: "center", gap: 12, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 12, cursor: "pointer" }}>
            <Avatar name={t.name} size={40} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: TEXT, display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name}</span>
                {t.role === "admin" && <span style={{ fontSize: 10.5, fontWeight: 700, color: "#A15C07", background: "#FFF3DD", borderRadius: 999, padding: "1px 7px" }}>Admin</span>}
              </div>
              <div style={{ fontSize: 12, color: MUTED, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.email || "—"}</div>
              <div style={{ fontSize: 12, color: MUTED, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.classes.length ? t.classes.join(", ") : "No classes yet"}</div>
            </div>
            <ChevronRight size={16} color={MUTED} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function AnnouncementsCard({ announcements, classNameById, onNew, onViewAll }) {
  return (
    <div style={panel}>
      <PanelHeader icon={Megaphone} title="Announcements" right={announcements.length > 0 && <LinkButton onClick={onViewAll}>View all</LinkButton>} />
      {announcements.length === 0 ? (
        <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
          <div style={{ width: 72, height: 72, borderRadius: 18, background: INK_SOFT, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Megaphone size={32} color={INK} />
          </div>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: TEXT }}>No announcements yet</div>
            <div style={{ fontSize: 12.5, color: MUTED, margin: "3px 0 10px", lineHeight: 1.5 }}>Share important updates with your students in the iBuddie app.</div>
            <Button small onClick={onNew}><Plus size={13} /> New announcement</Button>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {announcements.slice(0, 3).map((a) => (
            <div key={a.id} style={{ borderLeft: `3px solid ${INK}`, paddingLeft: 10 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: TEXT }}>{a.title}</div>
              <div style={{ fontSize: 12, color: MUTED }}>{a.classId ? classNameById[a.classId] || "Class" : "Whole college"} · {timeAgo(a.ts)}</div>
            </div>
          ))}
          <div><Button small variant="secondary" onClick={onNew}><Plus size={13} /> New announcement</Button></div>
        </div>
      )}
    </div>
  );
}
