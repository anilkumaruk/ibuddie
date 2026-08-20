import { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { signOut, onAuthStateChanged } from "firebase/auth";
import App from "./App.jsx";
import Login, { auth } from "./Login.jsx";
import "./index.css";
import "./firebase";

function Root() {
  const [user, setUser] = useState(null);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        setUser({
          uid: firebaseUser.uid,
          name: firebaseUser.displayName || firebaseUser.phoneNumber || firebaseUser.email || "there",
        });
      } else {
        setUser(null);
      }
      setCheckingSession(false);
    });
    return () => unsubscribe();
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
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#F1F1EE", fontFamily: "system-ui, sans-serif", color: "#8C7D6B", fontSize: 14 }}>
        Loading…
      </div>
    );
  }

  return user ? <App user={user} onLogout={handleLogout} /> : <Login onLogin={setUser} />;
}

createRoot(document.getElementById("root")).render(<Root />);