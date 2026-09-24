import { addDays, today } from './date';
import type { SrsState, Word } from './types';

/** Quality grades (SM-2 uses 0–5; anything below 3 counts as a failure). */
export const Grade = { Again: 1, Hard: 3, Good: 4, Easy: 5 } as const;

export function newSrs(on: string = today()): SrsState {
  return { ease: 2.5, interval: 0, reps: 0, lapses: 0, due: on };
}

/** Apply one SM-2 review with quality `q` (0–5) on date `on`. */
export function applyReview(s: SrsState, q: number, on: string = today()): SrsState {
  let { interval, reps, lapses } = s;
  if (q < 3) {
    // A lapse: forgetting a word that had graduated to day-long intervals.
    if (s.interval >= 1) lapses += 1;
    reps = 0;
    interval = 1;
  } else {
    reps += 1;
    if (reps === 1) interval = 1;
    else if (reps === 2) interval = 6;
    else interval = Math.max(interval + 1, Math.round(interval * s.ease));
  }
  const ease = Math.max(1.3, s.ease + 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  return {
    ...s, // keeps leech flags
    ease: Math.round(ease * 100) / 100,
    interval,
    reps,
    lapses,
    due: addDays(on, interval),
    lastReviewed: on,
  };
}

// ---------- Leeches ----------

export const isLeech = (w: Word): boolean => !!w.srs.leech;

/** Pseudo-tag used by the word list filter and the Practice source picker (e.g. #practice?tag=…). */
export const LEECH_FILTER = '__leeches__';

/** Lapses that count toward the leech threshold (only those since the last "Unmark leech"). */
export const leechLapses = (s: SrsState): number => s.lapses - (s.lapsesAtUnmark ?? 0);

/** Apply a review and flag the word as a leech the moment a lapse brings it to `threshold`. */
export function reviewWithLeech(s: SrsState, q: number, threshold: number, on: string = today()) {
  const next = applyReview(s, q, on);
  const becameLeech = !s.leech && next.lapses > s.lapses && leechLapses(next) >= threshold;
  return { srs: becameLeech ? { ...next, leech: true } : next, becameLeech };
}

export const unmarkLeech = (s: SrsState): SrsState => ({ ...s, leech: false, lapsesAtUnmark: s.lapses });

export const isDue = (w: Word, on: string = today()): boolean => w.srs.due <= on;
export const isNew = (w: Word): boolean => w.srs.reps === 0 && !w.srs.lastReviewed;

export function formatInterval(days: number): string {
  if (days < 1) return 'now';
  if (days < 30) return `${days}d`;
  if (days < 365) return `${Math.round(days / 30)}mo`;
  return `${(days / 365).toFixed(1)}y`;
}
