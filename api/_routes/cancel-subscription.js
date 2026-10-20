import Razorpay from "razorpay";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { subscriptionId } = req.body || {};
  if (!subscriptionId) {
    return res.status(400).json({ error: "Missing subscriptionId" });
  }

  const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });

  try {
    // cancel_at_cycle_end keeps access live through the period they already paid
    // for, and just stops the next auto-charge — the fairer default for students.
    await razorpay.subscriptions.cancel(subscriptionId, { cancel_at_cycle_end: 1 });
    res.status(200).json({ success: true });
  } catch (err) {
    console.error("Razorpay subscription cancellation failed:", err);
    res.status(500).json({ error: "Could not cancel subscription" });
  }
}