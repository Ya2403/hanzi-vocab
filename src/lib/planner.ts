/**
 * The study planner: how strong each skill of a learned word is, which exercise a card gets,
 * how review cards are ordered, and which words Practice should pick. Pure functions
 * (randomness is passed in) so they can be unit-tested.
 */
import { diffDays, today } from './date';
import { isRadicalOnly } from './learn';
import { accuracy, activeSkills, dueSkills, isLearned, SKILL_DIR, skillState } from './srs';
import type { CardDirection, Skill, SkillState, Word } from './types';

export type Strength = 'weak' | 'medium' | 'strong' | 'veryStrong';
export type Exercise = 'choice' | 'listen' | 'typing' | 'writing';

export interface PlannedCard {
  ex: Exercise;
  dir: CardDirection;
}

const STRENGTH_RANK: Record<Strength, number> = { weak: 0, medium: 1, strong: 2, veryStrong: 3 };

const misses = (s: SkillState) => [...(s.recent ?? '')].filter((c) => c === '0').length;

/**
 * Strength of one skill. weak: recently learned or struggling (misses, low accuracy, low ease)
 * · veryStrong: interval of 3+ weeks · strong: a week+ or 3+ successful reviews in a row · else medium
 */
export function skillStrength(s: SkillState, learnedOn: string | undefined, on: string = today()): Strength {
  const acc = accuracy(s);
  const recentlyLearned = !!learnedOn && diffDays(learnedOn, on) < 3;
  if (recentlyLearned || s.reps <= 1 || misses(s) >= 2 || (acc !== null && s.answered! >= 3 && acc < 0.6) || s.ease < 1.8) return 'weak';
  if (s.interval >= 21) return 'veryStrong';
  if (s.interval >= 7 || s.reps >= 3) return 'strong';
  return 'medium';
}

/** The skill a word is weakest at (lowest strength, then shortest interval). */
export function weakestSkill(w: Word, on: string = today()): Skill | null {
  let best: Skill | null = null;
  let bestKey = Infinity;
  for (const k of activeSkills(w)) {
    const s = skillState(w, k, on);
    const key = STRENGTH_RANK[skillStrength(s, w.learnedOn, on)] * 10_000 + s.interval;
    if (key < bestKey) [best, bestKey] = [k, key];
  }
  return best;
}

/** A word is as strong as its weakest active skill. */
export function strength(w: Word, on: string = today()): Strength {
  const k = weakestSkill(w, on);
  return k ? skillStrength(skillState(w, k, on), w.learnedOn, on) : 'weak';
}

/**
 * The exercise for a card testing `skill`, by that skill's strength:
 * - meaning: multiple choice 中→EN, typing the meaning once strong;
 * - pinyin: multiple choice 中→拼音, then listening, typing pinyin once strong;
 * - recall: multiple choice EN→中, typing hanzi once strong;
 * - writing: always writing.
 * Radical-only entries (氵…) have no reading of their own: always multiple choice.
 */
export function chooseExercise(w: Word, skill: Skill, opts: { listening: boolean; rnd?: () => number; on?: string }): PlannedCard {
  const rnd = opts.rnd ?? Math.random;
  const dir = SKILL_DIR[skill];
  if (skill === 'writing') return { ex: 'writing', dir };
  if (isRadicalOnly(w)) return { ex: 'choice', dir };
  const st = skillStrength(skillState(w, skill, opts.on), w.learnedOn, opts.on);
  if (st === 'strong' || st === 'veryStrong') return { ex: 'typing', dir };
  if (skill === 'pinyin' && st === 'medium' && opts.listening && rnd() < 0.5) return { ex: 'listen', dir };
  return { ex: 'choice', dir };
}

/** The easier card a missed skill gets when it comes back later in the same session. */
export const retryCard = (skill: Skill): PlannedCard => ({ ex: 'choice', dir: SKILL_DIR[skill] });

/**
 * How much a skill needs practice (higher = weaker). Combines recent misses, overall accuracy,
 * low ease, how soon it's due, and how long since it was last seen.
 */
export function skillWeakness(s: SkillState, on: string = today(), now: number = Date.now()): number {
  const acc = accuracy(s);
  const recentMisses = misses(s) * 1.5; // 0–7.5
  const lowAccuracy = (1 - (acc ?? 0.75)) * 4; // 0–4 (unknown ≈ 1)
  const lowEase = ((2.5 - Math.min(2.5, s.ease)) / 1.2) * 2; // 0–2
  const daysToDue = diffDays(on, s.due);
  const dueSoon = daysToDue <= 0 ? 2 : 2 / (1 + daysToDue); // 0–2
  const seen = s.lastSeen ?? (s.lastReviewed ? new Date(s.lastReviewed).getTime() : 0);
  const unseen = Math.min(1.5, (now - seen) / 86_400_000 / 14); // up to 1.5 after 3 weeks
  return recentMisses + lowAccuracy + lowEase + dueSoon + unseen;
}

/** A word's weakness is that of its weakest skill. */
export function weakness(w: Word, on: string = today(), now: number = Date.now()): number {
  return Math.max(0, ...activeSkills(w).map((k) => skillWeakness(skillState(w, k, on), on, now)));
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

// ---------- Review cards ----------

export interface ReviewItem {
  word: Word;
  skill: Skill;
}

/** Every due skill of the given words, one card each. */
export function dueItems(words: Word[], on: string = today()): ReviewItem[] {
  return words.flatMap((word) => dueSkills(word, on).map((skill) => ({ word, skill })));
}

/**
 * Order review cards most overdue first, without showing the same word twice in a row
 * (when that can't be avoided, e.g. only one word left, it still comes).
 */
export function orderItems(items: ReviewItem[], rnd: () => number = Math.random, on: string = today()): ReviewItem[] {
  const rest = items
    .map((it) => ({ it, key: skillState(it.word, it.skill, on).due, r: rnd() }))
    .sort((a, b) => a.key.localeCompare(b.key) || a.r - b.r)
    .map((x) => x.it);
  const out: ReviewItem[] = [];
  while (rest.length) {
    const prev = out[out.length - 1]?.word.id;
    const i = Math.max(0, rest.findIndex((it) => it.word.id !== prev));
    out.push(rest.splice(i, 1)[0]);
  }
  return out;
}

// ---------- Lessons vs topics ----------

export const isLessonTag = (t: string) => /^(hsk\s*)?lesson\b/i.test(t.trim());
