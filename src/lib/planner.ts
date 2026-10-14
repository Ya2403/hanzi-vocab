/**
 * The study planner: how strong each skill of a learned word is, how much it needs practice
 * (priority), which exercise a card gets, and which words a Practice session includes. Pure
 * functions (randomness and time are passed in) so they can be unit-tested.
 */
import { diffDays, today } from './date';
import { retrievability, stability } from './fsrs';
import { isRadicalOnly } from './learn';
import { accuracy, activeSkills, isLearned, SKILL_DIR, skillState } from './srs';
import type { CardDirection, Direction, PracticeMode, Skill, SkillState, Word } from './types';

export type Strength = 'weak' | 'medium' | 'strong';
export type Exercise = 'choice' | 'listen' | 'typing' | 'writing';

export interface PlannedCard {
  ex: Exercise;
  dir: CardDirection;
}

const STRENGTH_RANK: Record<Strength, number> = { weak: 0, medium: 1, strong: 2 };

const misses = (s: SkillState) => [...(s.recent ?? '')].filter((c) => c === '0').length;

/** Stability (days) from which a skill counts as strong, and below which it is weak. */
export const STRONG_STABILITY = 21;
export const WEAK_STABILITY = 3;

/**
 * Strength of one skill:
 * - weak: learned in the last 2 days, struggling (2+ recent misses, accuracy under 60%), or a
 *   memory that lasts less than 3 days;
 * - strong: a memory that lasts 3 weeks or more;
 * - medium: everything in between.
 */
export function skillStrength(s: SkillState, learnedOn: string | undefined, on: string = today()): Strength {
  const acc = accuracy(s);
  const recentlyLearned = !!learnedOn && diffDays(learnedOn, on) < 2;
  const stab = stability(s);
  if (recentlyLearned || misses(s) >= 2 || (acc !== null && s.answered! >= 3 && acc < 0.6) || stab < WEAK_STABILITY) return 'weak';
  return stab >= STRONG_STABILITY ? 'strong' : 'medium';
}

