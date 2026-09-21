// Tests for the guest question allowance rules (lib/guestQuota.js). Run with `npm test`.
//
// This module is deliberately free of Firebase imports so these tests need no credentials
// and touch no real project data — the Firestore transaction that stores the count lives
// in api/guest-quota.js and simply feeds these functions the stored value.
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  GUEST_FREE_QUESTIONS,
  readBearerToken,
  isAnonymousToken,
  normalizeUsed,
  guestQuota,
  consumeGuestQuestion,
} from "./guestQuota.js";

test("guests get exactly two free questions", () => {
  assert.equal(GUEST_FREE_QUESTIONS, 2);
});

test("readBearerToken pulls the token out of an Authorization header", () => {
  assert.equal(readBearerToken("Bearer abc.def.ghi"), "abc.def.ghi");
  assert.equal(readBearerToken("bearer abc.def.ghi"), "abc.def.ghi"); // scheme is case-insensitive
  assert.equal(readBearerToken("Bearer   padded  "), "padded");
});

test("readBearerToken rejects anything that isn't a bearer token", () => {
  assert.equal(readBearerToken(undefined), null);
  assert.equal(readBearerToken(""), null);
  assert.equal(readBearerToken("Bearer"), null);
  assert.equal(readBearerToken("Bearer "), null);
  assert.equal(readBearerToken("Basic abc"), null);
  assert.equal(readBearerToken("abc.def.ghi"), null);
  assert.equal(readBearerToken({ toString: () => "Bearer abc" }), null);
});

test("only anonymous sign-ins count as guests", () => {
  assert.equal(isAnonymousToken({ firebase: { sign_in_provider: "anonymous" } }), true);
  assert.equal(isAnonymousToken({ firebase: { sign_in_provider: "google.com" } }), false);
  assert.equal(isAnonymousToken({ firebase: { sign_in_provider: "password" } }), false);
  assert.equal(isAnonymousToken({ firebase: { sign_in_provider: "phone" } }), false);
  assert.equal(isAnonymousToken({ firebase: {} }), false);
  assert.equal(isAnonymousToken({}), false);
  assert.equal(isAnonymousToken(null), false);
});

test("normalizeUsed clamps junk stored counts into range", () => {
  assert.equal(normalizeUsed(undefined), 0);
  assert.equal(normalizeUsed(null), 0);
  assert.equal(normalizeUsed("not a number"), 0);
  assert.equal(normalizeUsed(NaN), 0);
  assert.equal(normalizeUsed(-5), 0);
  assert.equal(normalizeUsed(1.7), 1);
  assert.equal(normalizeUsed(99), GUEST_FREE_QUESTIONS);
});

test("a fresh guest has both questions available", () => {
  assert.deepEqual(guestQuota(0), { used: 0, limit: 2, remaining: 2, granted: true });
});

test("a guest with one question spent still has one left", () => {
  assert.deepEqual(guestQuota(1), { used: 1, limit: 2, remaining: 1, granted: true });
});

test("a guest who used both questions is blocked", () => {
  assert.deepEqual(guestQuota(2), { used: 2, limit: 2, remaining: 0, granted: false });
});

test("the first two questions are granted and the third is refused", () => {
  const first = consumeGuestQuestion(0);
  assert.equal(first.consumed, true);
  assert.equal(first.used, 1);
  assert.equal(first.remaining, 1);

  const second = consumeGuestQuestion(first.used);
  assert.equal(second.consumed, true);
  assert.equal(second.used, 2);
  assert.equal(second.remaining, 0);
  assert.equal(second.granted, false); // spent now, but nothing left for next time

  const third = consumeGuestQuestion(second.used);
  assert.equal(third.consumed, false);
  assert.equal(third.used, 2); // a refused attempt must not push the count any higher
  assert.equal(third.remaining, 0);
});

test("a refused attempt never spends a question", () => {
  const blocked = consumeGuestQuestion(GUEST_FREE_QUESTIONS);
  assert.equal(blocked.consumed, false);
  assert.equal(blocked.used, GUEST_FREE_QUESTIONS);
});

test("a failed AI request costs nothing, because nothing is consumed until it succeeds", () => {
  // api/ask.js only calls consume once the AI has actually answered. Two failures in a
  // row therefore leave the stored count exactly where it started.
  let used = 0;
  for (let attempt = 0; attempt < 2; attempt++) {
    assert.equal(guestQuota(used).granted, true); // the pre-flight check still lets them through
    // ...the AI call fails here, so consume is never reached and `used` doesn't move.
  }
  assert.equal(used, 0);
  assert.equal(guestQuota(used).remaining, 2);
});

test("the quota is not reversible — there is no way to give a question back", async () => {
  const mod = await import("./guestQuota.js");
  assert.equal(mod.refundGuestQuestion, undefined);
  assert.equal(mod.releaseGuestQuestion, undefined);
});

test("two successes leave the guest blocked on the third", () => {
  let used = consumeGuestQuestion(0).used;
  used = consumeGuestQuestion(used).used;
  assert.equal(used, 2);
  assert.equal(guestQuota(used).granted, false);
  assert.equal(consumeGuestQuestion(used).consumed, false);
});

test("a corrupted stored count can't be exploited into extra questions", () => {
  assert.equal(consumeGuestQuestion(-10).used, 1); // negative clamps to 0, then spends one
  assert.equal(consumeGuestQuestion(99).consumed, false); // over-limit stays blocked
});
