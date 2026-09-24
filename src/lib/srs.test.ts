import { describe, expect, it } from 'vitest';
import { applyReview, Grade, leechLapses, newSrs, reviewWithLeech, unmarkLeech } from './srs';
import type { SrsState } from './types';

const DAY = '2026-09-24';
const graduated = (): SrsState => applyReview(newSrs(DAY), Grade.Good, DAY); // interval 1

describe('lapses', () => {
  it('does not count Again on a word that never graduated', () => {
    const s = applyReview(newSrs(DAY), Grade.Again, DAY);
    expect(s.lapses).toBe(0);
  });

  it('counts Again once the interval is at least a day', () => {
    const s = applyReview(graduated(), Grade.Again, DAY);
    expect(s.lapses).toBe(1);
  });

  it('keeps counting repeated misses (interval resets to 1 day, still graduated)', () => {
    let s = graduated();
    for (let i = 0; i < 3; i++) s = applyReview(s, Grade.Again, DAY);
    expect(s.lapses).toBe(3);
  });

  it('does not count Hard as a lapse', () => {
    expect(applyReview(graduated(), Grade.Hard, DAY).lapses).toBe(0);
  });
});

describe('leeches', () => {
  it('becomes a leech exactly when reaching the threshold, and reports it once', () => {
    let s = graduated();
    const flags: boolean[] = [];
    for (let i = 0; i < 6; i++) {
      const r = reviewWithLeech(s, Grade.Again, 5, DAY);
      flags.push(r.becameLeech);
      s = r.srs;
    }
    expect(flags).toEqual([false, false, false, false, true, false]);
    expect(s.leech).toBe(true);
    expect(s.lapses).toBe(6);
  });

  it('keeps the leech flag through later reviews', () => {
    const s = { ...graduated(), leech: true };
    expect(applyReview(s, Grade.Good, DAY).leech).toBe(true);
  });

  it('after unmarking, needs a full threshold of new lapses to flag again', () => {
    let s = unmarkLeech({ ...graduated(), lapses: 5, leech: true });
    expect(s.leech).toBe(false);
    expect(leechLapses(s)).toBe(0);
    const flags: boolean[] = [];
    for (let i = 0; i < 3; i++) {
      const r = reviewWithLeech(s, Grade.Again, 3, DAY);
      flags.push(r.becameLeech);
      s = r.srs;
    }
    expect(flags).toEqual([false, false, true]);
  });

  it('reset progress clears lapses and the leech mark', () => {
    const s = newSrs(DAY);
    expect(s.lapses).toBe(0);
    expect(s.leech).toBeUndefined();
  });
});
