/**
 * Typed (or built) Chinese: normalizing, comparing character by character, and the shared
 * verdict for typing exercises. Pure functions, unit-tested.
 */
import { hanziMatches } from './answer';
import { toPinyin } from './pinyin';
import type { Word } from './types';

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


// ---------- The verdict for typing exercises ----------

export type TypedVerdict = 'correct' | 'almost' | 'wrong';

export interface TypedCheck {
  verdict: TypedVerdict;
  /** The comparison with the expected text (normalized), shown whenever the answer isn't exact. */
  parts: DiffPart[];
  /** E.g. "Same sound" for a dictation answer with other characters of the same reading. */
  note?: string;
}

/** Answers of at least this many characters get "Almost" for one wrong character. */
export const ALMOST_MIN_LENGTH = 6;

/**
 * Check typed Chinese against the expected text (spaces, punctuation and "…" placeholders ignored,
 * full-width letters and digits converted; stored alternatives accepted):
 * - exact → correct;
 * - one wrong (or missing, or extra) character in an answer of 6+ characters → almost (graded Hard);
 * - otherwise wrong.
 * `sameSound` (dictation): other characters with exactly the same pinyin also count as correct.
 */
export function checkTypedChinese(expected: string, got: string, opts: { alternatives?: string[]; sameSound?: boolean } = {}): TypedCheck {
  const exp = normalizeZh(expected);
  const typed = normalizeZh(got);
  const parts = diffChars(exp, typed);
  if (!typed) return { verdict: 'wrong', parts };
  const exact =
    typed === exp ||
    (expected.includes('…') && hanziMatches(got, expected)) ||
    (opts.alternatives ?? []).some((alt) => normalizeZh(alt) === typed);
  if (exact) return { verdict: 'correct', parts };
  if (opts.sameSound && sound(typed) === sound(exp)) return { verdict: 'correct', parts, note: 'Same sound, other characters' };
  const issues = parts.filter((p) => p.kind !== 'ok').length;
  if ([...exp].length >= ALMOST_MIN_LENGTH && issues === 1) return { verdict: 'almost', parts };
  return { verdict: 'wrong', parts };
}

const sound = (zh: string) => toPinyin(zh).normalize('NFC').replace(/\s+/g, '').toLowerCase();

/** The expected characters that were typed wrong or left out. */
export const missedChars = (parts: DiffPart[]): string[] => [...new Set(parts.filter((p) => p.kind === 'missing' || p.kind === 'wrong').map((p) => p.ch))];
