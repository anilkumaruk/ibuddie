export const config = { runtime: "edge" };

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

export default async function handler(req) {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }

  const { topic, subject } = await req.json();
  if (!topic || !subject) {
    return new Response(JSON.stringify({ error: "topic and subject are required" }), { status: 400 });
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
    return new Response(JSON.stringify({ error: "Lecture generation failed", details: errText }), {
      status: anthropicRes.status,
    });
  }

  const data = await anthropicRes.json();
  console.error("DEBUG stop_reason:", data.stop_reason, "content types:", JSON.stringify(data.content?.map(b => b.type)));

  const textBlock = data.content?.find((b) => b.type === "text");
  const rawText = textBlock?.text ?? "";

  let lecture;
  try {
    lecture = JSON.parse(rawText);
  } catch {
    return new Response(JSON.stringify({ error: "Model did not return valid JSON", raw: rawText }), { status: 502 });
  }

  return new Response(JSON.stringify(lecture), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
