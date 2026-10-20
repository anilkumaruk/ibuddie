// Sends a login OTP via 2Factor.in (an India-focused OTP API) instead of
// Firebase's own phone auth, which requires a Blaze billing account we don't
// have enabled. 2Factor generates and tracks the OTP on their side; we just
// hand back the "session id" it gives us, which the frontend carries through
// to /api/verify-otp.
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { phone } = req.body || {};
  const digits = String(phone || "").replace(/\D/g, "");
  // Accept a bare 10-digit Indian mobile number, or one that already carries
  // the 91 country code — normalize both to "91XXXXXXXXXX" for 2Factor.
  const localDigits = digits.length === 12 && digits.startsWith("91") ? digits.slice(2) : digits;
  if (localDigits.length !== 10) {
    return res.status(400).json({ error: "Enter a valid 10-digit mobile number." });
  }
  const fullNumber = `91${localDigits}`;

  const apiKey = process.env.TWO_FACTOR_API_KEY;
  if (!apiKey) {
    console.error("send-otp: TWO_FACTOR_API_KEY is not set");
    return res.status(500).json({ error: "OTP login isn't set up yet. Please try Google sign-in for now." });
  }

  try {
    const url = `https://2factor.in/API/V1/${apiKey}/SMS/${fullNumber}/AUTOGEN`;
    const otpRes = await fetch(url);
    const data = await otpRes.json();

    if (data.Status !== "Success" || !data.Details) {
      console.error("2Factor send OTP failed:", data);
      return res.status(502).json({ error: "Couldn't send OTP. Please try again in a moment." });
    }

    return res.status(200).json({ sessionId: data.Details, phone: fullNumber });
  } catch (err) {
    console.error("send-otp error:", err);
    return res.status(500).json({ error: "Couldn't send OTP. Please try again." });
  }
}
