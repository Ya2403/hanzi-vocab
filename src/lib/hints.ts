/**
 * Tap-a-word hints: which Chinese word an English word of a prompt stands for (stored alignments
 * first, then the meanings of the sentence's items), and the alignment format. Pure functions,
 * unit-tested.
 */
import type { Sentence, Word } from './types';

/** English words that never get their own hint. */
const STOP = new Set(['to', 'a', 'an', 'the', 'be', 'of', 'is', 'are', 'am', 'was', 'do', 'does', 'did']);

/** "Hello!" → "hello"; "teacher's" → "teacher". */
export const englishKey = (w: string): string =>
  w
    .toLowerCase()
    .replace(/[’']s$/, '')
    .replace(/[^a-z]/g, '');

/** Simple forms to try: the word, without a plural / tense ending. */
function forms(key: string): string[] {
  const out = [key];
  if (key.endsWith('ies')) out.push(`${key.slice(0, -3)}y`);
  if (key.endsWith('es')) out.push(key.slice(0, -2));
  if (key.endsWith('s')) out.push(key.slice(0, -1));
  if (key.endsWith('ed')) out.push(key.slice(0, -2), key.slice(0, -1));
  if (key.endsWith('ing')) out.push(key.slice(0, -3), `${key.slice(0, -3)}e`);
  return out;
}

/** "I=我; like=喜欢; cook=做饭" → { i: 我, like: 喜欢, cook: 做饭 }. */
export function parseAlignments(text: string): Record<string, string> | undefined {
  const out: Record<string, string> = {};
  for (const part of text.split(/[;；,，]/)) {
    const m = part.match(/^\s*([^=＝]+?)\s*[=＝]\s*(.+?)\s*$/);
    if (!m) continue;
    const key = m[1]
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .map(englishKey)
      .filter(Boolean)
      .join(' ');
    if (key && m[2]) out[key] = m[2].trim();
  }
  return Object.keys(out).length ? out : undefined;
}

/** { i: 我, like: 喜欢 } → "I=我; like=喜欢" (for editing). */
export const formatAlignments = (a: Record<string, string> | undefined): string =>
  a
    ? Object.entries(a)
        .map(([k, v]) => `${k}=${v}`)
        .join('; ')
    : '';

export interface EnglishToken {
  text: string;
  /** A word (tappable), or spaces and punctuation. */
  word: boolean;
  /** The Chinese it stands for in this sentence, if known. */
  zh?: string;
  /** The item (character or word) of the sentence it stands for, if any. */
  item?: Word;
}

/**
 * The English of a prompt split into words, each with the Chinese it stands for: a stored
 * alignment ("cook" → 做饭) first, else an item of the sentence whose meaning contains the word
 * ("teacher" → 老师). Words with no match have no `zh` ("No hint for this word").
 */
export function englishTokens(text: string, sentence: Pick<Sentence, 'zh' | 'alignments'> | undefined, items: Word[]): EnglishToken[] {
  const parts = text.match(/[A-Za-z’']+|[^A-Za-z’']+/g) ?? [];
  const align = sentence?.alignments ?? {};
  const byMeaning = new Map<string, Word>();
  for (const w of items) {
    for (const sense of w.meaning.toLowerCase().split(/[;,/()]/)) {
      for (const word of sense.split(/\s+/).map(englishKey)) {
        if (word && !STOP.has(word) && !byMeaning.has(word)) byMeaning.set(word, w);
      }
    }
  }
  const itemByZh = new Map(items.map((w) => [w.hanzi.trim(), w]));
  return parts.map((p) => {
    if (!/[A-Za-z]/.test(p)) return { text: p, word: false };
    const key = englishKey(p);
    for (const f of forms(key)) {
      const zh = align[f];
      if (zh) return { text: p, word: true, zh, item: itemByZh.get(zh) };
    }
    if (STOP.has(key)) return { text: p, word: true };
    for (const f of forms(key)) {
      const w = byMeaning.get(f);
      if (w && (!sentence || sentence.zh.includes(w.hanzi.trim()))) return { text: p, word: true, zh: w.hanzi, item: w };
    }
    return { text: p, word: true };
  });
}

/** For items with strong recall, about 1 exercise in 4 has no hints at all. */
export const NO_HINTS_SHARE = 0.25;
