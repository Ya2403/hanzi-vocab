/**
 * Reviewing learned sentences: due skills (understand / produce), which exercise each card gets,
 * and which sentences Practice picks. Pure functions (randomness passed in), unit-tested.
 */
import { today } from './date';
import { skillStrength, skillWeakness } from './planner';
import { isSentenceLearned } from './sentenceLearn';
import { isLearned, newSrs } from './srs';
import type { Sentence, SentenceSkill, SkillState, Word } from './types';

export const SENTENCE_SKILLS: SentenceSkill[] = ['understand', 'produce'];
export const SENTENCE_SKILL_LABEL: Record<SentenceSkill, string> = { understand: 'understand', produce: 'produce' };

/**
 * translate: read it, pick the translation · listen: hear it, pick the translation
 * cloze: fill in a blanked word you know · build: tap the word tiles in order
 * response: pick the reply to the line before it (dialogue lines only)
 */
export type SentenceExercise = 'translate' | 'listen' | 'cloze' | 'build' | 'response';

export interface SentenceStep {
  type: 'sentence';
  id: string;
  skill: SentenceSkill;
  ex: SentenceExercise;
  /** Review: the skill is due (its schedule changes). Practice: misses bring it forward. */
  scheduled: boolean;
}

export const isSentenceStep = (s: unknown): s is SentenceStep => (s as SentenceStep | undefined)?.type === 'sentence';

export const sentenceSkillState = (s: Sentence, k: SentenceSkill, on: string = today()): SkillState => s.skills?.[k] ?? newSrs(on);

export const dueSentenceSkills = (s: Sentence, on: string = today()): SentenceSkill[] =>
  isSentenceLearned(s) ? SENTENCE_SKILLS.filter((k) => sentenceSkillState(s, k, on).due <= on) : [];

export const isSentenceDue = (s: Sentence, on: string = today()) => dueSentenceSkills(s, on).length > 0;

/** The earliest review date of a learned sentence. */
export const sentenceNextDue = (s: Sentence, on: string = today()): string | null =>
  isSentenceLearned(s) ? SENTENCE_SKILLS.map((k) => sentenceSkillState(s, k, on).due).sort()[0] : null;

/** What a sentence offers for exercises. */
export interface SentenceContext {
  /** Audio exercises are possible (speech available and listening not paused). */
  listening: boolean;
  /** It's a dialogue line with a line before it. */
  canRespond: boolean;
  /** It contains a learned word that can be blanked. */
  canCloze: boolean;
}

/**
 * The exercise for a card, by the skill's strength:
 * - weak: understand → translate · produce → fill the blank (or build)
 * - medium: understand → listen or dialogue response · produce → fill the blank (or build)
 * - strong: understand → listen / dialogue response · produce → build the sentence
 */
export function chooseSentenceExercise(s: Sentence, skill: SentenceSkill, ctx: SentenceContext, rnd: () => number = Math.random, on?: string): SentenceExercise {
  const st = skillStrength(sentenceSkillState(s, skill, on), s.learnedOn, on);
  if (skill === 'produce') return st === 'weak' || st === 'medium' ? (ctx.canCloze ? 'cloze' : 'build') : 'build';
  if (st === 'weak') return 'translate';
  const options: SentenceExercise[] = [...(ctx.listening ? (['listen'] as const) : []), ...(ctx.canRespond ? (['response'] as const) : [])];
  return options.length ? options[Math.floor(rnd() * options.length)] : 'translate';
}

/** The easier card a missed sentence card becomes when it comes back in the same session. */
export const sentenceRetry = (step: SentenceStep, ctx: SentenceContext): SentenceStep => ({
  ...step,
  ex: step.skill === 'understand' ? 'translate' : ctx.canCloze ? 'cloze' : 'build',
});

