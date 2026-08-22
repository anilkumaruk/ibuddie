import { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { signOut, onAuthStateChanged } from "firebase/auth";
import App from "./App.jsx";
import Login, { auth } from "./Login.jsx";
import { ReactiveFace, AvatarKeyframes, INK } from "./AvatarWidget.jsx";
import "./index.css";
import "./firebase";

function Root() {
  const [user, setUser] = useState(null);
  const [checkingSession, setCheckingSession] = useState(true);

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
            name: firebaseUser.displayName || firebaseUser.phoneNumber || firebaseUser.email || "there",
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
    try {
      await signOut(auth);
    } catch (e) {
      console.error("Logout error:", e);
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

  return user ? <App user={user} onLogout={handleLogout} /> : <Login onLogin={setUser} />;
}

createRoot(document.getElementById("root")).render(<Root />);