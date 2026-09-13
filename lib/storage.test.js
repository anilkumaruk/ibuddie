// Tests for the dual-storage abstraction (lib/storage.js). Run with `npm test` (node --test).
//
// Deliberately NOT tested here: an actual Firebase Storage upload/sign under
// STORAGE_PROVIDER=firebase. Doing so would write a real object to the production Firebase
// Storage bucket this repo is configured against (lib/firebaseadmin.js points at real
// credentials via .env.local) — unacceptable for an automated test run. The firebase-path
// source code in lib/storage.js is an unmodified copy of the pre-migration logic from
// lib/voiceService.js (same three calls: .file().save() then .getSignedUrl()), so its
// behavior is preserved by construction, verified here by code diff rather than execution.
import { test, before, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";

// Same .env.local fallback pattern as scripts/pregenerate-lectures.js — needed so importing
// lib/storage.js (which imports lib/firebaseadmin.js) doesn't throw for lack of
// FIREBASE_SERVICE_ACCOUNT_KEY when run outside `vercel dev`.
before(() => {
  let content;
  try {
    content = fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  } catch {
    return;
  }
  for (const line of content.split("\n")) {
    const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key]) continue;
    let value = rawValue;
    if ((value.startsWith("'") && value.endsWith("'")) || (value.startsWith('"') && value.endsWith('"'))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
});

const { getStorageProvider, getPlaybackUrl, uploadAudio } = await import("./storage.js");

const R2_ENV_KEYS = ["STORAGE_PROVIDER", "R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET_NAME"];
let savedEnv;

beforeEach(() => {
  savedEnv = Object.fromEntries(R2_ENV_KEYS.map((k) => [k, process.env[k]]));
});

afterEach(() => {
  for (const key of R2_ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

function setFakeR2Config() {
  process.env.STORAGE_PROVIDER = "r2";
  process.env.R2_ACCOUNT_ID = "test-account-id";
  process.env.R2_ACCESS_KEY_ID = "TESTACCESSKEYID";
  process.env.R2_SECRET_ACCESS_KEY = "test-secret-access-key-value-not-real";
  process.env.R2_BUCKET_NAME = "ibuddie-audio-test";
}

// A. Firebase legacy URL: getPlaybackUrl returns it unchanged.
test("getPlaybackUrl passes a legacy Firebase https URL through unchanged", async () => {
  const legacyUrl = "https://firebasestorage.googleapis.com/v0/b/example/o/lectures%2Fphysics%2Fsegment-1.wav?alt=media&token=abc123";
  const result = await getPlaybackUrl(legacyUrl);
  assert.equal(result, legacyUrl);
});

// D (proxy). A legacy URL never triggers any network call — no R2 request, no Storage query —
// which is the behavioral guarantee that existing Firestore/Storage data is never touched.
test("getPlaybackUrl never makes a network call for a legacy https URL, even with no R2 config at all", async () => {
  for (const key of ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET_NAME"]) {
    delete process.env[key];
  }
  let fetchCalls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (...args) => {
    fetchCalls++;
    return originalFetch(...args);
  };
  try {
    const legacyUrl = "https://storage.googleapis.com/example-bucket/lectures/thermodynamics/segment-3.wav?X-Goog-Signature=xyz";
    const result = await getPlaybackUrl(legacyUrl);
    assert.equal(result, legacyUrl);
    assert.equal(fetchCalls, 0, "no network call should happen for a legacy reference");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// B. R2 reference: getPlaybackUrl returns a presigned HTTPS URL.
test("getPlaybackUrl signs an r2:// reference into a presigned HTTPS URL", async () => {
  setFakeR2Config();
  const ref = "r2://lectures/physics/neet/laws-of-motion/segment-1.wav";
  const logs = [];
  const originalLog = console.log;
  console.log = (...args) => logs.push(args.join(" "));
  let result;
  try {
    result = await getPlaybackUrl(ref);
  } finally {
    console.log = originalLog;
  }
  assert.ok(result.startsWith("https://test-account-id.r2.cloudflarestorage.com/ibuddie-audio-test/"), `unexpected host/path: ${result}`);
  assert.ok(result.includes("lectures/physics/neet/laws-of-motion/segment-1.wav"), "object key should be present in the signed URL");
  assert.ok(result.includes("X-Amz-Signature="), "should be a SigV4 query-signed URL");
  assert.ok(result.includes("X-Amz-Expires=3600"), "should request a ~1 hour expiry");
  assert.notEqual(result, ref, "the presigned URL must differ from the stable reference");

  // G. No secret values appear in logs — the secret access key must never be logged, signed
  // or not (SigV4 query signing exposes only the derived signature, never the raw secret).
  const allLogs = logs.join("\n");
  assert.ok(!allLogs.includes(process.env.R2_SECRET_ACCESS_KEY), "secret access key must not appear in logs");
  assert.ok(!result.includes(process.env.R2_SECRET_ACCESS_KEY), "secret access key must not appear in the returned URL");
});

// C. An R2 reference is never written as a full presigned URL — uploadAudio's return value
// (what callers cache to Firestore) is the stable "r2://<key>" marker, not a URL.
test("uploadAudio under STORAGE_PROVIDER=r2 returns a stable r2:// reference, never a presigned URL", async () => {
  setFakeR2Config();
  const originalFetch = globalThis.fetch;
  let putRequest = null;
  globalThis.fetch = async (input) => {
    putRequest = input instanceof Request ? input : new Request(input);
    return new Response(null, { status: 200 });
  };
  try {
    const objectKey = "lectures/physics/neet/laws-of-motion/segment-1.wav";
    const result = await uploadAudio(objectKey, Buffer.from("fake wav bytes"), "audio/wav");
    assert.equal(result, `r2://${objectKey}`);
    assert.ok(!result.startsWith("https://"), "uploadAudio must never return a presigned/permanent URL");
    assert.ok(putRequest, "expected the R2 PUT request to have been made");
    assert.equal(putRequest.method, "PUT");
    assert.equal(putRequest.headers.get("Content-Type"), "audio/wav");
    assert.ok(putRequest.url.includes(objectKey), "upload should target the exact lectureStoragePrefix()-derived key");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// E. STORAGE_PROVIDER selection defaults to "firebase" and is explicit for "r2" — the actual
// firebase upload path itself is not exercised here (see file header comment).
test("getStorageProvider defaults to firebase when STORAGE_PROVIDER is unset", () => {
  delete process.env.STORAGE_PROVIDER;
  assert.equal(getStorageProvider(), "firebase");
});

test("getStorageProvider returns r2 when STORAGE_PROVIDER=r2", () => {
  process.env.STORAGE_PROVIDER = "r2";
  assert.equal(getStorageProvider(), "r2");
});

test("getStorageProvider rejects an invalid STORAGE_PROVIDER value with a clear error", () => {
  process.env.STORAGE_PROVIDER = "s3";
  assert.throws(() => getStorageProvider(), /Invalid STORAGE_PROVIDER/);
});

// F. Missing R2 env vars produce a clear configuration error, and never a silent Firebase
// fallback, when STORAGE_PROVIDER=r2.
test("uploadAudio throws a clear config error when STORAGE_PROVIDER=r2 but R2 env vars are missing", async () => {
  process.env.STORAGE_PROVIDER = "r2";
  for (const key of ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET_NAME"]) {
    delete process.env[key];
  }
  await assert.rejects(
    () => uploadAudio("lectures/test.wav", Buffer.from("x"), "audio/wav"),
    /STORAGE_PROVIDER=r2 but missing required env var/
  );
});

test("getPlaybackUrl throws a clear config error for an r2:// ref when R2 env vars are missing", async () => {
  process.env.STORAGE_PROVIDER = "r2";
  for (const key of ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET_NAME"]) {
    delete process.env[key];
  }
  await assert.rejects(
    () => getPlaybackUrl("r2://lectures/test.wav"),
    /STORAGE_PROVIDER=r2 but missing required env var/
  );
});
