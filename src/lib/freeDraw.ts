/**
 * Scores a freely drawn character against Hanzi Writer's reference stroke medians.
 *
 * Both drawings are normalized to a unit square (y down), the user's drawing is
 * aligned to the reference's bounding box, every stroke is resampled to the same
 * number of points, and each reference stroke is paired with its best user stroke
 * by the Hungarian algorithm, so stroke order doesn't matter.
 */

export type Pt = [number, number];
export type Stroke = Pt[];

/**
 * All tunable values in one place. Distances are fractions of the character box
 * (1.0 = full grid width). See the tuning notes at the end of this file.
 */
export const FREE_DRAW_CONFIG = {
  /** Points per stroke after resampling. */
  RESAMPLE_POINTS: 24,
  /** Mean point deviation at which a stroke pair scores 0 (and is treated as unmatched). */
  COST_SCALE: 0.2,
  /** Minimum pair score for a user stroke to count as drawing that reference stroke. */
  MATCH_MIN: 0.3,
  /** Extra cost when a stroke is drawn in the opposite direction. */
  REVERSED_PENALTY: 0.04,
  /** Weight of the stroke-length mismatch term (|log length ratio|, capped at 1). */
  LENGTH_WEIGHT: 0.04,
  /** Strokes shorter than this are dots: direction isn't judged. */
  DOT_LENGTH: 0.06,
  /** The user's drawing is scaled to the reference size, but only within this range. */
  ALIGN_SCALE_RANGE: [0.6, 1.6] as const,
  /** Fraction of out-of-order stroke pairs above which the order note appears. */
  ORDER_NOTE_THRESHOLD: 0.3,
  /**
   * Verdict thresholds. `correct` needs the overall score, every stroke present, the right
   * stroke count, AND no stroke weaker than `correctMinStroke`; the last one catches look-alike
   * characters whose average is fine but one part is wrong (好 drawn as 妈).
   */
  THRESHOLDS: { correct: 0.7, close: 0.55, correctMinStroke: 0.5 },
};

export type Verdict = 'correct' | 'close' | 'wrong';

export interface RefStrokeResult {
  status: 'ok' | 'missing';
  /** Index of the matched user stroke. */
  user?: number;
  score: number;
  reversed?: boolean;
}

export interface FreeDrawResult {
  /** 0–1 */
  score: number;
  percent: number;
  verdict: Verdict;
  refs: RefStrokeResult[];
  /** User strokes that match nothing (extra or wrong strokes). */
  extraUser: number[];
  userCount: number;
  refCount: number;
  reversedCount: number;
  /** Fraction of matched stroke pairs drawn out of the standard order. */
  orderDisorder: number;
  notes: string[];
}

// ---------- Coordinates ----------

/** Hanzi Writer medians use a 1024 box with y up and the baseline at y = -124. */
export const refToUnit = (medians: number[][][]): Stroke[] =>
  medians.map((s) => s.map(([x, y]) => [x / 1024, (900 - y) / 1024] as Pt));

/** Board pixels (same padding as Hanzi Writer) → unit square. */
export const boardToUnit = (strokes: Stroke[], size: number, padding: number): Stroke[] => {
  const k = size - 2 * padding;
  return strokes.map((s) => s.map(([x, y]) => [(x - padding) / k, (y - padding) / k] as Pt));
};

// ---------- Geometry ----------

const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);

export function pathLength(s: Stroke): number {
  let len = 0;
  for (let i = 1; i < s.length; i++) len += dist(s[i - 1], s[i]);
  return len;
}

/** Resample to `n` points evenly spaced along the path (a dot becomes n copies). */
export function resample(s: Stroke, n: number = FREE_DRAW_CONFIG.RESAMPLE_POINTS): Stroke {
  if (!s.length) return [];
  const total = pathLength(s);
  if (total === 0 || s.length === 1) return Array.from({ length: n }, () => [...s[0]] as Pt);
  // The $1-recognizer resampling: walk the path, emitting a point every `step`.
  const step = total / (n - 1);
  const pts: Stroke = s.map((p) => [...p] as Pt);
  const out: Stroke = [[...pts[0]] as Pt];
  let acc = 0;
  for (let i = 1; i < pts.length && out.length < n; i++) {
    const d = dist(pts[i - 1], pts[i]);
    if (d > 0 && acc + d >= step) {
      const t = (step - acc) / d;
      const q: Pt = [pts[i - 1][0] + t * (pts[i][0] - pts[i - 1][0]), pts[i - 1][1] + t * (pts[i][1] - pts[i - 1][1])];
      out.push(q);
      pts.splice(i, 0, q); // q becomes the start of the next segment
      acc = 0;
    } else {
      acc += d;
    }
  }
  while (out.length < n) out.push([...pts[pts.length - 1]] as Pt);
  return out;
}

