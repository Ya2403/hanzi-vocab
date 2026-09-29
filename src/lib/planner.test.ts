import { describe, expect, it } from 'vitest';
import { chooseExercise, dueItems, isLessonTag, orderItems, pickPractice, skillStrength, strength, weakestSkill, weakness } from './planner';
import { activeSkills, dueSkills, isDueLearned, isLeech, leechSkills, learnedSkills, newSrs, practiceMiss, recordAnswer, unmarkLeech } from './srs';
import type { SkillState, Skills, Word } from './types';

const ON = '2026-09-27';
const NOW = new Date('2026-09-27T12:00:00').getTime();
const st = (s: Partial<SkillState>): SkillState => ({ ...newSrs(ON), lastReviewed: '2026-09-20', due: '2026-10-30', ...s });
/** A learned word; every skill gets `all`, then per-skill overrides. */
const w = (hanzi: string, all: Partial<SkillState>, per: Partial<Record<keyof Skills, Partial<SkillState>>> = {}, extra: Partial<Word> = {}): Word => ({
  id: hanzi,
  hanzi,
  pinyin: 'x',
  meaning: hanzi,
  tags: [],
  createdAt: 0,
  updatedAt: 0,
  skills: {
    meaning: st({ ...all, ...per.meaning }),
    pinyin: st({ ...all, ...per.pinyin }),
    recall: st({ ...all, ...per.recall }),
    ...(per.writing ? { writing: st(per.writing) } : {}),
  },
  ...extra,
});
const fixed = (x: number) => () => x;

describe('skill strength', () => {
  it('classifies skills', () => {
    const list = [
      st({ reps: 1, interval: 1 }),
      st({ reps: 2, interval: 6 }),
      st({ reps: 3, interval: 15 }),
      st({ reps: 5, interval: 40, ease: 2.6 }),
      st({ reps: 4, interval: 30, recent: '10100' }),
    ];
    expect(list.map((s) => skillStrength(s, undefined, ON))).toEqual(['weak', 'medium', 'strong', 'veryStrong', 'weak']);
    expect(skillStrength(st({ reps: 5, interval: 40 }), '2026-09-26', ON)).toBe('weak'); // recently learned
  });

  it('makes a word as strong as its weakest skill', () => {
    const word = w('好', { reps: 5, interval: 40 }, { pinyin: { reps: 2, interval: 6 } });
    expect(weakestSkill(word, ON)).toBe('pinyin');
    expect(strength(word, ON)).toBe('medium');
  });
});

describe('exercise choice per skill', () => {
  const weak = w('学', { reps: 1, interval: 1 });
  const medium = w('中', { reps: 2, interval: 6 });
  const strong = w('国', { reps: 3, interval: 15 });

  it('gives weak skills multiple choice in the skill\'s direction', () => {
    expect(chooseExercise(weak, 'meaning', { listening: true, on: ON })).toEqual({ ex: 'choice', dir: 'zh-en' });
    expect(chooseExercise(weak, 'pinyin', { listening: true, on: ON })).toEqual({ ex: 'choice', dir: 'zh-py' });
    expect(chooseExercise(weak, 'recall', { listening: true, on: ON })).toEqual({ ex: 'choice', dir: 'en-zh' });
  });

  it('gives medium pinyin listening sometimes (when audio is available)', () => {
    expect(chooseExercise(medium, 'pinyin', { listening: true, rnd: fixed(0.1), on: ON }).ex).toBe('listen');
    expect(chooseExercise(medium, 'pinyin', { listening: true, rnd: fixed(0.9), on: ON }).ex).toBe('choice');
    expect(chooseExercise(medium, 'pinyin', { listening: false, rnd: fixed(0.1), on: ON }).ex).toBe('choice');
  });

  it('gives strong skills typing, and writing cards for the writing skill', () => {
    expect(chooseExercise(strong, 'recall', { listening: true, on: ON })).toEqual({ ex: 'typing', dir: 'en-zh' });
    expect(chooseExercise(strong, 'writing', { listening: true, on: ON }).ex).toBe('writing');
  });

  it('only gives radical-only entries multiple choice', () => {
    const radical = w('氵', { reps: 6, interval: 60, ease: 2.7 });
    expect(chooseExercise(radical, 'recall', { listening: true, on: ON }).ex).toBe('choice');
  });
});

