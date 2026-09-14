// Was runtime: "edge" — switched to Node.js because Firestore access (adminDb, via
// firebase-admin) requires Node built-ins that Edge's runtime doesn't provide.
export const config = { maxDuration: 60 };

import { adminDb } from "../lib/firebaseadmin.js";
import { lectureCacheKey } from "../lib/lectureCache.js";
import { getPlaybackUrl } from "../lib/storage.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { topic, subject, exam } = req.body;
  if (!topic || !subject) {
    return res.status(400).json({ error: "topic and subject are required" });
  }

  // A pre-generated (or previously live-generated) lecture is a complete lecture, script +
  // audio, saved by generate-lecture-audio.js once synthesis finishes. Serving it here skips
  // the Sonnet call AND the audio step entirely — the client detects `cached: true` and never
  // calls /api/generate-lecture-audio at all for this request.
  const cacheRef = adminDb.collection("lectures").doc(lectureCacheKey({ subject, topic, exam }));
  const cached = await cacheRef.get();
  if (cached.exists) {
    const { segments } = cached.data();
    // Each segment's stored audio_url is either a legacy Firebase signed URL (returned
    // unchanged) or an "r2://<key>" reference (resolved to a fresh short-lived presigned URL
    // here, at read time). The Firestore document itself is never rewritten with the result.
    const playableSegments = await Promise.all(
      segments.map(async (segment) => ({ ...segment, audio_url: await getPlaybackUrl(segment.audio_url) }))
    );
    return res.status(200).json({ topic, segments: playableSegments, cached: true });
  }

  // The AI Lecture library is pre-generated offline (scripts/pregenerate-lectures.js), not
  // grown from live student requests — a cache miss here means this exact subject+topic+exam
  // combination simply isn't in the library yet, not "go generate one now". The client's topic
  // picker only ever offers chapters this endpoint already reports as cached, so reaching this
  // point at all means either a stale client catalog or a direct/unexpected API call — either
  // way, the correct response is "not available", never a live Sonnet + TTS generation.
  return res.status(404).json({ error: "not_available", cached: false });
}
