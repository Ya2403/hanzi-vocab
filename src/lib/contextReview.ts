/**
 * Reviewing words in context: picking a sentence that contains the word (i+1 first), the
 * exercise for it (fill the blank, reply in the dialogue, read and check), and checking typed
 * Chinese. Pure functions (randomness passed in), unit-tested.
 */
import { skillStrength, type Card, type Step } from './planner';
import type { Links } from './sentences';
import { isLearned, skillState } from './srs';
import type { Dialogue, Sentence, Skill, Word } from './types';

/** "Use sentences in reviews": never, about 40% of the eligible reviews, or whenever possible. */
export type UseSentences = 'off' | 'some' | 'max';
export const SOME_SHARE = 0.4;
/** At most this many other session words are graded on one read-and-check card. */
export const MAX_ALSO = 2;

export type ContextExercise = 'cloze' | 'reply' | 'read';
export type ContextPart = 'choice' | 'typing' | 'tiles' | 'check';

export interface ContextCard {
  kind: 'context';
  ex: ContextExercise;
  part: ContextPart;
  skill: Skill;
  sentenceId: string;
  /** Read and check: other words of the session highlighted (and graded) in the same sentence. */
  alsoIds?: string[];
}

export const isContextCard = (c: Card | ContextCard): c is ContextCard => c.kind === 'context';

// ---------- Typed Chinese ----------

/** Ignore spaces and all punctuation (Chinese and Western); full-width digits/letters → normal. */
export function normalizeZh(s: string): string {
  return s
    .replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/　/g, ' ')
    .replace(/[\s\p{P}\p{S}]/gu, '');
}

export type DiffKind = 'ok' | 'missing' | 'extra' | 'wrong';
export interface DiffPart {
  ch: string;
  kind: DiffKind;
  /** For 'wrong': what was typed instead. */
  got?: string;
  /** Index in the expected text (ok / missing / wrong). */
  at?: number;
}

/**
 * Character-by-character comparison of a typed answer with the expected one (both normalized):
 * matching characters, missing ones, extra ones, and wrong ones (a missing and an extra at the
 * same place).
 */
export function diffChars(expected: string, got: string): DiffPart[] {
  const a = [...expected];
  const b = [...got];
  // Longest common subsequence table.
  const dp = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const raw: DiffPart[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      raw.push({ ch: a[i], kind: 'ok', at: i });
      i++;
      j++;
    } else if (j < b.length && (i >= a.length || dp[i][j + 1] >= dp[i + 1][j])) raw.push({ ch: b[j++], kind: 'extra' });
    else raw.push({ ch: a[i], kind: 'missing', at: i++ });
  }
  // A missing next to an extra is a wrong character.
  const out: DiffPart[] = [];
  for (let k = 0; k < raw.length; k++) {
    const x = raw[k];
    const y = raw[k + 1];
    if (y && ((x.kind === 'missing' && y.kind === 'extra') || (x.kind === 'extra' && y.kind === 'missing'))) {
      const miss = x.kind === 'missing' ? x : y;
      const extra = x.kind === 'extra' ? x : y;
      out.push({ ch: miss.ch, kind: 'wrong', got: extra.ch, at: miss.at });
      k++;
    } else out.push(x);
  }
  return out;
}

/** Positions (in the normalized expected text) that weren't typed right. */
export function wrongPositions(parts: DiffPart[]): Set<number> {
  return new Set(parts.filter((p) => p.kind === 'missing' || p.kind === 'wrong').map((p) => p.at!));
}

/**
 * Which of `words` were wrong or missing in a typed (or built) sentence: a word counts as wrong
 * when any of its characters wasn't typed right. Words are located in order in the normalized text.
 */
export function wordResults(expectedZh: string, gotZh: string, words: Word[]): Map<string, boolean> {
  const exp = normalizeZh(expectedZh);
  const bad = wrongPositions(diffChars(exp, normalizeZh(gotZh)));
  const out = new Map<string, boolean>();
  for (const w of words) {
    const h = normalizeZh(w.hanzi);
    const at = exp.indexOf(h);
    if (at < 0 || !h) continue;
    let ok = true;
    for (let k = at; k < at + [...h].length; k++) if (bad.has(k)) ok = false;
    out.set(w.id, ok);
  }
  return out;
}

// ---------- Choosing a sentence ----------

export interface ContextWorld {
  links: Links;
  /** Dialogue line position of a sentence, if it is one. */
  lineOf(sentenceId: string): { lines: Sentence[]; index: number } | undefined;
}

/** Map sentence id → its dialogue lines and position. */
export function dialoguePositions(dialogues: Dialogue[], sentences: Sentence[]): Map<string, { lines: Sentence[]; index: number }> {
  const byId = new Map(sentences.map((s) => [s.id, s]));
  const out = new Map<string, { lines: Sentence[]; index: number }>();
  for (const d of dialogues) {
    if (d.kind === 'reading') continue; // a reading has no replies
    const lines = d.lines.map((l) => byId.get(l.sentenceId)).filter((s): s is Sentence => !!s);
    lines.forEach((s, index) => out.set(s.id, { lines, index }));
  }
  return out;
}

