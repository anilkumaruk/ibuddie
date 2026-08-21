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
    hard: `HARD difficulty: this must be noticeably harder than an average ${exam} question, not just another standard single-formula textbook question. A well-prepared student should need real working, not a one-line formula plug, to solve it. Model each question on ONE of these patterns, which is how genuinely hard real ${exam} questions are built:
(a) a quantity that varies with position/time (e.g. a variable coefficient, field, or force) where the student must integrate or reason piecewise to get a total, rather than plug into one static formula;
(b) a ratio/derivation question where two or more separate physical relations must be combined and simplified algebraically to reach the final ratio or value — the answer is not read off a single formula;
(c) a side-by-side comparison of two different configurations or setups (e.g. two circuit arrangements, two boundary conditions) where the student must correctly analyze both before taking their ratio or difference;
(d) combining two distinct conditions or harmonics/modes and relating them to each other.
Prefer numeric or ratio-style final answers over conceptual one-word answers. If a question could be answered in one step purely from memorized formula recall, it is NOT hard enough — replace it.`,
  }[level];

  const scopeLine = chapter ? `Every question must come specifically from the chapter "${chapter}" — do not include questions from any other chapter.` : "";

  // Only Hard questions need real multi-step derivation, so only Hard pays the
  // token/time cost of a private scratch field. Easy/Medium stay lean and fast.
  const needsScratch = level === "hard";

  const scratchInstructions = needsScratch
    ? `Each question needs a "scratch" field where you actually work through the problem step by step — do your real thinking there, including any false starts or corrections. That field is private and is stripped out before students ever see it, so use it freely.

CRITICAL RULE ABOUT THE "explanation" FIELD: this one IS shown to students as the final answer key. Only write it after "scratch" is completely finished and you're sure of the answer. It must contain ONLY the clean, correct, one-to-two-sentence final solution — never any hedging, false starts, or corrections (no "wait", "actually", "let me recheck", "recalculating", "hmm", or restating an earlier wrong step). All of that thinking belongs in "scratch", never in "explanation". Also make sure correctIndex matches the conclusion you actually reached in "scratch", not an earlier guess.
`
    : `The "explanation" field must be ONLY the clean, correct, one-to-two-sentence final solution — never hedging or visible re-working such as "wait", "actually", or "recalculating".
`;

  const jsonShape = needsScratch
    ? `{"question": "...", "options": ["...", "...", "...", "..."], "correctIndex": 0, "scratch": "your real step-by-step working, private, can be messy", "explanation": "clean final solution only, one to two sentences", "topic": "short topic name, e.g. 'Kinematics'", "difficulty": "${level}"}`
    : `{"question": "...", "options": ["...", "...", "...", "..."], "correctIndex": 0, "explanation": "clean final solution only, one to two sentences", "topic": "short topic name, e.g. 'Kinematics'", "difficulty": "${level}"}`;

  const systemPrompt = `You are a question-generator for iBuddie, an exam-prep app for Indian students.
Generate exactly ${n} multiple-choice questions for the subject "${subject}" at the syllabus level of the Indian ${exam} exam.
DIFFICULTY LEVEL: ${difficultyLine}
${scopeLine}
${scratchInstructions}
Respond with ONLY a raw JSON array — no markdown code fences, no commentary, no text before or after it. Each item must have exactly this shape:
${jsonShape}
correctIndex is the 0-based index (0-3) of the correct option in "options". Keep each question and option concise (under 25 words). Vary which option is correct across questions — don't always put it first. Vary the topic across questions where the subject allows it. Every question must match the requested difficulty level — do not default back to medium difficulty.`;

  // Give the Anthropic call its own hard deadline, comfortably inside the
  // platform's function time limit, so a slow generation fails cleanly with
  // JSON we control instead of the platform killing the function and
  // returning an HTML/plain-text error page that breaks the frontend's
  // res.json() parse.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

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
        max_tokens: needsScratch ? 4200 : 2800,
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

    const rawQuestions = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(rawQuestions) || rawQuestions.length === 0) throw new Error("Empty question set");

    // Strip the private "scratch" working field — students must only ever see
    // the clean "explanation", never the model's raw step-by-step reasoning.
    const questions = rawQuestions.map(({ scratch, ...q }) => q);

    return new Response(JSON.stringify({ questions }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const isTimeout = err?.name === "AbortError";
    console.error("Mock test generation failed:", err);
    return new Response(
      JSON.stringify({
        error: isTimeout
          ? "That took too long to generate. Please try again — fewer questions or Medium difficulty may be faster."
          : "Could not generate the mock test. Please try again.",
      }),
      { status: isTimeout ? 504 : 500, headers: { "Content-Type": "application/json" } }
    );
  } finally {
    clearTimeout(timeout);
  }
}