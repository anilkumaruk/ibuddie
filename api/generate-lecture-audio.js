import { adminDb } from "../lib/firebaseadmin.js";
import { synthesizeAndUpload } from "../lib/voiceService.js";
import { lectureCacheKey, lectureStoragePrefix } from "../lib/lectureCache.js";
import { getPlaybackUrl } from "../lib/storage.js";

// Segments are processed with bounded concurrency instead of strictly serial,
// because vercel dev's own internal proxy (undici, bundled in @vercel/node)
// kills the whole request after 300s of no response headers — and a fully
// serial run of a long lecture reliably exceeds that. This is a stopgap:
// production Vercel has its own function duration limits, so a job-queue
// design (return immediately, process in the background, client polls) is
// the real fix for lectures of unbounded length.
const CONCURRENCY = 4;

function timeoutAfter(ms, label) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error(`Timed out after ${ms}ms: ${label}`)), ms));
}

async function processSegment(segment, storagePrefix) {
  const audio_url = await synthesizeAndUpload(segment.narration, `${storagePrefix}/segment-${segment.id}.wav`);
  return { ...segment, audio_url };
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

// Synthesizes audio for every segment of a lecture script and, when subject/exam are given,
// caches the finished lecture (script + audio_url per segment) in Firestore so a future
// request for the same subject+topic+exam is served instantly by generate-lecture.js without
// touching Sonnet or the voice service again.
//
// segmentsWithAudio (and what gets cached to Firestore) carries whatever STABLE reference
// synthesizeAndUpload returns for each segment — a Firebase signed URL or an "r2://<key>"
// reference, per STORAGE_PROVIDER (see lib/storage.js). The value returned from this function
// is a separate, playable-URL copy, resolved via getPlaybackUrl() — so an r2:// reference is
// never handed back to a caller expecting to actually play the audio.
async function synthesizeLecture({ topic, segments, subject, exam }) {
  const storagePrefix = lectureStoragePrefix({ subject: subject || "general", topic, exam });
  const total = segments.length;

  const segmentsWithAudio = await runWithConcurrency(segments, CONCURRENCY, async (segment) => {
    console.log(`[${segment.id}/${total}] Starting...`);
    const result = await Promise.race([
      processSegment(segment, storagePrefix),
      timeoutAfter(120000, `segment ${segment.id}`),
    ]);
    console.log(`[${segment.id}/${total}] Done.`);
    return result;
  });

  if (subject) {
    const cacheRef = adminDb.collection("lectures").doc(lectureCacheKey({ subject, topic, exam }));
    await cacheRef.set({ subject, topic, exam: exam || null, segments: segmentsWithAudio, cachedAt: Date.now() });
  }

  const playableSegments = await Promise.all(
    segmentsWithAudio.map(async (segment) => ({ ...segment, audio_url: await getPlaybackUrl(segment.audio_url) }))
  );
  return { topic, segments: playableSegments };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { topic, segments, subject, exam } = req.body;
  if (!topic || !Array.isArray(segments)) {
    return res.status(400).json({ error: "Expected a lecture object with topic and segments" });
  }

  try {
    const result = await synthesizeLecture({ topic, segments, subject, exam });
    return res.status(200).json(result);
  } catch (e) {
    console.log(`FAILED:`, e.message);
    return res.status(e.status || 504).json({ error: e.message, details: e.details });
  }
}
