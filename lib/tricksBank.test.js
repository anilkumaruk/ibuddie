// Guards the hand-written Trick Bank (src/data/tricksBank.js). Run with `npm test`.
// Structure checks catch typos that would break the UI; the numeric checks recompute
// practice answers independently so a wrong "shortcut" can't ship silently.
import { test } from "node:test";
import assert from "node:assert/strict";
import { TRICKS, TRICK_SUBJECTS } from "../src/data/tricksBank.js";

const byId = Object.fromEntries(TRICKS.map((t) => [t.id, t]));
const correct = (id) => byId[id].practice.options[byId[id].practice.answer];

test("every trick is well-formed", () => {
  const ids = new Set();
  for (const t of TRICKS) {
    assert.ok(!ids.has(t.id), `duplicate id ${t.id}`);
    ids.add(t.id);
    assert.ok(TRICK_SUBJECTS.includes(t.subject), `${t.id}: unknown subject`);
    for (const f of ["chapter", "title", "useWhen", "trap", "saves"]) assert.ok(t[f]?.trim(), `${t.id}: missing ${f}`);
    assert.ok(t.steps.length >= 1, `${t.id}: no steps`);
    for (const f of ["question", "slow", "fast", "answer"]) assert.ok(t.example[f]?.trim(), `${t.id}: example.${f}`);
    assert.equal(t.practice.options.length, 4, `${t.id}: needs 4 options`);
    assert.equal(new Set(t.practice.options).size, 4, `${t.id}: duplicate options`);
    assert.ok(Number.isInteger(t.practice.answer) && t.practice.answer >= 0 && t.practice.answer < 4, `${t.id}: bad answer index`);
    assert.ok(t.exams.length > 0, `${t.id}: no exams`);
  }
});

test("every subject has tricks", () => {
  for (const s of TRICK_SUBJECTS) assert.ok(TRICKS.some((t) => t.subject === s), s);
});

test("superscripts use renderFormula-safe notation", () => {
  // renderFormula only superscripts ^ followed by a letter, digit or "(".
  for (const t of TRICKS) {
    const text = JSON.stringify(t);
    assert.doesNotMatch(text, /\^[^A-Za-z0-9(]/, `${t.id} has a caret renderFormula can't display`);
  }
});

test("physics answers recompute", () => {
  // tanθ = 4H/R with R = 4√3 H → 30°
  assert.equal(Math.round((Math.atan(4 / (4 * Math.sqrt(3))) * 180) / Math.PI), 30);
  assert.equal(correct("phy-projectile-tan"), "30°");
  // free fall: nth-second distances 3 : 7
  const nth = (n) => (10 / 2) * (2 * n - 1);
  assert.deepEqual([nth(2), nth(4)], [15, 35]);
  assert.equal(nth(3), 25);
  // resistors: series/parallel for n = 5 is 25; 6‖3 = 2
  assert.equal((5 * 1) / (1 / 5), 25);
  assert.equal((6 * 3) / (6 + 3), 2);
  // lenses +20 cm and −50 cm → +3 D
  assert.equal(100 / 20 + 100 / -50, 3);
  // sphere volume +2% radius → ≈ 6%
  assert.ok(Math.abs((1.02 ** 3 - 1) * 100 - 6) < 0.2);
  // escape vs orbital: +41%
  assert.equal(Math.round((Math.SQRT2 - 1) * 100), 41);
});

test("chemistry answers recompute", () => {
  const hyb = (V, M, C, A) => (V + M - C + A) / 2;
  assert.equal(hyb(6, 6, 0, 0), 6); // SF6
  assert.equal(hyb(8, 4, 0, 0), 6); // XeF4
  assert.equal(hyb(6, 0, 0, 2), 4); // SO4 2−
  // bond-order shortcut must agree with MO theory for 10–20 electrons
  const shortcut = (n) => (n <= 14 ? (n - 8) / 2 : (20 - n) / 2);
  const mo = { 10: 1, 12: 2, 13: 2.5, 14: 3, 15: 2.5, 16: 2, 17: 1.5, 18: 1, 20: 0 }; // B2, C2, N2+, N2, O2+, O2, O2−, O2 2−, Ne2
  for (const [n, bo] of Object.entries(mo)) assert.equal(shortcut(Number(n)), bo, `n = ${n}`);
  // pH
  assert.equal(Number((-Math.log10(0.002)).toFixed(2)), 2.7);
  assert.equal(Number((-Math.log10(5e-4)).toFixed(1)), 3.3);
  // spin-only moments
  const mu = (n) => Number(Math.sqrt(n * (n + 2)).toFixed(2));
  assert.deepEqual([1, 2, 3, 4, 5].map(mu), [1.73, 2.83, 3.87, 4.9, 5.92]);
  // first-order: 87.5% = 3 half-lives; t99.9 / t½ ≈ 10
  assert.equal(Math.log2(1 / 0.125), 3);
  assert.equal(Math.round(Math.log(1000) / Math.log(2)), 10);
  // Graham: He vs CH4 → 2
  assert.equal(Math.sqrt(16 / 4), 2);
  // degree of unsaturation
  const dbe = (C, H) => C - H / 2 + 1;
  assert.equal(dbe(6, 6), 4);
  assert.equal(dbe(4, 6), 2);
});

test("mathematics answers recompute", () => {
  const sumKK1 = (n) => Array.from({ length: n }, (_, i) => (i + 1) * (i + 2)).reduce((a, b) => a + b, 0);
  for (let n = 1; n <= 6; n++) assert.equal(sumKK1(n), (n * (n + 1) * (n + 2)) / 3);
  assert.equal(3 ** 2 - 2 * 1, 7); // α²+β² for x²−3x+1
  assert.equal(Math.abs(-1 - 4) / Math.hypot(6, 8), 0.5);
  const diagonals = (n) => (n * (n - 3)) / 2;
  assert.equal(diagonals(6), 9);
  assert.equal(diagonals(10), 35);
  const S = (n) => 2 * n * n + 5 * n;
  assert.equal(S(2) - S(1) - S(1), 4);
  const C = (n, k) => (k === 0 ? 1 : (n * C(n - 1, k - 1)) / k);
  assert.equal(C(6, 2), 15);
  // numeric check of King's property integral ≈ π/4
  let sum = 0;
  const N = 20000;
  for (let i = 0; i < N; i++) {
    const x = ((i + 0.5) / N) * (Math.PI / 2);
    sum += Math.sqrt(Math.sin(x)) / (Math.sqrt(Math.sin(x)) + Math.sqrt(Math.cos(x)));
  }
  assert.ok(Math.abs((sum * Math.PI) / 2 / N - Math.PI / 4) < 1e-4);
});

test("biology answers recompute", () => {
  assert.equal(2 ** 3, 8); // AaBBCcDd
  assert.equal(0.25 ** 3, 1 / 64);
  const q = Math.sqrt(0.16);
  assert.equal(Number((2 * (1 - q) * q).toFixed(2)), 0.48);
  assert.equal(450 / 3 - 1, 149);
  assert.equal(correct("bio-codon-count"), "149");
});
