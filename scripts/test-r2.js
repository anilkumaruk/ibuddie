// LOCAL-ONLY R2 smoke test — verifies real Cloudflare R2 credentials/connectivity using the
// existing lib/storage.js abstraction (no second R2 client implementation). Touches exactly
// one throwaway object under __r2_migration_test__/ and deletes it before exiting. Never lists
// the bucket, never touches lectures/, never touches Firestore, never calls Claude or TTS.
//
// Run with:
//   node --env-file=.env.local scripts/test-r2.js
//
// Requires STORAGE_PROVIDER=r2 and the four R2_* vars to already be set in .env.local — this
// script does not set or override STORAGE_PROVIDER itself, so check 1 below honestly reports
// whatever your local .env.local actually has configured.

import { getStorageProvider, uploadAudio, getPlaybackUrl, deleteAudio } from "../lib/storage.js";

const TEST_KEY = "__r2_migration_test__/healthcheck.txt";
const TEST_CONTENT = "iBuddie R2 migration test";

let allPassed = true;

function report(label, ok, detail) {
  console.log(`[${ok ? "PASS" : "FAIL"}] ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) allPassed = false;
  return ok;
}

async function main() {
  console.log(`R2 migration smoke test — key: ${TEST_KEY}\n`);

  // 1. Confirm STORAGE_PROVIDER=r2 is actually loaded (not forced by this script).
  const provider = getStorageProvider();
  if (!report("STORAGE_PROVIDER=r2 is loaded", provider === "r2", `resolved provider = "${provider}"`)) {
    console.log("\nAborting — this smoke test only makes sense with STORAGE_PROVIDER=r2 set in .env.local.");
    process.exitCode = 1;
    return;
  }

  // 2-5. Upload the tiny test object and confirm the returned reference is the stable
  // "r2://<key>" marker (never a presigned URL) — reusing uploadAudio() as-is.
  let ref;
  try {
    ref = await uploadAudio(TEST_KEY, Buffer.from(TEST_CONTENT, "utf8"), "text/plain");
    report("Upload to R2 succeeded", ref === `r2://${TEST_KEY}`, `reference = "${ref}"`);
  } catch (e) {
    report("Upload to R2 succeeded", false, e.message);
    console.log("\nAborting — upload failed, skipping remaining steps.");
    process.exitCode = 1;
    return;
  }

  // 6-7. Presigned URL via the existing getPlaybackUrl(), then structural checks only — the
  // URL itself is never printed, since it's a live, scoped, short-lived credential.
  let presignedUrl;
  try {
    presignedUrl = await getPlaybackUrl(ref);
  } catch (e) {
    report("Presigned GET URL generated", false, e.message);
    process.exitCode = 1;
    return;
  }

  const accountId = process.env.R2_ACCOUNT_ID;
  const bucket = process.env.R2_BUCKET_NAME;
  const secret = process.env.R2_SECRET_ACCESS_KEY;

  report("Presigned URL generated", true);
  report("Presigned URL is HTTPS", presignedUrl.startsWith("https://"));
  report("Presigned URL targets the R2 endpoint", presignedUrl.includes(`${accountId}.r2.cloudflarestorage.com`));
  report("Presigned URL targets the correct bucket + key", presignedUrl.includes(`/${bucket}/${TEST_KEY}`));
  report(
    "Presigned URL contains expected SigV4 signing params",
    presignedUrl.includes("X-Amz-Signature=") && presignedUrl.includes("X-Amz-Credential=") && presignedUrl.includes("X-Amz-Expires=")
  );
  report("Presigned URL does NOT contain the R2 secret access key", !presignedUrl.includes(secret));

  // 8. Actually fetch the presigned URL and verify status + body.
  try {
    const res = await fetch(presignedUrl);
    report("Presigned URL fetch returned a success status", res.ok, `HTTP ${res.status}`);
    const body = await res.text();
    report("Downloaded body matches the uploaded payload", body === TEST_CONTENT);
  } catch (e) {
    report("Presigned URL fetch succeeded", false, e.message);
  }

  // 9. Delete the test object via the existing deleteAudio() — nothing else is touched.
  try {
    await deleteAudio(ref);
    report("Delete of test object succeeded", true);
  } catch (e) {
    report("Delete of test object succeeded", false, e.message);
  }

  // 10. Verify it's actually gone — a GET on this one known key, never a bucket listing.
  try {
    const verifyUrl = await getPlaybackUrl(ref);
    const res = await fetch(verifyUrl);
    report("Test object no longer exists after delete", !res.ok, `HTTP ${res.status}`);
  } catch (e) {
    report("Post-delete verification completed", false, e.message);
  }

  console.log(`\n${allPassed ? "ALL CHECKS PASSED" : "SOME CHECKS FAILED"}`);
  process.exitCode = allPassed ? 0 : 1;
}

main().catch((e) => {
  console.error("FATAL:", e.message);
  process.exitCode = 1;
});
