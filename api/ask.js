// Runs on Vercel's Edge Runtime for real streaming support
export const config = { runtime: "edge" };

export default async function handler(req) {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }

  const { question, systemPrompt, image, model } = await req.json();

  if (model === "haiku") return streamFromClaude(question, systemPrompt, image, "claude-haiku-4-5-20251001");
  if (model === "sonnet") return streamFromClaude(question, systemPrompt, image, "claude-sonnet-5");
  return streamFromGemini(question, systemPrompt, image);
}

// ---- Haiku / Sonnet tiers: Claude (Anthropic) ----
async function streamFromClaude(question, systemPrompt, image, modelId) {
  const content = image
    ? [
        { type: "image", source: { type: "base64", media_type: image.mediaType, data: image.data } },
        { type: "text", text: question },
      ]
    : question;

  const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: modelId,
      max_tokens: 1000,
      system: systemPrompt,
      stream: true,
      messages: [{ role: "user", content }],
    }),
  });

  if (!anthropicRes.ok || !anthropicRes.body) {
    const errText = await anthropicRes.text();
    return new Response(errText, { status: anthropicRes.status });
  }

  const reader = anthropicRes.body.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop();
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (!jsonStr) continue;
          try {
            const evt = JSON.parse(jsonStr);
            if (evt.type === "content_block_delta" && evt.delta?.type === "text_delta") {
              controller.enqueue(encoder.encode(evt.delta.text));
            }
          } catch {
            // ignore partial/incomplete JSON lines
          }
        }
      }
      controller.close();
    },
  });

  return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

// ---- Free tier: Gemini ----
async function streamFromGemini(question, systemPrompt, image) {
  const parts = image
    ? [{ inline_data: { mime_type: image.mediaType, data: image.data } }, { text: question }]
    : [{ text: question }];

  const geminiRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:streamGenerateContent?alt=sse&key=${process.env.GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: "user", parts }],
      }),
    }
  );

  if (!geminiRes.ok || !geminiRes.body) {
    const errText = await geminiRes.text();
    return new Response(errText, { status: geminiRes.status });
  }

  const reader = geminiRes.body.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop();
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (!jsonStr) continue;
          try {
            const evt = JSON.parse(jsonStr);
            const text = evt?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) controller.enqueue(encoder.encode(text));
          } catch {
            // ignore partial/incomplete JSON lines
          }
        }
      }
      controller.close();
    },
  });

  return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}