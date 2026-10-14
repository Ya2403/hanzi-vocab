import { describe, expect, it } from 'vitest';
import { computeLinks, createSentence } from './sentences';
import { entryProgress, readableStats, strengthByTag, strengthCounts, toneTrouble } from './stats';
import { newSrs } from './srs';
import type { Dialogue, SkillState, Word } from './types';

const NOW = new Date('2026-10-10T12:00:00').getTime();
const st = (interval: number, lastReviewed = '2026-10-08'): SkillState => ({ ...newSrs('2026-10-10'), interval, reps: 3, due: '2026-12-01', lastReviewed });
const w = (hanzi: string, tags: string[], iv: [number, number, number] | null, extra: Partial<Word> = {}): Word => ({
  id: hanzi,
  hanzi,
  pinyin: 'x',
  meaning: hanzi,
  tags,
  createdAt: 0,
  updatedAt: 0,
  skills: iv ? { meaning: st(iv[0]), pinyin: st(iv[1]), recall: st(iv[2]) } : {},
  ...extra,
});

describe('words by strength', () => {
  const words = [
    w('一', ['HSK lesson 1'], [30, 40, 25]), // strong
    w('二', ['HSK lesson 1', 'food'], [30, 8, 30], { toneErrors: 2 }), // medium (weakest skill 8 days)
    w('三', ['food'], null), // new
    w('四', [], [1, 1, 1], { toneErrors: 5 }), // weak
    w('五', [], [10, 10, 10], { skills: { meaning: st(4, '2026-08-01'), pinyin: st(10), recall: st(10) } }), // rusty
  ];

  it('counts weak / medium / strong, new and rusty', () => {
    expect(strengthCounts(words, NOW)).toEqual({ new: 1, weak: 1, medium: 2, strong: 1, rusty: 1 });
  });

  it('per tag', () => {
    expect(strengthByTag(words, NOW)).toEqual([
      { tag: 'food', new: 1, weak: 0, medium: 1, strong: 0, rusty: 0 },
      { tag: 'HSK lesson 1', new: 0, weak: 0, medium: 1, strong: 1, rusty: 0 },
    ]);
  });

  it('lists words with tone errors, most first', () => {
    expect(toneTrouble(words).map((x) => x.hanzi)).toEqual(['四', '二']);
  });
});

describe('readable sentences', () => {
  it('counts sentences whose words are all learned, per tag and per dialogue', () => {
    const words = [w('我', [], [10, 10, 10]), w('是', [], [10, 10, 10]), w('学生', [], null)];
    const a = createSentence({ zh: '我是。', pinyin: 'x', translation: 'x', tags: ['lesson 1'] }, 0, 'a');
    const b = createSentence({ zh: '我是学生。', pinyin: 'x', translation: 'x', tags: ['lesson 1'] }, 0, 'b');
    const d: Dialogue = { id: 'd', title: '第一课', tags: [], lines: [{ sentenceId: 'a' }, { sentenceId: 'b' }], createdAt: 0, updatedAt: 0 };
    const r = readableStats([a, b], [d], computeLinks([a, b], words));
    expect(r.all).toEqual({ readable: 1, total: 2 });
    expect(r.tags).toEqual([{ tag: 'lesson 1', readable: 1, total: 2 }]);
    expect(r.dialogues.map((x) => [x.dialogue.title, x.readable, x.total])).toEqual([['第一课', 1, 2]]);
  });
});

describe('characters and words', () => {
  it('counts characters learned and words unlocked, per tag', () => {
    const e = (hanzi: string, learned: boolean, tags: string[], unlockedOn?: string): Word => ({
      id: hanzi, hanzi, pinyin: '', meaning: hanzi, tags, createdAt: 0, updatedAt: 0, unlockedOn,
      skills: learned ? { meaning: { ease: 2.5, interval: 1, reps: 1, lapses: 0, due: '2026-10-20' } } : {},
    });
    const { all, tags } = entryProgress([e('上', true, ['L4']), e('课', false, ['L4']), e('上课', false, ['L4']), e('电话', false, ['L4'], '2026-10-01')]);
    expect(all).toEqual({ charsLearned: 1, chars: 2, wordsUnlocked: 1, words: 2 });
    expect(tags).toEqual([{ tag: 'L4', charsLearned: 1, chars: 2, wordsUnlocked: 1, words: 2 }]);
  });
});