/** One card per due skill. */
export function sentenceReviewSteps(sentences: Sentence[], ctxOf: (s: Sentence) => SentenceContext, rnd: () => number = Math.random, on: string = today()): SentenceStep[] {
  return sentences.flatMap((s) =>
    dueSentenceSkills(s, on).map((skill) => ({ type: 'sentence' as const, id: s.id, skill, ex: chooseSentenceExercise(s, skill, ctxOf(s), rnd, on), scheduled: true })),
  );
}

export const sentenceReviewCount = (sentences: Sentence[], on: string = today()) => sentences.reduce((n, s) => n + dueSentenceSkills(s, on).length, 0);

/** How much a sentence needs practice: its weaker skill. */
export const sentenceWeakness = (s: Sentence, on: string = today(), now: number = Date.now()) =>
  Math.max(...SENTENCE_SKILLS.map((k) => skillWeakness(sentenceSkillState(s, k, on), on, now)));

/** The `n` weakest learned sentences (a little shuffled so sessions vary). */
export function pickSentencePractice(sentences: Sentence[], n: number, opts: { on?: string; now?: number; rnd?: () => number } = {}): Sentence[] {
  const rnd = opts.rnd ?? Math.random;
  return sentences
    .filter(isSentenceLearned)
    .map((s) => ({ s, score: sentenceWeakness(s, opts.on, opts.now) + rnd() * 0.75 }))
    .sort((a, b) => b.score - a.score)
    .slice(0, n)
    .map((x) => x.s);
}

/** Practice: a card for the weaker skill of each sentence. */
export function sentencePracticeStep(s: Sentence, ctx: SentenceContext, rnd: () => number = Math.random, on?: string): SentenceStep {
  const [weaker] = [...SENTENCE_SKILLS].sort((a, b) => skillWeakness(sentenceSkillState(s, b, on), on) - skillWeakness(sentenceSkillState(s, a, on), on));
  return { type: 'sentence', id: s.id, skill: weaker, ex: chooseSentenceExercise(s, weaker, ctx, rnd, on), scheduled: true };
}

// ---------- Fill the blank ----------

/** Learned words of the sentence that appear in it as written (candidates for the blank). */
export const clozeCandidates = (s: Sentence, linked: Word[]): Word[] => linked.filter((w) => isLearned(w) && w.hanzi.trim() && s.zh.includes(w.hanzi.trim()));

/** The word to blank: preferably a longer one (more to recall), with some variety. */
export function clozeTarget(s: Sentence, linked: Word[], rnd: () => number = Math.random): Word | null {
  const list = clozeCandidates(s, linked);
  if (!list.length) return null;
  const scored = list.map((w) => ({ w, score: [...w.hanzi].length + rnd() * 1.5 })).sort((a, b) => b.score - a.score);
  return scored[0].w;
}

/** Four options: the blanked word plus learned words of similar length that don't appear in the sentence. */
export function clozeOptions(target: Word, s: Sentence, pool: Word[], n = 4, rnd: () => number = Math.random): Word[] {
  const len = [...target.hanzi].length;
  const others = pool
    .filter((w) => w.id !== target.id && isLearned(w) && w.hanzi !== target.hanzi && !s.zh.includes(w.hanzi))
    .map((w) => ({ w, score: Math.abs([...w.hanzi].length - len) + rnd() * 1.2 }))
    .sort((a, b) => a.score - b.score)
    .slice(0, n - 1)
    .map((x) => x.w);
  const all = [target, ...others];
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [all[i], all[j]] = [all[j], all[i]];
  }
  return all;
}

/** Practice sessions: about 30% sentences (when included), the rest words. */
export const SENTENCE_PRACTICE_SHARE = 0.3;

export function practiceSplit(size: number, learnedWords: number, learnedSentences: number, includeSentences: boolean) {
  const sentences = includeSentences ? Math.min(learnedSentences, Math.round(size * SENTENCE_PRACTICE_SHARE), size) : 0;
  const words = Math.min(learnedWords, size - sentences);
  // Few words: fill up with sentences.
  return { words, sentences: includeSentences ? Math.min(learnedSentences, size - words) : 0 };
}
