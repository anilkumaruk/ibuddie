import crypto from "crypto";
import { adminDb } from "../lib/firebaseAdmin.js";

// Razorpay signs the RAW body, so we can't let Vercel's default JSON body-parser
// touch it first — it needs to match byte-for-byte or the signature check fails.
export const config = { api: { bodyParser: false } };

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).end();
  }

  const rawBody = await readRawBody(req);
  const signature = req.headers["x-razorpay-signature"];
  const expected = crypto
    .createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET)
    .update(rawBody)
    .digest("hex");

  if (signature !== expected) {
    console.error("Webhook signature mismatch — rejecting");
    return res.status(400).json({ error: "Invalid signature" });
  }

  const event = JSON.parse(rawBody);
  const type = event.event;

  try {
    const sub = event.payload?.subscription?.entity;
    const { uid, tier } = sub?.notes || {};

    if (uid && tier) {
      const ref = adminDb.collection("users").doc(uid);

      if (type === "subscription.activated" || type === "subscription.charged") {
        // current_end is the timestamp (seconds) this billing cycle is paid through —
        // that's the real "unlimited access until" date, refreshed on every renewal.
        const expiresAt = sub.current_end ? sub.current_end * 1000 : Date.now() + 35 * 24 * 60 * 60 * 1000;
        await ref.set(
          { [`subscriptions.${tier}`]: { active: true, expiresAt, subscriptionId: sub.id, status: sub.status } },
          { merge: true }
        );
      } else if (type === "subscription.cancelled" || type === "subscription.completed" || type === "subscription.halted") {
        // halted = Razorpay gave up retrying a failed renewal charge. All three mean:
        // access ends now (cancelled-with-cycle-end already kept access until the
        // paid-through date via subscription.charged, so this is the real cutoff).
        await ref.set(
          { [`subscriptions.${tier}`]: { active: false, expiresAt: 0, subscriptionId: sub.id, status: type } },
          { merge: true }
        );
      }
      // payment.failed is intentionally ignored here — Razorpay auto-retries a few
      // times before subscription.halted fires, so one failed charge shouldn't cut
      // access immediately.
    }

    res.status(200).json({ received: true });
  } catch (err) {
    console.error("Webhook handling failed:", err);
    // Still 200 — Razorpay will retry on non-2xx, and a code bug shouldn't cause
    // it to hammer this endpoint. Check logs instead.
    res.status(200).json({ received: true, error: "internal" });
  }
}