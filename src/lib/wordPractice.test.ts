import { describe, expect, it } from 'vitest';
import { computeCharLinks } from './entries';
import { planSession, targetChar, wordCandidates } from './wordPractice';
import { newSrs } from './srs';
import type { Word, WordStats } from './types';

const ON = '2026-10-14';
const NOW = new Date(`${ON}T12:00:00`).getTime();
const st = (interval: number) => ({ ...newSrs(ON), interval, reps: 3, lastReviewed: '2026-10-10', due: '2026-10-30' });
const char = (hanzi: string, interval = 10): Word => ({
  id: hanzi,
  hanzi,
  pinyin: 'x',
  meaning: hanzi,
  tags: [],
  createdAt: 0,
  updatedAt: 0,
  learnedOn: '2026-09-01',
  skills: { meaning: st(interval), pinyin: st(interval), recall: st(interval) },
});
const word = (hanzi: string, extra: Partial<Word> = {}, stats?: Partial<WordStats>): Word => ({
  id: hanzi,
  hanzi,
  pinyin: 'x',
  meaning: hanzi,
  tags: [],
  createdAt: 0,
  updatedAt: 0,
  skills: {},
  unlockedOn: '2026-10-01',
  stats: stats ? { answered: 1, correct: 0, recent: '0', ...stats } : undefined,
  ...extra,
});

describe('words in practice', () => {
  const chars = [char('上'), char('课'), char('电', 1), char('话'), char('王'), char('一'), char('飞')];
  const words = [
    word('上课', {}, { lastSeen: 50 }),
    word('下课', { unlockedOn: undefined }),
    word('电话', {}, { needsWork: true, lastSeen: 10 }),
    word('课本', {}, { lastSeen: 5 }),
    word('王一飞', { tags: ['names'] }),
  ];
  const links = computeCharLinks([...chars, ...words, char('本')]);

  it('offers unlocked words for a character: needing work first, then least recently seen; names only for meaning', () => {
    expect(wordCandidates(chars[1], 'recall', links).map((w) => w.hanzi)).toEqual(['课本', '上课']);
    expect(wordCandidates(chars[4], 'recall', links)).toEqual([]);
    expect(wordCandidates(chars[4], 'meaning', links).map((w) => w.hanzi)).toEqual(['王一飞']);
  });

  it('a word that comes up on its own reviews its weakest character', () => {
    expect(targetChar(words[2], links, NOW)!.hanzi).toBe('电');
  });

  it('adds words that need work, and does some character picks through a word', () => {
    const plan = planSession(chars, words, 10, links, { use: 'lot', now: NOW, rnd: () => 0 });
    expect(plan).toHaveLength(8); // all 7 characters (fewer than 9 asked for) + 1 word needing work
    const direct = plan.find((p) => p.entry.hanzi === '电话')!;
    expect(direct.target!.hanzi).toBe('电');
    const viaWord = plan.filter((p) => p.target && p.entry.hanzi !== '电话');
    expect(viaWord.length).toBeGreaterThan(0);
    for (const p of viaWord) expect(p.entry.hanzi).toContain(p.target!.hanzi);
    // Each word once.
    expect(new Set(plan.map((p) => p.entry.id)).size).toBe(plan.length);
  });

  it('"off" never uses words', () => {
    const plan = planSession(chars, words, 10, links, { use: 'off', now: NOW, rnd: () => 0 });
    expect(plan.every((p) => !p.target)).toBe(true);
  });
});
