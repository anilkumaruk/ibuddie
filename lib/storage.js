import { AwsClient } from "aws4fetch";
import { adminStorage } from "./firebaseadmin.js";

// Dual-storage abstraction for lecture/explain audio. Lecture-generation code (voiceService,
// generate-lecture-audio, explain-segment) only ever calls uploadAudio/getPlaybackUrl below —
// it never sees an AwsClient, an R2 endpoint, or a Firebase Storage handle directly.
//
// STORAGE_PROVIDER selects the backend for NEW uploads ("firebase" default, or "r2"). Existing
// Firestore data is provider-agnostic by construction: a value already starting with "https://"
// is a legacy Firebase signed URL and is always returned completely unchanged, regardless of
// STORAGE_PROVIDER — this is what keeps every lecture generated before this migration playing
// exactly as it does today, forever, even after STORAGE_PROVIDER is eventually flipped to "r2".
// A value starting with "r2://" is a stable object-key reference — never a URL — resolved to a
// short-lived presigned URL fresh on every read. Firestore itself is never rewritten by this
// module; callers decide what to persist.

const R2_REF_PREFIX = "r2://";
const R2_PRESIGN_EXPIRY_SECONDS = 3600; // ~1 hour, per migration spec
const VALID_PROVIDERS = new Set(["firebase", "r2"]);

// Read fresh on every call rather than cached at module load, so STORAGE_PROVIDER (or a test
// stubbing it) takes effect immediately without needing a fresh process/module load.
function resolveProvider() {
  const raw = process.env.STORAGE_PROVIDER;
  const provider = raw ? raw.toLowerCase() : "firebase";
  if (!VALID_PROVIDERS.has(provider)) {
    throw Object.assign(
      new Error(`Invalid STORAGE_PROVIDER "${raw}" — expected "firebase" or "r2"`),
      { status: 500 }
    );
  }
  return provider;
}

// Fails loudly and immediately when R2 is selected but not fully configured — deliberately
// never falls back to Firebase, since that could silently mask a real config error.
function requireR2Config() {
  const required = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET_NAME"];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length) {
    throw Object.assign(
      new Error(`STORAGE_PROVIDER=r2 but missing required env var(s): ${missing.join(", ")}`),
      { status: 500 }
    );
  }
  return {
    accountId: process.env.R2_ACCOUNT_ID,
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    bucket: process.env.R2_BUCKET_NAME,
  };
}

function r2ObjectUrl(accountId, bucket, objectKey) {
  return `https://${accountId}.r2.cloudflarestorage.com/${bucket}/${objectKey}`;
}

// A fresh client per call is cheap — aws4fetch does no network I/O in its constructor — and
// keeps this module free of long-lived state that could go stale across Vercel invocations.
function r2Client({ accessKeyId, secretAccessKey }) {
  return new AwsClient({ accessKeyId, secretAccessKey, service: "s3", region: "auto" });
}

export function getStorageProvider() {
  return resolveProvider();
}

// Uploads audio bytes for objectKey under whichever provider STORAGE_PROVIDER selects, and
// returns a STABLE reference meant for Firestore — never a temporary/presigned URL:
//   - "firebase": a long-lived (2099) signed URL, byte-for-byte the same shape as the
//     pre-migration behavior in lib/voiceService.js, so nothing downstream changes.
//   - "r2": "r2://<objectKey>" — resolve via getPlaybackUrl() at read time, right before it
//     reaches a client response. Never store a presigned URL in Firestore.
// objectKey is expected to already be built by lectureCache.js's lectureStoragePrefix() —
// this module does not invent or alter any naming convention.
export async function uploadAudio(objectKey, buffer, contentType) {
  const provider = resolveProvider();

  if (provider === "r2") {
    const { accountId, accessKeyId, secretAccessKey, bucket } = requireR2Config();
    const client = r2Client({ accessKeyId, secretAccessKey });
    const res = await client.fetch(r2ObjectUrl(accountId, bucket, objectKey), {
      method: "PUT",
      body: buffer,
      headers: { "Content-Type": contentType },
    });
    if (!res.ok) {
      const details = await res.text().catch(() => "");
      throw Object.assign(new Error("R2 upload failed"), { status: 502, details });
    }
    return `${R2_REF_PREFIX}${objectKey}`;
  }

  const file = adminStorage.file(objectKey);
  await file.save(buffer, { contentType });
  const [signedUrl] = await file.getSignedUrl({ action: "read", expires: "01-01-2099" });
  return signedUrl;
}

// Resolves a stored audio reference into a URL a browser can play right now.
// - Anything that isn't an "r2://" reference (in practice: a legacy Firebase signed URL) is
//   returned completely unchanged — never re-signed, never checked against Storage, never
//   written back anywhere. This is the entire backward-compatibility guarantee for old data.
// - An "r2://<objectKey>" reference gets a fresh presigned GET URL on every call. Nothing is
//   cached here, so a stable "r2://..." reference is always safe to keep in Firestore forever.
export async function getPlaybackUrl(ref) {
  if (!ref || !ref.startsWith(R2_REF_PREFIX)) return ref;

  const objectKey = ref.slice(R2_REF_PREFIX.length);
  const { accountId, accessKeyId, secretAccessKey, bucket } = requireR2Config();
  const client = r2Client({ accessKeyId, secretAccessKey });
  const url = new URL(r2ObjectUrl(accountId, bucket, objectKey));
  url.searchParams.set("X-Amz-Expires", String(R2_PRESIGN_EXPIRY_SECONDS));
  const signedRequest = await client.sign(url, { method: "GET", aws: { signQuery: true } });
  return signedRequest.url;
}

// Not called anywhere yet — kept only for a future migration step (e.g. cleaning up an R2
// object after it's been superseded). Deliberately scoped to "r2://" refs only: deleting a
// legacy Firebase object is out of scope for this migration entirely.
export async function deleteAudio(ref) {
  if (!ref || !ref.startsWith(R2_REF_PREFIX)) {
    throw new Error("deleteAudio only supports r2:// references");
  }
  const objectKey = ref.slice(R2_REF_PREFIX.length);
  const { accountId, accessKeyId, secretAccessKey, bucket } = requireR2Config();
  const client = r2Client({ accessKeyId, secretAccessKey });
  const res = await client.fetch(r2ObjectUrl(accountId, bucket, objectKey), { method: "DELETE" });
  if (!res.ok) {
    const details = await res.text().catch(() => "");
    throw Object.assign(new Error("R2 delete failed"), { status: 502, details });
  }
}