describe('due skills and review cards', () => {
  it('is due when any active skill is due', () => {
    const word = w('好', { reps: 3, interval: 10 }, { recall: { due: ON } });
    expect(dueSkills(word, ON, false)).toEqual(['recall']);
    expect(isDueLearned(word, ON, false)).toBe(true);
    expect(isDueLearned(w('中', {}), ON, false)).toBe(false);
  });

  it('never makes new words due', () => {
    const fresh: Word = { ...w('新', {}), skills: {} };
    expect(isDueLearned(fresh, ON, true)).toBe(false);
    expect(activeSkills(fresh, true)).toEqual([]);
  });

  it('starts the writing skill once recall reaches 6 days, only with writing practice on', () => {
    const young = w('好', { reps: 2, interval: 5 });
    const ready = w('好', { reps: 3, interval: 6 });
    expect(activeSkills(ready, false)).not.toContain('writing');
    expect(activeSkills(young, true)).not.toContain('writing');
    expect(activeSkills(ready, true)).toContain('writing');
    expect(dueSkills(ready, ON, true)).toEqual(['writing']); // a fresh skill is due right away
  });

  it('orders cards most overdue first without the same word twice in a row', () => {
    const a = w('一', {}, { meaning: { due: '2026-09-20' }, pinyin: { due: '2026-09-21' }, recall: { due: '2026-09-22' } });
    const b = w('二', {}, { meaning: { due: '2026-09-25' } });
    const items = orderItems(dueItems([a, b], ON), fixed(0), ON);
    expect(items.map((it) => `${it.word.hanzi}:${it.skill}`)).toEqual(['一:meaning', '二:meaning', '一:pinyin', '一:recall']);
  });
});

describe('leeches per skill', () => {
  it('names the skill and unmarks all of them', () => {
    const word = w('难', {}, { pinyin: { leech: true, lapses: 5 } });
    expect([isLeech(word), leechSkills(word)]).toEqual([true, ['pinyin']]);
    const unmarked = unmarkLeech(word);
    expect(isLeech(unmarked)).toBe(false);
    expect(unmarked.skills.pinyin!.lapsesAtUnmark).toBe(5);
  });
});

describe('practice selection', () => {
  it('ranks recent misses, low accuracy and low ease as weakest', () => {
    const solid = w('好', { reps: 5, interval: 30, ease: 2.6, due: '2026-10-20', answered: 10, correct: 10, recent: '11111', lastSeen: NOW });
    const missed = w('难', { reps: 5, interval: 30, ease: 2.6, due: '2026-10-20', answered: 10, correct: 10, recent: '11111', lastSeen: NOW }, {
      pinyin: { reps: 3, interval: 10, ease: 2.2, due: '2026-10-05', answered: 8, correct: 4, recent: '01010', lastSeen: NOW },
    });
    const dueNow = w('中', { reps: 2, interval: 6, ease: 2.5, due: ON, answered: 3, correct: 3, recent: '111', lastSeen: NOW - 7 * 86_400_000 });
    expect(weakness(missed, ON, NOW)).toBeGreaterThan(weakness(dueNow, ON, NOW));
    expect(weakness(dueNow, ON, NOW)).toBeGreaterThan(weakness(solid, ON, NOW));
    expect(pickPractice([solid, missed, dueNow], 2, { on: ON, now: NOW, rnd: fixed(0) }).map((x) => x.hanzi)).toEqual(['难', '中']);
  });

  it('never picks new (unlearned) words', () => {
    const fresh: Word = { ...w('新', {}), skills: {} };
    expect(pickPractice([fresh], 5, { on: ON, now: NOW })).toEqual([]);
  });
});

describe('answer stats and practice misses', () => {
  it('keeps totals and the last five results', () => {
    let s = newSrs(ON);
    for (const ok of [true, false, true, true, true, false]) s = recordAnswer(s, ok, NOW);
    expect([s.answered, s.correct, s.recent]).toEqual([6, 4, '01110']);
  });

  const learned = (on: string) => learnedSkills({ hanzi: '好' }, {}, on).meaning!;

  it('moves the review to tomorrow at the latest and halves the interval', () => {
    const { srs } = practiceMiss({ ...learned('2026-09-01'), interval: 20, due: '2026-10-15', reps: 4 }, 5, ON);
    expect([srs.due, srs.interval, srs.lapses]).toEqual(['2026-09-28', 10, 1]);
  });

  it('counts a lapse (and can flag a leech) only for well-known skills', () => {
    const young = practiceMiss({ ...learned('2026-09-26'), interval: 1 }, 1, ON);
    expect([young.srs.lapses, young.becameLeech]).toEqual([0, false]);
    const known = practiceMiss({ ...learned('2026-08-01'), interval: 12, lapses: 4 }, 5, ON);
    expect([known.srs.lapses, known.becameLeech, known.srs.leech]).toEqual([5, true, true]);
  });
});

describe('isLessonTag', () => {
  it('groups lesson tags apart from topics', () => {
    expect(['HSK lesson 1', 'lesson 3', 'Lesson5', 'HSK1', 'food', 'lessons learned'].map(isLessonTag)).toEqual([true, true, false, false, false, false]);
  });
});
