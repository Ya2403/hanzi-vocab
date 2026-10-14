/**
 * Reviewing items in context: picking a sentence that contains the item (i+1 first), the
 * exercise for it (fill the blank, reply in the dialogue, complete the chat, build in Chinese,
 * complete the sentence), and checking typed Chinese. Pure functions (randomness passed in),
 * unit-tested.
 */
import { skillStrength, wordPriority, type Card, type Step } from './planner';
import { isWordEntry, needsWork, wordAccuracy } from './entries';
import { BLANKS, chooseBlanks } from './tiles';
import type { Links } from './sentences';
import { isLearned, skillState } from './srs';
import { CHAT_MIN_LINES } from './choiceExercises';
import type { Dialogue, Sentence, Skill, Word } from './types';

/** "Use sentences in reviews": never, about 40% of the eligible reviews, or whenever possible. */
export type UseSentences = 'off' | 'some' | 'max';
export const SOME_SHARE = 0.4;
/**
 * cloze: fill the blank; reply: reply in the dialogue; chat: Complete the chat (pick the reply);
 * build: Build in Chinese (the sentence from word tiles); complete: Complete the sentence (blanks
 * filled from tiles).
 */
export type ContextExercise = 'cloze' | 'reply' | 'chat' | 'build' | 'complete';
export type ContextPart = 'choice' | 'typing' | 'tiles';

export interface ContextCard {
  kind: 'context';
  ex: ContextExercise;
  part: ContextPart;
  skill: Skill;
  sentenceId: string;
  /** Complete the sentence: the other items blanked besides the target (they record accuracy). */
  blankIds?: string[];
}

/** How much an item needs practice (for picking extra blanks): characters by FSRS priority, words by "needs work" and accuracy. */
export const itemPriority = (w: Word): number =>
  isWordEntry(w) ? (needsWork(w) ? 5 : 0) + (1 - (wordAccuracy(w) ?? 1)) * 3 : (wordPriority(w)?.priority ?? 0);

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
 * Turn a card into a sentence exercise, by the tested skill's strength:
 * - weak: fill the blank with options; recall also Complete the sentence with 1 blank;
 * - medium: meaning → Complete the chat (dialogue replies) or fill the blank; recall → reply with
 *   tiles (dialogue lines), Build in Chinese, or Complete the sentence with 2 blanks;
 * - strong: reply typed (dialogue lines), fill the blank typed, or (recall) Complete the sentence
 *   with 3 blanks.
 * Pinyin stays a word card. Returns null when there's no suitable sentence (or it isn't picked).
 */
export function contextCardFor(w: Word, skill: Skill, world: ContextWorld, opts: { use: UseSentences; rnd?: () => number; on?: string }): ContextCard | null {
  const rnd = opts.rnd ?? Math.random;
  if (opts.use === 'off' || skill === 'pinyin' || skill === 'writing') return null;
  const sentences = contextSentences(w, world);
  if (!sentences.length) return null;
  if (opts.use === 'some' && rnd() >= SOME_SHARE) return null;
  const st = skillStrength(skillState(w, skill, opts.on), w.learnedOn, opts.on);
  const replies = sentences.filter((s) => (world.lineOf(s.id)?.index ?? 0) > 0);
  // Complete the chat: a reply line of a dialogue with at least 3 lines.
  const chats = replies.filter((s) => (world.lineOf(s.id)?.lines.length ?? 0) >= CHAT_MIN_LINES);
  const pick = <T,>(xs: T[]) => xs[Math.min(xs.length - 1, Math.floor(rnd() * Math.min(xs.length, 3)))];
  const card = (ex: ContextExercise, part: ContextPart, list: Sentence[] = sentences): ContextCard => ({ kind: 'context', ex, part, skill, sentenceId: pick(list).id });
  /** Complete the sentence with the target plus the highest-priority other items. */
  const complete = (): ContextCard | null => {
    const s = pick(sentences);
    const blanks = chooseBlanks(s, w, world.links.bySentence.get(s.id) ?? [], BLANKS[st], itemPriority);
    if (!blanks) return null;
    const others = blanks.filter((x) => x.item.id !== w.id).map((x) => x.item.id);
    return { kind: 'context', ex: 'complete', part: 'tiles', skill, sentenceId: s.id, blankIds: others.length ? others : undefined };
  };
  const oneOf = (list: (ContextCard | null)[]): ContextCard | null => {
    const ok = list.filter((x): x is ContextCard => !!x);
    return ok.length ? ok[Math.floor(rnd() * ok.length)] : null;
  };

  if (st === 'weak') {
    if (skill === 'recall') return oneOf([card('cloze', 'choice'), complete()]);
    return card('cloze', 'choice');
  }
  if (st === 'medium') {
    if (skill === 'meaning') return chats.length && rnd() < 0.5 ? card('chat', 'choice', chats) : card('cloze', 'choice');
    return oneOf([replies.length ? card('reply', 'tiles', replies) : null, card('build', 'tiles'), complete()]);
  }
  if (skill === 'recall') return oneOf([replies.length ? card('reply', 'typing', replies) : null, card('cloze', 'typing'), complete()]);
  return card('cloze', 'typing');
}

/** Session steps with some cards turned into sentence exercises. */
export function withContext(steps: Step[], words: Map<string, Word>, world: ContextWorld, opts: { use: UseSentences; rnd?: () => number; on?: string }): (Step | ContextStep)[] {
  const skillOf = (c: Card): Skill | null => (c.kind === 'single' ? c.skill : c.kind === 'pair' ? 'meaning' : null);
  return steps.map((s) => {
    const w = words.get(s.id);
    const skill = skillOf(s.card);
    const ctx = w && skill ? contextCardFor(w, skill, world, opts) : null;
    return ctx ? { id: s.id, card: ctx, scheduled: [ctx.skill], target: s.target } : s;
  });
}

export interface ContextStep {
  id: string;
  card: ContextCard;
  scheduled: Skill[];
  delayed?: boolean;
  /** A word card: the character whose skill it reviews (see Step). */
  target?: string;
}
