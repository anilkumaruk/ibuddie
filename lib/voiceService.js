import { uploadAudio } from "./storage.js";

const VOICE_SERVICE_URL = "https://ibuddie-voice-1089026974662.asia-south1.run.app/synthesize";

export function slugify(text) {
  return text.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

// Synthesizes narrationText via the self-hosted TTS service, uploads the WAV under filePath
// via the storage abstraction (lib/storage.js — Firebase Storage or R2, per STORAGE_PROVIDER),
// and returns whatever STABLE reference that upload produces: a long-lived Firebase signed URL
// under the "firebase" provider (unchanged from pre-migration behavior), or an "r2://<key>"
// reference under "r2". This is what callers should cache — resolve it to something playable
// with getPlaybackUrl() only at the point a response actually goes out to a client. Shared by
// generate-lecture-audio (all segments of a fresh lecture) and explain-segment (a single
// re-narrated segment).
export async function synthesizeAndUpload(narrationText, filePath) {
  const voiceRes = await fetch(VOICE_SERVICE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: narrationText, languageCode: "en-IN" }),
  });

  if (!voiceRes.ok) {
    const errText = await voiceRes.text();
    throw Object.assign(new Error("Audio synthesis failed"), { status: 502, details: errText });
  }

  const audioBuffer = await voiceRes.arrayBuffer();
  return uploadAudio(filePath, Buffer.from(audioBuffer), "audio/wav");
}
