import { describe, expect, it } from 'vitest';
import { balanceHint, cardsFor, chooseExercise, isLessonTag, isRusty, pickSession, practiceCard, retryOf, skillPriority, skillStrength, spreadSteps, strength, testedSkills, weakestSkill } from './planner';
import { activeSkills, isLeech, leechSkills, newSrs, recordAnswer, unmarkLeech } from './srs';
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

describe('skill strength (FSRS stability)', () => {
  it('classifies skills as weak / medium / strong', () => {
    const list = [
      st({ reps: 1, interval: 1 }),
      st({ reps: 2, interval: 6 }),
      st({ reps: 3, interval: 15 }),
      st({ reps: 5, interval: 40, ease: 2.6 }),
      st({ reps: 4, interval: 30, recent: '10100' }),
    ];
    expect(list.map((s) => skillStrength(s, undefined, ON))).toEqual(['weak', 'medium', 'medium', 'strong', 'weak']);
    expect(skillStrength(st({ reps: 5, interval: 40 }), '2026-09-26', ON)).toBe('weak'); // learned yesterday
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
  const strong = w('国', { reps: 5, interval: 30 });

  it("gives weak skills multiple choice in the skill's direction", () => {
    expect(chooseExercise(weak, 'meaning', { listening: true, on: ON })).toEqual({ ex: 'choice', dir: 'zh-en' });
    expect(chooseExercise(weak, 'pinyin', { listening: true, on: ON })).toEqual({ ex: 'choice', dir: 'zh-py' });
    expect(chooseExercise(weak, 'recall', { listening: true, on: ON })).toEqual({ ex: 'choice', dir: 'en-zh' });
  });

  it('gives medium pinyin listening sometimes (when audio is available)', () => {
    expect(chooseExercise(medium, 'pinyin', { listening: true, rnd: fixed(0.1), on: ON }).ex).toBe('listen');
    expect(chooseExercise(medium, 'pinyin', { listening: true, rnd: fixed(0.9), on: ON }).ex).toBe('choice');
    expect(chooseExercise(medium, 'pinyin', { listening: false, rnd: fixed(0.1), on: ON }).ex).toBe('choice');
  });

  it('types recall once it is not weak, pinyin once strong; meaning is always multiple choice', () => {
    expect(chooseExercise(medium, 'recall', { listening: true, on: ON })).toEqual({ ex: 'typing', dir: 'en-zh' });
    expect(chooseExercise(strong, 'pinyin', { listening: true, on: ON })).toEqual({ ex: 'typing', dir: 'zh-py' });
    expect(chooseExercise(strong, 'meaning', { listening: true, on: ON })).toEqual({ ex: 'choice', dir: 'zh-en' });
  });

  it('only gives radical-only entries multiple choice', () => {
    const radical = w('氵', { reps: 6, interval: 60, ease: 2.7 });
    expect(chooseExercise(radical, 'recall', { listening: true, on: ON }).ex).toBe('choice');
  });
});

describe('cards', () => {
  const opts = { mode: 'auto' as const, listening: false, on: ON };

  it('asks meaning and pinyin on one two-step card', () => {
    const word = w('好', { reps: 1, interval: 1 });
    expect(cardsFor(word, ['pinyin'], opts)[0].card).toEqual({ kind: 'pair', p: 'choice' });
    const strongPinyin = w('好', { reps: 5, interval: 30 });
    expect(cardsFor(strongPinyin, ['meaning'], opts)[0].card).toEqual({ kind: 'pair', p: 'typing' });
  });

  it('gives recall its own card; flashcards have rows per skill', () => {
    const word = w('好', { reps: 5, interval: 30 });
    expect(cardsFor(word, ['recall'], opts)[0].card).toEqual({ kind: 'single', skill: 'recall', ex: 'typing', dir: 'en-zh' });
    expect(cardsFor(word, ['meaning', 'recall'], { ...opts, mode: 'flashcards' }).map((s) => s.card)).toEqual([
      { kind: 'flash', dir: 'zh-en', skills: ['meaning', 'pinyin'] },
      { kind: 'flash', dir: 'en-zh', skills: ['recall'] },
    ]);
  });

  it('asks radical-only entries meaning on its own', () => {
    expect(cardsFor(w('氵', {}), ['meaning'], opts)[0].card).toMatchObject({ kind: 'single', skill: 'meaning' });
  });

  it('makes a missed card easier when it comes back', () => {
    const word = w('好', { reps: 5, interval: 30 });
    expect(retryOf(cardsFor(word, ['meaning'], opts)[0]).card).toEqual({ kind: 'pair', p: 'choice' });
    expect(retryOf(cardsFor(word, ['recall'], opts)[0]).card).toMatchObject({ ex: 'choice' });
  });

  it('grades every skill the card tests, and uses the chosen skill', () => {
    const word = w('好', { reps: 5, interval: 30 });
    const step = practiceCard(word, 'mixed', { ...opts, skill: 'recall' });
    expect(testedSkills(step.card)).toEqual(['recall']);
    expect(step.scheduled).toEqual(['recall']);
    expect(practiceCard(word, 'mixed', { ...opts, skill: 'pinyin' }).scheduled).toEqual(['meaning', 'pinyin']);
  });

  it('never shows the same word twice in a row when it can be avoided', () => {
    expect(spreadSteps([{ id: 'a' }, { id: 'a' }, { id: 'b' }]).map((s) => s.id)).toEqual(['a', 'b', 'a']);
  });
});

describe('writing is hidden', () => {
  it('never adds the writing skill', () => {
    expect(activeSkills(w('好', { reps: 3, interval: 30 }), true)).toEqual(['meaning', 'pinyin', 'recall']);
  });
});

describe('priority and sessions', () => {
  const fresh = w('新', { reps: 1, interval: 1, lastReviewed: '2026-09-26', due: '2026-09-27' }, {}, { learnedOn: '2026-09-26' });
  const forgotten = w('忘', { reps: 3, interval: 4, lastReviewed: '2026-08-01', due: '2026-08-05' });
  const missed = w('错', { reps: 4, interval: 20, lastReviewed: '2026-09-20', due: '2026-10-10', recent: '01010', answered: 10, correct: 5 });
  const solid = w('好', { reps: 6, interval: 60, lastReviewed: '2026-09-20', due: '2026-11-19', recent: '11111', answered: 10, correct: 10 });

  it('puts likely-forgotten, recently missed and low-accuracy skills first', () => {
    const p = (x: Word) => skillPriority(x.skills.meaning!, x.learnedOn, NOW);
    expect(p(forgotten)).toBeGreaterThan(p(solid));
    expect(p(missed)).toBeGreaterThan(p(solid));
  });

  it('takes about 80% from the top and 20% at random from the rest, one card per word', () => {
    const many = Array.from({ length: 20 }, (_, i) => w(`字${i}`, { reps: 6, interval: 60, lastReviewed: '2026-09-20', due: '2026-11-19', recent: '11111', answered: 10, correct: 10 }));
    const pool = [forgotten, missed, solid, ...many];
    const picked = pickSession(pool, 10, { now: NOW, rnd: fixed(0.5) });
    expect(picked).toHaveLength(10);
    expect(new Set(picked.map((x) => x.word.id)).size).toBe(10);
    expect(picked.map((x) => x.word.id)).toContain('忘');
    expect(picked.map((x) => x.word.id)).toContain('错');
  });

  it('never picks new words, and uses everything when the pool is small', () => {
    const newWord: Word = { ...w('新', {}), skills: {} };
    expect(pickSession([newWord, solid], 20, { now: NOW }).map((x) => x.word.id)).toEqual(['好']);
  });

  it('counts rusty words for the balance hint', () => {
    expect(isRusty(forgotten, NOW)).toBe(true);
    expect(isRusty(solid, NOW)).toBe(false);
    void fresh;
    expect(balanceHint([forgotten, solid], NOW)).toMatchObject({ rusty: 1, learned: 2, refresh: false });
    const rustyMany = Array.from({ length: 6 }, (_, i) => w(`锈${i}`, { reps: 3, interval: 4, lastReviewed: '2026-08-01', due: '2026-08-05' }));
    expect(balanceHint([...rustyMany, solid], NOW).refresh).toBe(true);
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

describe('answer stats', () => {
  it('keeps totals and the last five results', () => {
    let s = newSrs(ON);
    for (const ok of [true, false, true, true, true, false]) s = recordAnswer(s, ok, NOW);
    expect([s.answered, s.correct, s.recent]).toEqual([6, 4, '01110']);
  });
});

describe('isLessonTag', () => {
  it('groups lesson tags apart from topics', () => {
    expect(['HSK lesson 1', 'lesson 3', 'Lesson5', 'HSK1', 'food', 'lessons learned'].map(isLessonTag)).toEqual([true, true, false, false, false, false]);
  });
});
