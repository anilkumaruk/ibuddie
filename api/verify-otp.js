import { adminAuth } from "../lib/firebaseadmin.js";

// Verifies the OTP with 2Factor.in, then mints a Firebase custom token so the
// client can sign in through the normal Firebase Auth SDK (signInWithCustomToken).
// Minting custom tokens and creating users via the Admin SDK is free on any
// plan — it's only Firebase's own SMS-sending phone auth that needs Blaze.
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { sessionId, otp, phone } = req.body || {};
  if (!sessionId || !otp || !phone) {
    return res.status(400).json({ error: "Missing verification details. Please request a new OTP." });
  }

  const apiKey = process.env.TWO_FACTOR_API_KEY;
  if (!apiKey) {
    console.error("verify-otp: TWO_FACTOR_API_KEY is not set");
    return res.status(500).json({ error: "OTP login isn't set up yet. Please try Google sign-in for now." });
  }

  try {
    const url = `https://2factor.in/API/V1/${apiKey}/SMS/VERIFY/${sessionId}/${otp}`;
    const verifyRes = await fetch(url);
    const data = await verifyRes.json();

    if (data.Status !== "Success") {
      return res.status(401).json({ error: "Incorrect code. Please try again." });
    }

    // `phone` arrives as "918861142813" (from send-otp) — Firebase wants the
    // full E.164 form as the user's phoneNumber identity.
    const phoneNumber = phone.startsWith("+") ? phone : `+${phone}`;

    let userRecord;
    try {
      userRecord = await adminAuth.getUserByPhoneNumber(phoneNumber);
    } catch (e) {
      if (e.code === "auth/user-not-found") {
        userRecord = await adminAuth.createUser({ phoneNumber });
      } else {
        throw e;
      }
    }

    const customToken = await adminAuth.createCustomToken(userRecord.uid);
    return res.status(200).json({ customToken });
  } catch (err) {
    console.error("verify-otp error:", err);
    return res.status(500).json({ error: "Couldn't verify that code. Please try again." });
  }
}
