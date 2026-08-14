import Razorpay from "razorpay";

// Prices in paise. Keep this as the single source of truth for pricing —
// never trust an amount sent from the client.
const TIER_PRICES = {
  haiku: 4900,   // ₹49.00
  sonnet: 24900, // ₹249.00
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { tier } = req.body || {};
  const amount = TIER_PRICES[tier];
  if (!amount) {
    return res.status(400).json({ error: "Invalid or missing tier" });
  }

  const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });

  try {
    const order = await razorpay.orders.create({
      amount,
      currency: "INR",
      receipt: `ibuddie_${tier}_${Date.now()}`,
    });
    res.status(200).json({ orderId: order.id, amount: order.amount, currency: order.currency });
  } catch (err) {
    console.error("Razorpay order creation failed:", err);
    res.status(500).json({ error: "Could not create order" });
  }
}