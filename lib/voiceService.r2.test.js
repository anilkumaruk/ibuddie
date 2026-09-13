// LOCAL-ONLY integration test for the real application flow:
//   voiceService.synthesizeAndUpload() -> lib/storage.js (real, unmocked) -> real Cloudflare R2
//
// Only the Cloud Run TTS network response is mocked — done here by intercepting the global
// `fetch` and forwarding every call EXCEPT the exact TTS endpoint URL through to the real
// fetch. No production file was changed to make this possible: lib/voiceService.js already
// calls the ambient global `fetch`, so this is a pure test-side seam, not a refactor.
//
// This test talks to REAL Cloudflare R2 and is opt-in ONLY: it requires R2_LIVE_TEST=1 to be
// set explicitly, in addition to STORAGE_PROVIDER=r2 and real R2_* creds in .env.local. A
// plain `npm test` — with no special environment — always skips this test, even on a machine
// that happens to have real R2 credentials configured, so routine test runs can never write
// to production R2 by accident.
//
// Run with:
//   R2_LIVE_TEST=1 node --env-file=.env.local --test lib/voiceService.r2.test.js

import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";

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

const { getStorageProvider, getPlaybackUrl, deleteAudio } = await import("./storage.js");
const { synthesizeAndUpload } = await import("./voiceService.js");

// Must match the private VOICE_SERVICE_URL constant in lib/voiceService.js exactly — kept
// duplicated here rather than exporting it from production code just for this test.
const VOICE_SERVICE_URL = "https://ibuddie-voice-1089026974662.asia-south1.run.app/synthesize";

const TEST_KEY = "__r2_migration_test__/voice-service-test.wav";

// A fixed, deterministic byte sequence standing in for a TTS WAV response. Nothing in this
// test decodes it as audio — it only needs to round-trip byte-for-byte through the real
// upload/download path.
const MOCK_WAV_BYTES = Buffer.from("RIFF-mock-deterministic-audio-bytes-for-r2-integration-test-WAVEfmt ", "utf8");

test("synthesizeAndUpload: mocked TTS -> real storage abstraction -> real R2 -> real presigned download", async (t) => {
  if (process.env.R2_LIVE_TEST !== "1") {
    t.skip('Set R2_LIVE_TEST=1 to run this test — it performs real writes/reads/deletes against Cloudflare R2. Skipped by default so a normal `npm test` never touches R2.');
    return;
  }

  const provider = getStorageProvider();
  if (provider !== "r2") {
    t.skip(`STORAGE_PROVIDER is "${provider}", not "r2" — skipping rather than risking a write to Firebase Storage under the wrong provider. Set STORAGE_PROVIDER=r2 in .env.local to run this test.`);
    return;
  }
  for (const key of ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET_NAME"]) {
    if (!process.env[key]) {
      t.skip(`${key} is not set in .env.local — skipping real R2 integration test.`);
      return;
    }
  }

  const originalFetch = globalThis.fetch;
  let ttsCallCount = 0;
  let otherCallCount = 0;
  globalThis.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input.url;
    if (url === VOICE_SERVICE_URL) {
      ttsCallCount++;
      return new Response(MOCK_WAV_BYTES, { status: 200, headers: { "Content-Type": "audio/wav" } });
    }
    otherCallCount++; // every other call (the real R2 PUT/GET/DELETE) passes through untouched
    return originalFetch(input, init);
  };

  let ref;
  try {
    // A + B: synthesizeAndUpload fetches the (mocked) TTS response, then hands the bytes to
    // the real, unmocked storage abstraction, which — under STORAGE_PROVIDER=r2 — uploads to
    // real Cloudflare R2.
    ref = await synthesizeAndUpload("irrelevant narration text, TTS is mocked", TEST_KEY);
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(ttsCallCount, 1, "the mocked TTS endpoint should be called exactly once");
  assert.ok(otherCallCount >= 1, "the real R2 upload call should have gone through the real network path");

  // C + D: stable r2:// reference, never a presigned URL.
  assert.equal(ref, `r2://${TEST_KEY}`);
  assert.ok(!ref.startsWith("https://"), "synthesizeAndUpload must return a stable reference, not a presigned URL");

  try {
    // F: real presigned URL from the real, unmocked getPlaybackUrl().
    const presignedUrl = await getPlaybackUrl(ref);
    assert.ok(presignedUrl.startsWith("https://"));
    assert.ok(!presignedUrl.includes(process.env.R2_SECRET_ACCESS_KEY), "secret must never appear in the presigned URL");

    // G + H + I: real fetch against real R2; status, stored Content-Type, and exact byte match.
    const res = await fetch(presignedUrl);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("content-type"), "audio/wav"); // E: verifies what was actually persisted, not just the call argument
    const downloaded = Buffer.from(await res.arrayBuffer());
    assert.ok(downloaded.equals(MOCK_WAV_BYTES), "downloaded bytes must exactly match the mocked TTS bytes");
  } finally {
    // 8 + 9: always clean up the one test object, then verify it's actually gone via a direct
    // GET on that known key (never a bucket listing).
    await deleteAudio(ref);
    const verifyUrl = await getPlaybackUrl(ref);
    const verifyRes = await fetch(verifyUrl);
    assert.equal(verifyRes.status, 404, "test object must no longer exist after delete");
  }
});
