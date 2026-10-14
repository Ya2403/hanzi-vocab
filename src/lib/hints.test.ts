import { describe, expect, it } from 'vitest';
import { englishTokens, formatAlignments, parseAlignments } from './hints';
import type { Word } from './types';

const w = (hanzi: string, meaning: string): Word => ({ id: hanzi, hanzi, pinyin: 'x', meaning, tags: [], createdAt: 0, updatedAt: 0, skills: {} });

describe('english hints', () => {
  it('parses and formats the alignment line', () => {
    expect(parseAlignments('I=我; like=喜欢；cook = 做饭')).toEqual({ i: '我', like: '喜欢', cook: '做饭' });
    expect(formatAlignments({ i: '我', like: '喜欢' })).toBe('i=我; like=喜欢');
    expect(parseAlignments('nothing here')).toBeUndefined();
  });

  it('uses stored alignments first, then the meanings of the sentence items', () => {
    const items = [w('老师', 'teacher'), w('我', 'I; me'), w('说', 'to speak; to say'), w('你好', 'hello')];
    const tokens = englishTokens('The teacher says hello to me.', { zh: '老师对我说你好。', alignments: { says: '对…说' } }, items);
    const words = tokens.filter((t) => t.word);
    expect(words.map((t) => [t.text, t.zh ?? null])).toEqual([
      ['The', null],
      ['teacher', '老师'],
      ['says', '对…说'],
      ['hello', '你好'],
      ['to', null],
      ['me', '我'],
    ]);
    expect(words[1].item?.hanzi).toBe('老师');
    expect(tokens.map((t) => t.text).join('')).toBe('The teacher says hello to me.');
  });

  it('finds plural and verb forms', () => {
    const tokens = englishTokens('I want to eat steamed buns.', { zh: '我想吃包子。' }, [w('包子', 'steamed bun'), w('吃', 'to eat'), w('想', 'to want')]);
    expect(tokens.filter((t) => t.zh).map((t) => [t.text, t.zh])).toEqual([
      ['want', '想'],
      ['eat', '吃'],
      ['steamed', '包子'],
      ['buns', '包子'],
    ]);
  });
});
