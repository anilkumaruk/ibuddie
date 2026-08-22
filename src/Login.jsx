import { useState } from "react";
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import {
  getAuth, GoogleAuthProvider, signInWithPopup,
  RecaptchaVerifier, signInWithPhoneNumber,
} from "firebase/auth";

// These values come from your Firebase project settings — see setup steps provided separately.
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
const ACCENT = "#6D5AE6";

export default function Login({ onLogin }) {
  const [mode, setMode] = useState("choice"); // choice | phone | otp
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [confirmationResult, setConfirmationResult] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleGoogleLogin() {
    setError("");
    setBusy(true);
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      onLogin({ name: result.user.displayName, uid: result.user.uid, method: "google" });
    } catch (e) {
      console.error("Google sign-in error:", e.code, e.message);
      setError(`Google sign-in failed: ${e.code || e.message}`);
    } finally {
      setBusy(false);
    }
  }

  function setupRecaptcha() {
    if (!window.recaptchaVerifier) {
      window.recaptchaVerifier = new RecaptchaVerifier(auth, "recaptcha-container", {
        size: "invisible",
      });
    }
  }

  // Firebase requires full E.164 format (e.g. +918861142813). Most users just
  // type their bare 10-digit number, so normalize it instead of rejecting it —
  // that's what was causing auth/invalid-phone-number.
  function toE164(raw) {
    const trimmed = raw.trim();
    if (trimmed.startsWith("+")) return `+${trimmed.slice(1).replace(/\D/g, "")}`;
    const digits = trimmed.replace(/\D/g, "");
    if (digits.length === 10) return `+91${digits}`; // bare Indian mobile number
    if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
    return `+${digits}`;
  }

  async function handleSendOtp() {
    setError("");
    const digitsOnly = phone.trim().replace(/\D/g, "");
    if (digitsOnly.length < 10) {
      setError("Enter your 10-digit mobile number.");
      return;
    }
    const e164Phone = toE164(phone);
    setBusy(true);
    try {
      setupRecaptcha();
      const result = await signInWithPhoneNumber(auth, e164Phone, window.recaptchaVerifier);
      setConfirmationResult(result);
      setMode("otp");
    } catch (e) {
      console.error("OTP send error:", e.code, e.message);
      setError(`Couldn't send OTP: ${e.code || e.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleVerifyOtp() {
    setError("");
    if (!otp.trim()) return;
    setBusy(true);
    try {
      const result = await confirmationResult.confirm(otp.trim());
      onLogin({ name: result.user.phoneNumber, uid: result.user.uid, method: "phone" });
    } catch (e) {
      setError("Incorrect code. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#F4F5FA", fontFamily: "'Inter', system-ui, sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');`}</style>
      <div id="recaptcha-container" />
      <div style={{ width: 380, background: "#FFFFFF", borderRadius: 20, padding: 32, boxShadow: "0 8px 30px rgba(30,20,80,0.08)" }}>
        <div style={{ textAlign: "center", marginBottom: 26 }}>
          <span style={{ fontSize: 26, fontWeight: 800, color: "#211C42" }}>i<span style={{ color: ACCENT }}>Buddie</span></span>
          <div style={{ fontSize: 13, color: "#8B85AE", marginTop: 6 }}>Sign in to continue to your AI Mentor</div>
        </div>

        {mode === "choice" && (
          <>
            <button
              onClick={handleGoogleLogin}
              disabled={busy}
              style={{
                width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                padding: "12px 0", borderRadius: 12, border: "1px solid #EDEBF7", background: "#FFFFFF",
                fontWeight: 600, fontSize: 14, color: "#211C42", cursor: busy ? "default" : "pointer", marginBottom: 12,
              }}
            >
              <svg width="18" height="18" viewBox="0 0 18 18"><path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 01-1.8 2.72v2.26h2.9c1.7-1.57 2.7-3.88 2.7-6.62z"/><path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.98v2.33A9 9 0 009 18z"/><path fill="#FBBC05" d="M3.95 10.7A5.4 5.4 0 013.68 9c0-.59.1-1.17.27-1.7V4.97H.98A9 9 0 000 9c0 1.45.35 2.83.98 4.03l2.97-2.33z"/><path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 00.98 4.97l2.97 2.33C4.66 5.17 6.65 3.58 9 3.58z"/></svg>
              Continue with Google
            </button>
            <button
              onClick={() => setMode("phone")}
              style={{
                width: "100%", padding: "12px 0", borderRadius: 12, border: "none",
                background: ACCENT, color: "#FFFFFF", fontWeight: 600, fontSize: 14, cursor: "pointer",
              }}
            >
              Continue with Mobile Number
            </button>
          </>
        )}

        {mode === "phone" && (
          <>
            <label style={{ fontSize: 12.5, fontWeight: 600, color: "#5C5680", marginBottom: 6, display: "block" }}>Mobile number</label>
            <div style={{ display: "flex", alignItems: "center", border: "1px solid #EDEBF7", borderRadius: 12, marginBottom: 14, overflow: "hidden" }}>
              <span style={{ padding: "12px 10px 12px 14px", fontSize: 14, color: "#5C5680", fontWeight: 600, borderRight: "1px solid #EDEBF7" }}>+91</span>
              <input
                type="tel"
                value={phone}
                onChange={(e) => {
                  let digits = e.target.value.replace(/\D/g, "");
                  if (digits.length > 10 && digits.startsWith("91")) digits = digits.slice(2); // handle pasted +91/91 prefix
                  setPhone(digits.slice(0, 10));
                }}
                placeholder="8861142813"
                maxLength={10}
                style={{ flex: 1, padding: "12px 14px", border: "none", fontSize: 14, outline: "none", boxSizing: "border-box" }}
              />
            </div>
            <button
              onClick={handleSendOtp}
              disabled={busy}
              style={{ width: "100%", padding: "12px 0", borderRadius: 12, border: "none", background: ACCENT, color: "#fff", fontWeight: 600, fontSize: 14, cursor: busy ? "default" : "pointer", marginBottom: 10 }}
            >
              {busy ? "Sending…" : "Send OTP"}
            </button>
            <div onClick={() => setMode("choice")} style={{ textAlign: "center", fontSize: 12.5, color: "#8B85AE", cursor: "pointer" }}>← Back</div>
          </>
        )}

        {mode === "otp" && (
          <>
            <label style={{ fontSize: 12.5, fontWeight: 600, color: "#5C5680", marginBottom: 6, display: "block" }}>Enter the 6-digit code sent to {toE164(phone)}</label>
            <input
              type="text"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              placeholder="123456"
              style={{ width: "100%", padding: "12px 14px", borderRadius: 12, border: "1px solid #EDEBF7", fontSize: 14, marginBottom: 14, outline: "none", boxSizing: "border-box", letterSpacing: "0.2em" }}
            />
            <button
              onClick={handleVerifyOtp}
              disabled={busy}
              style={{ width: "100%", padding: "12px 0", borderRadius: 12, border: "none", background: ACCENT, color: "#fff", fontWeight: 600, fontSize: 14, cursor: busy ? "default" : "pointer", marginBottom: 10 }}
            >
              {busy ? "Verifying…" : "Verify & Continue"}
            </button>
            <div onClick={() => setMode("phone")} style={{ textAlign: "center", fontSize: 12.5, color: "#8B85AE", cursor: "pointer" }}>← Back</div>
          </>
        )}

        {error && <div style={{ color: "#E24C4C", fontSize: 12.5, marginTop: 12, textAlign: "center" }}>{error}</div>}
      </div>
    </div>
  );
}