import { describe, expect, it } from 'vitest';
import { computeLinks, createSentence } from './sentences';
import { buildTiles, learnedSentenceSkills, learnGroups, readiness, responseOptions, sentenceTiles, tilesCorrect, translationOptions } from './sentenceLearn';
import { newSrs } from './srs';
import type { Dialogue, Sentence, Word } from './types';

const learnedSkill = { ...newSrs('2026-10-01'), reps: 2, interval: 6, lastReviewed: '2026-10-01' };
const w = (hanzi: string, learned: boolean): Word => ({
  id: `w-${hanzi}`,
  hanzi,
  pinyin: '',
  meaning: hanzi,
  tags: [],
  createdAt: 0,
  updatedAt: 0,
  skills: learned ? { meaning: learnedSkill, pinyin: learnedSkill, recall: learnedSkill } : {},
});
const s = (zh: string, translation = zh, extra: Partial<Sentence> = {}): Sentence => ({
  ...createSentence({ zh, pinyin: 'x', translation, tags: [] }, 0, `s-${zh}`),
  ...extra,
});
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

describe('readiness', () => {
  const words = [w('我', true), w('是', true), w('学生', false), w('老师', true)];
  it('is ready when enough of the linked words are learned', () => {
    const list = [s('我是学生。'), s('我是老师。')];
    const links = computeLinks(list, words);
    const r = readiness(list, links, 70);
    expect([r.total, r.learned, r.missing.map((x) => x.hanzi), r.ready]).toEqual([4, 3, ['学生'], true]);
    expect(readiness(list, links, 80).ready).toBe(false);
    expect(readiness([s('谢谢。')], links, 70).ready).toBe(true); // no linked words
  });
});

describe('learn groups', () => {
  it('puts dialogues first in line order, then loose sentences per tag', () => {
    const a = s('你好！', 'Hello!', { dialogueId: 'd1' });
    const b = s('你好吗？', 'How are you?', { dialogueId: 'd1' });
    const c = s('我是学生。', 'I am a student.', { tags: ['lesson 1'], createdAt: 2 });
    const d = s('谢谢。', 'Thanks.', { createdAt: 1 });
    const dialogue: Dialogue = { id: 'd1', title: '第一课', tags: [], lines: [{ sentenceId: b.id, speaker: 'B' }, { sentenceId: a.id, speaker: 'A' }], createdAt: 0, updatedAt: 0 };
    const groups = learnGroups([a, b, c, d], [dialogue]);
    expect(groups.map((g) => [g.title, g.sentences.map((x) => x.zh)])).toEqual([
      ['第一课', ['你好吗？', '你好！']],
      ['lesson 1', ['我是学生。']],
      ['Other sentences', ['谢谢。']],
    ]);
    expect(groups[0].speakers.get(a.id)).toBe('A');
  });
});

describe('exercise material', () => {
  it('offers distinct translations including the right one', () => {
    const target = s('我是学生。', 'I am a student.');
    const near = [s('他是老师。', 'He is a teacher.'), s('我是学生！', 'I am a student!')];
    const pool = [s('谢谢。', 'Thanks.'), s('你好。', 'Hello.')];
    const opts = translationOptions(target, near, pool, 3, rnd);
    expect(opts).toHaveLength(3);
    expect(opts).toContain('I am a student.');
    expect(opts).not.toContain('I am a student!'); // reads the same
  });

  it('builds tiles from the words, without punctuation, plus extra tiles', () => {
    const known = new Set(['我', '是', '学生', '你']);
    expect(sentenceTiles('我是学生。', known)).toEqual(['我', '是', '学生']);
    expect(sentenceTiles('他是我的老师。', new Set(['是', '老师']))).toEqual(['他', '是', '我的', '老师']);
    const { answer, tiles } = buildTiles(s('我是学生。'), [s('你叫什么名字？')], rnd, known);
    expect(answer).toEqual(['我', '是', '学生']);
    expect(tiles.length).toBeGreaterThan(answer.length);
    for (const t of answer) expect(tiles).toContain(t);
    expect(tilesCorrect(['我', '是', '学生'], answer)).toBe(true);
    expect(tilesCorrect(['是', '我', '学生'], answer)).toBe(false);
  });

  it('offers the next line plus other lines for a dialogue response', () => {
    const lines = ['你好！', '你好！你叫什么名字？', '我叫王明。', '你是学生吗？', '是。'].map((x) => s(x));
    const opts = responseOptions(lines, 2, 3, rnd);
    expect(opts).toHaveLength(3);
    expect(opts.map((o) => o.zh)).toContain('我叫王明。');
    expect(opts.map((o) => o.zh)).not.toContain('你好！你叫什么名字？'); // the prompt
  });

  it('starts learned sentences with both skills due tomorrow, keeping learn answers', () => {
    const skills = learnedSentenceSkills({ produce: { answered: 2, correct: 1, recent: '01' } }, '2026-10-04');
    expect([skills.understand!.due, skills.produce!.due, skills.produce!.recent]).toEqual(['2026-10-05', '2026-10-05', '01']);
  });
});
