import { adminDb } from "../lib/firebaseadmin.js";

// Read-only catalog of which subject+exam topics already have a pre-generated lecture in
// Firestore. This is a single Firestore query — it never touches Anthropic or the voice
// service — used by AiLecture.jsx's topic picker to mark chapters Available vs Coming Soon
// before the student ever selects one, so a click on an uncached chapter never has a reason
// to reach /api/generate-lecture in the first place.
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { subject, exam } = req.body;
  if (!subject) {
    return res.status(400).json({ error: "subject is required" });
  }

  const snap = await adminDb.collection("lectures").where("subject", "==", subject).get();
  const topics = snap.docs
    .map((doc) => doc.data())
    .filter((d) => (d.exam || null) === (exam || null))
    .map((d) => d.topic);

  return res.status(200).json({ topics });
}
