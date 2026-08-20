// Real, sourced rank-prediction data. Confidence varies meaningfully by exam — see notes.
//
// NEET: official NTA data, no normalization (raw score = rank basis). Two years included
// (2024 = easy paper, 2025 = hard paper) since the SAME score produced wildly different
// ranks between them — showing both is the honest way to present this, not a single
// falsely-precise number. Source: Careers360 "NEET Marks vs Rank 2025" (official NTA
// scorecard data) and cross-referenced 2024 NTA result figures.
//
// JEE Main: NTA does NOT publish an official raw-marks-to-percentile table (only
// normalized percentile is officially released). Third-party compilations of the same
// year disagreed by 40-80 marks at the same percentile in our research. This is
// genuinely less reliable than NEET — bands are kept wide and the UI carries a much
// stronger disclaimer.
//
// KCET: rank is NOT determined by exam marks alone — KEA uses a 50:50 composite of
// KCET marks and 2nd PUC (Class 12) PCM percentage. A predictor using marks alone would
// be missing half the actual formula, so this requires the student's real PUC PCM% as
// input rather than guessing it.

// [minMarks, maxMarks, minRank, maxRank] brackets, sorted highest marks first.
export const NEET_RANK_DATA = {
  2025: [
    [686, 720, 1, 1],
    [682, 685, 2, 2],
    [681, 681, 3, 3],
    [678, 680, 8, 8],
    [650, 677, 8, 77],
    [630, 649, 77, 250],
    [609, 629, 250, 845],
    [601, 608, 845, 1302],
    [577, 600, 1302, 4000],
    [563, 576, 4000, 7296],
    [549, 562, 7296, 12860],
    [528, 548, 12860, 25541],
    [515, 527, 25541, 36843],
    [481, 514, 36843, 76510],
    [459, 480, 76510, 107944],
    [402, 458, 107944, 206050],
    [302, 401, 206050, 436777],
    [228, 301, 436777, 684232],
    [135, 227, 684232, 1152192],
    [69, 134, 1152192, 1717603],
    [0, 68, 1717603, 2209318],
  ],
  2024: [
    [716, 720, 1, 89],
    [700, 715, 89, 2250],
    [690, 699, 2250, 4500],
    [680, 689, 4500, 8488],
    [675, 679, 8488, 9167],
    [650, 674, 9167, 26139],
    [600, 649, 26139, 76574],
    [500, 599, 76574, 300000],
    [400, 499, 300000, 700000],
    [300, 399, 700000, 1200000],
    [0, 299, 1200000, 2406079],
  ],
};

// [minPercent-of-300, maxPercent-of-300 (marks out of 300), minRank, maxRank]
// Wide bands reflecting genuine cross-source uncertainty — treat as a rough zone,
// not a precise figure.
export const JEE_MAIN_RANK_DATA = [
  [280, 300, 1, 100],
  [250, 279, 100, 1500],
  [220, 249, 1500, 8000],
  [190, 219, 8000, 20000],
  [160, 189, 20000, 45000],
  [130, 159, 45000, 90000],
  [100, 129, 90000, 180000],
  [70, 99, 180000, 400000],
  [40, 69, 400000, 800000],
  [0, 39, 800000, 1500000],
];

// KCET: combined merit % = (KCET_marks/180 * 50) + (PUC_PCM_percent/300... actually
// PUC%/100 * 50) — see calculateKcetRank(). [minCombined%, maxCombined%, minRank, maxRank]
export const KCET_RANK_DATA = [
  [95, 100, 1, 100],
  [90, 94.9, 100, 1000],
  [85, 89.9, 1000, 5000],
  [80, 84.9, 5000, 15000],
  [75, 79.9, 15000, 40000],
  [70, 74.9, 40000, 90000],
  [65, 69.9, 90000, 180000],
  [60, 64.9, 180000, 300000],
  [50, 59.9, 300000, 600000],
  [0, 49.9, 600000, 3300000],
];

function findBracket(brackets, value) {
  return brackets.find((b) => value >= b[0] && value <= b[1]) || null;
}

export function predictNeetRank(marks) {
  const y2025 = findBracket(NEET_RANK_DATA[2025], marks);
  const y2024 = findBracket(NEET_RANK_DATA[2024], marks);
  return { y2025: y2025 ? [y2025[2], y2025[3]] : null, y2024: y2024 ? [y2024[2], y2024[3]] : null };
}

export function predictJeeRank(marksOutOf300) {
  const b = findBracket(JEE_MAIN_RANK_DATA, marksOutOf300);
  return b ? [b[2], b[3]] : null;
}

export function predictKcetRank(kcetMarksOutOf180, pucPcmPercent) {
  const kcetPercent = (kcetMarksOutOf180 / 180) * 100;
  const combined = kcetPercent * 0.5 + pucPcmPercent * 0.5;
  const b = findBracket(KCET_RANK_DATA, combined);
  return { combined: Math.round(combined * 10) / 10, range: b ? [b[2], b[3]] : null };
}