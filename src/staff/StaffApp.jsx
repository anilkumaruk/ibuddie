import { useState, useEffect, useCallback } from "react";
import {
  onAuthStateChanged, signOut, GoogleAuthProvider, signInWithPopup,
  signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile, sendPasswordResetEmail,
} from "firebase/auth";
import { School, Building2, KeyRound, LogOut, Loader2, RefreshCw, ArrowRight } from "lucide-react";
import { auth } from "../Login.jsx";
import { callCollege } from "../collegeApi.js";
import StaffDashboard from "../college/StaffDashboard.jsx";
import { INK, TEXT, MUTED, BORDER, PAPER, GREEN, card, input, sectionTitle, SPIN_CSS } from "../college/theme.js";
import { Button, Field, ErrorNote } from "../college/ui.jsx";

// Staff portal (/staff/): its own sign-in for college admins and teachers, then the
// management dashboard. Roles are checked server-side by /api/college on every call —
// this page only decides what to show.

const BASE_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
  html, body { margin: 0; background: ${PAPER}; color: ${TEXT}; font-family: 'Inter', system-ui, sans-serif; color-scheme: light; }
  * { box-sizing: border-box; }
  button, input, select, textarea { font-family: inherit; }
  input:focus, select:focus, textarea:focus { outline: 2px solid ${INK}22; border-color: ${INK}55; }
  ${SPIN_CSS}
