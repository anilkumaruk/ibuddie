import Razorpay from "razorpay";
console.log("DEBUG razorpay env keys:", Object.keys(process.env).filter(k => k.startsWith("RAZORPAY")));
// Plan IDs come from Razorpay Dashboard → Subscriptions → Plans (create one plan
// per tier there first, then paste its plan_XXXX id into these env vars).
const PLAN_ID_ENV = {
  haiku: "RAZORPAY_HAIKU_PLAN_ID",
  sonnet: "RAZORPAY_SONNET_PLAN_ID",
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { tier, uid } = req.body || {};
  const planIdEnvKey = PLAN_ID_ENV[tier];
  if (!planIdEnvKey || !uid) {
    return res.status(400).json({ error: "Invalid tier or missing uid" });
  }

  const planId = process.env[planIdEnvKey];
  if (!planId) {
    return res.status(500).json({ error: `${planIdEnvKey} isn't set — create the plan in Razorpay first` });
  }

  const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });

  try {
    // total_count is required by Razorpay even for "indefinite" billing — 120 months
    // (10 years) of monthly cycles effectively means "bill until cancelled" for our purposes.
    // notes.uid/tier is how the webhook later knows which Firestore user + model this is for.
    const subscription = await razorpay.subscriptions.create({
      plan_id: planId,
      customer_notify: 1,
      total_count: 120,
      notes: { uid, tier },
    });
    res.status(200).json({ subscriptionId: subscription.id });
  } catch (err) {
    console.error("Razorpay subscription creation failed:", err);
    res.status(500).json({ error: "Could not create subscription" });
  }
}