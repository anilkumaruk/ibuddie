// Batch pre-generation for the AI Lecture library. Runs OFFLINE — a human triggers this
// manually or via a scheduled job. Never called from a student-facing request path.
//
// For every (subject, PUC year topic, exam mode) combination in scope, this reuses the exact
// same generation logic the live app uses (generateLectureScript + synthesizeLecture from
// api/generate-lecture*.js, explainSegment from api/explain-segment.js), so a pre-generated
// lecture is byte-for-byte what a student would have gotten from a live request — just
// computed ahead of time and cached under the same Firestore/Storage keys generate-lecture.js
// checks on every request. That's what makes the live path a zero-cost cache hit afterward.
//
// Resume/skip: every write path (lectureCacheKey, explain cache key) already checks Firestore
// before calling any model, so re-running this script after a partial run — or a crash — just
// skips everything already cached and picks up where it left off. No separate checkpoint file
// needed.
//
// Usage:
//   node scripts/pregenerate-lectures.js --dry-run                 # enumerate scope + cost estimate, no API calls
//   node scripts/pregenerate-lectures.js --exam=NEET                # NEET only, realistic subject mapping
//   node scripts/pregenerate-lectures.js --exam=NEET,JEE --puc=2nd  # scope by exam + PUC year
//   node scripts/pregenerate-lectures.js --all-subjects             # full 4-subject x N-exam cross product
//   node scripts/pregenerate-lectures.js --no-explain                # lectures only, skip the 4 Explain Again styles
//   node scripts/pregenerate-lectures.js --per-combo=3               # first 3 topics per (subject, exam) pair — smoke test
//   node scripts/pregenerate-lectures.js --limit=2                   # process only the first N topics overall
//   node scripts/pregenerate-lectures.js --topic="Kinematics"        # restrict to one topic (across the exam/subject scope)

import fs from "fs";

// lib/firebaseadmin.js has its own .env.local fallback for Firebase creds (Vercel dev doesn't
// reliably expose Production-only dashboard vars locally), but generate-lecture.js and
// explain-segment.js read process.env.ANTHROPIC_API_KEY directly — fine under `vercel dev` or
// deployed Vercel, where the platform injects it, but this script runs as plain `node` with no
// such injection. Load .env.local ourselves before any generation call needs it. This only
// fills in keys not already set (e.g. by a real shell export), and runs before main() calls
// any generation function — module-level state in the imported files (like adminDb's own
// Firebase init) already has its own fallback and doesn't depend on this.
function loadEnvLocal() {
  let content;
  try {
    content = fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  } catch {
    return;
  }
  for (const line of content.split("\n")) {
    const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key]) continue;
    let value = rawValue;
    if ((value.startsWith("'") && value.endsWith("'")) || (value.startsWith('"') && value.endsWith('"'))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}
loadEnvLocal();

import { adminDb } from "../lib/firebaseadmin.js";
import { generateLectureScript } from "../api/_routes/generate-lecture.js";
import { synthesizeLecture } from "../api/_routes/generate-lecture-audio.js";
import { explainSegment, EXPLAIN_STYLE_KEYS } from "../api/_routes/explain-segment.js";
import { lectureCacheKey } from "../lib/lectureCache.js";
import { PUC_SYLLABUS } from "../src/data/pucSyllabus.js";

// Must match App.jsx's `EXAMS` array exactly (including "Boards" casing) — this is the same
// value threaded through generate-lecture.js's EXAM_GUIDANCE lookup and the cache key, so a
// mismatch here would silently generate under the generic "no specific exam target" prompt
// instead of the real per-exam guidance.
const ALL_EXAMS = ["NEET", "JEE", "KCET", "Boards"];

// Real-world syllabus overlap per exam — NEET has no Mathematics, JEE has no Biology.
// KCET (Karnataka CET) and Boards (CBSE/state board) both cover students across PCM and PCB
// streams, so both are mapped to all four subjects here; pass --all-subjects to ignore this
// mapping entirely and generate every subject for every requested exam instead.
const DEFAULT_SUBJECTS_BY_EXAM = {
  NEET: ["Physics", "Chemistry", "Biology"],
  JEE: ["Physics", "Chemistry", "Mathematics"],
  KCET: ["Physics", "Chemistry", "Mathematics", "Biology"],
  Boards: ["Physics", "Chemistry", "Mathematics", "Biology"],
};

function parseArgs(argv) {
  const args = { exam: null, subjects: null, allSubjects: false, puc: null, explain: true, dryRun: false, limit: null, perCombo: null, topic: null };
  for (const raw of argv) {
    const [key, value] = raw.replace(/^--/, "").split(/=(.*)/s);
    if (key === "exam") {
      args.exam = value.split(",").map((s) => {
        const match = ALL_EXAMS.find((e) => e.toLowerCase() === s.trim().toLowerCase());
        if (!match) throw new Error(`Unknown exam "${s}" — expected one of ${ALL_EXAMS.join(", ")}`);
        return match;
      });
    }
    else if (key === "subjects") args.subjects = value.split(",").map((s) => s.trim());
    else if (key === "all-subjects") args.allSubjects = true;
    else if (key === "puc") args.puc = value.split(",").map((s) => s.trim());
    else if (key === "no-explain") args.explain = false;
    else if (key === "dry-run") args.dryRun = true;
    else if (key === "limit") args.limit = Number(value);
    else if (key === "per-combo") args.perCombo = Number(value);
    else if (key === "topic") args.topic = value;
  }
  return args;
}

