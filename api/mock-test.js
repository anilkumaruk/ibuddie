// Non-streaming — we need one complete, valid JSON payload before we can
// render the quiz, unlike ask.js which streams prose as it arrives.
export const config = { runtime: "edge" };

export default async function handler(req) {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }

  const { subject, exam, count, model, chapter } = await req.json();
  const n = Math.min(Math.max(parseInt(count, 10) || 5, 3), 15);
  const modelId = model === "sonnet" ? "claude-sonnet-5" : "claude-haiku-4-5-20251001";

  const scopeLine = chapter ? `Every question must come specifically from the chapter "${chapter}" — do not include questions from any other chapter.` : "";

  const systemPrompt = `You are a question-generator for iBuddie, an exam-prep app for Indian students.
Generate exactly ${n} multiple-choice questions for the subject "${subject}" at the difficulty and syllabus level of the Indian ${exam} exam.
${scopeLine}
The "explanation" field must be ONLY the clean, correct, one-to-two-sentence final solution — never hedging or visible re-working such as "wait", "actually", "let me recheck", or "recalculating". Work out the correct answer fully before writing it down, and double-check that the option at correctIndex is actually correct.
Respond with ONLY a raw JSON array — no markdown code fences, no commentary, no text before or after it. Each item must have exactly this shape:
{"question": "...", "options": ["...", "...", "...", "..."], "correctIndex": 0, "explanation": "...", "topic": "short topic name, e.g. 'Kinematics'"}
correctIndex is the 0-based index (0-3) of the correct option in "options". Keep each question and option concise (under 25 words). Vary which option is correct across questions — don't always put it first. Vary the topic across questions where the subject allows it.`;

  // Give the Anthropic call its own deadline, comfortably inside the platform's
  // function time limit, so a slow generation fails cleanly with JSON we
  // control instead of the platform killing the function and returning an
  // HTML/plain-text error page that breaks the frontend's JSON parse.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);

  try {
    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: controller.signal,
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
      return new Response(JSON.stringify({ error: `Question generation failed (${anthropicRes.status}). Please try again.`, detail: errText.slice(0, 500) }), {
        status: anthropicRes.status,
        headers: { "Content-Type": "application/json" },
      });
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
    const isTimeout = err?.name === "AbortError";
    console.error("Mock test generation failed:", err);
    return new Response(
      JSON.stringify({
        error: isTimeout
          ? "That took too long to generate. Please try again."
          : "Could not generate the mock test. Please try again.",
      }),
      { status: isTimeout ? 504 : 500, headers: { "Content-Type": "application/json" } }
    );
  } finally {
    clearTimeout(timeout);
  }
}
