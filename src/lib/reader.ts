/**
 * The reader: a text split into words (learned / new / not in my list), how much of it I know,
 * and what finishing a reading does to the words in it. Pure functions, unit-tested.
 */
import { retrievability } from './fsrs';
import { segment } from './sentences';
import { splitKnown } from './sentenceLearn';
import { isWordEntry } from './entries';
import { isLearned, skillState } from './srs';
import type { Word } from './types';

const CJK = /[㐀-鿿豈-﫿]/;

export type TokenKind = 'learned' | 'new' | 'unknown' | 'other';

export interface Token {
  text: string;
  kind: TokenKind;
  word?: Word;
}

/**
 * Split a sentence into tokens. Word segments that aren't one of my words but are made of them
 * are split into those (我是 → 我 + 是). Punctuation, spaces and Latin text are 'other'.
 */
export function tokenize(zh: string, byHanzi: Map<string, Word>): Token[] {
  const kindOf = (t: string): Token => {
    const word = byHanzi.get(t);
    if (word) return { text: t, kind: isLearned(word) ? 'learned' : 'new', word };
    return { text: t, kind: CJK.test(t) ? 'unknown' : 'other' };
  };
  const segs = segment(zh);
  if (!segs) return [...zh].map(kindOf);
  const out: Token[] = [];
  const known = new Set(byHanzi.keys());
  let at = 0;
  for (const sg of segs) {
    if (sg.index > at) out.push({ text: zh.slice(at, sg.index), kind: 'other' });
    const pieces = [...sg.text].length > 1 && !byHanzi.has(sg.text) ? splitKnown(sg.text, known) : null;
    for (const p of pieces ?? [sg.text]) out.push(kindOf(p));
    at = sg.index + sg.text.length;
  }
  if (at < zh.length) out.push({ text: zh.slice(at), kind: 'other' });
  return out;
}

/** "% of words known": learned word tokens ÷ all word tokens in the text. */
export function knownPercent(tokens: Token[]): number {
  const words = tokens.filter((t) => t.kind !== 'other');
  if (!words.length) return 100;
  return Math.round((words.filter((t) => t.kind === 'learned').length / words.length) * 100);
}

/** Finishing a reading counts as a meaning review for learned words below this recall chance. */
export const READ_REVIEW_BELOW = 0.9;

/**
 * What "Done reading" does with the learned words of the text (each once) that weren't looked up:
 * - `review`: meaning under 90% likely to be remembered → graded Good (FSRS);
 * - `seen`: the rest → a correct answer for accuracy only.
 */
export function finishPlan(tokens: Token[], lookedUp: Set<string>, now: number = Date.now()): { review: Word[]; seen: Word[] } {
  const words = new Map<string, Word>();
  // Characters only: words and names have no schedule.
  for (const t of tokens) if (t.kind === 'learned' && t.word && !isWordEntry(t.word) && !lookedUp.has(t.word.id)) words.set(t.word.id, t.word);
  const review: Word[] = [];
  const seen: Word[] = [];
  for (const w of words.values()) (retrievability(skillState(w, 'meaning'), now) < READ_REVIEW_BELOW ? review : seen).push(w);
  return { review, seen };
}
