import { convert } from 'pinyin-pro';
import { normalizeSearch } from './pinyin';
import type { Word } from './types';

/** correct → Good, close (typo / tones off) → Hard, wrong → Again. */
export type Verdict = 'correct' | 'close' | 'wrong';

export interface Check {
  verdict: Verdict;
  note?: string;
}

const CJK = /[\u3400-\u9fff\uf900-\ufaff]/;

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/** "To Eat (food)!" → "eat": lowercase, no accents, parentheticals, punctuation or leading articles/"to". */
function normalizeMeaning(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\(.*?\)|\[.*?\]/g, ' ')
    .replace(/[^\p{L}\p{N}\s']/gu, ' ')
    .replace(/\b(to|a|an|the|be)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Typed English (or any language) meaning against a stored meaning like "to study; to learn". */
export function checkMeaning(input: string, meaning: string): Check {
  const answer = normalizeMeaning(input);
  if (!answer) return { verdict: 'wrong' };
  const senses = [meaning, ...meaning.split(/[;,/|]|\bor\b/)].map(normalizeMeaning).filter(Boolean);
  if (senses.includes(answer)) return { verdict: 'correct' };
  const typoOk = senses.some((s) => levenshtein(answer, s) <= Math.max(1, Math.floor(s.length / 6)));
  if (typoOk) return { verdict: 'close', note: 'Almost: check the spelling.' };
  return { verdict: 'wrong' };
}

const stripHanzi = (s: string) => [...s].filter((c) => CJK.test(c)).join('');

/** Pinyin in any common form → tone-marked, lowercase, no spaces/apostrophes ("Ni3 hao3" → "nǐhǎo"). */
function canonicalPinyin(s: string): string {
  const lower = s.trim().toLowerCase().replace(/u:/g, 'ü');
  // convert() needs separate syllables: "ni3hao3" → "ni3 hao3".
  const spaced = lower
    .replace(/v/g, 'ü')
    .replace(/([a-zü])[50]/g, '$1 ') // 5/0 = neutral tone: no mark
    .replace(/([1-4])(?=[a-zü])/g, '$1 ');
  const toned = /[1-5]/.test(lower) ? convert(spaced, { format: 'numToSymbol' }) : lower;
  return toned.normalize('NFC').replace(/[\s'’·-]/g, '');
}

const tonelessPinyin = (s: string) => normalizeSearch(s).replace(/[\d'’·-]/g, '').replace(/v/g, 'u');

/** Typed hanzi or pinyin against a word. */
export function checkChinese(input: string, word: Word): Check {
  const text = input.trim();
  if (!text) return { verdict: 'wrong' };

  if (CJK.test(text)) {
    return stripHanzi(text) === stripHanzi(word.hanzi) ? { verdict: 'correct' } : { verdict: 'wrong' };
  }

  if (canonicalPinyin(text) === canonicalPinyin(word.pinyin)) return { verdict: 'correct' };
  if (tonelessPinyin(text) === tonelessPinyin(word.pinyin)) {
    // Tone marks are combining accents after NFD; \u00fc's diaeresis (U+0308) is not a tone.
    const hasTones = /[1-5]/.test(text) || /[\u0300-\u0307\u0309-\u036f]/.test(text.normalize('NFD'));
    return { verdict: 'close', note: hasTones ? 'Right syllables, but check the tones.' : 'Right syllables. Add tones for full marks.' };
  }
  return { verdict: 'wrong' };
}
