// Runs on Vercel's Edge Runtime for real streaming support
export const config = { runtime: "edge" };

export default async function handler(req) {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }

  const { question, systemPrompt, image, model, history } = await req.json();

  if (model === "haiku") {
  return streamFromClaude(
    question,
    systemPrompt,
    image,
    "claude-haiku-4-5-20251001",
    history
  );
}

if (model === "sonnet") {
  return streamFromClaude(
    question,
    systemPrompt,
    image,
    "claude-sonnet-5",
    history
  );
}

if (model === "ibuddie") {
  return streamFromOllama(question, systemPrompt);
}

return streamFromGemini(question, systemPrompt, image);
}

// ---- Haiku / Sonnet tiers: Claude (Anthropic) ----
// `history` is optional — an array of prior { role: "user"|"assistant", content } turns from
// a multi-turn session (e.g. Voice Viva mode's running oral-exam transcript). Every other
// caller omits it, which preserves the original single-turn behavior exactly.
async function streamFromClaude(question, systemPrompt, image, modelId, history) {
  const content = image
    ? [
        { type: "image", source: { type: "base64", media_type: image.mediaType, data: image.data } },
        { type: "text", text: question },
      ]
    : question;

  const messages = [...(Array.isArray(history) ? history : []), { role: "user", content }];

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
      messages,
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



// ---- iBuddie Local AI: Ollama + Qwen2.5-3B ----
// OLLAMA_SERVER_URL / OLLAMA_AUTH_TOKEN point this at the always-on Oracle Cloud VM in
// production. Left unset, it falls back to 127.0.0.1 for local `vercel dev` testing
// against Ollama running on this same machine, same as before.
async function streamFromOllama(question, systemPrompt) {
  const baseUrl = process.env.OLLAMA_SERVER_URL || "http://127.0.0.1:11434";
  const authToken = process.env.OLLAMA_AUTH_TOKEN; // only needed once a remote server is in front of nginx's auth check

  const ollamaRes = await fetch(`${baseUrl}/api/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    },
    body: JSON.stringify({
      model: "ibuddie",
      system: systemPrompt,
      prompt: question,
      stream: true,
      options: {
        temperature: 0.25,
        top_p: 0.9,
        num_ctx: 8192,
      },
    }),
  });

  if (!ollamaRes.ok || !ollamaRes.body) {
    const errText = await ollamaRes.text();

    return new Response(
      JSON.stringify({
        error: "Ollama request failed",
        details: errText,
      }),
      {
        status: ollamaRes.status,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  }

  const reader = ollamaRes.body.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let buffer = "";

      try {
        while (true) {
          const { done, value } = await reader.read();

          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.trim()) continue;

            try {
              const data = JSON.parse(line);

              if (data.response) {
                // Strip markdown bold markers -- the fine-tuned iBuddie model writes
                // **Concept:**-style section headers, but the chat UI renders plain text
                // (no markdown), and the shared parseReply() parser expects a bare
                // "TOPIC:"/"DIFFICULTY:" prefix with no asterisks in front of it.
                const cleaned = data.response.replace(/\*\*/g, "");
                if (cleaned) {
                  controller.enqueue(encoder.encode(cleaned));
                }
              }

              if (data.done) {
                break;
              }
            } catch {
              // Ignore incomplete JSON chunks
            }
          }
        }

        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
}