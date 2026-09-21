import { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { signOut, onAuthStateChanged } from "firebase/auth";
import App from "./App.jsx";
import Login, { auth } from "./Login.jsx";
import { ReactiveFace, AvatarKeyframes, INK } from "./AvatarWidget.jsx";
import "./index.css";
import "./firebase";

function Root() {
  const [user, setUser] = useState(null);
  const [checkingSession, setCheckingSession] = useState(true);
  // Which screen the login page opens on. Normally "choice"; set to "email" when a guest
  // taps "Continue with Email" on the limit prompt, so they land on the form directly.
  const [loginMode, setLoginMode] = useState("choice");

  useEffect(() => {
    // Firebase normally resolves the session almost instantly from local
    // persistence, but on a flaky connection (or a stalled auth request) it
    // can hang indefinitely. Never leave the user staring at a blank screen —
    // fall back to the login screen if it takes too long.
    const failSafe = setTimeout(() => setCheckingSession(false), 8000);

    const unsubscribe = onAuthStateChanged(
      auth,
      (firebaseUser) => {
        clearTimeout(failSafe);
        if (firebaseUser) {
          setUser({
            uid: firebaseUser.uid,
            // isAnonymous is Firebase's own flag for a signInAnonymously() session — the
            // single source of truth for "this is a guest", so a page reload keeps the
            // guest a guest instead of quietly promoting them.
            isGuest: firebaseUser.isAnonymous,
            name: firebaseUser.isAnonymous
              ? "Guest"
              : firebaseUser.displayName || firebaseUser.phoneNumber || firebaseUser.email || "there",
          });
        } else {
          setUser(null);
        }
        setCheckingSession(false);
      },
      (error) => {
        clearTimeout(failSafe);
        console.error("Auth state error:", error);
        setCheckingSession(false);
      }
    );

    return () => {
      clearTimeout(failSafe);
      unsubscribe();
    };
  }, []);

  async function handleLogout() {
    setLoginMode("choice");
    try {
      await signOut(auth);
    } catch (e) {
      console.error("Logout error:", e);
    }
    setUser(null);
  }

  // A guest who ran out of free questions chose "Continue with Email" on the limit prompt.
  // End the anonymous session and open the existing login page on its email form — the
  // email/password flow itself is untouched. (The prompt's Google button doesn't come
  // through here: it runs the same native Google popup in place, without leaving the app.)
  async function handleExitGuest() {
    setLoginMode("email");
    try {
      await signOut(auth);
    } catch (e) {
      console.error("Guest sign-out error:", e);
    }
    setUser(null);
  }

  if (checkingSession) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
          background: "#F1F1EE",
          fontFamily: "system-ui, sans-serif",
          color: "#8C7D6B",
          fontSize: 14,
        }}
      >
        <div
          style={{
            width: 84,
            height: 84,
            borderRadius: "50%",
            background: INK,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 10px 28px rgba(23,20,15,0.16)",
            animation: "avatarBob 3.2s ease-in-out infinite",
          }}
        >
          <ReactiveFace size={44} isSpeaking={false} />
        </div>
        <div>iBuddie is getting ready…</div>
        <AvatarKeyframes />
      </div>
    );
  }

  return user
    ? <App user={user} onLogout={handleLogout} onExitGuest={handleExitGuest} />
    : <Login onLogin={setUser} initialMode={loginMode} />;
}

// App.jsx owns the actual module -> URL mapping (see VIEW_TO_PATH/SEGMENT_TO_VIEW there) and
// derives its `view` state from useLocation() directly, rather than matching against a
// <Routes> tree — the whole app (sidebar, header, every module) already lives in one
// component keyed off a single `view` string, so BrowserRouter only needs to supply router
// context (history, location) for that existing switch to read from.
createRoot(document.getElementById("root")).render(
  <BrowserRouter>
    <Root />
  </BrowserRouter>
);