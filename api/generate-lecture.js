// Was runtime: "edge" — switched to Node.js because Firestore access (adminDb, via
// firebase-admin) requires Node built-ins that Edge's runtime doesn't provide.
export const config = { maxDuration: 60 };

import { adminDb } from "../lib/firebaseadmin.js";
import { lectureCacheKey } from "../lib/lectureCache.js";
import { getPlaybackUrl } from "../lib/storage.js";

// Only diagram types with a matching React/SVG template in src/LectureDiagrams.jsx may be
// requested — the model picks a TYPE + PARAMS, our code renders it, never an AI-generated
// image. Keep this list in sync with DIAGRAM_COMPONENTS there.
const SUPPORTED_DIAGRAM_TYPES = `- "force_diagram": a free-body diagram. params: { "objectLabel": a SHORT 1-2 word noun naming the object (e.g. "Block", "Ball", "Car") — never a full sentence, it's drawn inside a small circle, "forces": [{ "label": a SHORT 1-2 word force name (e.g. "Weight", "Normal", "Friction", "Action", "Reaction", "Tension") — never a descriptive phrase, it's drawn next to a short arrow with limited space, "magnitudeN": number, "directionDeg": number, "color": "gold"|"red"|"green"|"blue" (optional) }] }. directionDeg is a standard math angle in degrees: 0 = right, 90 = up, 180 = left, 270 = down.`;

const EXAM_GUIDANCE = {
  NEET: "Exam target is NEET: emphasize NCERT-aligned factual accuracy, definitions, and straightforward recall-style checkpoint questions. Derivations should be brief or omitted unless central to the concept.",
  JEE: "Exam target is JEE: include derivations and formula fields wherever a concept has one, add worked numerical examples, and make checkpoint questions application/numerical style, not pure recall.",
  KCET: "Exam target is KCET: keep explanations concise and formula-application focused — less derivation depth than JEE, more direct than NEET's pure recall. Checkpoints should test quick formula application.",
  Boards: "Exam target is school Board exams (CBSE/state board, Class 11-12): stay close to the NCERT textbook's own wording and structure, cover definitions and short/long-answer style points a board paper actually asks for, and favor completeness over exam-cracking shortcuts. Checkpoints should mirror a board exam question — direct, textbook-based, not competitive-exam trickery.",
};

const SYSTEM_PROMPT = `You are a JEE/NEET/KCET lecture writer for iBuddie, an Indian exam-prep platform, building a rich, structured lecture — not just a slideshow.

Given a subject, topic, and exam target, produce a spoken lecture broken into segments. Every segment has these base fields:
- slide_title: short heading shown on screen
- slide_bullets: 2-4 short bullet points shown on screen
- narration: what is spoken aloud, in plain conversational spoken English (no markdown, spell out formulas in words — "F equals m a", not "F = ma")

Additionally, ONLY when genuinely relevant to that specific segment's concept, a segment MAY also include any of these optional fields — never force one in just to fill space, and never put all of them on every segment:
- "board": a 2-4 sentence written concept explanation (distinct in style from narration — written to be read, not spoken) for a chalkboard-style display.
- "diagram": a labeled diagram, built from a template your code renders — you only choose the TYPE and PARAMETERS, never generate an image. Only use a type from this exact list:
${SUPPORTED_DIAGRAM_TYPES}
  Omit "diagram" entirely if no supported type fits this segment's concept — never invent a new type.
- "example": { "title": string, "steps": [string] } — a worked example with step-by-step math, each step one line, the last step giving the final answer. Only include on segments that genuinely have a worked numerical or logical example.
- "formula": { "expression": string, "variables": [{ "symbol": string, "meaning": string }] } — expression written with plain ^ and _ notation for superscript/subscript (e.g. "v^2 = u^2 + 2 a s", "a_n"), listing every variable used.
- "notes": a short supplementary string (exam tips, common mistakes, a fact worth remembering) — only when there's something genuinely worth flagging.
- "checkpoint": { "question": string, "options": [string, string, string, string], "correctIndex": number, "explanation": string } — a quick multiple-choice check on the concept just taught. Only add this to some of the most important segments (roughly 1 in every 3-4 segments, never on the intro or recap segment) — most segments should have NO checkpoint.

Rules:
- Produce 8-15 segments: an engaging intro, each major concept in its own segment, at least one worked numerical example, a recap segment, and one practice question at the end.
- Narration must be scientifically accurate. Never invent facts, formulas, or exam information. If uncertain about something, omit it rather than guess.
- Keep each narration segment to roughly 30-90 seconds of natural spoken pacing (about 75-220 words). Double-check every word boundary in the narration text before finishing — never let two words run together with no space (e.g. write "does not change", never "doesnotchange").
- Tailor depth, checkpoint difficulty, and how much derivation/formula content you include based on the exam target given below.
- Output ONLY valid JSON matching this exact shape, nothing else, no markdown code fences:
{"topic": string, "segments": [{"id": number, "slide_title": string, "slide_bullets": [string], "narration": string, "board": string (optional), "diagram": object (optional), "example": object (optional), "formula": object (optional), "notes": string (optional), "checkpoint": object (optional)}]}`;

// Writes the lecture script (no audio) via Sonnet. Throws Object-augmented Errors with
// .status/.details on failure, same convention as voiceService's synthesizeAndUpload, so
// callers (the HTTP handler and the batch pre-generation script) can handle both uniformly.
export async function generateLectureScript(subject, topic, exam) {
  const examLine = EXAM_GUIDANCE[exam] || "No specific exam target was given — write for general NEET/JEE/KCET-level exam prep.";

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
        model: "claude-sonnet-5",
        // Calibrated against real generation runs: a full 13-15 segment rich lecture
        // (board/diagram/example/formula/notes/checkpoint fields) uses ~10,000-12,000
        // output tokens and takes 90-150s. 16,000 measurably truncated mid-lecture on a
        // real run; 24,000 leaves ~2x headroom while still finishing well inside the 300s
        // maxDuration ceiling.
        max_tokens: 24000,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: `Subject: ${subject}\nTopic: ${topic}\n${examLine}` }],
      }),
    });
  } catch (e) {
    throw Object.assign(new Error("Could not reach the lecture writer"), { status: 502, details: e.message });
  }

  if (!anthropicRes.ok) {
    const errText = await anthropicRes.text();
    throw Object.assign(new Error("Lecture generation failed"), { status: anthropicRes.status, details: errText });
  }

  const data = await anthropicRes.json();
  if (data.usage) console.log(`[USAGE] sonnet in=${data.usage.input_tokens} out=${data.usage.output_tokens}`);

  const textBlock = data.content?.find((b) => b.type === "text");
  const rawText = textBlock?.text ?? "";
  // Defends against an occasional ```json fence wrapped around otherwise-valid output —
  // seen from this same model on this same style of request, so cheap, safe insurance.
  const jsonText = rawText.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();

  try {
    return JSON.parse(jsonText);
  } catch {
    // One real test run produced invalid JSON (a raw unescaped character inside a string,
    // most likely) despite stop_reason "end_turn" well under max_tokens — not a truncation
    // case. stop_reason is included here specifically to distinguish that failure mode from
    // a true truncation if this shows up again.
    throw Object.assign(new Error("Model did not return valid JSON"), { status: 502, details: rawText, stopReason: data.stop_reason });
  }
}

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
