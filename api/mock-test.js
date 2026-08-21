// Non-streaming — we need one complete, valid JSON payload before we can
// render the quiz, unlike ask.js which streams prose as it arrives.
export const config = { runtime: "edge" };

export default async function handler(req) {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }

  const { subject, exam, count, model, chapter, difficulty } = await req.json();
  const n = Math.min(Math.max(parseInt(count, 10) || 5, 3), 15);
  const modelId = model === "sonnet" ? "claude-sonnet-5" : "claude-haiku-4-5-20251001";

  const level = ["easy", "medium", "hard"].includes(difficulty) ? difficulty : "medium";
  const difficultyLine = {
    easy: `EASY difficulty: direct, single-concept recall and straightforward application of one well-known formula. No multi-step reasoning or tricky wording. Should be comfortably answerable by a student who has just learned the topic.`,
    medium: `MEDIUM difficulty: standard ${exam} exam level — a mix of direct recall and one or two-step application/numerical problems, similar to what shows up most often in the real exam.`,
    hard: `HARD difficulty: this must be noticeably harder than an average ${exam} question, not just another standard single-formula textbook question. A well-prepared student should need real working, not a one-line formula plug, to solve it. Use at least one of: combining two or more distinct concepts in one question, a multi-step derivation or calculation, an unusual/twisted setup or edge case, or closely-spaced distractor options that trap a common mistake. If a question could be answered in one step purely from memorized formula recall, it is NOT hard enough — replace it.`,
  }[level];

  const scopeLine = chapter ? `Every question must come specifically from the chapter "${chapter}" — do not include questions from any other chapter.` : "";

  const systemPrompt = `You are a question-generator for iBuddie, an exam-prep app for Indian students.
Generate exactly ${n} multiple-choice questions for the subject "${subject}" at the syllabus level of the Indian ${exam} exam.
DIFFICULTY LEVEL: ${difficultyLine}
${scopeLine}
Work out the correct answer to each question carefully and fully in your own head before writing anything down, and double-check that the option at correctIndex is actually, factually correct (verify against standard formulas/results) before including the question.
Respond with ONLY a raw JSON array — no markdown code fences, no commentary, no text before or after it. Each item must have exactly this shape:
{"question": "...", "options": ["...", "...", "...", "..."], "correctIndex": 0, "explanation": "...", "topic": "short topic name, e.g. 'Kinematics'", "difficulty": "${level}"}
correctIndex is the 0-based index (0-3) of the correct option in "options". Keep each question and option concise (under 25 words). The "explanation" must be ONLY the final, clean, correct solution in one or two sentences — never include hedging, backtracking, or visible re-working such as "wait", "let me recheck", "actually", or "recalculating"; if you need to work through the problem, do that silently and only write down the final correct explanation. Vary which option is correct across questions — don't always put it first. Vary the topic across questions where the subject allows it. Every question must match the requested difficulty level — do not default back to medium difficulty.`;

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
        max_tokens: 3500,
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