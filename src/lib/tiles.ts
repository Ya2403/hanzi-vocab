/**
 * Tile exercises: Build in Chinese (a sentence from word tiles, or a word from character tiles)
 * and Complete the sentence (1–3 blanks filled from tiles). Pure functions (randomness passed in),
 * unit-tested.
 */
import { normalizeZh } from './contextReview';
import { entryChars, isCharEntry, isWordEntry, sharesChar } from './entries';
import type { HanziDict } from './hanziDict';
import { wordsSimilar } from './learn';
import { sentenceTiles } from './sentenceLearn';
import { isLearned } from './srs';
import type { Sentence, Word } from './types';

const shuffleWith = <T,>(xs: readonly T[], rnd: () => number): T[] => {
  const a = xs.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

/** Distractor tiles: 2 for answers of up to 3 tiles, 3 for 4–6, 4 for more. */
export const distractorCount = (answerTiles: number): number => (answerTiles <= 3 ? 2 : answerTiles <= 6 ? 3 : 4);

/** Tiles in an order that isn't already the answer. */
function scramble(answer: string[], extra: string[], rnd: () => number): string[] {
  let tiles = shuffleWith([...answer, ...extra], rnd);
  if (tiles.length > 1 && tiles.slice(0, answer.length).join('') === answer.join('')) tiles = [...tiles.slice(1), tiles[0]];
  return tiles;
}

export interface TileSet {
  /** The tiles in the right order. */
  answer: string[];
  /** All tiles (answer + distractors), shuffled. */
  tiles: string[];
}

// ---------- Build in Chinese: a sentence ----------

/**
 * A sentence's word tiles (split so your items are whole tiles) plus distractors from your learned
 * items: ones that look like an answer tile first (same length and a shared or look-alike
 * character), then ones of the same length, then others. Never a tile that is already an answer
 * tile, appears in the sentence, or is part of a stored alternative answer.
 */
export function sentenceBuildTiles(s: Sentence, entries: Word[], dict: HanziDict | null, rnd: () => number = Math.random): TileSet {
  const known = new Set(entries.map((w) => w.hanzi.trim()));
  const answer = sentenceTiles(s.zh, known);
  const banned = new Set([...answer, ...(s.alternatives ?? []).flatMap((a) => sentenceTiles(a, known))]);
  const pool = entries.filter(
    (w) => isLearned(w) && !w.hanzi.includes('…') && !banned.has(w.hanzi) && !s.zh.includes(w.hanzi) && !(s.alternatives ?? []).some((a) => a.includes(w.hanzi)),
  );
  const lengths = new Set(answer.map((t) => [...t].length));
  const answerEntries = entries.filter((w) => answer.includes(w.hanzi));
  const looks = (w: Word) => lengths.has([...w.hanzi].length) && answerEntries.some((a) => sharesChar(a, w) || wordsSimilar(a, w, dict));
  const similar = shuffleWith(pool.filter(looks), rnd);
  const sameLength = shuffleWith(pool.filter((w) => !looks(w) && lengths.has([...w.hanzi].length)), rnd);
  const rest = shuffleWith(pool.filter((w) => !looks(w) && !lengths.has([...w.hanzi].length)), rnd);
  const extra = [...new Set([...similar, ...sameLength, ...rest].map((w) => w.hanzi))].slice(0, distractorCount(answer.length));
  return { answer, tiles: scramble(answer, extra, rnd) };
}

// ---------- Build in Chinese: a word ----------

/**
 * A word's character tiles plus look-alike learned characters (then ones from the same lesson,
 * then others) that aren't in the word.
 */
export function wordBuildTiles(word: Word, entries: Word[], dict: HanziDict | null, rnd: () => number = Math.random): TileSet {
  const answer = [...word.hanzi].filter((c) => entryChars(c).length > 0);
  const own = new Set(answer);
  const pool = entries.filter((w) => isCharEntry(w) && isLearned(w) && !own.has(w.hanzi));
  const ownEntries = entries.filter((w) => isCharEntry(w) && own.has(w.hanzi));
  const looks = (w: Word) => ownEntries.some((o) => wordsSimilar(o, w, dict));
  const similar = shuffleWith(pool.filter(looks), rnd);
  const related = shuffleWith(pool.filter((w) => !looks(w) && w.tags.some((t) => word.tags.includes(t))), rnd);
  const rest = shuffleWith(pool.filter((w) => !looks(w) && !related.includes(w)), rnd);
  const extra = [...new Set([...similar, ...related, ...rest].map((w) => w.hanzi))].slice(0, distractorCount(answer.length));
  return { answer, tiles: scramble(answer, extra, rnd) };
}

// ---------- Checking built tiles ----------

export interface TileCheck {
  ok: boolean;
  /** Positions (in the answer) where the placed tile isn't the right one. */
  wrong: number[];
}

/**
 * Built tiles are right when they spell the answer (punctuation ignored) or a stored alternative.
 * Otherwise the answer positions holding a wrong (or no) tile are marked.
 */
export function checkTiles(placed: string[], answer: string[], alternatives: string[] = []): TileCheck {
  const got = normalizeZh(placed.join(''));
  if (got === normalizeZh(answer.join('')) || alternatives.some((a) => normalizeZh(a) === got)) return { ok: true, wrong: [] };
  return { ok: false, wrong: answer.map((t, i) => (placed[i] === t ? -1 : i)).filter((i) => i >= 0) };
}

/** The characters of the answer tiles at `wrong` positions (what to count as missed). */
export const charsAt = (answer: string[], wrong: number[]): string[] => [...new Set(wrong.flatMap((i) => entryChars(answer[i] ?? '')))];

// ---------- Complete the sentence ----------

export interface Blank {
  item: Word;
  /** Where the item starts in the sentence. */
  at: number;
}

/** Blanks per strength of the target's skill: 1 weak, 2 medium, 3 strong. */
export const BLANKS = { weak: 1, medium: 2, strong: 3 } as const;

/**
 * The blanks of Complete the sentence: the target, plus up to `n - 1` other learned items of the
 * sentence, highest priority first, that don't overlap the target or each other. In sentence order.
 */
export function chooseBlanks(s: Sentence, target: Word, linked: Word[], n: number, priority: (w: Word) => number): Blank[] | null {
  const at = s.zh.indexOf(target.hanzi.trim());
  if (at < 0 || target.hanzi.includes('…')) return null;
  const blanks: Blank[] = [{ item: target, at }];
  const overlaps = (a: number, len: number) => blanks.some((b) => a < b.at + b.item.hanzi.length && b.at < a + len);
  const others = linked
    .filter((w) => w.id !== target.id && isLearned(w) && !w.hanzi.includes('…') && s.zh.includes(w.hanzi.trim()))
    .sort((a, b) => priority(b) - priority(a));
  for (const w of others) {
    if (blanks.length >= n) break;
    const pos = s.zh.indexOf(w.hanzi.trim());
    if (pos < 0 || overlaps(pos, w.hanzi.length)) continue;
    blanks.push({ item: w, at: pos });
  }
  return blanks.sort((a, b) => a.at - b.at);
}

/** The sentence around its blanks: text pieces and blank indexes, in order. */
export function blankedParts(zh: string, blanks: Blank[]): ({ text: string } | { blank: number })[] {
  const out: ({ text: string } | { blank: number })[] = [];
  let pos = 0;
  blanks.forEach((b, i) => {
    if (b.at > pos) out.push({ text: zh.slice(pos, b.at) });
    out.push({ blank: i });
    pos = b.at + b.item.hanzi.length;
  });
  if (pos < zh.length) out.push({ text: zh.slice(pos) });
  return out;
}

/** Tiles for the blanks plus 2–3 learned items of similar length that aren't in the sentence. */
export function blankTiles(blanks: Blank[], s: Sentence, entries: Word[], rnd: () => number = Math.random): string[] {
  const answer = blanks.map((b) => b.item.hanzi);
  const lens = answer.map((a) => [...a].length);
  const pool = entries.filter((w) => isLearned(w) && !w.hanzi.includes('…') && !answer.includes(w.hanzi) && !s.zh.includes(w.hanzi));
  const score = (w: Word) => Math.min(...lens.map((l) => Math.abs([...w.hanzi].length - l))) + (isWordEntry(w) === blanks.some((b) => isWordEntry(b.item)) ? 0 : 0.5) + rnd();
  const extra = [...new Set(pool.map((w) => ({ w, k: score(w) })).sort((a, b) => a.k - b.k).map((x) => x.w.hanzi))].slice(0, 2 + Math.floor(rnd() * 2));
  return scramble(answer, extra, rnd);
}