/**
 * Sentences that can review `w` in context, best first: it has a translation and the word
 * appears in it as written; i+1 sentences (every other word learned) first, then ones with at
 * least 80% of the other words learned.
 */
export function contextSentences(w: Word, world: ContextWorld): Sentence[] {
  const list = (world.links.byWord.get(w.id) ?? []).filter((s) => s.translation.trim() && s.zh.includes(w.hanzi.trim()));
  const score = (s: Sentence) => {
    const others = (world.links.bySentence.get(s.id) ?? []).filter((x) => x.id !== w.id);
    if (!others.length) return 1;
    return others.filter(isLearned).length / others.length;
  };
  return list
    .map((s) => ({ s, k: score(s) }))
    .filter((x) => x.k >= 0.8)
    .sort((a, b) => b.k - a.k || a.s.zh.length - b.s.zh.length)
    .map((x) => x.s);
}

/**
 * Turn a word card into a sentence exercise, by the tested skill's strength:
 * - weak → fill the blank with options;
 * - medium → read and check (meaning), reply with tiles (recall, dialogue lines);
 * - strong → fill the blank typed, reply typed.
 * Pinyin stays a word card. Returns null when there's no suitable sentence (or it isn't picked).
 */
export function contextCardFor(
  w: Word,
  skill: Skill,
  world: ContextWorld,
  opts: { use: UseSentences; rnd?: () => number; on?: string; sessionWords?: Word[] },
): ContextCard | null {
  const rnd = opts.rnd ?? Math.random;
  if (opts.use === 'off' || skill === 'pinyin' || skill === 'writing') return null;
  const sentences = contextSentences(w, world);
  if (!sentences.length) return null;
  if (opts.use === 'some' && rnd() >= SOME_SHARE) return null;
  const st = skillStrength(skillState(w, skill, opts.on), w.learnedOn, opts.on);
  const replies = sentences.filter((s) => (world.lineOf(s.id)?.index ?? 0) > 0);
  const pick = <T,>(xs: T[]) => xs[Math.min(xs.length - 1, Math.floor(rnd() * Math.min(xs.length, 3)))];

  if (st === 'weak') return { kind: 'context', ex: 'cloze', part: 'choice', skill, sentenceId: pick(sentences).id };
  if (st === 'medium') {
    if (skill === 'recall' && replies.length) return { kind: 'context', ex: 'reply', part: 'tiles', skill, sentenceId: pick(replies).id };
    if (skill === 'meaning') {
      const s = pick(sentences);
      // Other session words in the same sentence are highlighted and graded too (a few at most).
      const linked = new Set((world.links.bySentence.get(s.id) ?? []).map((x) => x.id));
      const also = (opts.sessionWords ?? [])
        .filter((x) => x.id !== w.id && linked.has(x.id) && isLearned(x) && s.zh.includes(x.hanzi.trim()))
        .map((x) => x.id)
        .slice(0, MAX_ALSO);
      return { kind: 'context', ex: 'read', part: 'check', skill, sentenceId: s.id, alsoIds: also.length ? also : undefined };
    }
    return { kind: 'context', ex: 'cloze', part: 'choice', skill, sentenceId: pick(sentences).id };
  }
  if (skill === 'recall' && replies.length) return { kind: 'context', ex: 'reply', part: 'typing', skill, sentenceId: pick(replies).id };
  return { kind: 'context', ex: 'cloze', part: 'typing', skill, sentenceId: pick(sentences).id };
}

/**
 * Session steps with some word cards turned into sentence exercises. A read-and-check card can
 * also cover later words of the session that appear in its sentence and are due a meaning
 * review; those don't get their own card.
 */
export function withContext(steps: Step[], words: Map<string, Word>, world: ContextWorld, opts: { use: UseSentences; rnd?: () => number; on?: string }): (Step | ContextStep)[] {
  const covered = new Set<string>();
  const out: (Step | ContextStep)[] = [];
  const skillOf = (c: Card): Skill | null => (c.kind === 'single' ? c.skill : c.kind === 'pair' ? 'meaning' : null);
  steps.forEach((s, i) => {
    if (covered.has(s.id)) return;
    const w = words.get(s.id);
    const skill = skillOf(s.card);
    const later = steps
      .slice(i + 1)
      .filter((x) => skillOf(x.card) === 'meaning')
      .map((x) => words.get(x.id))
      .filter((x): x is Word => !!x && !covered.has(x.id));
    const ctx = w && skill ? contextCardFor(w, skill, world, { ...opts, sessionWords: later }) : null;
    if (ctx) {
      ctx.alsoIds?.forEach((id) => covered.add(id));
      out.push({ id: s.id, card: ctx, scheduled: [ctx.skill], target: s.target });
    } else out.push(s);
  });
  return out;
}

export interface ContextStep {
  id: string;
  card: ContextCard;
  scheduled: Skill[];
  delayed?: boolean;
  /** A word card: the character whose skill it reviews (see Step). */
  target?: string;
}
