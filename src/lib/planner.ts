/**
 * The study planner: how strong each learned word is, which exercise it gets, and which words
 * Practice should pick. Pure functions (randomness is passed in) so they can be unit-tested.
 */
import { diffDays, today } from './date';
import { isRadicalOnly } from './learn';
import { accuracy, isLearned } from './srs';
import type { CardDirection, Word } from './types';

export type Strength = 'weak' | 'medium' | 'strong' | 'veryStrong';
export type Exercise = 'choice' | 'listen' | 'typing' | 'writing';

export interface PlannedCard {
  ex: Exercise;
  dir: CardDirection;
}

const misses = (w: Word) => [...(w.srs.recent ?? '')].filter((c) => c === '0').length;

/**
 * weak: recently learned or struggling (misses, low accuracy, low ease)
 * veryStrong: interval of 3+ weeks · strong: a week+ or 3+ successful reviews in a row · else medium
 */
export function strength(w: Word, on: string = today()): Strength {
  const s = w.srs;
  const acc = accuracy(s);
  const recentlyLearned = !!s.learnedOn && diffDays(s.learnedOn, on) < 3;
  if (recentlyLearned || s.reps <= 1 || misses(w) >= 2 || (acc !== null && s.answered! >= 3 && acc < 0.6) || s.ease < 1.8) return 'weak';
  if (s.interval >= 21) return 'veryStrong';
  if (s.interval >= 7 || s.reps >= 3) return 'strong';
  return 'medium';
}

/** Chance that a very strong word gets a writing card instead of typing. */
export const WRITING_CHANCE = 0.3;

/**
 * weak → multiple choice 中→EN · medium → listening or EN→中 choice (sometimes 中→拼音)
 * strong → typing (mixed directions) · very strong → typing, sometimes writing.
 * Radical-only entries (氵…) have no reading of their own: always recognition (choice).
 */
export function chooseExercise(w: Word, opts: { listening: boolean; rnd?: () => number; on?: string }): PlannedCard {
  const rnd = opts.rnd ?? Math.random;
  const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)];
  if (isRadicalOnly(w)) return { ex: 'choice', dir: rnd() < 0.5 ? 'zh-en' : 'en-zh' };
  switch (strength(w, opts.on)) {
    case 'weak':
      return { ex: 'choice', dir: 'zh-en' };
    case 'medium': {
      const r = rnd();
      if (opts.listening && r < 0.4) return { ex: 'listen', dir: 'zh-en' };
      return { ex: 'choice', dir: r < 0.85 ? 'en-zh' : 'zh-py' };
    }
    case 'strong':
      return { ex: 'typing', dir: pick<CardDirection>(['en-zh', 'en-zh', 'zh-en', 'zh-py']) };
    case 'veryStrong':
      return rnd() < WRITING_CHANCE ? { ex: 'writing', dir: 'en-zh' } : { ex: 'typing', dir: pick<CardDirection>(['en-zh', 'zh-py', 'zh-en']) };
  }
}

/** The easier card a missed word gets when it comes back later in the same session. */
export const RETRY_CARD: PlannedCard = { ex: 'choice', dir: 'zh-en' };

/**
 * How much a word needs practice (higher = weaker). Combines recent misses, overall accuracy,
 * low ease, how soon it's due, and how long since it was last seen.
 */
export function weakness(w: Word, on: string = today(), now: number = Date.now()): number {
  const s = w.srs;
  const acc = accuracy(s);
  const recentMisses = misses(w) * 1.5; // 0–7.5
  const lowAccuracy = (1 - (acc ?? 0.75)) * 4; // 0–4 (unknown ≈ 1)
  const lowEase = ((2.5 - Math.min(2.5, s.ease)) / 1.2) * 2; // 0–2
  const daysToDue = diffDays(on, s.due);
  const dueSoon = daysToDue <= 0 ? 2 : 2 / (1 + daysToDue); // 0–2
  const seen = s.lastSeen ?? (s.lastReviewed ? new Date(s.lastReviewed).getTime() : 0);
  const unseen = Math.min(1.5, (now - seen) / 86_400_000 / 14); // up to 1.5 after 3 weeks
  return recentMisses + lowAccuracy + lowEase + dueSoon + unseen;
}

/** Pick the `n` weakest learned words (with a little shuffle so sessions vary). */
export function pickPractice(words: Word[], n: number, opts: { on?: string; now?: number; rnd?: () => number } = {}): Word[] {
  const rnd = opts.rnd ?? Math.random;
  return words
    .filter(isLearned)
    .map((w) => ({ w, score: weakness(w, opts.on, opts.now) + rnd() * 0.75 }))
    .sort((a, b) => b.score - a.score)
    .slice(0, n)
    .map((x) => x.w);
}

// ---------- Lessons vs topics ----------

export const isLessonTag = (t: string) => /^(hsk\s*)?lesson\b/i.test(t.trim());
