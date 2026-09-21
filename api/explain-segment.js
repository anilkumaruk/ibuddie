import { adminDb } from "../lib/firebaseadmin.js";
import { slugify, synthesizeAndUpload } from "../lib/voiceService.js";
import { lectureStoragePrefix } from "../lib/lectureCache.js";
import { getPlaybackUrl } from "../lib/storage.js";

// Ask iBuddie and Explain Again don't need Sonnet's power: the hard part (writing accurate
// lecture material) already happened at Sonnet during generation. Rephrasing/answering
// against already-correct material is well within Haiku's ability, at a fraction of the cost.
const HAIKU_MODEL = "claude-haiku-4-5-20251001";

const STYLE_INSTRUCTIONS = {
  simpler: "Rewrite this segment's explanation in much simpler language, as if explaining to someone hearing this concept for the very first time. Short sentences, everyday words, no jargon left unexplained. Drop or simplify any formula/example if it isn't essential.",
  "real-world": "Rewrite this segment's explanation woven around a concrete, relatable real-world example or analogy (something an Indian high-school student would recognize) that makes the concept intuitive. If a worked example fits naturally, include one grounded in that real-world scenario.",
  exam: "Rewrite this segment's explanation to be exam-oriented: sharper, more concise, focused on exactly what gets tested, and flag any common mistakes or exam tips as notes. Keep any formula precise and exam-ready.",
  derivation: "Rewrite this segment to focus on a clear step-by-step derivation of the underlying formula or result, if one exists for this concept. Show each algebraic/logical step as its own line in an example.steps array building up to the final formula. If this concept genuinely has no derivation, explain the reasoning behind it step by step instead.",
};

// Shared with AiLecture.jsx's EXPLAIN_STYLES and the batch pre-generation script, so all three
// stay in sync off one list instead of three separately-maintained copies.
export const EXPLAIN_STYLE_KEYS = Object.keys(STYLE_INSTRUCTIONS);

const SYSTEM_PROMPT = `You are rewriting ONE segment of an existing JEE/NEET/KCET lecture for iBuddie, an Indian exam-prep platform, at the student's request — the student is still on this same segment and wants it explained differently, not a new lecture.

You will be given the segment's current content and a requested style. Rewrite ONLY what that style calls for, keeping everything else about the concept accurate and consistent with the original segment's topic and scientific facts. Never invent facts or exam information.

Output ONLY valid JSON, nothing else, no markdown code fences, matching this shape (include a field only if you are actually changing/adding it — omit any field you want left as it already was):
{"slide_title": string (optional), "slide_bullets": [string] (optional), "narration": string (optional — required in almost all cases, since the rewritten explanation needs new spoken narration), "board": string (optional), "example": {"title": string, "steps": [string]} (optional), "formula": {"expression": string, "variables": [{"symbol": string, "meaning": string}]} (optional), "notes": string (optional)}

narration must be plain conversational spoken English (no markdown, spell out formulas in words), 30-90 seconds of natural pacing (about 75-220 words), with no run-together words.`;

// Same "generate once, reuse forever" pattern already used for the lecture itself: a
// Firestore-cached JSON doc, since that's a much better fit for a structured response than
// parsing a Storage blob. Keyed by subject (topic names collide across subjects — e.g.
// "Thermodynamics" is in both Physics and Chemistry) and exam (the rewrite genuinely differs
// for NEET vs JEE, not just cosmetically).
function explainCacheKey({ subject, topic, exam, segmentId, style }) {
  return `${slugify(subject)}__${slugify(topic)}__${segmentId}__${style}__${exam || "none"}`;
}

// Core rewrite-and-narrate logic, reused by the HTTP handler and the batch pre-generation
// script. Returns { result, fromCache }. Throws Object-augmented Errors with .status/.details
// on failure (same convention as generateLectureScript / synthesizeAndUpload).
export async function explainSegment({ subject, topic, exam, segment, style }) {
  const cacheKey = explainCacheKey({ subject, topic, exam, segmentId: segment.id, style });
  const cacheRef = adminDb.collection("lectureExplanations").doc(cacheKey);

  const cached = await cacheRef.get();
  if (cached.exists) {
    console.log(`[explain-segment] cache HIT for ${cacheKey} — skipping Haiku call`);
    const { cachedAt, ...stored } = cached.data();
    // stored.audio_url is whatever was persisted at write time (a legacy Firebase signed URL,
    // or an "r2://<key>" reference) — resolve to a playable URL here, at read time, without
    // touching the Firestore document itself.
    const result = { ...stored, audio_url: await getPlaybackUrl(stored.audio_url) };
    return { result, fromCache: true };
  }
  console.log(`[explain-segment] cache MISS for ${cacheKey} — calling Haiku`);

  const examLine = exam ? `Exam target: ${exam}.` : "";
  const userMessage = `Subject: ${subject}\nTopic: ${topic}\n${examLine}\n\nCurrent segment:\n${JSON.stringify({
    slide_title: segment.slide_title,
    slide_bullets: segment.slide_bullets,
    narration: segment.narration,
    board: segment.board,
    example: segment.example,
    formula: segment.formula,
    notes: segment.notes,
  })}\n\nRequested style: ${style}\n${STYLE_INSTRUCTIONS[style]}`;

  let anthropicRes;
  try {
    anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: HAIKU_MODEL,
        max_tokens: 3000,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userMessage }],
      }),
    });
  } catch (e) {
    throw Object.assign(new Error("Could not reach the lecture writer"), { status: 502, details: e.message });
  }

  if (!anthropicRes.ok) {
    const errText = await anthropicRes.text();
    throw Object.assign(new Error("Re-explanation failed"), { status: anthropicRes.status, details: errText });
  }

  const data = await anthropicRes.json();
  if (data.usage) console.log(`[USAGE] haiku in=${data.usage.input_tokens} out=${data.usage.output_tokens}`);
  const textBlock = data.content?.find((b) => b.type === "text");
  const rawText = textBlock?.text ?? "";
  // Haiku is more prone than Sonnet to wrapping JSON in a ```json fence despite being told
  // not to — strip one off before parsing rather than failing the whole request over it.
  const jsonText = rawText.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();

  let updatedFields;
  try {
    updatedFields = JSON.parse(jsonText);
  } catch {
    throw Object.assign(new Error("Model did not return valid JSON"), { status: 502, details: rawText });
  }

  if (!updatedFields.narration) {
    throw Object.assign(new Error("Model did not return new narration to synthesize"), { status: 502 });
  }

  // audio_url here is a STABLE reference (Firebase signed URL, or "r2://<key>") — this is what
  // gets cached below. It's resolved to a playable URL only in the returned `result`, never in
  // what's written to Firestore.
  const audio_url = await synthesizeAndUpload(
    updatedFields.narration,
    `${lectureStoragePrefix({ subject, topic, exam })}/explain/${segment.id}-${style}.wav`
  );
  const stored = { ...updatedFields, audio_url };
  await cacheRef.set({ ...stored, cachedAt: Date.now() });
  const result = { ...stored, audio_url: await getPlaybackUrl(audio_url) };
  return { result, fromCache: false };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { subject, topic, exam, segment, style } = req.body;
  if (!subject || !topic || !segment || !STYLE_INSTRUCTIONS[style]) {
    return res.status(400).json({ error: "subject, topic, segment, and a valid style are required" });
  }

  try {
    const { result } = await explainSegment({ subject, topic, exam, segment, style });
    return res.status(200).json(result);
  } catch (e) {
    return res.status(e.status || 502).json({ error: e.message, details: e.details });
  }
}