interface Box {
  cx: number;
  cy: number;
  size: number;
  w: number;
  h: number;
}

function bbox(strokes: Stroke[]): Box | null {
  const pts = strokes.flat();
  if (!pts.length) return null;
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, w: x1 - x0, h: y1 - y0, size: Math.max(x1 - x0, y1 - y0, 0.05) };
}

/** Uniform scale `s` + translation, applied as p → s·p + t. */
interface Similarity {
  s: number;
  tx: number;
  ty: number;
}

const IDENTITY: Similarity = { s: 1, tx: 0, ty: 0 };
const applyT = (strokes: Stroke[], t: Similarity): Stroke[] =>
  strokes.map((st) => st.map(([x, y]) => [t.s * x + t.tx, t.s * y + t.ty] as Pt));

const clampScale = (s: number) => {
  const [lo, hi] = FREE_DRAW_CONFIG.ALIGN_SCALE_RANGE;
  return Math.min(hi, Math.max(lo, s));
};

/** Map the user's bounding box onto the reference's (a starting guess for alignment). */
function bboxAlign(user: Stroke[], ref: Stroke[]): Similarity {
  const ub = bbox(user);
  const rb = bbox(ref);
  if (!ub || !rb) return IDENTITY;
  const s = clampScale(rb.size / ub.size);
  return { s, tx: rb.cx - s * ub.cx, ty: rb.cy - s * ub.cy };
}

/** Least-squares scale + translation mapping paired points u → r (no rotation). */
function fitSimilarity(u: Pt[], r: Pt[]): Similarity {
  const n = u.length;
  if (n < 2) return IDENTITY;
  const mean = (ps: Pt[]) => ps.reduce((a, p) => [a[0] + p[0] / n, a[1] + p[1] / n] as Pt, [0, 0] as Pt);
  const [mu, mr] = [mean(u), mean(r)];
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    const [ux, uy] = [u[i][0] - mu[0], u[i][1] - mu[1]];
    num += ux * (r[i][0] - mr[0]) + uy * (r[i][1] - mr[1]);
    den += ux * ux + uy * uy;
  }
  const s = clampScale(den > 1e-9 ? num / den : 1);
  return { s, tx: mr[0] - s * mu[0], ty: mr[1] - s * mu[1] };
}

// ---------- Stroke pairing ----------

interface PairCost {
  cost: number;
  reversed: boolean;
}

/** Mean distance from each point of `a` to the nearest point of `b`. */
function meanNearest(a: Stroke, b: Stroke): number {
  let sum = 0;
  for (const p of a) {
    let best = Infinity;
    for (const q of b) best = Math.min(best, dist(p, q));
    sum += best;
  }
  return sum / a.length;
}

/**
 * Shape + position as a symmetric closest-point (chamfer) distance, which tolerates
 * strokes drawn a bit short or long; direction from the endpoints; plus a length
 * mismatch term. Inputs must be resampled.
 */
export function pairCost(u: Stroke, r: Stroke, uLen: number, rLen: number): PairCost {
  const cfg = FREE_DRAW_CONFIG;
  const geom = (meanNearest(u, r) + meanNearest(r, u)) / 2;
  const n = r.length - 1;
  const same = dist(u[0], r[0]) + dist(u[n], r[n]);
  const swapped = dist(u[n], r[0]) + dist(u[0], r[n]);
  const reversed = rLen > cfg.DOT_LENGTH && uLen > cfg.DOT_LENGTH && swapped < same * 0.7;
  const lengthTerm = cfg.LENGTH_WEIGHT * Math.min(1, Math.abs(Math.log((uLen + 0.02) / (rLen + 0.02))));
  return { cost: geom + lengthTerm + (reversed ? cfg.REVERSED_PENALTY : 0), reversed };
}

/** Minimum-cost assignment for an n×m matrix with n ≤ m. Returns the column for each row. */
export function hungarian(a: number[][]): number[] {
  const n = a.length;
  const m = a[0]?.length ?? 0;
  const INF = Number.POSITIVE_INFINITY;
  const u = new Array<number>(n + 1).fill(0);
  const v = new Array<number>(m + 1).fill(0);
  const p = new Array<number>(m + 1).fill(0);
  const way = new Array<number>(m + 1).fill(0);
  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Array<number>(m + 1).fill(INF);
    const used = new Array<boolean>(m + 1).fill(false);
    do {
      used[j0] = true;
      const i0 = p[j0];
      let delta = INF;
      let j1 = 0;
      for (let j = 1; j <= m; j++) {
        if (used[j]) continue;
        const cur = a[i0 - 1][j - 1] - u[i0] - v[j];
        if (cur < minv[j]) {
          minv[j] = cur;
          way[j] = j0;
        }
        if (minv[j] < delta) {
          delta = minv[j];
          j1 = j;
        }
      }
      for (let j = 0; j <= m; j++) {
        if (used[j]) {
          u[p[j]] += delta;
          v[j] -= delta;
        } else {
          minv[j] -= delta;
        }
      }
      j0 = j1;
    } while (p[j0] !== 0);
    do {
      const j1 = way[j0];
      p[j0] = p[j1];
      j0 = j1;
    } while (j0);
  }
  const rowToCol = new Array<number>(n).fill(-1);
  for (let j = 1; j <= m; j++) if (p[j]) rowToCol[p[j] - 1] = j - 1;
  return rowToCol;
}

