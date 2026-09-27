import { describe, expect, it } from 'vitest';
import { chooseExercise, isLessonTag, pickPractice, strength, weakness } from './planner';
import { learnedSrs } from './learn';
import { newSrs, practiceMiss, recordAnswer } from './srs';
import type { SrsState, Word } from './types';

const ON = '2026-09-27';
const NOW = new Date('2026-09-27T12:00:00').getTime();
const w = (hanzi: string, srs: Partial<SrsState>): Word => ({
  id: hanzi,
  hanzi,
  pinyin: 'x',
  meaning: hanzi,
  tags: [],
  createdAt: 0,
  updatedAt: 0,
  srs: { ...newSrs(ON), lastReviewed: '2026-09-20', ...srs },
});
const fixed = (x: number) => () => x;

describe('strength and exercise choice', () => {
  const justLearned = w('学', learnedSrs('2026-09-26'));
  const medium = w('中', { reps: 2, interval: 6, ease: 2.5 });
  const strong = w('国', { reps: 3, interval: 15, ease: 2.5 });
  const veryStrong = w('好', { reps: 5, interval: 40, ease: 2.6 });
  const struggling = w('难', { reps: 4, interval: 30, ease: 2.5, recent: '10100' });

  it('classifies words', () => {
    expect([justLearned, medium, strong, veryStrong, struggling].map((x) => strength(x, ON))).toEqual([
      'weak',
      'medium',
      'strong',
      'veryStrong',
      'weak',
    ]);
  });

  it('gives weak words 中→EN multiple choice', () => {
    expect(chooseExercise(justLearned, { listening: true, on: ON })).toEqual({ ex: 'choice', dir: 'zh-en' });
    expect(chooseExercise(struggling, { listening: true, on: ON })).toEqual({ ex: 'choice', dir: 'zh-en' });
  });

  it('gives medium words listening or EN→中 choice', () => {
    expect(chooseExercise(medium, { listening: true, rnd: fixed(0.1), on: ON }).ex).toBe('listen');
    expect(chooseExercise(medium, { listening: true, rnd: fixed(0.5), on: ON })).toEqual({ ex: 'choice', dir: 'en-zh' });
    expect(chooseExercise(medium, { listening: false, rnd: fixed(0.1), on: ON }).ex).toBe('choice');
  });

  it('gives strong words typing and very strong words writing sometimes', () => {
    expect(chooseExercise(strong, { listening: true, rnd: fixed(0.5), on: ON }).ex).toBe('typing');
    expect(chooseExercise(veryStrong, { listening: true, rnd: fixed(0.1), on: ON }).ex).toBe('writing');
    expect(chooseExercise(veryStrong, { listening: true, rnd: fixed(0.9), on: ON }).ex).toBe('typing');
  });

  it('only gives radical-only entries recognition exercises', () => {
    const radical = w('氵', { reps: 6, interval: 60, ease: 2.7 });
    expect(chooseExercise(radical, { listening: true, rnd: fixed(0.1), on: ON }).ex).toBe('choice');
  });
});

describe('practice selection', () => {
  it('ranks recent misses, low accuracy and low ease as weakest', () => {
    const solid = w('好', { reps: 5, interval: 30, ease: 2.6, due: '2026-10-20', answered: 10, correct: 10, recent: '11111', lastSeen: NOW });
    const missed = w('难', { reps: 3, interval: 10, ease: 2.2, due: '2026-10-05', answered: 8, correct: 4, recent: '01010', lastSeen: NOW });
    const dueNow = w('中', { reps: 2, interval: 6, ease: 2.5, due: ON, answered: 3, correct: 3, recent: '111', lastSeen: NOW - 7 * 86_400_000 });
    expect(weakness(missed, ON, NOW)).toBeGreaterThan(weakness(dueNow, ON, NOW));
    expect(weakness(dueNow, ON, NOW)).toBeGreaterThan(weakness(solid, ON, NOW));
    expect(pickPractice([solid, missed, dueNow], 2, { on: ON, now: NOW, rnd: fixed(0) }).map((x) => x.hanzi)).toEqual(['难', '中']);
  });

  it('never picks new (unlearned) words', () => {
    const fresh = { ...w('新', {}), srs: newSrs(ON) };
    expect(pickPractice([fresh], 5, { on: ON, now: NOW })).toEqual([]);
  });
});

describe('answer stats and practice misses', () => {
  it('keeps totals and the last five results', () => {
    let s = newSrs(ON);
    for (const ok of [true, false, true, true, true, false]) s = recordAnswer(s, ok, NOW);
    expect([s.answered, s.correct, s.recent]).toEqual([6, 4, '01110']);
  });

  it('moves the review to tomorrow at the latest and halves the interval', () => {
    const { srs } = practiceMiss({ ...learnedSrs('2026-09-01'), interval: 20, due: '2026-10-15', reps: 4 }, 5, ON);
    expect([srs.due, srs.interval, srs.lapses]).toEqual(['2026-09-28', 10, 1]);
  });

  it('counts a lapse (and can flag a leech) only for well-known words', () => {
    const young = practiceMiss({ ...learnedSrs('2026-09-26'), interval: 1 }, 1, ON);
    expect([young.srs.lapses, young.becameLeech]).toEqual([0, false]);
    const known = practiceMiss({ ...learnedSrs('2026-08-01'), interval: 12, lapses: 4 }, 5, ON);
    expect([known.srs.lapses, known.becameLeech, known.srs.leech]).toEqual([5, true, true]);
  });
});

describe('isLessonTag', () => {
  it('groups lesson tags apart from topics', () => {
    expect(['HSK lesson 1', 'lesson 3', 'Lesson5', 'HSK1', 'food', 'lessons learned'].map(isLessonTag)).toEqual([true, true, false, false, false, false]);
  });
});
