import { describe, expect, it } from 'vitest';
import { computeLinks, exampleSentenceId, migrateExamples, parseSentenceBulk, parseTranslations, createSentence } from './sentences';
import type { Sentence, Word } from './types';

const w = (hanzi: string, extra: Partial<Word> = {}): Word => ({
  id: `w-${hanzi}`,
  hanzi,
  pinyin: '',
  meaning: hanzi,
  tags: [],
  createdAt: 0,
  updatedAt: 0,
  skills: {},
  ...extra,
});
const s = (zh: string, extra: Partial<Sentence> = {}): Sentence => ({ ...createSentence({ zh, pinyin: 'x', translation: 't', tags: [] }, 0, `s-${zh}`), ...extra });

describe('linked words', () => {
  const words = [w('我'), w('是'), w('学生'), w('学'), w('生'), w('图书馆'), w('图书'), w('去'), w('猫')];
  const links = (zh: string, extra: Partial<Sentence> = {}) =>
    computeLinks([s(zh, extra)], words).bySentence.get(`s-${zh}`)!.map((x) => x.hanzi);

  it('matches whole words first, in sentence order', () => {
    expect(links('我是学生。')).toEqual(['我', '是', '学生']);
  });

  it('joins segments the segmenter splits (图书馆 over 图书)', () => {
    expect(links('我去图书馆。')).toEqual(['我', '去', '图书馆']);
  });

  it('falls back to single characters not covered by a word', () => {
    expect(links('学习')).toEqual(['学']);
  });

  it('finds words inside a longer segment (中国 in 中国人)', () => {
    const more = [...words, w('中国'), w('人')];
    const got = computeLinks([s('我是中国人。')], more).bySentence.get('s-我是中国人。')!.map((x) => x.hanzi);
    expect(got).toEqual(['我', '是', '中国', '人']);
  });

  it('orders words by their first appearance', () => {
    const more = [...words, w('你'), w('好')];
    const got = computeLinks([s('你好！你是学生。')], more).bySentence.get('s-你好！你是学生。')!.map((x) => x.hanzi);
    expect(got).toEqual(['你', '好', '是', '学生']);
  });

  it('adds words linked by hand and lists sentences per word', () => {
    expect(links('我是学生。', { wordIds: ['w-猫'] })).toContain('猫');
    const { byWord } = computeLinks([s('我是学生。'), s('我去图书馆。')], words);
    expect(byWord.get('w-我')!.length).toBe(2);
  });
});

describe('migrating word examples', () => {
  it('turns each example into a linked sentence and clears the word', () => {
    const words = [w('猫', { example: '我有一只猫。', tags: ['animals'] }), w('狗', { example: '我有一只狗。', exampleTranslation: 'I have a dog.', exampleRef: 42 }), w('鸟')];
    const { sentences, words: cleaned } = migrateExamples(words, [], 1000);
    expect(sentences).toHaveLength(2);
    expect(sentences[0]).toMatchObject({ id: exampleSentenceId('w-猫'), zh: '我有一只猫。', translation: '', tags: ['animals'], wordIds: ['w-猫'] });
    expect(sentences[0].pinyin).toContain('māo');
    expect(sentences[1]).toMatchObject({ translation: 'I have a dog.', tatoebaId: 42 });
    expect(cleaned.map((x) => [x.hanzi, x.example])).toEqual([
      ['猫', undefined],
      ['狗', undefined],
    ]);
  });

  it('links to an existing sentence with the same text instead of duplicating it', () => {
    const existing = s('我有一只猫。');
    const { sentences } = migrateExamples([w('猫', { example: '我有一只猫。' }), w('只', { example: '我有一只猫。' })], [existing]);
    expect(sentences).toHaveLength(1);
    expect(sentences[0]).toMatchObject({ id: existing.id, wordIds: ['w-猫', 'w-只'] });
  });
});

describe('bulk sentences', () => {
  it('parses chinese | pinyin | translation | tags and reports missing translations', () => {
    const { rows, errors } = parseSentenceBulk('你好！ | nǐ hǎo! | Hello! | lesson 1, greetings\n我是学生。 |  |  | lesson 1\nSure, here they are:');
    expect(rows).toHaveLength(1);
    expect(rows[0].input).toMatchObject({ zh: '你好！', pinyin: 'nǐ hǎo!', translation: 'Hello!', tags: ['lesson 1', 'greetings'] });
    expect(errors).toEqual([{ line: 2, text: '我是学生。 |  |  | lesson 1', reason: 'missing translation' }]);
  });

  it('generates pinyin when empty and accepts "chinese | translation"', () => {
    const { rows } = parseSentenceBulk('我是学生。 | I am a student.');
    expect(rows[0].input).toMatchObject({ translation: 'I am a student.' });
    expect(rows[0].input.pinyin).toContain('xué');
  });

  it('reads speakers and extra examples in a dialogue', () => {
    const text = 'A: 你好！ | nǐ hǎo! | Hello! |\n王老师：你叫什么名字？ |  | What is your name? |\n--- examples\n他叫王明。 |  | His name is Wang Ming. |';
    const { rows } = parseSentenceBulk(text, true);
    expect(rows.map((r) => [r.speaker, r.input.zh, !!r.extra])).toEqual([
      ['A', '你好！', false],
      ['王老师', '你叫什么名字？', false],
      [undefined, '他叫王明。', true],
    ]);
  });
});

describe('filling translations', () => {
  it('matches pasted lines on the Chinese text', () => {
    const list = [s('我是学生。', { translation: '' }), s('你好！', { translation: '' })];
    const map = parseTranslations('我是学生。 | I am a student.\n1. 你好！ | Hello!\n不在 | Not there', list);
    expect([...map.values()]).toEqual(['I am a student.', 'Hello!']);
  });
});
