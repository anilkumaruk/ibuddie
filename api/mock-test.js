// Non-streaming — we need one complete, valid JSON payload before we can
// render the quiz, unlike ask.js which streams prose as it arrives.
export const config = { runtime: "edge" };

export default async function handler(req) {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }

  const { subject, exam, count, model } = await req.json();
  const n = Math.min(Math.max(parseInt(count, 10) || 5, 3), 15);
  const modelId = model === "sonnet" ? "claude-sonnet-5" : "claude-haiku-4-5-20251001";

  const systemPrompt = `You are a question-generator for iBuddie, an exam-prep app for Indian students.
Generate exactly ${n} multiple-choice questions for the subject "${subject}" at the difficulty and syllabus level of the Indian ${exam} exam.
Respond with ONLY a raw JSON array — no markdown code fences, no commentary, no text before or after it. Each item must have exactly this shape:
{"question": "...", "options": ["...", "...", "...", "..."], "correctIndex": 0, "explanation": "..."}
correctIndex is the 0-based index (0-3) of the correct option in "options". Keep each question and option concise (under 25 words). Vary which option is correct across questions — don't always put it first.`;

  try {
    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: modelId,
        max_tokens: 2800,
        system: systemPrompt,
        messages: [{ role: "user", content: `Generate the ${n} questions now.` }],
      }),
    });

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      return new Response(errText, { status: anthropicRes.status });
    }

    const data = await anthropicRes.json();
    const text = data.content?.[0]?.text || "";
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error("Model did not return a JSON array");

    const questions = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(questions) || questions.length === 0) throw new Error("Empty question set");

    return new Response(JSON.stringify({ questions }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Mock test generation failed:", err);
    return new Response(JSON.stringify({ error: "Could not generate the mock test. Please try again." }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}