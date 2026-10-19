// Tests for the dashboard aggregation helpers (lib/collegeStats.js). Run with `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  generateCode, normalizeCode, normalizePhone, normalizeEmail, parseRoster, studentsToCsv, daysSince, summarizeStudent, summarizeGroup,
} from "./collegeStats.js";

const NOW = Date.parse("2026-10-13T10:00:00Z");

test("generateCode uses only unambiguous characters", () => {
  const code = generateCode(200);
  assert.equal(code.length, 200);
  assert.match(code, /^[A-HJKMNP-Z2-9]+$/);
});

test("normalizeCode uppercases and strips separators", () => {
  assert.equal(normalizeCode(" ab-c 2x9 "), "ABC2X9");
  assert.equal(normalizeCode(undefined), "");
});

test("daysSince handles today, past and missing dates", () => {
  assert.equal(daysSince("2026-10-13", NOW), 0);
  assert.equal(daysSince("2026-10-03", NOW), 10);
  assert.equal(daysSince(null, NOW), null);
  assert.equal(daysSince("garbage", NOW), null);
});

test("summarizeStudent computes weighted average, weak topics and status", () => {
  const s = summarizeStudent(
    { uid: "u1", name: "Asha", classId: "c1" },
    { xp: 340, streak: { current: 4, lastActiveDate: "2026-10-12" }, totalDoubtsAsked: 12, totalTestsCompleted: 3, totalStudyMinutes: 90 },
    [
      { subject: "Physics", score: 1, total: 5, wrongTopics: ["Optics", "Current Electricity"], ts: 3 },
      { subject: "Physics", score: 2, total: 10, wrongTopics: ["Optics"], ts: 2 },
      { subject: "Chemistry", score: 0, total: 0, wrongTopics: ["ignored"], ts: 1 },
    ],
    NOW,
  );
  assert.equal(s.avgScorePct, 20); // 3 / 15, not mean of 20% and 20%
  assert.equal(s.status, "struggling");
  assert.deepEqual(s.weakTopics[0], { topic: "Optics", count: 2 });
  assert.equal(s.recentTests.length, 2);
  assert.deepEqual(s.subjects, [{ subject: "Physics", tests: 2, avgScorePct: 20 }]);
  assert.equal(s.daysInactive, 1);
});

test("summarizeStudent marks never-active students inactive", () => {
  const s = summarizeStudent({ uid: "u2" }, undefined, [], NOW);
  assert.equal(s.status, "inactive");
  assert.equal(s.avgScorePct, null);
  assert.equal(s.name, "Student");
});

test("summarizeGroup aggregates and ranks attention list", () => {
  const a = summarizeStudent({ uid: "a" }, { streak: { lastActiveDate: "2026-10-13" }, totalDoubtsAsked: 5 },
    [{ subject: "Physics", score: 9, total: 10, wrongTopics: ["Optics"] }], NOW);
  const b = summarizeStudent({ uid: "b" }, { streak: { lastActiveDate: "2026-09-01" }, totalDoubtsAsked: 1 },
    [{ subject: "Physics", score: 3, total: 10, wrongTopics: ["Optics", "Waves"] }], NOW);
  const c = summarizeStudent({ uid: "c" }, { streak: { lastActiveDate: "2026-10-10" } },
    [{ score: 1, total: 10 }, { score: 2, total: 10 }], NOW);

  const g = summarizeGroup([a, b, c]);
  assert.equal(g.students, 3);
  assert.equal(g.active7d, 2);
  assert.equal(g.doubts, 6);
  assert.equal(g.avgScorePct, Math.round((90 + 30 + 15) / 3));
  assert.deepEqual(g.weakTopics[0], { topic: "Optics", count: 2 });
  assert.deepEqual(g.scoreBands.map((x) => x.count), [2, 0, 0, 1]);
  assert.deepEqual(g.needsAttention.map((x) => x.uid), ["c", "b"]);
});

test("normalizePhone accepts common Indian formats and rejects junk", () => {
  assert.equal(normalizePhone("98765 43210"), "+919876543210");
  assert.equal(normalizePhone("+91-98765-43210"), "+919876543210");
  assert.equal(normalizePhone("09876543210"), "+919876543210");
  assert.equal(normalizePhone("12345"), null);
  assert.equal(normalizePhone("1234567890"), null); // Indian mobiles start 6-9
});

test("normalizeEmail lowercases and validates", () => {
  assert.equal(normalizeEmail("  Asha@Example.COM "), "asha@example.com");
  assert.equal(normalizeEmail("not-an-email"), null);
});

test("parseRoster handles commas, tabs, any column order, duplicates and bad lines", () => {
  const { rows, errors } = parseRoster(
    "Asha Rao, 9876543210, 12\n" +
    "bharath@example.com\tBharath K\t13\n" +
    "\n" +
    "Chaitra, 98765 43210\n" +
    "Darshan, no contact here"
  );
  assert.deepEqual(rows, [
    { name: "Asha Rao", phone: "+919876543210", email: null, rollNo: "12" },
    { name: "Bharath K", phone: null, email: "bharath@example.com", rollNo: "13" },
  ]);
  assert.deepEqual(errors.map((e) => [e.line, e.reason]), [
    [4, "Duplicate of an earlier line"],
    [5, "No valid 10-digit mobile number or email"],
  ]);
});

test("studentsToCsv escapes commas and quotes", () => {
  const s = summarizeStudent({ uid: "u", name: 'Rao, "Asha"', classId: "c1", rollNo: "7" }, {}, [], NOW);
  const csv = studentsToCsv([s], { c1: "Sec A" }).split("\n");
  assert.equal(csv.length, 2);
  assert.ok(csv[1].startsWith('"Rao, ""Asha""",7,Sec A,'));
});
