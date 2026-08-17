export const config = { runtime: "edge" };

export default async function handler(req) {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }

  const { subject, exam, model } = await req.json();
  const modelId = model === "sonnet" ? "claude-sonnet-5" : "claude-haiku-4-5-20251001";

  const systemPrompt = `You are an exam-prep content mentor for iBuddie, an exam-prep app for Indian students.
Generate 8 multiple-choice practice questions for "${subject}" written in the exact style, difficulty, and syllabus scope of past ${exam} exam papers — these are practice questions YOU are generating in that style, not claimed to be verbatim reproductions of real historical papers.
Cover a spread of different topics within ${subject} and a mix of difficulty levels.
Respond with ONLY a raw JSON array — no markdown code fences, no commentary, no text before or after it. Each item must have exactly this shape:
{"topic": "short topic name", "difficulty": "Easy, Medium, or Hard", "question": "the question text", "options": ["option A", "option B", "option C", "option D"], "correctIndex": 0, "solution": "a clear step-by-step explanation of how to reach the correct answer, 3-5 sentences"}
correctIndex is the 0-based index of the correct option. Keep question and option text concise and exam-realistic.`;

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
        max_tokens: 4000,
        system: systemPrompt,
        messages: [{ role: "user", content: "Generate the practice questions now." }],
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
    if (!Array.isArray(questions) || questions.length === 0) throw new Error("Empty question list");

    return new Response(JSON.stringify({ questions }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("PYQ generation failed:", err);
    return new Response(JSON.stringify({ error: "Could not load practice questions. Please try again." }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}