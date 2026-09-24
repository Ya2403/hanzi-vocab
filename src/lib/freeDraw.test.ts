import { describe, expect, it } from 'vitest';
import { compareStrokes, hungarian, pathLength, resample, type Pt, type Stroke } from './freeDraw';

// A made-up 4-stroke "character" in unit coordinates (y down): two horizontals, a vertical, a dot.
const line = (a: Pt, b: Pt, n = 10): Stroke => Array.from({ length: n }, (_, i) => [a[0] + ((b[0] - a[0]) * i) / (n - 1), a[1] + ((b[1] - a[1]) * i) / (n - 1)] as Pt);
const REF: Stroke[] = [line([0.2, 0.3], [0.8, 0.3]), line([0.15, 0.7], [0.85, 0.7]), line([0.5, 0.1], [0.5, 0.9]), [[0.75, 0.45]]];

/** Deterministic pseudo-random noise so tests are repeatable. */
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 2 ** 32;
    return seed / 2 ** 32 - 0.5;
  };
}
const jitter = (strokes: Stroke[], amount: number, seed = 1): Stroke[] => {
  const r = rng(seed);
  return strokes.map((s) => {
    const [dx, dy] = [r() * amount, r() * amount];
    return s.map(([x, y]) => [x + dx + r() * amount * 0.5, y + dy + r() * amount * 0.5] as Pt);
  });
};

describe('resample', () => {
  it('returns evenly spaced points along the path', () => {
    const out = resample([[0, 0], [1, 0]], 5);
    expect(out).toHaveLength(5);
    expect(out.map((p) => +p[0].toFixed(3))).toEqual([0, 0.25, 0.5, 0.75, 1]);
  });
  it('keeps the total length for a bent path', () => {
    const bent: Stroke = [[0, 0], [1, 0], [1, 1]];
    expect(pathLength(resample(bent, 24))).toBeCloseTo(2, 1);
  });
  it('turns a dot into repeated points', () => {
    expect(resample([[0.3, 0.3]], 4)).toEqual([[0.3, 0.3], [0.3, 0.3], [0.3, 0.3], [0.3, 0.3]]);
  });
});

describe('hungarian', () => {
  it('finds the optimal assignment where greedy would fail', () => {
    // Greedy picks row0→col0 (1) and then row1→col1 (100) = 101; optimal is 2 + 3 = 5.
    const cost = [
      [1, 2],
      [3, 100],
    ];
    expect(hungarian(cost)).toEqual([1, 0]);
  });
  it('handles a 3×3 matrix', () => {
    const cost = [
      [4, 1, 3],
      [2, 0, 5],
      [3, 2, 2],
    ];
    const a = hungarian(cost);
    expect(a.reduce((sum, c, r) => sum + cost[r][c], 0)).toBe(5);
  });
});

describe('compareStrokes', () => {
  it('scores an exact copy as correct', () => {
    const r = compareStrokes(REF, REF);
    expect(r.verdict).toBe('correct');
    expect(r.percent).toBe(100);
    expect(r.extraUser).toEqual([]);
  });

  it('accepts a slightly wobbly drawing', () => {
    expect(compareStrokes(jitter(REF, 0.04), REF).verdict).toBe('correct');
  });

  it('ignores stroke order but notes it when very different', () => {
    const shuffled = [REF[3], REF[2], REF[1], REF[0]];
    const r = compareStrokes(shuffled, REF);
    expect(r.verdict).toBe('correct');
    expect(r.percent).toBe(100);
    expect(r.orderDisorder).toBe(1);
    expect(r.notes.join(' ')).toMatch(/stroke order/);
  });

  it('detects strokes drawn in the opposite direction', () => {
    const reversed = REF.map((s, i) => (i === 0 ? [...s].reverse() : s));
    const r = compareStrokes(reversed, REF);
    expect(r.reversedCount).toBe(1);
    expect(r.percent).toBeLessThan(100);
  });

  it('is not correct when a stroke is missing', () => {
    const r = compareStrokes(REF.slice(0, 3), REF);
    expect(r.verdict).not.toBe('correct');
    expect(r.refs[3].status).toBe('missing');
    expect(r.notes[0]).toMatch(/3 strokes.*has 4/);
  });

  it('flags an extra stroke', () => {
    const r = compareStrokes([...REF, line([0.1, 0.9], [0.9, 0.1])], REF);
    expect(r.verdict).not.toBe('correct');
    expect(r.extraUser).toEqual([4]);
  });

  it('aligns a drawing that is smaller and off-center', () => {
    const small = REF.map((s) => s.map(([x, y]) => [0.1 + x * 0.8, 0.15 + y * 0.8] as Pt));
    expect(compareStrokes(small, REF).verdict).toBe('correct');
  });

  it('rejects a scribble', () => {
    const scribble = [line([0.1, 0.1], [0.9, 0.9]), line([0.9, 0.1], [0.1, 0.9])];
    expect(compareStrokes(scribble, REF).verdict).toBe('wrong');
  });

  it('handles an empty drawing', () => {
    const r = compareStrokes([], REF);
    expect(r.verdict).toBe('wrong');
    expect(r.refs.every((x) => x.status === 'missing')).toBe(true);
  });
});
