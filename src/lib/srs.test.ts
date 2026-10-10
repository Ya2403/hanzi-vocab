import { describe, expect, it } from 'vitest';
import { learnedState } from './fsrs';
import { applyReview, Grade, leechLapses, newSrs, reviewWithLeech, unmarkLeechSkill } from './srs';
import type { SrsState } from './types';

const DAY = '2026-09-24';
const T0 = new Date('2026-09-24T12:00:00').getTime();
const days = (n: number) => T0 + n * 86_400_000;

describe('SM-2 lapses (old data)', () => {
  const graduated = (): SrsState => applyReview(newSrs(DAY), Grade.Good, DAY); // interval 1
  it('does not count Again on a word that never graduated', () => {
    expect(applyReview(newSrs(DAY), Grade.Again, DAY).lapses).toBe(0);
  });
  it('counts Again once the interval is at least a day, but not Hard', () => {
    expect(applyReview(graduated(), Grade.Again, DAY).lapses).toBe(1);
    expect(applyReview(graduated(), Grade.Hard, DAY).lapses).toBe(0);
  });
});

describe('leeches (FSRS reviews)', () => {
  /** Miss the skill `n` times, a few days apart. */
  const missRepeatedly = (s: SrsState, n: number, threshold: number) => {
    const flags: boolean[] = [];
    for (let i = 0; i < n; i++) {
      const r = reviewWithLeech(s, Grade.Again, threshold, days(3 * (i + 1)));
      flags.push(r.becameLeech);
      s = r.srs;
    }
    return { s, flags };
  };

  it('counts each miss of a learned skill as a lapse and becomes a leech exactly at the threshold', () => {
    const { s, flags } = missRepeatedly(learnedState(T0), 6, 5);
    expect(s.lapses).toBe(6);
    expect(flags).toEqual([false, false, false, false, true, false]);
    expect(s.leech).toBe(true);
  });

  it('keeps the leech flag through later reviews', () => {
    const s = reviewWithLeech({ ...learnedState(T0), leech: true }, Grade.Good, 5, days(3)).srs;
    expect(s.leech).toBe(true);
  });

  it('after unmarking, needs a full threshold of new lapses to flag again', () => {
    const marked = { ...learnedState(T0), lapses: 5, leech: true };
    const unmarked = unmarkLeechSkill(marked);
    expect([unmarked.leech, leechLapses(unmarked)]).toEqual([false, 0]);
    expect(missRepeatedly(unmarked, 3, 3).flags).toEqual([false, false, true]);
  });

  it('reset progress clears lapses and the leech mark', () => {
    const s = newSrs(DAY);
    expect(s.lapses).toBe(0);
    expect(s.leech).toBeUndefined();
  });
});
