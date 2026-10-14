import { describe, expect, it } from 'vitest';
import { finishPlan, knownPercent, tokenize } from './reader';
import { newSrs } from './srs';
import type { SkillState, Word } from './types';

const NOW = new Date('2026-10-12T12:00:00').getTime();
const st = (interval: number, lastReviewed: string): SkillState => ({ ...newSrs('2026-10-12'), interval, reps: 3, due: '2026-12-01', lastReviewed });
const w = (hanzi: string, learned: boolean, lastReviewed = '2026-10-11', interval = 30): Word => ({
  id: hanzi,
  hanzi,
  pinyin: 'x',
  meaning: hanzi,
  tags: [],
  createdAt: 0,
  updatedAt: 0,
  skills: learned ? { meaning: st(interval, lastReviewed), pinyin: st(interval, lastReviewed), recall: st(interval, lastReviewed) } : {},
});

describe('reader tokens', () => {
  const words = [w('我', true), w('是', true), w('学生', false), w('老师', true, '2026-08-01', 5)];
  const byHanzi = new Map(words.map((x) => [x.hanzi, x]));

  it('marks learned, new and unknown words, and keeps punctuation', () => {
    const tokens = tokenize('我是学生，他是老师。', byHanzi);
    expect(tokens.map((t) => [t.text, t.kind])).toEqual([
      ['我', 'learned'],
      ['是', 'learned'],
      ['学生', 'new'],
      ['，', 'other'],
      ['他', 'unknown'],
      ['是', 'learned'],
      ['老师', 'learned'],
      ['。', 'other'],
    ]);
    expect(knownPercent(tokens)).toBe(67); // 4 of 6 words
  });

  it('reviews learned characters that were read but not looked up, once each', () => {
    const chars = new Map([...byHanzi, ['好', w('好', true, '2026-08-01', 5)]]);
    const tokens = tokenize('我是老师。我是好老师。', chars);
    const plan = finishPlan(tokens, new Set(['我']), NOW);
    expect(plan.review.map((x) => x.hanzi)).toEqual(['好']); // likely forgotten (5 days, read 2 months later)
    expect(plan.seen.map((x) => x.hanzi)).toEqual(['是']); // fresh: accuracy only; 老师 is a word (no schedule)
  });
});
