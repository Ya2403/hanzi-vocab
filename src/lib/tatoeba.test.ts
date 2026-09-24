import { beforeEach, describe, expect, it } from 'vitest';

// Node has no localStorage; the rotation helper only needs get/set.
const store = new Map<string, string>();
globalThis.localStorage ??= {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  key: (i: number) => [...store.keys()][i] ?? null,
  get length() {
    return store.size;
  },
} as Storage;
import { buildCorpus, findSentences, matchLabel, pickRotating } from './tatoeba';
import { newSrs } from './srs';
import type { Word } from './types';

const corpus = buildCorpus({
  s: [
    ['我|去|学校|。', 'I go to school.', 1],
    ['我|学|中文|。', 'I study Chinese.', 2],
    ['他|在|图书|馆|看书|。', 'He reads in the library.', 3],
    ['我|在|学校|学|中文|和|日文|。', 'I study Chinese and Japanese at school.', 4],
    ['学校|很|大|。', 'The school is big.', 5],
  ],
});

const word = (hanzi: string, learned: boolean): Word => ({
  id: hanzi,
  hanzi,
  pinyin: '',
  meaning: '',
  tags: [],
  createdAt: 0,
  updatedAt: 0,
  srs: learned ? { ...newSrs(), reps: 1, interval: 1, lastReviewed: '2026-09-01' } : newSrs(),
});

describe('findSentences', () => {
  it('matches whole segments only: 学 does not match inside 学校', () => {
    const zh = findSentences(corpus, { hanzi: '学' }, []).map((m) => m.sentence.zh);
    expect(zh).toEqual(['我学中文。', '我在学校学中文和日文。']);
  });

  it('falls back to substring matching when the segmenter splits the word', () => {
    const [m] = findSentences(corpus, { hanzi: '图书馆' }, []);
    expect(m.via).toBe('substring');
    expect(m.sentence.zh).toBe('他在图书馆看书。');
    // 图书 and 馆 are part of the target, not "other words".
    expect(m.unknown.sort()).toEqual(['他', '在', '看书'].sort());
  });

  it('ranks sentences whose other words you have learned first, then shorter ones', () => {
    const mine = [word('我', true), word('去', true), word('很', true), word('大', false)];
    const ranked = findSentences(corpus, { hanzi: '学校' }, mine);
    expect(ranked.map((m) => [m.sentence.zh, matchLabel(m)])).toEqual([
      ['我去学校。', 'all known'],
      ['学校很大。', '1 new word'], // 大 is in the list but not learned yet
      ['我在学校学中文和日文。', '5 new words'],
    ]);
  });
});

describe('segments the segmenter glued together', () => {
  const glued = buildCorpus({ s: [['我去|学校|。', 'I go to school.', 9]] });

  it('count as known when they split into learned words', () => {
    const [m] = findSentences(glued, { hanzi: '学校' }, [word('我', true), word('去', true)]);
    expect(matchLabel(m)).toBe('all known');
  });

  it('stay unknown when part of them is not learned', () => {
    const [m] = findSentences(glued, { hanzi: '学校' }, [word('我', true)]);
    expect(m.unknown).toEqual(['我去']);
  });
});

describe('pickRotating', () => {
  beforeEach(() => localStorage.clear());
  const c = [{ key: 'a' }, { key: 'b' }, { key: 'c' }];

  it('uses a different sentence each time while there are unused ones', () => {
    expect([1, 2, 3].map(() => pickRotating('w', c)!.key)).toEqual(['a', 'b', 'c']);
  });

  it('then cycles back to the least recently shown', () => {
    [1, 2, 3].forEach(() => pickRotating('w', c));
    expect(pickRotating('w', c)!.key).toBe('a');
  });

  it('keeps using the only sentence there is', () => {
    expect(pickRotating('x', [{ key: 'only' }])!.key).toBe('only');
    expect(pickRotating('x', [{ key: 'only' }])!.key).toBe('only');
  });
});
