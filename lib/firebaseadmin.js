import admin from "firebase-admin";

// The webhook runs with no logged-in user, so it can't use the client Firestore
// SDK (that relies on the visitor's own auth). This uses a service account instead,
// which has full write access — keep FIREBASE_SERVICE_ACCOUNT_KEY secret.
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY)),
  });
}

export const adminDb = admin.firestore();