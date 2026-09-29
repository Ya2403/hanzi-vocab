import { describe, expect, it } from 'vitest';
import { skillTotals, tagProgress, toneTrouble } from './stats';
import { newSrs } from './srs';
import type { SkillState, Word } from './types';

const st = (interval: number): SkillState => ({ ...newSrs('2026-09-29'), interval, reps: 2, due: '2026-12-01', lastReviewed: '2026-09-20' });
const w = (hanzi: string, tags: string[], iv: [number, number, number] | null, toneErrors?: number): Word => ({
  id: hanzi,
  hanzi,
  pinyin: 'x',
  meaning: hanzi,
  tags,
  createdAt: 0,
  updatedAt: 0,
  skills: iv ? { meaning: st(iv[0]), pinyin: st(iv[1]), recall: st(iv[2]) } : {},
  toneErrors,
});

describe('skill stats', () => {
  const words = [w('一', ['HSK lesson 1'], [10, 3, 7]), w('二', ['HSK lesson 1', 'food'], [20, 8, 1], 2), w('三', ['food'], null), w('四', [], [1, 1, 1], 5)];

  it('counts known skills (interval of a week or more)', () => {
    const t = skillTotals(words);
    expect([t.meaning.known, t.pinyin.known, t.recall.known]).toEqual([2, 1, 1]);
    expect(t.meaning.active).toBe(3);
  });

  it('shows new vs learned and known skills per tag', () => {
    expect(tagProgress(words)).toEqual([
      { tag: 'food', total: 2, learned: 1, known: { meaning: 1, pinyin: 1, recall: 0, writing: 0 } },
      { tag: 'HSK lesson 1', total: 2, learned: 2, known: { meaning: 2, pinyin: 1, recall: 1, writing: 0 } },
    ]);
  });

  it('lists words with tone errors, most first', () => {
    expect(toneTrouble(words).map((x) => x.hanzi)).toEqual(['四', '二']);
  });
});
