// Server-side enforcement of the guest (Firebase anonymous) question allowance.
//
// Runs on the Node runtime because it needs firebase-admin: api/ask.js streams from the
// Edge runtime, where the Admin SDK can't run, so it calls this endpoint instead of
// verifying and counting itself. The count is keyed by the anonymous user's Firebase uid
// and lives server-side, so clearing localStorage or reloading doesn't reset it.
//
// Signed-in (Google / Email / Phone) users are verified and waved straight through — their
// per-model free limits are unchanged and are still handled in the app itself.
import { adminAuth, adminDb } from "../../lib/firebaseadmin.js";
import {
  GUEST_FREE_QUESTIONS,
  readBearerToken,
  isAnonymousToken,
  guestQuota,
  consumeGuestQuestion,
} from "../../lib/guestQuota.js";

// Both actions are safe to expose to the browser: "status" only reads, and "consume" only
// ever moves the count up. There is deliberately no action that lowers it — that would let
// a guest call this endpoint with their own token and reset themselves.
const VALID_ACTIONS = new Set(["consume", "status"]);

function readAction(body) {
  let parsed = body;
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      parsed = null;
    }
  }
  const action = parsed?.action;
  return VALID_ACTIONS.has(action) ? action : "status";
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const token = readBearerToken(req.headers.authorization);
  if (!token) {
    return res.status(401).json({ error: "missing_token" });
  }

  let decoded;
  try {
    decoded = await adminAuth.verifyIdToken(token);
  } catch (e) {
    console.error("Guest quota: ID token rejected:", e.code || e.message);
    return res.status(401).json({ error: "invalid_token" });
  }

  if (!isAnonymousToken(decoded)) {
    return res.status(200).json({ guest: false, granted: true });
  }

  const action = readAction(req.body);
  const ref = adminDb.collection("guestUsage").doc(decoded.uid);

  try {
    // A transaction (rather than a plain increment) so two questions fired at once can't
    // both read the same stale count and both slip through.
    const quota = await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const used = snap.exists ? snap.data().used : 0;

      if (action === "status") return guestQuota(used);

      const next = consumeGuestQuestion(used);
      if (!next.consumed) return next; // refused — nothing changed, so don't spend a write

      tx.set(ref, { used: next.used, updatedAt: Date.now() }, { merge: true });
      return next;
    });

    return res.status(200).json({
      guest: true,
      limit: GUEST_FREE_QUESTIONS,
      used: quota.used,
      remaining: quota.remaining,
      // For "consume", granted means this attempt actually spent a question. For "status"
      // it means there is at least one left to spend.
      granted: action === "consume" ? !!quota.consumed : quota.granted,
    });
  } catch (e) {
    console.error("Guest quota: Firestore transaction failed:", e.message);
    return res.status(503).json({ error: "quota_unavailable" });
  }
}
