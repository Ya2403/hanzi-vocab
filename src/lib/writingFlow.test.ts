import { describe, expect, it } from 'vitest';
import { needsRepeat, tracesFor } from '../components/WritingFlow';
import { Grade, newSrs } from './srs';
import type { Word } from './types';

const w = (writingInterval: number | null): Word => ({
  id: '好',
  hanzi: '好',
  pinyin: 'hǎo',
  meaning: 'good',
  tags: [],
  createdAt: 0,
  updatedAt: 0,
  skills: writingInterval === null ? {} : { writing: { ...newSrs('2026-09-29'), interval: writingInterval, reps: 2 } },
});

describe('writing flow', () => {
  it('traces new or weak words only, by default', () => {
    expect(tracesFor(w(null), 'weak')).toBe(true);
    expect(tracesFor(w(3), 'weak')).toBe(true);
    expect(tracesFor(w(6), 'weak')).toBe(false);
    expect(tracesFor(w(30), 'always')).toBe(true);
    expect(tracesFor(w(null), 'never')).toBe(false);
  });

  it('repeats tracing after a bad first blank attempt', () => {
    expect(needsRepeat(Grade.Good, { mistakes: 0 }, 'strokes')).toBe(false);
    expect(needsRepeat(Grade.Hard, { mistakes: 2 }, 'strokes')).toBe(false);
    expect(needsRepeat(Grade.Hard, { mistakes: 3 }, 'strokes')).toBe(true);
    expect(needsRepeat(Grade.Again, { gaveUp: true }, 'strokes')).toBe(true);
    expect(needsRepeat(Grade.Hard, { verdict: 'close' }, 'free')).toBe(true);
    expect(needsRepeat(Grade.Good, { verdict: 'correct' }, 'free')).toBe(false);
  });
});