function buildScope(args) {
  const exams = args.exam?.length ? args.exam : ALL_EXAMS;
  const pucYears = args.puc?.length ? args.puc : ["1st", "2nd"];

  const jobs = [];
  for (const exam of exams) {
    const subjects = args.allSubjects ? Object.keys(PUC_SYLLABUS) : (args.subjects || DEFAULT_SUBJECTS_BY_EXAM[exam]);
    for (const subject of subjects) {
      const byYear = PUC_SYLLABUS[subject];
      if (!byYear) throw new Error(`Unknown subject "${subject}" — expected one of ${Object.keys(PUC_SYLLABUS).join(", ")}`);
      let takenForCombo = 0;
      for (const puc of pucYears) {
        for (const topic of byYear[puc] || []) {
          if (args.topic && topic !== args.topic) continue;
          if (args.perCombo && takenForCombo >= args.perCombo) continue;
          jobs.push({ subject, exam, puc, topic });
          takenForCombo++;
        }
      }
    }
  }
  return args.limit ? jobs.slice(0, args.limit) : jobs;
}

// Rough, documented estimate — not a live pricing lookup. Sonnet 5 $2/$10 per 1M in/out
// tokens, Haiku 4.5 $1/$5 per 1M in/out tokens (see the Anthropic pricing page for current
// rates). Token counts are averages measured from real generation runs, not worst-case.
function estimateCost(jobCount, explainEnabled) {
  const SONNET_IN = 700, SONNET_OUT = 11000;
  const sonnetCost = jobCount * (SONNET_IN * 2 + SONNET_OUT * 10) / 1e6;

  let haikuCost = 0;
  if (explainEnabled) {
    const AVG_SEGMENTS = 11.5;
    const HAIKU_IN = 800, HAIKU_OUT = 500;
    const explainCalls = jobCount * AVG_SEGMENTS * EXPLAIN_STYLE_KEYS.length;
    haikuCost = explainCalls * (HAIKU_IN * 1 + HAIKU_OUT * 5) / 1e6;
  }
  return { sonnetCost, haikuCost, total: sonnetCost + haikuCost };
}

async function isLectureCached(job) {
  const doc = await adminDb.collection("lectures").doc(lectureCacheKey(job)).get();
  return doc.exists ? doc.data() : null;
}

async function processJob(job, index, total) {
  const label = `${job.subject} / ${job.exam} / ${job.puc} PUC / "${job.topic}"`;
  console.log(`\n[${index + 1}/${total}] ${label}`);

  let lecture = await isLectureCached(job);
  if (lecture) {
    console.log(`  SKIP — already cached (${lecture.segments.length} segments)`);
  } else {
    console.log("  Generating script (Sonnet)...");
    const script = await generateLectureScript(job.subject, job.topic, job.exam);
    console.log(`  Script done — ${script.segments.length} segments. Synthesizing audio...`);
    // Cache under the requested topic (job.topic), not the model's own returned topic string
    // (script.topic) — the model is free to rephrase it slightly (e.g. adding "in Properties"),
    // which silently mismatched the key this resume check and the live app's read path both use,
    // causing permanent cache misses and duplicate regeneration on every re-run.
    lecture = await synthesizeLecture({ topic: job.topic, segments: script.segments, subject: job.subject, exam: job.exam });
    console.log("  Lecture cached.");
  }
  return lecture;
}

async function processExplainStyles(job, lecture) {
  for (const segment of lecture.segments) {
    for (const style of EXPLAIN_STYLE_KEYS) {
      try {
        const { fromCache } = await explainSegment({ subject: job.subject, topic: job.topic, exam: job.exam, segment, style });
        console.log(`    ${fromCache ? "skip (cached)" : "generated"} — segment ${segment.id} / ${style}`);
      } catch (e) {
        console.log(`    FAILED — segment ${segment.id} / ${style}: ${e.message}`);
      }
    }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const jobs = buildScope(args);

  console.log(`Scope: ${jobs.length} lecture(s)${args.explain ? ` + up to ${EXPLAIN_STYLE_KEYS.length} Explain Again styles each` : " (Explain Again skipped)"}`);
  const { sonnetCost, haikuCost, total } = estimateCost(jobs.length, args.explain);
  console.log(`Estimated Claude API cost: ~$${sonnetCost.toFixed(2)} (Sonnet scripts) + ~$${haikuCost.toFixed(2)} (Haiku explain rewrites) = ~$${total.toFixed(2)} total`);
  console.log("(TTS/audio synthesis cost is separate — self-hosted Cloud Run compute, not an Anthropic API cost — and not included above.)");

  if (args.dryRun) {
    console.log("\n--dry-run: listing scope only, no API calls made.\n");
    jobs.forEach((j, i) => console.log(`  ${i + 1}. ${j.subject} / ${j.exam} / ${j.puc} PUC / "${j.topic}"`));
    return;
  }

  let succeeded = 0, failed = 0;
  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i];
    try {
      const lecture = await processJob(job, i, jobs.length);
      if (args.explain) await processExplainStyles(job, lecture);
      succeeded++;
    } catch (e) {
      failed++;
      console.log(`  FAILED — ${job.subject} / ${job.exam} / "${job.topic}": ${e.message}`);
      if (e.details) console.log(`    details: ${typeof e.details === "string" ? e.details.slice(0, 300) : JSON.stringify(e.details).slice(0, 300)}`);
    }
  }

  console.log(`\nDone. ${succeeded} succeeded, ${failed} failed, out of ${jobs.length}.`);
  if (failed > 0) console.log("Re-run the same command to retry failures — everything already cached will be skipped.");
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
