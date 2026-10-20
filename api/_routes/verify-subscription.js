import crypto from "crypto";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { razorpay_subscription_id, razorpay_payment_id, razorpay_signature } = req.body;

  if (!razorpay_subscription_id || !razorpay_payment_id || !razorpay_signature) {
    return res.status(400).json({ verified: false, error: "Missing payment fields" });
  }

  // Subscription signatures are payment_id|subscription_id — different order/fields
  // than the order-based flow (which used order_id|payment_id).
  const body = razorpay_payment_id + "|" + razorpay_subscription_id;
  const expectedSignature = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update(body)
    .digest("hex");

  if (expectedSignature === razorpay_signature) {
    res.status(200).json({ success: true });
  } else {
    res.status(400).json({ success: false, error: "Signature mismatch" });
  }
}