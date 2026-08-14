// Runs on Vercel's Edge Runtime, same pattern as api/ask.js
export const config = { runtime: "edge" };

export default async function handler(req) {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }

  const { text, languageCode } = await req.json();
  if (!text || !text.trim()) {
    return new Response(JSON.stringify({ error: "Missing text" }), { status: 400 });
  }

  // Bulbul v3 caps input at 2500 characters per request
  const safeText = text.length > 2450 ? text.slice(0, 2450) : text;
  const langCode = languageCode === "kn-IN" ? "kn-IN" : "en-IN";

  // Streaming endpoint: Sarvam starts sending audio bytes as soon as the first
  // chunk is synthesized, and returns raw binary (mp3) instead of a base64 JSON
  // blob — both cut the "time to first sound" way down vs the plain REST endpoint.
  const sarvamRes = await fetch("https://api.sarvam.ai/text-to-speech/stream", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-subscription-key": process.env.SARVAM_API_KEY,
    },
    body: JSON.stringify({
      text: safeText,
      language_code: langCode,
      model: "bulbul:v3",
      speaker: "shubh", // safe cross-language default; can be made user-selectable later
      output_audio_codec: "mp3", // much smaller/faster to transfer than default WAV
    }),
  });

  if (!sarvamRes.ok || !sarvamRes.body) {
    const errText = await sarvamRes.text();
    return new Response(errText, { status: sarvamRes.status });
  }

  // Pipe Sarvam's audio stream straight through to the browser — no buffering,
  // no base64, no JSON wrapping.
  return new Response(sarvamRes.body, {
    headers: { "Content-Type": sarvamRes.headers.get("content-type") || "audio/mpeg" },
  });
}