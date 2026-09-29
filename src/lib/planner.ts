/**
 * The study planner: how strong each skill of a learned word is, which exercise a card gets,
 * how review cards are ordered, and which words Practice should pick. Pure functions
 * (randomness is passed in) so they can be unit-tested.
 */
import { diffDays, today } from './date';
import { isRadicalOnly } from './learn';
import { accuracy, activeSkills, dueSkills, isLearned, SKILL_DIR, skillState } from './srs';
import type { CardDirection, Direction, PracticeMode, Skill, SkillState, Word } from './types';

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

// ---------- Cards ----------

/** How a step of the two-step card is answered. */
export type Part = 'choice' | 'typing';

/**
 * One card in a session.
 * - pair: the two-step card, meaning then pinyin, for the same hanzi;
 * - single: one skill (multiple choice, typing, listening or writing);
 * - flash: a flashcard with one grade row per skill;
 * - cloze: a sentence with the word blanked out (meaning + recall).
 */
export type Card =
  | { kind: 'pair'; m: Part; p: Part }
  | { kind: 'single'; skill: Skill; ex: Exercise; dir: CardDirection }
  | { kind: 'flash'; dir: CardDirection; skills: Skill[] }
  | { kind: 'cloze' };

export interface Step {
  id: string;
  card: Card;
  /** Skills whose schedule this card may change (Review: the due ones). Others only record accuracy. */
  scheduled: Skill[];
}

/** The skills a card tests. */
export function testedSkills(card: Card): Skill[] {
  switch (card.kind) {
    case 'pair':
      return ['meaning', 'pinyin'];
    case 'single':
      return [card.skill];
    case 'flash':
      return card.skills;
    case 'cloze':
      return ['meaning', 'recall'];
  }
}

/** Session mode: 'auto' picks each card from the skill's strength; otherwise the chosen practice mode. */
export type SessionMode = PracticeMode | 'auto';

interface PlanOpts {
  mode: SessionMode;
  listening: boolean;
  /** Choice mode: 'match' puts several words on one card, so each card tests a single skill. */
  choiceStyle?: 'single' | 'match';
  rnd?: () => number;
  on?: string;
}

const partFor = (w: Word, k: Skill, on?: string): Part => {
  const s = skillStrength(skillState(w, k, on), w.learnedOn, on);
  return s === 'strong' || s === 'veryStrong' ? 'typing' : 'choice';
};

/**
 * The cards that test a word's `skills` (Review: its due skills). Meaning and pinyin share the
 * two-step card (asking both even if only one is due), recall gets its own card, writing a
 * writing card. Radical-only entries have no pinyin: meaning is asked on its own.
 */
export function cardsFor(w: Word, skills: Skill[], opts: PlanOpts): Step[] {
  const { mode } = opts;
  const on = opts.on;
  const radical = isRadicalOnly(w);
  const has = (k: Skill) => skills.includes(k);
  const mp = skills.filter((k) => k === 'meaning' || k === 'pinyin');
  const steps: Step[] = [];
  const add = (card: Card, scheduled: Skill[]) => steps.push({ id: w.id, card, scheduled });
  const single = (skill: Skill, ex: Exercise): Card => ({ kind: 'single', skill, ex, dir: SKILL_DIR[skill] });

  if (mode === 'sentence' && (has('meaning') || has('recall')) && !radical) {
    add({ kind: 'cloze' }, skills.filter((k) => k === 'meaning' || k === 'recall'));
    if (has('pinyin')) add({ kind: 'pair', m: 'choice', p: 'choice' }, ['pinyin']);
  } else if (mp.length) {
    if (radical) add(mode === 'flashcards' ? { kind: 'flash', dir: 'zh-en', skills: ['meaning'] } : single('meaning', mode === 'typing' ? 'typing' : 'choice'), ['meaning']);
    else if (mode === 'flashcards') add({ kind: 'flash', dir: 'zh-en', skills: ['meaning', 'pinyin'] }, mp);
    else if (mode === 'choice' && opts.choiceStyle === 'match' && mp.length === 1) add(single(mp[0], 'choice'), mp);
    else if (mode === 'typing') add({ kind: 'pair', m: 'typing', p: 'typing' }, mp);
    else if (mode === 'auto' && mp.length === 1 && mp[0] === 'pinyin' && chooseExercise(w, 'pinyin', opts).ex === 'listen') add(single('pinyin', 'listen'), mp);
    else if (mode === 'auto') add({ kind: 'pair', m: partFor(w, 'meaning', on), p: partFor(w, 'pinyin', on) }, mp);
    else add({ kind: 'pair', m: 'choice', p: 'choice' }, mp);
  }
  if (has('recall') && !(mode === 'sentence' && !radical)) {
    if (mode === 'flashcards') add({ kind: 'flash', dir: 'en-zh', skills: ['recall'] }, ['recall']);
    else if (mode === 'auto') add(single('recall', chooseExercise(w, 'recall', opts).ex), ['recall']);
    else add(single('recall', mode === 'typing' ? 'typing' : 'choice'), ['recall']);
  }
  if (has('writing')) add(single('writing', 'writing'), ['writing']);
  return steps;
}

