import { describe, expect, it } from 'vitest';
import { createSentence } from './sentences';
import { newSrs } from './srs';
import { blankedParts, blankTiles, charsAt, checkTiles, chooseBlanks, distractorCount, sentenceBuildTiles, wordBuildTiles } from './tiles';
import type { Sentence, Word } from './types';

const st = () => ({ ...newSrs('2026-10-01'), interval: 5, reps: 3 });
const e = (hanzi: string, tags: string[] = []): Word => ({
  id: hanzi,
  hanzi,
  pinyin: 'x',
  meaning: hanzi,
  tags,
  createdAt: 0,
  updatedAt: 0,
  skills: [...hanzi].length === 1 ? { meaning: st(), pinyin: st(), recall: st() } : {},
  unlockedOn: [...hanzi].length > 1 ? '2026-10-01' : undefined,
});
const s = (zh: string, extra: Partial<Sentence> = {}): Sentence => ({ ...createSentence({ zh, pinyin: '', translation: 'I want to eat buns.', tags: [] }, 0, zh), ...extra });
const fixed = () => 0;
const entries = ['我', '想', '吃', '包', '子', '包子', '喝', '水', '他', '你', '电', '脑', '话', '电话', '人', '大', '太'].map((h) => e(h));

describe('build in Chinese', () => {
  it('splits a sentence into word tiles and adds distractors (never an answer tile)', () => {
    const { answer, tiles } = sentenceBuildTiles(s('我想吃包子。'), entries, null, fixed);
    expect(answer).toEqual(['我', '想', '吃', '包子']);
    expect(tiles).toHaveLength(4 + distractorCount(4));
    const extra = tiles.filter((t) => !answer.includes(t));
    expect(extra).toHaveLength(3);
    for (const t of extra) expect('我想吃包子').not.toContain(t);
    expect(tiles.join('')).not.toBe(answer.join('') + extra.join(''));
  });

  it('builds a word from character tiles', () => {
    const { answer, tiles } = wordBuildTiles(e('电脑'), entries, null, fixed);
    expect(answer).toEqual(['电', '脑']);
    expect(tiles).toHaveLength(4);
    expect(tiles.filter((t) => t !== '电' && t !== '脑')).toHaveLength(2);
  });

  it('checks the order, accepts alternatives, and marks the wrong tiles', () => {
    expect(checkTiles(['我', '想', '吃', '包子'], ['我', '想', '吃', '包子'])).toEqual({ ok: true, wrong: [] });
    expect(checkTiles(['我', '吃', '想', '包子'], ['我', '想', '吃', '包子'])).toEqual({ ok: false, wrong: [1, 2] });
    expect(checkTiles(['他', '想', '吃'], ['我', '想', '吃'], ['他想吃。']).ok).toBe(true);
    expect(charsAt(['我', '想', '吃', '包子'], [3])).toEqual(['包', '子']);
  });
});

describe('complete the sentence', () => {
  const sentence = s('我想吃包子。');
  const linked = ['我', '想', '吃', '包子'].map((h) => entries.find((x) => x.hanzi === h)!);
  const prio = (w: Word) => ({ 包子: 3, 我: 2, 想: 1 })[w.hanzi] ?? 0;

  it('blanks the target plus the highest-priority other items, in sentence order', () => {
    const blanks = chooseBlanks(sentence, linked[2], linked, 2, prio)!;
    expect(blanks.map((b) => b.item.hanzi)).toEqual(['吃', '包子']);
    expect(blankedParts(sentence.zh, blanks)).toEqual([{ text: '我想' }, { blank: 0 }, { blank: 1 }, { text: '。' }]);
    expect(chooseBlanks(sentence, linked[2], linked, 1, prio)!.map((b) => b.item.hanzi)).toEqual(['吃']);
  });

  it('gives tiles for the blanks plus 2–3 others not in the sentence', () => {
    const blanks = chooseBlanks(sentence, linked[2], linked, 2, prio)!;
    const tiles = blankTiles(blanks, sentence, entries, fixed);
    expect(tiles).toContain('吃');
    expect(tiles).toContain('包子');
    expect(tiles.length).toBeGreaterThanOrEqual(4);
    for (const t of tiles.filter((x) => x !== '吃' && x !== '包子')) expect(sentence.zh).not.toContain(t);
  });
});
