import { describe, expect, it } from 'vitest';
import type { HanziDict } from './hanziDict';
import { isRadicalOnly, nextBatch, planLearning, unlockRank, wordsSimilar } from './learn';
import { isNew, learnedSkills } from './srs';
import type { Word } from './types';

// Minimal Make Me a Hanzi-style entries: [definition, pinyin, decomposition, radical].
const dict = {
  女: ['woman', ['nǚ'], '？', '女'],
  子: ['child', ['zǐ'], '？', '子'],
  马: ['horse', ['mǎ'], '？', '马'],
  好: ['good', ['hǎo'], '⿰女子', '女'],
  妈: ['mother', ['mā'], '⿰女马', '女'],
  她: ['she', ['tā'], '⿰女也', '女'],
  学: ['study', ['xué'], '⿱⺍子', '子'],
  生: ['life', ['shēng'], '？', '生'],
  未: ['not yet', ['wèi'], '？', '木'],
  末: ['end', ['mò'], '？', '木'],
} as unknown as HanziDict;

let t = 0;
const w = (hanzi: string, tags: string[] = []): Word => ({
  id: hanzi,
  hanzi,
  pinyin: '',
  meaning: hanzi,
  tags,
  createdAt: ++t,
  updatedAt: 0,
  skills: {},
});

describe('planLearning', () => {
  it('puts components before the characters built from them, otherwise keeps the added order', () => {
    const words = [w('好'), w('妈'), w('马'), w('子'), w('女')];
    expect(planLearning(words, dict).ordered.map((x) => x.hanzi)).toEqual(['子', '女', '好', '马', '妈']);
  });

  it('puts a character before words that contain it, even without dictionary data', () => {
    const words = [w('学生'), w('生'), w('学')];
    expect(planLearning(words, null).ordered.map((x) => x.hanzi)).toEqual(['生', '学', '学生']);
  });

  it('without dictionary data, words tagged "key" go first', () => {
    const words = [w('好'), w('马'), w('女', ['key'])];
    expect(planLearning(words, null).ordered.map((x) => x.hanzi)).toEqual(['女', '好', '马']);
  });
});

describe('nextBatch', () => {
  it('keeps look-alikes apart when there are other words to take instead', () => {
    const words = [w('未'), w('末'), w('子'), w('马')];
    const plan = planLearning(words, dict);
    const batch = nextBatch(plan, new Set(words.map((x) => x.id)), 3, dict).map((x) => x.hanzi);
    expect(batch).toContain('未');
    expect(batch).not.toContain('末');
    expect(batch).toHaveLength(3);
  });

  it('still fills the batch with a look-alike when nothing else is left', () => {
    const words = [w('未'), w('末')];
    const plan = planLearning(words, dict);
    expect(nextBatch(plan, new Set(['未', '末']), 6, dict)).toHaveLength(2);
  });

  it('treats characters with the same radical in the same layout as similar', () => {
    expect(wordsSimilar(w('妈'), w('她'), dict)).toBe(true);
    expect(wordsSimilar(w('妈'), w('马'), dict)).toBe(false);
  });
});

describe('learned state', () => {
  const NOW = new Date('2026-09-27T12:00:00').getTime();
  it('is not new anymore; every skill has had a first FSRS review and comes back within days', () => {
    const skills = learnedSkills({ hanzi: '好' }, {}, NOW);
    expect(isNew({ ...w('好'), skills })).toBe(false);
    expect(Object.keys(skills)).toEqual(['meaning', 'pinyin', 'recall']);
    for (const x of Object.values(skills)) {
      expect(x!.fsrs).toBeDefined();
      expect(x!.reps).toBe(1);
      expect(x!.due > '2026-09-27' && x!.due < '2026-10-03').toBe(true);
    }
  });

  it('keeps the answers given while learning', () => {
    const skills = learnedSkills({ hanzi: '好' }, { pinyin: { answered: 3, correct: 2, recent: '101' } }, NOW);
    expect([skills.pinyin!.answered, skills.pinyin!.recent, skills.meaning!.answered]).toEqual([3, '101', undefined]);
  });

  it('gives radical-only entries meaning and recall only', () => {
    expect(Object.keys(learnedSkills({ hanzi: '氵' }))).toEqual(['meaning', 'recall']);
  });
});

describe('isRadicalOnly', () => {
  it('recognizes bound radical forms, not normal characters', () => {
    expect(['氵', '扌', '讠', '⺍'].map((h) => isRadicalOnly({ hanzi: h }))).toEqual([true, true, true, true]);
    expect(['女', '水', '学生'].map((h) => isRadicalOnly({ hanzi: h }))).toEqual([false, false, false]);
  });
});

describe('unlock order', () => {
  const e = (hanzi: string, createdAt: number, learned = false, tags = ['L4']): Word => ({
    id: hanzi, hanzi, pinyin: '', meaning: hanzi, tags, createdAt, updatedAt: 0,
    skills: learned ? { meaning: { ease: 2.5, interval: 1, reps: 1, lapses: 0, due: '2026-10-20' } } : {},
  });
  it('puts characters that unlock the most words first, keeping lessons together', () => {
    const pool = [e('上', 1), e('课', 2), e('电', 3), e('一', 0, false, ['L1'])];
    const all = [...pool, e('话', 4, true), e('上课', 5), e('电话', 6), e('电脑', 7)];
    const rank = unlockRank(pool, all);
    const order = [...pool].sort((a, b) => rank.get(a.id)! - rank.get(b.id)!).map((w) => w.hanzi);
    // 一 (L1) comes first: its lesson was added first. In L4, 电 unlocks 电话 right away; 脑 isn't in the list.
    expect(order).toEqual(['一', '电', '上', '课']);
    expect(planLearning(pool, null, all).ordered.map((w) => w.hanzi)).toEqual(['一', '电', '上', '课']);
  });
});
