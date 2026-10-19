import { auth } from "./Login.jsx";

// Client for /api/college — sends the Firebase ID token so the server can check the caller's role.
export async function callCollege(action, payload = {}) {
  const token = await auth.currentUser?.getIdToken();
  const res = await fetch("/api/college", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token || ""}` },
    body: JSON.stringify({ action, ...payload }),
  });
  let data = {};
  try {
    data = await res.json();
  } catch {
    // non-JSON (e.g. a Vercel timeout page) — fall through to the generic message
  }
  if (!res.ok) throw new Error(data.error || `Server error (${res.status})`);
  return data;
}
