import admin from "firebase-admin";
import fs from "fs";
import path from "path";

// The webhook runs with no logged-in user, so it can't use the client Firestore
// SDK (that relies on the visitor's own auth). This uses a service account instead,
// which has full write access — keep FIREBASE_SERVICE_ACCOUNT_KEY secret.

// `vercel dev` doesn't reliably expose variables that are registered on the Vercel
// dashboard for Production only (not Development), even when .env.local has a
// valid local value. Read straight from .env.local as a guaranteed fallback.
function getLocalEnvValue(key) {
  try {
    const envPath = path.join(process.cwd(), ".env.local");
    const content = fs.readFileSync(envPath, "utf8");
    const line = content.split("\n").find((l) => l.startsWith(key + "="));
    if (!line) return undefined;
    let val = line.slice(key.length + 1);
    if ((val.startsWith("'") && val.endsWith("'")) || (val.startsWith('"') && val.endsWith('"'))) {
      val = val.slice(1, -1);
    }
    return val;
  } catch (e) {
    return undefined;
  }
}

function getEnv(key) {
  return process.env[key] || getLocalEnvValue(key);
}

if (!admin.apps.length) {
  const keyStr = getEnv("FIREBASE_SERVICE_ACCOUNT_KEY");
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(keyStr)),
  });
}
export const adminDb = admin.firestore();
export const adminAuth = admin.auth();
export const adminStorage = admin.storage().bucket(getEnv("VITE_FIREBASE_STORAGE_BUCKET"));
