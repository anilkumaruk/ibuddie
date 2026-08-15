// Runs on Vercel's Edge Runtime, same pattern as api/ask.js
export const config = { runtime: "edge" };

// Your own self-hosted voice service (Kokoro for English, MMS-TTS for Kannada) —
// no per-request cost, unlike the Sarvam API this route used to call.
const VOICE_SERVICE_URL = "https://ibuddie-voice-1089026974662.asia-south1.run.app/synthesize";

export default async function handler(req) {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }

  const { text, languageCode } = await req.json();
  if (!text || !text.trim()) {
    return new Response(JSON.stringify({ error: "Missing text" }), { status: 400 });
  }

  const langCode = languageCode === "kn-IN" ? "kn-IN" : "en-IN";

  const voiceRes = await fetch(VOICE_SERVICE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, languageCode: langCode }),
  });

  if (!voiceRes.ok || !voiceRes.body) {
    const errText = await voiceRes.text();
    return new Response(errText, { status: voiceRes.status });
  }

  // Pipe the WAV audio straight through to the browser.
  return new Response(voiceRes.body, {
    headers: { "Content-Type": voiceRes.headers.get("content-type") || "audio/wav" },
  });
}