/** Cards for everything due on the given words. */
export const reviewCards = (words: Word[], opts: PlanOpts): Step[] => words.flatMap((w) => cardsFor(w, dueSkills(w, opts.on), opts));

/** How many review cards the due words make (for "X reviews"; the mode barely changes it). */
export const reviewCount = (words: Word[], on: string = today()): number =>
  reviewCards(words, { mode: 'choice', listening: false, on }).length;

/**
 * Practice: one card per word. Automatic: the word's weakest skill. Manual: the card direction
 * decides (中 → EN and 中 → 拼音 use the two-step card, EN → 中 tests recall).
 */
export function practiceCard(w: Word, direction: Direction, opts: PlanOpts): Step {
  const rnd = opts.rnd ?? Math.random;
  let skill: Skill;
  if (opts.mode === 'auto') skill = weakestSkill(w, opts.on) ?? 'meaning';
  else if (opts.mode === 'writing') skill = 'writing';
  else if (opts.mode === 'sentence') skill = 'recall';
  else {
    const dirs: CardDirection[] = ['zh-en', 'en-zh', 'zh-py'];
    const dir = direction === 'mixed' ? dirs[Math.floor(rnd() * dirs.length)] : direction;
    skill = dir === 'zh-en' ? 'meaning' : dir === 'zh-py' ? 'pinyin' : 'recall';
    if (skill === 'pinyin' && isRadicalOnly(w)) skill = 'meaning';
  }
  const [step] = cardsFor(w, [skill], opts);
  // Practice: every skill the card tests counts (a miss brings it forward).
  return { ...step, scheduled: testedSkills(step.card) };
}

/** The easier card a missed one becomes when it comes back later in the same session. */
export function retryOf(step: Step): Step {
  const { card } = step;
  if (card.kind === 'pair') return { ...step, card: { kind: 'pair', m: 'choice', p: 'choice' } };
  if (card.kind === 'single' && (card.ex === 'typing' || card.ex === 'listen')) return { ...step, card: { ...card, ex: 'choice' } };
  return step;
}

/**
 * Order cards most overdue first, without showing the same word twice in a row
 * (when that can't be avoided, e.g. only one word left, it still comes).
 */
export function orderSteps(steps: Step[], words: Map<string, Word>, rnd: () => number = Math.random, on: string = today()): Step[] {
  const dueOf = (s: Step) => {
    const w = words.get(s.id);
    return w ? s.scheduled.map((k) => skillState(w, k, on).due).sort()[0] ?? on : on;
  };
  const rest = steps
    .map((s) => ({ s, key: dueOf(s), r: rnd() }))
    .sort((a, b) => a.key.localeCompare(b.key) || a.r - b.r)
    .map((x) => x.s);
  const out: Step[] = [];
  while (rest.length) {
    const prev = out[out.length - 1]?.id;
    const i = Math.max(0, rest.findIndex((s) => s.id !== prev));
    out.push(rest.splice(i, 1)[0]);
  }
  return out;
}

// ---------- Lessons vs topics ----------

export const isLessonTag = (t: string) => /^(hsk\s*)?lesson\b/i.test(t.trim());
