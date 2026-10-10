import { describe, expect, it } from 'vitest';
import { fsrsReview, learnedState, retrievability, stability, toCard } from './fsrs';
import type { SkillState } from './types';

const at = (day: string) => new Date(`${day}T12:00:00`).getTime();
const sm2 = (x: Partial<SkillState>): SkillState => ({ ease: 2.5, interval: 10, reps: 3, lapses: 1, due: '2026-10-11', lastReviewed: '2026-10-01', ...x });

describe('FSRS', () => {
  it('estimates a card from SM-2 data: interval as stability, counts as they are', () => {
    const card = toCard(sm2({}));
    expect([card.stability, card.reps, card.lapses]).toEqual([10, 3, 1]);
    expect(toCard(sm2({ ease: 1.3 })).difficulty).toBeGreaterThan(card.difficulty);
  });

  it('is about 90% likely to be remembered after one stability, and drops when late', () => {
    expect(retrievability(sm2({}), at('2026-10-11'))).toBeCloseTo(0.9, 1);
    expect(retrievability(sm2({}), at('2026-11-30'))).toBeLessThan(0.8);
    expect(retrievability({ ease: 2.5, interval: 0, reps: 0, lapses: 0, due: '2026-10-01' })).toBe(0);
  });

  it('grows stability more for a late correct review than an early one', () => {
    const early = fsrsReview(sm2({}), 4, at('2026-10-03'));
    const late = fsrsReview(sm2({}), 4, at('2026-11-10'));
    expect(stability(late)).toBeGreaterThan(stability(early));
    expect(early.fsrs).toBeDefined();
    expect(early.lastReviewed).toBe('2026-10-03');
  });

  it('a miss counts as a lapse and brings the review close', () => {
    const r = fsrsReview(sm2({}), 1, at('2026-10-11'));
    expect(r.lapses).toBe(2);
    expect(r.interval).toBeLessThanOrEqual(2);
    expect(stability(r)).toBeLessThan(10);
  });

  it('a newly learned skill is reviewed soon and its statistics stay', () => {
    const s = learnedState(at('2026-10-10'));
    expect(s.reps).toBe(1);
    expect(s.interval).toBeGreaterThanOrEqual(1);
    expect(s.interval).toBeLessThanOrEqual(5);
    const again = fsrsReview({ ...s, answered: 3, correct: 2 }, 3, at('2026-10-12'));
    expect([again.answered, again.correct, again.reps]).toEqual([3, 2, 2]);
  });
});
