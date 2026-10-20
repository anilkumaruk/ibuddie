// One Node.js function serving every handler in api/_routes/.
//
// Vercel's Hobby plan caps a deployment at 12 Node.js serverless functions. Files and
// folders starting with "_" inside api/ are not deployed as functions, so handlers live in
// api/_routes/ and vercel.json rewrites /api/<name> → /api/router?route=<name>. URLs the app
// calls are unchanged, and adding an endpoint no longer uses up a function slot.
//
// Not routed here:
//  - Edge functions (ask, pyq, mock-test, …) — they don't count toward the cap.
//  - razorpay-webhook.js — it reads the raw request body to verify Razorpay's signature,
//    which needs bodyParser disabled for that function alone.
//
// To add an endpoint: create api/_routes/<name>.js exporting `default async (req, res)`,
// then add one line to ROUTES. Imports stay lazy so each request only loads its handler.

const ROUTES = {
  "cancel-subscription": () => import("./_routes/cancel-subscription.js"),
  college: () => import("./_routes/college.js"),
  "create-subscription": () => import("./_routes/create-subscription.js"),
  "explain-segment": () => import("./_routes/explain-segment.js"),
  "generate-lecture": () => import("./_routes/generate-lecture.js"),
  "generate-lecture-audio": () => import("./_routes/generate-lecture-audio.js"),
  "guest-quota": () => import("./_routes/guest-quota.js"),
  "lecture-library": () => import("./_routes/lecture-library.js"),
  "send-otp": () => import("./_routes/send-otp.js"),
  "verify-otp": () => import("./_routes/verify-otp.js"),
  "verify-subscription": () => import("./_routes/verify-subscription.js"),
};

// Hobby's ceiling. Lecture generation needs 90-150s; everything else finishes far sooner.
export const config = { maxDuration: 300 };

export default async function handler(req, res) {
  const route = String(req.query?.route || "");
  if (!Object.hasOwn(ROUTES, route)) {
    return res.status(404).json({ error: "Not found" });
  }
  const { default: routeHandler } = await ROUTES[route]();
  return routeHandler(req, res);
}

export { ROUTES };
