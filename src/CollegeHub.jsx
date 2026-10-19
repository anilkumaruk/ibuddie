import { useState, useEffect, useCallback } from "react";
import { School, GraduationCap, UserPlus, RefreshCw, LogOut, Loader2, Megaphone, Mail, ArrowRight } from "lucide-react";
import { callCollege } from "./collegeApi.js";
import { INK, TEXT, MUTED, card, input, sectionTitle, SPIN_CSS } from "./college/theme.js";
import { Button, ErrorNote, AnnouncementItem } from "./college/ui.jsx";

// Student-side "My College" view inside the main app: accept a teacher's invite or join
// with a class code, then see the class and its announcements. Staff manage everything
// from the separate portal at /staff/ (src/staff/StaffApp.jsx).

function readJoinParam() {
  try {
    return new URLSearchParams(window.location.search).get("join") || "";
  } catch {
    return "";
  }
}

function clearJoinParam() {
  if (window.location.search.includes("join=")) window.history.replaceState(null, "", window.location.pathname);
}

function InviteCard({ invite, onRespond, busy }) {
  return (
    <div style={{ ...card, borderColor: `${INK}33` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, ...sectionTitle }}><Mail size={16} /> You're invited</div>
      <div style={{ fontSize: 14, color: TEXT, lineHeight: 1.6 }}>
        <b>{invite.collegeName}</b>{invite.city ? `, ${invite.city}` : ""} added you to <b>{invite.className || "a class"}</b>
        {invite.teacherName ? <> with {invite.teacherName}</> : null}.
      </div>
      <div style={{ fontSize: 12.5, color: MUTED, margin: "8px 0 14px", lineHeight: 1.5 }}>
        If you accept, your teachers can see your XP, streak, mock test scores, study minutes and weak topics — never your chat messages.
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <Button disabled={busy} onClick={() => onRespond("acceptInvite", invite.key)}>{busy ? <Loader2 size={14} className="spin" /> : <UserPlus size={14} />} Accept</Button>
        <Button variant="secondary" disabled={busy} onClick={() => onRespond("declineInvite", invite.key)}>Decline</Button>
      </div>
    </div>
  );
}

function JoinView({ invites, onDone }) {
  const [code, setCode] = useState(readJoinParam);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function run(fn) {
    setBusy(true);
    setError("");
    try {
      await fn();
      clearJoinParam();
      onDone();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ maxWidth: 560, margin: "0 auto", width: "100%", display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ textAlign: "center", margin: "12px 0 6px" }}>
        <School size={34} color={INK} />
        <div style={{ fontSize: 22, fontWeight: 800, color: TEXT, marginTop: 8 }}>My College</div>
        <div style={{ fontSize: 13.5, color: MUTED, marginTop: 6, lineHeight: 1.5 }}>Join your class so your teacher can follow your progress and send you announcements.</div>
      </div>
      <ErrorNote>{error}</ErrorNote>
      {invites.map((inv) => <InviteCard key={inv.key} invite={inv} busy={busy} onRespond={(action, key) => run(() => callCollege(action, { key }))} />)}
      <form style={card} onSubmit={(e) => { e.preventDefault(); run(() => callCollege("join", { code })); }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, ...sectionTitle }}><GraduationCap size={17} /> Join with a class code</div>
        <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="e.g. K7M2QX" maxLength={12} style={{ ...input, letterSpacing: "0.15em", fontWeight: 700, marginBottom: 12 }} />
        <Button type="submit" disabled={busy || code.trim().length < 4}>{busy ? <Loader2 size={14} className="spin" /> : <UserPlus size={14} />} Join class</Button>
      </form>
      <a href="/staff/" style={{ ...card, display: "flex", alignItems: "center", gap: 10, textDecoration: "none", color: TEXT, padding: 14 }}>
        <div style={{ flex: 1, fontSize: 13 }}><b>Teacher or college admin?</b> <span style={{ color: MUTED }}>Use the staff portal.</span></div>
        <ArrowRight size={16} color={MUTED} />
      </a>
    </div>
  );
}

