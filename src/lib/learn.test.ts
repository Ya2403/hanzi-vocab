import { describe, expect, it } from 'vitest';
import type { HanziDict } from './hanziDict';
import { isRadicalOnly, nextBatch, planLearning, wordsSimilar } from './learn';
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
  it('is not new anymore and every skill is first due tomorrow', () => {
    const skills = learnedSkills({ hanzi: '好' }, {}, '2026-09-27');
    expect(isNew({ ...w('好'), skills })).toBe(false);
    expect(Object.keys(skills)).toEqual(['meaning', 'pinyin', 'recall']);
    expect(Object.values(skills).map((x) => x!.due)).toEqual(['2026-09-28', '2026-09-28', '2026-09-28']);
  });

  it('keeps the answers given while learning', () => {
    const skills = learnedSkills({ hanzi: '好' }, { pinyin: { answered: 3, correct: 2, recent: '101' } }, '2026-09-27');
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
