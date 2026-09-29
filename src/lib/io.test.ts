import { describe, expect, it } from 'vitest';
import { normalizeWord, parseImport } from './io';
import { isLearned, isNew } from './srs';

const ON = '2026-09-29';

describe('parseImport', () => {
  it('keeps notes, skills and tone errors from a current export', () => {
    const file = JSON.stringify({
      version: 2,
      words: [
        {
          hanzi: '学校',
          meaning: 'school',
          notes: '  a child 子 learning under a roof  ',
          learnedOn: '2026-09-01',
          toneErrors: 3,
          skills: {
            meaning: { ease: 2.1, interval: 4, reps: 2, lapses: 5, due: '2026-09-24', leech: true, lapsesAtUnmark: 2, recent: '0110' },
            pinyin: { ease: 2.5, interval: 2, reps: 1, lapses: 0, due: '2026-09-30', answered: 4, correct: 3 },
            bogus: { ease: 1 },
          },
        },
      ],
    });
    const [w] = parseImport(file).words;
    expect(w.notes).toBe('a child 子 learning under a roof');
    expect(w.skills.meaning).toMatchObject({ leech: true, lapses: 5, lapsesAtUnmark: 2, recent: '0110' });
    expect(w.skills.pinyin).toMatchObject({ interval: 2, answered: 4, correct: 3 });
    expect(Object.keys(w.skills)).toEqual(['meaning', 'pinyin']);
    expect([w.learnedOn, w.toneErrors]).toEqual(['2026-09-01', 3]);
  });
});

describe('migration from a single schedule (old backups and stored words)', () => {
  const legacy = (srs: Record<string, unknown>, hanzi = '猫') =>
    normalizeWord({ id: 'w1', hanzi, meaning: 'cat', srs }, 0, ON)!;

  it('copies the old schedule into meaning, with its leech data and statistics', () => {
    const w = legacy({ ease: 2.1, interval: 10, reps: 3, lapses: 5, due: '2026-10-05', lastReviewed: '2026-09-25', leech: true, answered: 7, correct: 5, learnedOn: '2026-09-01', successes: 3 });
    expect(w.skills.meaning).toEqual({
      ease: 2.1, interval: 10, reps: 3, lapses: 5, due: '2026-10-05', lastReviewed: '2026-09-25', leech: true,
      answered: 7, correct: 5, recent: undefined, lastSeen: undefined, lapsesAtUnmark: undefined,
    });
    expect(w.learnedOn).toBe('2026-09-01');
    expect(isLearned(w)).toBe(true);
  });

  it('seeds pinyin and recall with half the interval, due from tomorrow at the earliest', () => {
    const w = legacy({ ease: 2.5, interval: 20, reps: 4, due: '2026-10-10', lastReviewed: '2026-09-20' });
    for (const k of ['pinyin', 'recall'] as const) {
      expect(w.skills[k]).toMatchObject({ interval: 10, ease: 2.5, reps: 4, lapses: 0, due: '2026-09-30', lastReviewed: '2026-09-20' });
    }
  });

  it('spreads overdue seeded skills over the next days instead of all tomorrow', () => {
    const dues = new Set(
      Array.from({ length: 30 }, (_, i) =>
        normalizeWord({ id: `id${i}`, hanzi: '猫', meaning: 'cat', srs: { interval: 20, reps: 4, lastReviewed: '2026-06-01', due: '2026-06-21' } }, 0, ON)!.skills.recall!.due,
      ),
    );
    expect(dues.size).toBeGreaterThan(3);
    for (const d of dues) expect(d >= '2026-09-30' && d <= '2026-10-09').toBe(true);
  });

  it('gives short intervals a minimum of one day', () => {
    const w = legacy({ interval: 1, reps: 1, lastReviewed: '2026-09-28', due: '2026-09-29' });
    expect([w.skills.pinyin!.interval, w.skills.pinyin!.due]).toEqual([1, '2026-09-30']);
  });

  it('keeps words without review history new', () => {
    const w = legacy({ ease: 2.5, interval: 0, reps: 0, due: '2026-09-01' });
    expect(isNew(w)).toBe(true);
    expect(w.skills).toEqual({});
    expect(isNew(normalizeWord({ hanzi: '狗', meaning: 'dog' }, 0, ON)!)).toBe(true);
  });

  it('gives radical-only entries no pinyin skill', () => {
    const w = legacy({ interval: 6, reps: 2, lastReviewed: '2026-09-25' }, '氵');
    expect(Object.keys(w.skills)).toEqual(['meaning', 'recall']);
  });

  it('counts a failed-but-reviewed word as learned', () => {
    expect(isLearned(legacy({ interval: 1, reps: 0, lapses: 2, lastReviewed: '2026-09-28' }))).toBe(true);
  });
});
