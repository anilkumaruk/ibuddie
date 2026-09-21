// Guest (Firebase anonymous) question allowance — the rules only, with no Firebase or
// Firestore imports, so the decision logic can be unit-tested under plain `node --test`
// (see guestQuota.test.js). api/guest-quota.js wraps these with the actual Firestore
// counter; api/ask.js (Edge runtime) imports only the constants and the header parser.

export const GUEST_FREE_QUESTIONS = 2;

// The client matches on this exact code to decide whether to show the sign-in prompt
// instead of a generic "couldn't reach the AI Mentor" error bubble.
export const GUEST_LIMIT_CODE = "guest_limit_reached";
export const GUEST_LIMIT_TITLE = "You've used your 2 free guest chats.";
export const GUEST_LIMIT_SUBTITLE = "Sign in to continue using iBuddie.";

// Set on a successful /api/ask response for a guest so the client's own counter stays
// exactly in step with the server's, rather than drifting on its own optimistic guesses.
export const GUEST_REMAINING_HEADER = "X-Guest-Remaining";

export function readBearerToken(authorizationHeader) {
  if (typeof authorizationHeader !== "string") return null;
  const match = authorizationHeader.match(/^Bearer[ \t]+(.+)$/i);
  if (!match) return null;
  return match[1].trim() || null;
}

// A Firebase ID token minted by signInAnonymously() carries this sign-in provider. Any
// other value (google.com, password, phone, custom) is a real account, whose limits are
// handled in the app exactly as before and must not be touched here.
export function isAnonymousToken(decodedToken) {
  return decodedToken?.firebase?.sign_in_provider === "anonymous";
}

// Stored counts come back from Firestore untrusted (missing doc, corrupted value, a limit
// that was lowered since the doc was written) — clamp before reasoning about them.
export function normalizeUsed(used, limit = GUEST_FREE_QUESTIONS) {
  const n = Number(used);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(Math.floor(n), limit);
}

export function guestQuota(used, limit = GUEST_FREE_QUESTIONS) {
  const u = normalizeUsed(used, limit);
  return { used: u, limit, remaining: limit - u, granted: u < limit };
}

// Spends one question. This runs only AFTER the AI has actually answered, which is what
// keeps a failed request free — there is deliberately no way to hand a question back,
// because a reversible action exposed on an endpoint the guest can call themselves would
// let them reset their own count. `consumed` says whether this attempt spent one;
// `granted` on the returned quota says whether anything is left for next time.
export function consumeGuestQuestion(used, limit = GUEST_FREE_QUESTIONS) {
  const before = guestQuota(used, limit);
  if (!before.granted) return { ...before, consumed: false };
  return { ...guestQuota(before.used + 1, limit), consumed: true };
}
