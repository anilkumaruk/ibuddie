export const config = { runtime: "edge" };

export default async function handler(req) {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }

  const { subject, exam, puc, model } = await req.json();
  const modelId = model === "sonnet" ? "claude-sonnet-5" : "claude-haiku-4-5-20251001";
  const pucLabel = puc === "1st" ? "1st PUC (Class 11 equivalent, Karnataka)" : "2nd PUC (Class 12 equivalent, Karnataka)";

  const systemPrompt = `You are an exam-strategy mentor for iBuddie, an exam-prep app for Indian students.
List the most important chapters and topics in "${subject}" for a ${pucLabel} student preparing for the Indian ${exam} exam, organized by chapter (following the standard ${pucLabel} ${subject} syllabus structure for this exam).
Respond with ONLY a raw JSON array — no markdown code fences, no commentary, no text before or after it. Include 4 to 5 chapters, ordered from highest to lowest exam weightage. Each item must have exactly this shape:
{"chapter": "Chapter name", "weightage": "e.g. High, Medium, or a rough % if known", "topics": [{"topic": "...", "why": "one sentence on why this topic matters or how often it's tested", "focus": "one sentence on what specifically to focus on within this topic", "sampleQuestions": ["...", "..."]}]}
Each chapter should list 2 to 3 of its most important topics. Each topic's "sampleQuestions" should have exactly 2 short practice questions written in the style and difficulty of past ${exam} papers on that topic — these are illustrative practice questions you're generating, NOT claimed to be verbatim reproductions of real past exam papers. Keep every sentence concise.`;

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
        max_tokens: 3200,
        system: systemPrompt,
        messages: [{ role: "user", content: "List the important topics now." }],
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

    const chapters = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(chapters) || chapters.length === 0) throw new Error("Empty chapter list");

    return new Response(JSON.stringify({ chapters }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Important topics generation failed:", err);
    return new Response(JSON.stringify({ error: "Could not load important topics. Please try again." }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}