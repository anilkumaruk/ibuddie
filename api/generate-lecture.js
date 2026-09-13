// Was runtime: "edge" — switched to Node.js because Firestore access (adminDb, via
// firebase-admin) requires Node built-ins that Edge's runtime doesn't provide. A full lecture
// generation genuinely takes 90-150+ seconds; Node has no Edge-style fixed time-to-first-byte
// requirement, just a duration ceiling this is set comfortably under.
export const config = { maxDuration: 300 };

import { adminDb } from "../lib/firebaseadmin.js";
import { lectureCacheKey } from "../lib/lectureCache.js";
import { getPlaybackUrl } from "../lib/storage.js";

const SYSTEM_PROMPT = `You are a JEE/NEET/KCET lecture writer for iBuddie, an Indian exam-prep platform.

Given a subject and topic, produce a spoken lecture broken into segments. Each segment has:
- slide_title: short heading shown on screen
- slide_bullets: 2-4 short bullet points shown on screen
- narration: what is spoken aloud, in plain conversational spoken English (no markdown, spell out formulas in words — "F equals m a", not "F = ma")

Rules:
- Produce 8-15 segments: an engaging intro, each major concept in its own segment, at least one worked numerical example, a recap segment, and one practice question at the end.
- Narration must be scientifically accurate. Never invent facts, formulas, or exam information. If uncertain about something, omit it rather than guess.
- Keep each narration segment to roughly 30-90 seconds of natural spoken pacing (about 75-220 words). Double-check every word boundary in the narration text before finishing — never let two words run together with no space (e.g. write "does not change", never "doesnotchange").
- Output ONLY valid JSON matching this exact shape, nothing else, no markdown code fences:
{"topic": string, "segments": [{"id": number, "slide_title": string, "slide_bullets": [string], "narration": string}]}`;

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

  const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-5",
      max_tokens: 8000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: `Subject: ${subject}\nTopic: ${topic}` }],
    }),
  });

  if (!anthropicRes.ok) {
    const errText = await anthropicRes.text();
    return res.status(anthropicRes.status).json({ error: "Lecture generation failed", details: errText });
  }

  const data = await anthropicRes.json();
  console.error("DEBUG stop_reason:", data.stop_reason, "content types:", JSON.stringify(data.content?.map(b => b.type)));

  const textBlock = data.content?.find((b) => b.type === "text");
  const rawText = textBlock?.text ?? "";

  let lecture;
  try {
    lecture = JSON.parse(rawText);
  } catch {
    return res.status(502).json({ error: "Model did not return valid JSON", raw: rawText });
  }

  return res.status(200).json(lecture);
}
