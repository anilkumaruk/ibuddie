export const config = { runtime: "edge" };

// If strict JSON.parse fails (e.g. the model's response got truncated mid-array, or
// included one malformed entry), salvage whatever complete {...} objects we can find
// instead of throwing away the whole batch over one bad question.
function repairAndParseQuestions(rawText) {
  const objectMatches = rawText.match(/\{[^{}]*\}/g) || [];
  const recovered = [];
  for (const chunk of objectMatches) {
    try {
      const obj = JSON.parse(chunk);
      if (obj && typeof obj.question === "string" && Array.isArray(obj.options)) {
        recovered.push(obj);
      }
    } catch {
      // skip this one malformed object, keep going
    }
  }
  return recovered;
}

export default async function handler(req) {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }

  const { subject, exam, puc, model, chapter, year } = await req.json();
  const modelId = model === "sonnet" ? "claude-sonnet-5" : "claude-haiku-4-5-20251001";
  const pucLabel = puc === "1st" ? "1st PUC (Class 11 equivalent, Karnataka)" : "2nd PUC (Class 12 equivalent, Karnataka)";

  const scopeLine = chapter
    ? `Every question must come specifically from the chapter "${chapter}" — do not include questions from any other chapter.`
    : year
    ? `Write these in the style, difficulty, and question patterns typical of the ${year} ${exam} exam specifically — these are practice questions YOU are generating in that ${year} style, not claimed to be verbatim reproductions of the real ${year} paper.`
    : `Cover a spread of different topics within ${subject}.`;

  const systemPrompt = `You are an exam-prep content mentor for iBuddie, an exam-prep app for Indian students.
Generate 6 multiple-choice practice questions for "${subject}" (${pucLabel} syllabus) written in the exact style and difficulty of past ${exam} exam papers — these are practice questions YOU are generating in that style, not claimed to be verbatim reproductions of real historical papers.
${scopeLine}
Include a mix of difficulty levels.
Respond with ONLY a raw JSON array — no markdown code fences, no commentary, no text before or after it. Each item must have exactly this shape:
{"topic": "short topic name", "difficulty": "Easy, Medium, or Hard", "question": "the question text", "options": ["option A", "option B", "option C", "option D"], "correctIndex": 0, "solution": "a clear step-by-step explanation of how to reach the correct answer, 2-3 sentences"}
correctIndex is the 0-based index of the correct option.
Critical formatting rules: output must be strictly valid JSON. Never use a double-quote character inside any string value (rewrite the sentence to avoid quoting anything). Keep every field concise. Do not include a trailing comma after the last item.`;

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
        max_tokens: 6000,
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

    let questions;
    try {
      questions = JSON.parse(jsonMatch[0]);
    } catch (parseErr) {
      console.error("Strict JSON parse failed, attempting repair:", parseErr.message);
      questions = repairAndParseQuestions(jsonMatch[0]);
    }

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