`;

const AUTH_ERRORS = {
  "auth/invalid-email": "That doesn't look like a valid email address.",
  "auth/email-already-in-use": "An account with that email already exists — sign in instead.",
  "auth/weak-password": "Password must be at least 6 characters.",
  "auth/user-not-found": "No account with that email. Create one, or ask your college admin to add you.",
  "auth/wrong-password": "Incorrect password.",
  "auth/invalid-credential": "Incorrect email or password. If your admin added you, use \"Forgot password?\" to set one.",
  "auth/missing-password": "Enter your password.",
  "auth/too-many-requests": "Too many attempts. Wait a minute and try again.",
  "auth/popup-closed-by-user": "Google sign-in was closed before finishing.",
};

function authMessage(e) {
  return AUTH_ERRORS[e?.code] || e?.message || "Something went wrong. Please try again.";
}

function Logo({ size = 22 }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <span style={{ fontSize: size, fontWeight: 800, color: INK }}>i<span style={{ color: "#B8860B" }}>Buddie</span></span>
      <span style={{ fontSize: 11, fontWeight: 700, color: MUTED, border: `1px solid ${BORDER}`, background: "#FFFFFF", borderRadius: 999, padding: "2px 8px", letterSpacing: "0.04em" }}>STAFF</span>
    </span>
  );
}

function CenterCard({ children, width = 400 }) {
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ width: `min(${width}px, 100%)` }}>{children}</div>
    </div>
  );
}

function StaffLogin() {
  const [mode, setMode] = useState("signin"); // "signin" | "signup" | "reset"
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function run(fn) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (e) {
      console.error("Staff auth error:", e.code, e.message);
      setError(authMessage(e));
    } finally {
      setBusy(false);
    }
  }

  function submit(e) {
    e.preventDefault();
    const trimmed = email.trim();
    if (mode === "reset") {
      return run(async () => {
        await sendPasswordResetEmail(auth, trimmed, { url: `${window.location.origin}/staff/` });
        setNotice(`If ${trimmed} has an account, a link to set a new password is on its way. Check spam too.`);
        setMode("signin");
      });
    }
    if (mode === "signup") {
      return run(async () => {
        if (name.trim().length < 2) throw new Error("Enter your full name.");
        const { user } = await createUserWithEmailAndPassword(auth, trimmed, password);
        await updateProfile(user, { displayName: name.trim() });
        await user.getIdToken(true); // so the server sees the new display name
      });
    }
    return run(() => signInWithEmailAndPassword(auth, trimmed, password));
  }

  const switchTo = (m) => { setMode(m); setError(""); setNotice(""); };

  return (
    <CenterCard>
      <div style={{ textAlign: "center", marginBottom: 18 }}>
        <Logo size={26} />
        <div style={{ fontSize: 13.5, color: MUTED, marginTop: 10, lineHeight: 1.5 }}>For college admins and teachers. Students sign in at <a href="/" style={{ color: TEXT }}>{window.location.host}</a>.</div>
      </div>
      <div style={{ ...card, padding: 24 }}>
        <div style={{ fontSize: 17, fontWeight: 800, color: TEXT, marginBottom: 14 }}>
          {mode === "signin" ? "Sign in" : mode === "signup" ? "Create a staff account" : "Set or reset your password"}
        </div>
        {notice && <div style={{ background: "#EEF5F0", color: GREEN, borderRadius: 10, fontSize: 12.5, padding: "9px 12px", marginBottom: 12 }}>{notice}</div>}
        <ErrorNote>{error}</ErrorNote>

        {mode !== "reset" && (
          <>
            <Button variant="secondary" disabled={busy} style={{ width: "100%", padding: "11px 0" }} onClick={() => run(() => signInWithPopup(auth, new GoogleAuthProvider()))}>
              <svg width="16" height="16" viewBox="0 0 18 18"><path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 01-1.8 2.72v2.26h2.9c1.7-1.57 2.7-3.88 2.7-6.62z"/><path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.98v2.33A9 9 0 009 18z"/><path fill="#FBBC05" d="M3.95 10.7A5.4 5.4 0 013.68 9c0-.59.1-1.17.27-1.7V4.97H.98A9 9 0 000 9c0 1.45.35 2.83.98 4.03l2.97-2.33z"/><path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 00.98 4.97l2.97 2.33C4.66 5.17 6.65 3.58 9 3.58z"/></svg>
              Continue with Google
            </Button>
            <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "14px 0", color: MUTED, fontSize: 11.5 }}>
              <div style={{ flex: 1, height: 1, background: BORDER }} /> or with email <div style={{ flex: 1, height: 1, background: BORDER }} />
            </div>
          </>
        )}

        <form onSubmit={submit}>
          {mode === "signup" && <Field label="Full name"><input value={name} onChange={(e) => setName(e.target.value)} style={input} autoComplete="name" placeholder="Meena Kulkarni" /></Field>}
          <Field label="Email"><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} style={input} autoComplete="email" placeholder="you@college.edu.in" /></Field>
          {mode !== "reset" && (
            <Field label="Password">
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} style={input} autoComplete={mode === "signup" ? "new-password" : "current-password"} placeholder={mode === "signup" ? "At least 6 characters" : ""} />
            </Field>
          )}
          <Button type="submit" disabled={busy || !email.includes("@") || (mode !== "reset" && password.length < 6)} style={{ width: "100%", padding: "11px 0" }}>
            {busy && <Loader2 size={14} className="spin" />}
            {mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : "Send link"}
          </Button>
        </form>

        <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginTop: 14, fontSize: 12.5 }}>
          {mode === "signin" ? (
            <>
              <span style={{ color: MUTED, cursor: "pointer" }} onClick={() => switchTo("reset")}>Forgot password?</span>
              <span style={{ color: TEXT, fontWeight: 600, cursor: "pointer" }} onClick={() => switchTo("signup")}>New here? Create account</span>
            </>
          ) : (
            <span style={{ color: TEXT, fontWeight: 600, cursor: "pointer" }} onClick={() => switchTo("signin")}>← Back to sign in</span>
          )}
        </div>
      </div>
      <div style={{ fontSize: 12, color: MUTED, textAlign: "center", marginTop: 14, lineHeight: 1.5 }}>
        Added by your college admin? You'll have an email with a link to set your password — or use "Forgot password?".
      </div>
    </CenterCard>
  );
}

function StaffOnboarding({ user, onDone }) {
  const [code, setCode] = useState(() => {
    try {
      return new URLSearchParams(window.location.search).get("join") || "";
    } catch {
      return "";
    }
  });
  const [collegeName, setCollegeName] = useState("");
  const [city, setCity] = useState("");
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState("");

  async function run(kind, fn) {
    setBusy(kind);
    setError("");
    try {
      await fn();
      if (window.location.search.includes("join=")) window.history.replaceState(null, "", window.location.pathname);
      onDone();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <CenterCard width={760}>
      <div style={{ textAlign: "center", marginBottom: 20 }}>
        <School size={32} color={INK} />
        <div style={{ fontSize: 21, fontWeight: 800, color: TEXT, marginTop: 8 }}>Welcome, {user.displayName || user.email}</div>
        <div style={{ fontSize: 13.5, color: MUTED, marginTop: 6 }}>This account isn't linked to a college yet. Choose one:</div>
      </div>
      <ErrorNote>{error}</ErrorNote>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14 }}>
        <form style={card} onSubmit={(e) => { e.preventDefault(); run("join", () => callCollege("join", { code, portal: "staff" })); }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, ...sectionTitle }}><KeyRound size={17} /> I'm a teacher</div>
          <div style={{ fontSize: 12.5, color: MUTED, marginBottom: 12, lineHeight: 1.5 }}>Enter the teacher code from your college admin.</div>
          <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="e.g. T4HN8Z" maxLength={12} style={{ ...input, letterSpacing: "0.15em", fontWeight: 700, marginBottom: 12 }} />
          <Button type="submit" disabled={!!busy || code.trim().length < 4}>{busy === "join" ? <Loader2 size={14} className="spin" /> : <ArrowRight size={14} />} Join college</Button>
        </form>
        <form style={card} onSubmit={(e) => { e.preventDefault(); run("create", () => callCollege("createCollege", { name: collegeName, city })); }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, ...sectionTitle }}><Building2 size={17} /> Register my college</div>
          <div style={{ fontSize: 12.5, color: MUTED, marginBottom: 12, lineHeight: 1.5 }}>For principals and coordinators. You become the college admin.</div>
          <input value={collegeName} onChange={(e) => setCollegeName(e.target.value)} placeholder="College name" maxLength={80} style={{ ...input, marginBottom: 8 }} />
          <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="City" maxLength={60} style={{ ...input, marginBottom: 12 }} />
          <Button type="submit" disabled={!!busy || collegeName.trim().length < 3}>{busy === "create" ? <Loader2 size={14} className="spin" /> : <Building2 size={14} />} Register college</Button>
        </form>
      </div>
      <div style={{ textAlign: "center", marginTop: 18 }}>
        <Button small variant="ghost" onClick={() => signOut(auth)}><LogOut size={13} /> Sign out</Button>
      </div>
    </CenterCard>
  );
}

function TopBar({ user }) {
  return (
    <div style={{ background: "#FFFFFF", borderBottom: `1px solid ${BORDER}`, padding: "10px 16px", display: "flex", alignItems: "center", gap: 12, position: "sticky", top: 0, zIndex: 20 }}>
      <Logo />
      <div style={{ flex: 1 }} />
      <span style={{ fontSize: 12.5, color: MUTED, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "40vw" }}>{user.displayName || user.email}</span>
      <Button small variant="secondary" onClick={() => signOut(auth)}><LogOut size={13} /> Sign out</Button>
    </div>
  );
}

export default function StaffApp() {
  const [user, setUser] = useState(undefined); // undefined = still checking the session
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 768);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => onAuthStateChanged(auth, (u) => {
    setUser(u);
    setData(null);
    setError("");
  }), []);

  const load = useCallback(async () => {
    setError("");
    try {
      setData(await callCollege("dashboard"));
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    if (user) load();
  }, [user, load]);

  // Runs a mutation then reloads. Returns true on success.
  async function act(action, payload) {
    setBusy(true);
    try {
      await callCollege(action, payload);
      await load();
      return true;
    } catch (e) {
      alert(e.message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  let page;
  if (user === undefined || (user && !data && !error)) {
    page = <CenterCard><div style={{ textAlign: "center", color: MUTED, fontSize: 13.5 }}><Loader2 size={18} className="spin" /><div style={{ marginTop: 8 }}>Loading…</div></div></CenterCard>;
  } else if (!user) {
    page = <StaffLogin />;
  } else if (!data) {
    page = (
      <CenterCard>
        <div style={{ ...card, textAlign: "center" }}>
          <ErrorNote>{error}</ErrorNote>
          <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
            <Button small variant="secondary" onClick={load}><RefreshCw size={13} /> Try again</Button>
            <Button small variant="ghost" onClick={() => signOut(auth)}><LogOut size={13} /> Sign out</Button>
          </div>
        </div>
      </CenterCard>
    );
  } else if (!data.role) {
    page = <StaffOnboarding user={user} onDone={load} />;
  } else if (data.role === "student") {
    page = (
      <CenterCard>
        <div style={{ ...card, padding: 24, textAlign: "center" }}>
          <School size={28} color={INK} />
          <div style={{ fontSize: 17, fontWeight: 800, color: TEXT, margin: "8px 0 6px" }}>This is a student account</div>
          <div style={{ fontSize: 13, color: MUTED, lineHeight: 1.55, marginBottom: 16 }}>
            {user.email || "This account"} is enrolled as a student at {data.college.name}. The staff portal needs a separate teacher or admin account.
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
            <a href="/" style={{ textDecoration: "none" }}><Button small>Open iBuddie</Button></a>
            <Button small variant="secondary" onClick={() => signOut(auth)}><LogOut size={13} /> Use another account</Button>
          </div>
        </div>
      </CenterCard>
    );
  } else {
    page = (
      <>
        <TopBar user={user} />
        <div style={{ padding: isMobile ? "14px 12px 32px" : "22px 24px 40px", opacity: busy ? 0.7 : 1, transition: "opacity 0.15s" }}>
          <StaffDashboard data={data} act={act} reload={load} isMobile={isMobile} />
        </div>
      </>
    );
  }

  return (
    <>
      <style>{BASE_CSS}</style>
      {page}
    </>
  );
}
