import { adminStorage } from "../lib/firebaseadmin.js";

const VOICE_SERVICE_URL = "https://ibuddie-voice-1089026974662.asia-south1.run.app/synthesize";

// Segments are processed with bounded concurrency instead of strictly serial,
// because vercel dev's own internal proxy (undici, bundled in @vercel/node)
// kills the whole request after 300s of no response headers — and a fully
// serial run of a long lecture reliably exceeds that. This is a stopgap:
// production Vercel has its own function duration limits, so a job-queue
// design (return immediately, process in the background, client polls) is
// the real fix for lectures of unbounded length.
const CONCURRENCY = 4;

function slugify(text) {
  return text.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function timeoutAfter(ms, label) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error(`Timed out after ${ms}ms: ${label}`)), ms));
}

async function processSegment(segment, topicSlug) {
  const voiceRes = await fetch(VOICE_SERVICE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: segment.narration, languageCode: "en-IN" }),
  });

  if (!voiceRes.ok) {
    const errText = await voiceRes.text();
    throw Object.assign(new Error(`Audio failed on segment ${segment.id}`), { status: 502, details: errText });
  }

  const audioBuffer = await voiceRes.arrayBuffer();
  const filePath = `lectures/${topicSlug}/segment-${segment.id}.wav`;
  const file = adminStorage.file(filePath);
  await file.save(Buffer.from(audioBuffer), { contentType: "audio/wav" });
  const [signedUrl] = await file.getSignedUrl({ action: "read", expires: "01-01-2099" });

  return { ...segment, audio_url: signedUrl };
}

async function runWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function runNext() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex++;
      results[currentIndex] = await worker(items[currentIndex]);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, runNext);
  await Promise.all(workers);
  return results;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const lecture = req.body;
  if (!lecture?.topic || !Array.isArray(lecture.segments)) {
    return res.status(400).json({ error: "Expected a lecture object with topic and segments" });
  }

  const topicSlug = slugify(lecture.topic);
  const total = lecture.segments.length;

  try {
    const segmentsWithAudio = await runWithConcurrency(lecture.segments, CONCURRENCY, async (segment) => {
      console.log(`[${segment.id}/${total}] Starting...`);
      const result = await Promise.race([
        processSegment(segment, topicSlug),
        timeoutAfter(120000, `segment ${segment.id}`),
      ]);
      console.log(`[${segment.id}/${total}] Done.`);
      return result;
    });

    return res.status(200).json({ topic: lecture.topic, segments: segmentsWithAudio });
  } catch (e) {
    console.log(`FAILED:`, e.message);
    return res.status(e.status || 504).json({ error: e.message, details: e.details });
  }
}