/** The skill a word is weakest at (lowest strength, then lowest stability). */
export function weakestSkill(w: Word, on: string = today()): Skill | null {
  let best: Skill | null = null;
  let bestKey = Infinity;
  for (const k of activeSkills(w)) {
    const s = skillState(w, k, on);
    const key = STRENGTH_RANK[skillStrength(s, w.learnedOn, on)] * 10_000 + stability(s);
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
 * - meaning: always multiple choice 中→EN;
 * - pinyin: multiple choice 中→拼音, sometimes listening once it isn't weak (pinyin is never typed);
 * - recall: multiple choice EN→中 while weak, then typing the characters;
 * - writing: always writing.
 * Radical-only entries (氵…) have no reading of their own: always multiple choice.
 */
export function chooseExercise(w: Word, skill: Skill, opts: { listening: boolean; rnd?: () => number; on?: string }): PlannedCard {
  const rnd = opts.rnd ?? Math.random;
  const dir = SKILL_DIR[skill];
  if (skill === 'writing') return { ex: 'writing', dir };
  if (isRadicalOnly(w)) return { ex: 'choice', dir };
  // Meaning is always recognised from options (typing English translations isn't useful practice).
  if (skill === 'meaning') return { ex: 'choice', dir };
  const st = skillStrength(skillState(w, skill, opts.on), w.learnedOn, opts.on);
  // Recall: type the characters once it isn't weak any more.
  if (skill === 'recall' && st !== 'weak') return { ex: 'typing', dir };
  if (skill === 'pinyin' && st !== 'weak' && opts.listening && rnd() < 0.5) return { ex: 'listen', dir };
  return { ex: 'choice', dir };
}

// ---------- Priority ----------

/** A learned word is rusty when one of its skills is less than 70% likely to be remembered. */
export const RUSTY_RETRIEVABILITY = 0.7;
const DAY = 86_400_000;

/**
 * How much a skill needs practice now (higher first): most likely forgotten (low FSRS
 * retrievability) first, then recent misses (including reader lookups), then low accuracy.
 * Skills of words learned in the last 2 days get a boost.
 */
export function skillPriority(s: SkillState, learnedOn: string | undefined, now: number = Date.now()): number {
  const r = retrievability(s, now);
  const acc = accuracy(s);
  const fresh = !!learnedOn && diffDays(learnedOn, today()) < 2 && now - new Date(`${learnedOn}T00:00:00`).getTime() < 3 * DAY;
  return (1 - r) * 10 + misses(s) * 1.5 + (acc === null ? 0.5 : (1 - acc) * 3) + (fresh ? 3 : 0);
}

export interface WordPriority {
  word: Word;
  /** The skill that needs practice most, and its priority. */
  skill: Skill;
  priority: number;
}

export function wordPriority(w: Word, now: number = Date.now()): WordPriority | null {
  let best: WordPriority | null = null;
  for (const k of activeSkills(w)) {
    const p = skillPriority(skillState(w, k), w.learnedOn, now);
    if (!best || p > best.priority) best = { word: w, skill: k, priority: p };
  }
  return best;
}

/** Learned words with a skill under 70% retrievability. */
export const isRusty = (w: Word, now: number = Date.now()): boolean =>
  activeSkills(w).some((k) => retrievability(skillState(w, k), now) < RUSTY_RETRIEVABILITY);

// ---------- Cards ----------

/** How a step of the two-step card is answered (pinyin is never typed). */
export type Part = 'choice';

/**
 * One card in a session.
 * - pair: the two-step card, meaning then pinyin, for the same hanzi;
 * - single: one skill (multiple choice, typing, listening or writing);
 * - flash: a flashcard with one grade row per skill;
 */
export type Card =
  | { kind: 'pair'; p: Part }
  | { kind: 'single'; skill: Skill; ex: Exercise; dir: CardDirection }
  | { kind: 'flash'; dir: CardDirection; skills: Skill[] };

export interface Step {
  id: string;
  card: Card;
  /** Skills whose FSRS card this card updates (on the first answer of the session). Others only record accuracy. */
  scheduled: Skill[];
  /** Writing: the delayed recall a few cards later (blank grid only, not graded for the schedule). */
  delayed?: boolean;
  /** A word card: the character (id) whose `scheduled` skills it reviews. */
  target?: string;
}

/** The delayed recall of a writing card comes back this many cards later (at random within the range). */
export const DELAYED_RECALL = { min: 3, max: 5 };

/** The skills a card tests. */
export function testedSkills(card: Card): Skill[] {
  switch (card.kind) {
    case 'pair':
      return ['meaning', 'pinyin'];
    case 'single':
      return [card.skill];
    case 'flash':
      return card.skills;
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

/**
 * The cards that test a word's `skills`. Meaning and pinyin share the two-step card (asking
 * both), recall gets its own card, writing a writing card. Radical-only entries have no
 * pinyin: meaning is asked on its own.
 */
export function cardsFor(w: Word, skills: Skill[], opts: PlanOpts): Step[] {
  const { mode } = opts;
  const radical = isRadicalOnly(w);
  const has = (k: Skill) => skills.includes(k);
  const mp = skills.filter((k) => k === 'meaning' || k === 'pinyin');
  const steps: Step[] = [];
  const add = (card: Card, scheduled: Skill[]) => steps.push({ id: w.id, card, scheduled });
  const single = (skill: Skill, ex: Exercise): Card => ({ kind: 'single', skill, ex, dir: SKILL_DIR[skill] });

  if (mp.length) {
    if (radical) add(mode === 'flashcards' ? { kind: 'flash', dir: 'zh-en', skills: ['meaning'] } : single('meaning', 'choice'), ['meaning']);
    else if (mode === 'flashcards') add({ kind: 'flash', dir: 'zh-en', skills: ['meaning', 'pinyin'] }, mp);
    else if (mode === 'choice' && opts.choiceStyle === 'match' && mp.length === 1) add(single(mp[0], 'choice'), mp);
    else if (mode === 'auto' && mp.length === 1 && mp[0] === 'pinyin' && chooseExercise(w, 'pinyin', opts).ex === 'listen') add(single('pinyin', 'listen'), mp);
    else add({ kind: 'pair', p: 'choice' }, mp);
  }
  if (has('recall')) {
    if (mode === 'flashcards') add({ kind: 'flash', dir: 'en-zh', skills: ['recall'] }, ['recall']);
    else if (mode === 'auto') add(single('recall', chooseExercise(w, 'recall', opts).ex), ['recall']);
    else add(single('recall', mode === 'typing' ? 'typing' : 'choice'), ['recall']);
  }
  if (has('writing')) add(single('writing', 'writing'), ['writing']);
  return steps;
}

/**
 * One card for a word. Automatic: its highest-priority skill. Manual: the card direction
 * decides (中 → EN and 中 → 拼音 use the two-step card, EN → 中 tests recall).
 * Every skill the card tests is graded.
 */
export function practiceCard(w: Word, direction: Direction, opts: PlanOpts & { skill?: Skill }): Step {
  const rnd = opts.rnd ?? Math.random;
  let skill: Skill;
  if (opts.mode === 'auto') skill = opts.skill ?? wordPriority(w)?.skill ?? 'meaning';
  else if (opts.mode === 'writing') skill = 'writing';
  else {
    const dirs: CardDirection[] = ['zh-en', 'en-zh', 'zh-py'];
    const dir = direction === 'mixed' ? dirs[Math.floor(rnd() * dirs.length)] : direction;
    skill = dir === 'zh-en' ? 'meaning' : dir === 'zh-py' ? 'pinyin' : 'recall';
    if (skill === 'pinyin' && isRadicalOnly(w)) skill = 'meaning';
  }
  const [step] = cardsFor(w, [skill], opts);
  return { ...step, scheduled: testedSkills(step.card) };
}

/** The easier card a missed one becomes when it comes back later in the same session. */
export function retryOf(step: Step): Step {
  const { card } = step;
  if (card.kind === 'single' && (card.ex === 'typing' || card.ex === 'listen')) return { ...step, card: { ...card, ex: 'choice' } };
  return step;
}

/** Keep the order, but never the same word twice in a row (when avoidable). */
export function spreadSteps<T extends { id: string }>(steps: T[]): T[] {
  const rest = steps.slice();
  const out: T[] = [];
  while (rest.length) {
    const prev = out[out.length - 1]?.id;
    const i = Math.max(0, rest.findIndex((s) => s.id !== prev));
    out.push(rest.splice(i, 1)[0]);
  }
  return out;
}

// ---------- Practice sessions ----------

/** Share of a session taken from the highest-priority words; the rest are random stronger words. */
export const PRIORITY_SHARE = 0.8;

/**
 * The words of a practice session of `size` exercises (one card each): about 80% the
 * highest-priority words, about 20% picked at random from the rest, so strong words still come
 * up now and then. In a mixed order.
 */
export function pickSession(words: Word[], size: number, opts: { now?: number; rnd?: () => number } = {}): WordPriority[] {
  const rnd = opts.rnd ?? Math.random;
  const now = opts.now ?? Date.now();
  const ranked = words
    .filter(isLearned)
    .map((w) => wordPriority(w, now))
    .filter((x): x is WordPriority => !!x)
    // A little noise, so equal priorities don't always come in the same order.
    .map((x) => ({ x, key: x.priority + rnd() * 0.3 }))
    .sort((a, b) => b.key - a.key)
    .map((y) => y.x);
  const top = Math.min(ranked.length, Math.max(1, Math.round(size * PRIORITY_SHARE)));
  const chosen = ranked.slice(0, top);
  const rest = ranked.slice(top);
  for (let n = Math.min(size - chosen.length, rest.length); n > 0; n--) chosen.push(rest.splice(Math.floor(rnd() * rest.length), 1)[0]);
  // Mix the random ones in among the priority ones.
  for (let i = chosen.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [chosen[i], chosen[j]] = [chosen[j], chosen[i]];
  }
  return chosen;
}

/** Balance hint: many rusty characters → refresh first; few → a good time to learn new ones. */
export function balanceHint(words: Word[], now: number = Date.now()): { rusty: number; learned: number; refresh: boolean } {
  const learned = words.filter((w) => activeSkills(w).length > 0);
  const rusty = learned.filter((w) => isRusty(w, now)).length;
  return { rusty, learned: learned.length, refresh: rusty >= Math.max(5, learned.length * 0.2) };
}

// ---------- Lessons vs topics ----------

export const isLessonTag = (t: string) => /^(hsk\s*)?lesson\b/i.test(t.trim());
