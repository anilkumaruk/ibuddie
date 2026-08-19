export const config = { runtime: "edge" };

export default async function handler(req) {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }

  const { weakTopics, exam, daysRemaining, model } = await req.json();
  const modelId = model === "sonnet" ? "claude-sonnet-5" : "claude-haiku-4-5-20251001";

  const weakTopicsText = Object.entries(weakTopics)
    .map(([subject, topics]) => `${subject}: ${topics.map((t) => `${t.topic} (asked about ${t.count}x)`).join(", ")}`)
    .join("\n");

  const planLength = Math.min(daysRemaining, 21); // cap the generated plan at 3 weeks — a plan for a 6-month countdown isn't useful to see all at once

  const systemPrompt = `You are a study planning mentor for iBuddie, an exam-prep app for Indian students preparing for ${exam}.
The student has ${daysRemaining} days remaining until their exam. Based on their real doubt-asking history, here are the topics they've struggled with most (asked about most frequently), by subject:
${weakTopicsText}
Generate a ${planLength}-day revision plan (covering the next ${planLength} days) that prioritizes these weak topics early, while still being a sensible, balanced study schedule (mixing revision of weak topics with lighter review of other areas, not just endlessly repeating the same topic). If ${planLength} is less than ${daysRemaining}, treat this as the first ${planLength} days of a longer runway, not a cram-everything-in plan.
Respond with ONLY a raw JSON array — no markdown code fences, no commentary. Each item must have exactly this shape:
{"day": 1, "subject": "Physics", "focus": "short focus description, e.g. 'Kinematics — numerical practice'", "note": "one sentence on why/what to do that day"}
Keep "focus" and "note" concise. Do not include a trailing comma after the last item.`;

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
        messages: [{ role: "user", content: "Generate the study plan now." }],
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

    const plan = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(plan) || plan.length === 0) throw new Error("Empty plan");

    return new Response(JSON.stringify({ plan }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Study plan generation failed:", err);
    return new Response(JSON.stringify({ error: "Could not build your study plan. Please try again." }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}