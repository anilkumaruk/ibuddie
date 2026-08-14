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

  // Bulbul v3 REST API caps input at 2500 characters per request
  const safeText = text.length > 2450 ? text.slice(0, 2450) : text;
  const langCode = languageCode === "kn-IN" ? "kn-IN" : "en-IN";

  const sarvamRes = await fetch("https://api.sarvam.ai/text-to-speech", {
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
    }),
  });

  if (!sarvamRes.ok) {
    const errText = await sarvamRes.text();
    return new Response(errText, { status: sarvamRes.status });
  }

  const data = await sarvamRes.json();
  const audio = data.audios?.[0];
  if (!audio) {
    return new Response(JSON.stringify({ error: "No audio returned from Sarvam AI" }), { status: 502 });
  }

  return new Response(JSON.stringify({ audio }), {
    headers: { "Content-Type": "application/json" },
  });
}