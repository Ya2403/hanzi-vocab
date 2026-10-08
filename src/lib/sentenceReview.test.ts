import { describe, expect, it } from 'vitest';
import { createSentence } from './sentences';
import {
  chooseSentenceExercise,
  clozeOptions,
  clozeTarget,
  dueSentenceSkills,
  pickSentencePractice,
  sentenceReviewCount,
  sentenceReviewSteps,
  sentenceRetry,
} from './sentenceReview';
import { newSrs } from './srs';
import type { Sentence, SkillState, Word } from './types';

const ON = '2026-10-08';
const st = (x: Partial<SkillState>): SkillState => ({ ...newSrs(ON), lastReviewed: '2026-10-01', due: '2026-11-01', reps: 2, interval: 6, ...x });
const s = (zh: string, u: Partial<SkillState> | null, p: Partial<SkillState> = {}, extra: Partial<Sentence> = {}): Sentence => ({
  ...createSentence({ zh, pinyin: 'x', translation: zh, tags: [] }, 0, `s-${zh}`),
  ...(u ? { skills: { understand: st(u), produce: st(p) }, learnedOn: '2026-09-01' } : {}),
  ...extra,
});
const learned = { meaning: st({}), pinyin: st({}), recall: st({}) };
const w = (hanzi: string, isLearned = true): Word => ({ id: `w-${hanzi}`, hanzi, pinyin: '', meaning: hanzi, tags: [], createdAt: 0, updatedAt: 0, skills: isLearned ? learned : {} });
const all = { listening: true, canRespond: true, canCloze: true };

describe('due sentence skills', () => {
  it('lists due skills of learned sentences only', () => {
    expect(dueSentenceSkills(s('我是学生。', { due: ON }), ON)).toEqual(['understand']);
    expect(dueSentenceSkills(s('你好！', null), ON)).toEqual([]);
    expect(sentenceReviewCount([s('a', { due: ON }, { due: '2026-10-01' }), s('b', {})], ON)).toBe(2);
  });

  it('makes one card per due skill', () => {
    const steps = sentenceReviewSteps([s('我是学生。', { due: ON }, { due: ON })], () => all, () => 0, ON);
    expect(steps.map((x) => [x.skill, x.scheduled])).toEqual([
      ['understand', true],
      ['produce', true],
    ]);
  });
});

describe('exercise choice', () => {
  it('weak: translate, and fill the blank (or build without a learned word)', () => {
    const weak = s('我是学生。', { reps: 1, interval: 1 }, { reps: 1, interval: 1 });
    expect(chooseSentenceExercise(weak, 'understand', all, () => 0, ON)).toBe('translate');
    expect(chooseSentenceExercise(weak, 'produce', all, () => 0, ON)).toBe('cloze');
    expect(chooseSentenceExercise(weak, 'produce', { ...all, canCloze: false }, () => 0, ON)).toBe('build');
  });

  it('medium: listen or dialogue response; strong produce: build', () => {
    const medium = s('我是学生。', { reps: 2, interval: 6 }, { reps: 3, interval: 15 });
    expect(chooseSentenceExercise(medium, 'understand', all, () => 0, ON)).toBe('listen');
    expect(chooseSentenceExercise(medium, 'understand', all, () => 0.9, ON)).toBe('response');
    expect(chooseSentenceExercise(medium, 'understand', { ...all, listening: false, canRespond: false }, () => 0, ON)).toBe('translate');
    expect(chooseSentenceExercise(medium, 'produce', all, () => 0, ON)).toBe('build');
  });

  it('retries a missed card as the easy exercise for its skill', () => {
    expect(sentenceRetry({ type: 'sentence', id: 'x', skill: 'understand', ex: 'listen', scheduled: true }, all).ex).toBe('translate');
    expect(sentenceRetry({ type: 'sentence', id: 'x', skill: 'produce', ex: 'build', scheduled: true }, all).ex).toBe('cloze');
  });
});

describe('fill the blank', () => {
  it('blanks a learned word of the sentence, longer ones first', () => {
    const sentence = s('我是学生。', {});
    expect(clozeTarget(sentence, [w('我'), w('学生'), w('是', false)], () => 0)!.hanzi).toBe('学生');
    expect(clozeTarget(sentence, [w('是', false)], () => 0)).toBeNull();
  });

  it('offers learned words of similar length that are not in the sentence', () => {
    const sentence = s('我是学生。', {});
    const opts = clozeOptions(w('学生'), sentence, [w('学生'), w('老师'), w('朋友'), w('我'), w('猫'), w('名字', false)], 4, () => 0);
    expect(opts).toHaveLength(4);
    expect(opts.map((x) => x.hanzi)).toContain('学生');
    expect(opts.map((x) => x.hanzi)).not.toContain('我');
    expect(opts.map((x) => x.hanzi)).not.toContain('名字');
  });
});

describe('practice', () => {
  it('picks the weakest learned sentences', () => {
    const solid = s('a', { reps: 5, interval: 30, answered: 10, correct: 10, recent: '11111' }, { reps: 5, interval: 30, answered: 10, correct: 10, recent: '11111' });
    const shaky = s('b', { reps: 2, interval: 3, answered: 6, correct: 3, recent: '01010' });
    expect(pickSentencePractice([solid, shaky, s('new', null)], 1, { on: ON, rnd: () => 0 }).map((x) => x.zh)).toEqual(['b']);
  });
});
