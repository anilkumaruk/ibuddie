import { auth } from "./Login.jsx";

// Every /api/ask call carries the current Firebase user's ID token so the server can tell
// a guest (anonymous) session apart from a signed-in one and enforce the two-question
// guest allowance itself, rather than trusting anything the browser claims.
//
// getIdToken() reads from local persistence and refreshes only when the token is close to
// expiring, so this is effectively free on the common path.
export async function authHeaders() {
  try {
    const token = await auth.currentUser?.getIdToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch (e) {
    console.error("Couldn't attach an auth token:", e);
    return {};
  }
}
