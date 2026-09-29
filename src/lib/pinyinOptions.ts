/**
 * Wrong answers for pinyin questions. They should sound like the answer (same initial or final
 * first, then the same number of syllables), but never differ from it only in tones, and never
 * be another correct reading of the same word.
 */
import { pinyin } from 'pinyin-pro';
import { tonelessPinyin } from './answer';
import { writableChars } from './strokes';
import type { Word } from './types';

/** Remove tone marks but keep ü ("lǜ shī" → "lü shi"). */
export const stripTones = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[̀-̇̉-ͯ]/g, '')
    .normalize('NFC');

interface Syl {
  initial: string;
  final: string;
}

/** Initial and final of each character, toneless ("学生" → x+ue, sh+eng). */
function sounds(hanzi: string): Syl[] {
  const chars = writableChars(hanzi).join('');
  if (!chars) return [];
  const initials = pinyin(chars, { pattern: 'initial', type: 'array' });
  const finals = pinyin(chars, { pattern: 'final', toneType: 'none', type: 'array' });
  return initials.map((initial, i) => ({ initial, final: (finals[i] ?? '').replace(/v/g, 'ü') }));
}

/** Other readings of a single character (行: xíng / háng), as toneless keys. */
function otherReadings(word: Word): Set<string> {
  const chars = writableChars(word.hanzi);
  if (chars.length !== 1) return new Set();
  return new Set(pinyin(chars[0], { multiple: true, type: 'array' }).map(tonelessPinyin));
}

// ---------- Syllable table (for words whose list has too few similar words) ----------

interface TableEntry extends Syl {
  toned: string;
}
let table: TableEntry[] | null = null;

/** Every toned syllable pinyin-pro knows, from the common CJK block (built once, on demand). */
function syllableTable(): TableEntry[] {
  if (table) return table;
  let chars = '';
  for (let cp = 0x4e00; cp <= 0x9fa5; cp++) chars += String.fromCodePoint(cp);
  const toned = pinyin(chars, { type: 'array' });
  const initials = pinyin(chars, { pattern: 'initial', type: 'array' });
  const finals = pinyin(chars, { pattern: 'final', toneType: 'none', type: 'array' });
  const seen = new Set<string>();
  table = [];
  toned.forEach((t, i) => {
    if (!t || seen.has(t) || !/^[a-zāáǎàēéěèīíǐìōóǒòūúǔùüǖǘǚǜńňǹḿ]+$/.test(t)) return;
    seen.add(t);
    table!.push({ toned: t, initial: initials[i], final: (finals[i] ?? '').replace(/v/g, 'ü') });
  });
  return table;
}

/** The answer's syllables: the stored pinyin when it's split per character, else pinyin-pro's. */
function answerSyllables(word: Word): string[] {
  const n = writableChars(word.hanzi).length;
  const stored = word.pinyin.trim().split(/\s+/);
  return stored.length === n ? stored : pinyin(writableChars(word.hanzi).join(''), { type: 'array' });
}

/**
 * Up to `n` wrong pinyin answers for `word`, best first. Taken from other words in `pool`,
 * topped up with made-up but real syllables that share an initial or final with the answer.
 */
export function pinyinDistractors(word: Word, pool: Word[], n = 3, rnd: () => number = Math.random): string[] {
  const answerKey = tonelessPinyin(word.pinyin);
  const banned = new Set([answerKey, ...otherReadings(word)]);
  const mine = sounds(word.hanzi);
  const out: string[] = [];
  const used = new Set(banned);
  const add = (p: string) => {
    const key = tonelessPinyin(p);
    if (out.length >= n || !key || used.has(key)) return;
    used.add(key);
    out.push(p.trim());
  };

  // 1. Other words that share an initial or final at the same position (same length first).
  const ranked = pool
    .filter((w) => w.id !== word.id && w.hanzi !== word.hanzi && w.pinyin.trim())
    .map((w) => {
      const theirs = sounds(w.hanzi);
      const shares = mine.some((s, i) => theirs[i] && (theirs[i].initial === s.initial || theirs[i].final === s.final));
      const sameCount = theirs.length === mine.length;
      return { p: w.pinyin, shares, score: (sameCount ? 0 : 1) + rnd() * 0.5 };
    })
    .sort((a, b) => a.score - b.score);
  for (const x of ranked) if (x.shares) add(x.p);

  // 2. Made-up alternatives: change one syllable to a real one sharing its initial or final.
  if (out.length < n && mine.length) {
    const syls = answerSyllables(word);
    const entries = syllableTable();
    for (let tries = 0; out.length < n && tries < 60; tries++) {
      const i = Math.floor(rnd() * mine.length);
      const s = mine[i];
      const byInitial = rnd() < 0.5;
      const options = entries.filter((e) =>
        byInitial ? e.initial === s.initial && e.final !== s.final : e.final === s.final && e.initial !== s.initial,
      );
      if (!options.length) continue;
      const pick = options[Math.floor(rnd() * options.length)];
      add(syls.map((x, j) => (j === i ? pick.toned : x)).join(' '));
    }
  }
  // 3. Last resort: other words of the same length.
  for (const x of ranked) if (x.score < 1) add(x.p);
  return out;
}