/** Fraction of pairs (i < j in reference order) whose user strokes came in the opposite order. */
function disorder(userOrder: number[]): number {
  let pairs = 0;
  let bad = 0;
  for (let i = 0; i < userOrder.length; i++) {
    for (let j = i + 1; j < userOrder.length; j++) {
      pairs++;
      if (userOrder[i] > userOrder[j]) bad++;
    }
  }
  return pairs ? bad / pairs : 0;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

// ---------- Scoring ----------

interface Match {
  refs: RefStrokeResult[];
  total: number;
}

/** Optimal one-to-one pairing of reference and (transformed) user strokes. */
function matchStrokes(userS: Stroke[], userLen: number[], refS: Stroke[], refLen: number[], t: Similarity): Match {
  const cfg = FREE_DRAW_CONFIG;
  const u = applyT(userS, t);
  const uLen = userLen.map((l) => l * t.s);
  const [nRef, nUser] = [refS.length, u.length];
  // Square matrix: dummy rows/columns cost COST_SCALE (= a score of 0), so leaving a stroke
  // unmatched is never worse than a terrible match.
  const k = Math.max(nRef, nUser);
  const pairs: (PairCost | null)[][] = [];
  const matrix: number[][] = [];
  for (let i = 0; i < k; i++) {
    pairs.push([]);
    matrix.push([]);
    for (let j = 0; j < k; j++) {
      const pc = i < nRef && j < nUser ? pairCost(u[j], refS[i], uLen[j], refLen[i]) : null;
      pairs[i].push(pc);
      matrix[i].push(pc ? Math.min(pc.cost, cfg.COST_SCALE) : cfg.COST_SCALE);
    }
  }
  const assignment = k ? hungarian(matrix) : [];
  const refs: RefStrokeResult[] = [];
  let total = 0;
  for (let i = 0; i < nRef; i++) {
    const j = assignment[i];
    const pc = j >= 0 && j < nUser ? pairs[i][j] : null;
    const score = pc ? Math.max(0, 1 - pc.cost / cfg.COST_SCALE) : 0;
    if (pc && score >= cfg.MATCH_MIN) {
      refs.push({ status: 'ok', user: j, score, reversed: pc.reversed });
      total += score;
    } else {
      refs.push({ status: 'missing', score: 0 });
    }
  }
  return { refs, total };
}

/**
 * Find the placement of the user's drawing that fits the reference best. Starts from
 * "as drawn" and "bounding box matched", then refines each by a least-squares fit on the
 * strokes it matched (ICP-style). A stray extra or missing stroke then can't throw
 * the whole drawing out of place.
 */
function bestMatch(user: Stroke[], userS: Stroke[], userLen: number[], ref: Stroke[], refS: Stroke[], refLen: number[]) {
  let best: { m: Match; t: Similarity } | null = null;
  for (const start of [IDENTITY, bboxAlign(user, ref)]) {
    let t = start;
    for (let iter = 0; iter < 3; iter++) {
      const m = matchStrokes(userS, userLen, refS, refLen, t);
      if (!best || m.total > best.m.total) best = { m, t };
      const ok = m.refs.filter((r) => r.status === 'ok');
      if (ok.length < 2) break;
      const up: Pt[] = [];
      const rp: Pt[] = [];
      for (const r of ok) {
        const us = r.reversed ? [...userS[r.user!]].reverse() : userS[r.user!];
        const rs = refS[m.refs.indexOf(r)];
        us.forEach((p, i) => {
          up.push(p);
          rp.push(rs[i]);
        });
      }
      t = fitSimilarity(up, rp);
    }
  }
  return best!;
}

/** Compare user strokes with reference strokes, both already in unit coordinates. */
export function compareStrokes(userUnit: Stroke[], refUnit: Stroke[], char = 'this character'): FreeDrawResult {
  const cfg = FREE_DRAW_CONFIG;
  const user = userUnit.filter((s) => s.length > 0);
  const nRef = refUnit.length;
  const nUser = user.length;
  const k = Math.max(nRef, nUser);

  const refS = refUnit.map((s) => resample(s));
  const refLen = refUnit.map(pathLength);
  const userS = user.map((s) => resample(s));
  const userLen = user.map(pathLength);
  const { m } = bestMatch(user, userS, userLen, refUnit, refS, refLen);
  const refs = m.refs;
  const matchedUser = new Set(refs.filter((r) => r.status === 'ok').map((r) => r.user!));
  const extraUser = user.map((_, j) => j).filter((j) => !matchedUser.has(j));
  const score = k ? m.total / k : 0;

  // Placement feedback is based on the drawing as drawn, not the fitted one.
  const ub = bbox(user);
  const rb = bbox(refUnit);
  const tooSmall = !!ub && !!rb && ub.size < rb.size * 0.55;
  const offCenter = !!ub && !!rb && Math.hypot(ub.cx - rb.cx, ub.cy - rb.cy) > 0.25;
  const missing = refs.filter((r) => r.status === 'missing').length;
  const reversedCount = refs.filter((r) => r.reversed).length;
  const orderDisorder = disorder(refs.filter((r) => r.status === 'ok').map((r) => r.user!));

  const weakest = refs.length ? Math.min(...refs.map((r) => r.score)) : 0;
  const verdict: Verdict =
    score >= cfg.THRESHOLDS.correct && missing === 0 && nUser === nRef && weakest >= cfg.THRESHOLDS.correctMinStroke
      ? 'correct'
      : score >= cfg.THRESHOLDS.close
        ? 'close'
        : 'wrong';

  const notes: string[] = [];
  if (nUser !== nRef) notes.push(`You drew ${plural(nUser, 'stroke')}; ${char} has ${nRef}.`);
  if (missing && nUser === nRef) notes.push(`${plural(missing, 'stroke')} didn’t match the reference.`);
  else if (!missing && weakest < cfg.THRESHOLDS.correctMinStroke) notes.push('One part looks quite different from the reference.');
  if (reversedCount) notes.push(`${plural(reversedCount, 'stroke')} drawn in the opposite direction.`);
  if (orderDisorder > cfg.ORDER_NOTE_THRESHOLD && matchedUser.size > 2)
    notes.push('Your stroke order differs quite a bit from the standard order. Tap “Show stroke order” to see it.');
  if (nUser && (tooSmall || offCenter)) notes.push('Try to fill the grid: draw bigger and centered.');

  return {
    score,
    percent: Math.round(score * 100),
    verdict,
    refs,
    extraUser,
    userCount: nUser,
    refCount: nRef,
    reversedCount,
    orderDisorder,
    notes,
  };
}

/*
 * Tuning notes (Sept 2026). Real Hanzi Writer data; synthetic "handwriting" = medians with ends
 * trimmed 5–10%, per-stroke offset ±2.5%, per-point wobble ±1.5%, whole character scaled 0.8
 * and shifted ("medium" = 1.5× that noise, "sloppy" = 2×). 10 seeds per cell, held out from
 * the seeds used while tuning. ✓ correct / ~ close / ✗ wrong.
 *
 *   char     clean   medium  sloppy   shuffled+rev  1 missing  1 extra  scribble
 *   一 人 十  all ✓   all ✓   all ✓    all ✓         ✗ (2-stroke chars)   ✗/~     ✗
 *   口 大 日  all ✓   all ✓   ✓/~      all ✓         ~          ~        ✗
 *   谢 馆 爱  all ✓   ✓ (1~)  ~ (1✓)   ✓ (爱 6✓4~)   ~          ~        ✗
 *   鸭 游
 *
 *   Look-alikes (asked ← drew): 好←妈, 大←太, 大←犬, 日↔目, 谢←射 → ~ (never ✓).
 *   Known limitation: 未←末, 土←士, 己←已 (same strokes, different relative lengths or a small
 *   gap) score ✓, and 人←入 half the time. The tolerance that lets real handwriting pass
 *   can't tell these apart.
 *
 * Why these values:
 *   - COST_SCALE 0.2 / MATCH_MIN 0.3: stricter values (0.12–0.15, 0.45–0.6) rejected up to 60%
 *     of medium-noise drawings while barely reducing look-alike passes.
 *   - LENGTH_WEIGHT 0.04: 0.1+ started dropping strokes from correct drawings.
 *   - correctMinStroke 0.5: good drawings' weakest stroke is ≥ 0.52 in 98% of cases; 好←妈's
 *     is ≤ 0.48, so this gate turns that and similar one-part-wrong drawings into "close".
 *   - close 0.55: the highest scribble scored 51%; the lowest sloppy-but-right drawing 59%.
 */