function StudentView({ data, onLeave }) {
  return (
    <div style={{ maxWidth: 620, margin: "0 auto", width: "100%", display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <School size={22} color={INK} />
          <div>
            <div style={{ fontSize: 17, fontWeight: 800, color: TEXT }}>{data.college.name}</div>
            {data.college.city && <div style={{ fontSize: 12.5, color: MUTED }}>{data.college.city}</div>}
          </div>
        </div>
        {data.class ? (
          <div style={{ fontSize: 13.5, color: TEXT, lineHeight: 1.7 }}>
            <div>Class: <b>{data.class.name}</b> · {data.class.exam}</div>
            <div>Teacher: <b>{data.class.teacherName || "Not assigned yet"}</b></div>
            {data.rollNo && <div>Roll number: <b>{data.rollNo}</b></div>}
          </div>
        ) : (
          <div style={{ fontSize: 13, color: MUTED }}>You're not in a class right now. Ask your teacher to move you into one.</div>
        )}
      </div>
      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, ...sectionTitle, marginBottom: 4 }}><Megaphone size={16} /> Announcements</div>
        {data.announcements.length === 0
          ? <div style={{ fontSize: 12.5, color: MUTED, paddingTop: 8 }}>Nothing from your teachers yet.</div>
          : data.announcements.map((a) => <AnnouncementItem key={a.id} a={a} classLabel={a.collegeWide ? "Whole college" : null} />)}
      </div>
      <div style={{ fontSize: 12.5, color: MUTED, lineHeight: 1.5 }}>
        Your teachers can see your XP, streak, mock test scores, study minutes and weak topics — not your chat messages.
      </div>
      <div><Button variant="danger" small onClick={onLeave}><LogOut size={13} /> Leave college</Button></div>
    </div>
  );
}

function StaffRedirect({ data }) {
  return (
    <div style={{ maxWidth: 480, margin: "auto", width: "100%" }}>
      <div style={{ ...card, textAlign: "center", padding: 24 }}>
        <School size={28} color={INK} />
        <div style={{ fontSize: 17, fontWeight: 800, color: TEXT, margin: "8px 0 6px" }}>{data.college.name}</div>
        <div style={{ fontSize: 13, color: MUTED, lineHeight: 1.55, marginBottom: 16 }}>
          You're {data.role === "admin" ? "the college admin" : "a teacher"} here. Classes, students and announcements are managed in the staff portal.
        </div>
        <a href="/staff/" style={{ textDecoration: "none" }}><Button>Open staff portal <ArrowRight size={14} /></Button></a>
      </div>
    </div>
  );
}

export default function CollegeHub({ isMobile, isGuest, onSignIn, onInvitesChange }) {
  if (isGuest) return <GuestPrompt onSignIn={onSignIn} />;
  return <CollegeHubForMember isMobile={isMobile} onInvitesChange={onInvitesChange} />;
}

function GuestPrompt({ onSignIn }) {
  return (
    <div style={{ flex: 1, display: "flex", padding: 16 }}>
      <div style={{ ...card, margin: "auto", maxWidth: 440, textAlign: "center", padding: 24 }}>
        <School size={30} color={INK} />
        <div style={{ fontSize: 17, fontWeight: 800, color: TEXT, margin: "8px 0 6px" }}>Join your college on iBuddie</div>
        <div style={{ fontSize: 13, color: MUTED, lineHeight: 1.55, marginBottom: 16 }}>
          Sign in with Google, your mobile number or email to join your class and see announcements from your teachers.
        </div>
        {onSignIn && <Button onClick={onSignIn}>Sign in <ArrowRight size={14} /></Button>}
      </div>
    </div>
  );
}

function CollegeHubForMember({ isMobile, onInvitesChange }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try {
      const d = await callCollege("dashboard");
      setData(d);
      onInvitesChange?.(d.invites?.length || 0);
    } catch (e) {
      setError(e.message);
    }
  }, [onInvitesChange]);

  useEffect(() => { load(); }, [load]);

  async function leave() {
    if (!window.confirm("Leave your college? Your teacher will no longer see your progress.")) return;
    setBusy(true);
    try {
      await callCollege("leave");
      await load();
    } catch (e) {
      alert(e.message);
    } finally {
      setBusy(false);
    }
  }

  let body;
  if (!data && !error) body = <div style={{ margin: "auto", color: MUTED, fontSize: 13.5, display: "flex", alignItems: "center", gap: 8 }}><Loader2 size={16} className="spin" /> Loading…</div>;
  else if (!data) body = (
    <div style={{ margin: "auto", textAlign: "center", color: MUTED, fontSize: 13.5 }}>
      <div style={{ marginBottom: 10 }}>{error}</div>
      <Button small variant="secondary" onClick={load}><RefreshCw size={13} /> Try again</Button>
    </div>
  );
  else if (!data.role) body = <JoinView invites={data.invites || []} onDone={load} />;
  else if (data.role === "student") body = <StudentView data={data} onLeave={leave} />;
  else body = <StaffRedirect data={data} />;

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: isMobile ? "4px 2px 24px" : "8px 6px 32px", display: "flex", flexDirection: "column", opacity: busy ? 0.7 : 1 }}>
      <style>{SPIN_CSS}</style>
      {body}
    </div>
  );
}
