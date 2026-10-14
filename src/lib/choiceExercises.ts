/**
 * Choice exercises: Select the correct translation (EN → 3 Chinese options), Which character?
 * (a word with one character blanked) and Complete the chat (pick the reply to a dialogue line).
 * Pure functions (randomness passed in), unit-tested.
 */
import { entryChars, isCharEntry, isWordEntry, sharesChar } from './entries';
import type { HanziDict } from './hanziDict';
import { wordsSimilar } from './learn';
import { isLearned } from './srs';
import type { Dialogue, Sentence, Word } from './types';

const shuffleWith = <T,>(xs: readonly T[], rnd: () => number): T[] => {
  const a = xs.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// ---------- Select the correct translation ----------

/**
 * Distractors for "Select the correct translation": learned entries that look like the answer
 * (a look-alike character, or for a word one sharing a character), then ones with a tag in
 * common, then the rest. Never one with the same characters or the same meaning.
 */
export function translationDistractors(answer: Word, pool: Word[], dict: HanziDict | null, n: number, rnd: () => number = Math.random): Word[] {
  const key = (w: Word) => w.meaning.trim().toLowerCase();
  const seen = new Set([answer.hanzi, key(answer)]);
  const candidates = pool.filter((w) => w.id !== answer.id && isLearned(w) && isWordEntry(w) === isWordEntry(answer));
  const looks = (w: Word) => wordsSimilar(answer, w, dict) || (isWordEntry(answer) && sharesChar(answer, w));
  const similar = shuffleWith(candidates.filter(looks), rnd);
  const related = shuffleWith(candidates.filter((w) => !looks(w) && w.tags.some((t) => answer.tags.includes(t))), rnd);
  const rest = shuffleWith(candidates.filter((w) => !looks(w) && !related.includes(w)), rnd);
  // Too few of the same kind: fill with the other kind.
  const others = shuffleWith(pool.filter((w) => w.id !== answer.id && isLearned(w) && isWordEntry(w) !== isWordEntry(answer)), rnd);
  const out: Word[] = [];
  for (const w of [...similar, ...related, ...rest, ...others]) {
    if (out.length >= n) break;
    if (seen.has(w.hanzi) || seen.has(key(w))) continue;
    seen.add(w.hanzi);
    seen.add(key(w));
    out.push(w);
  }
  return out;
}

// ---------- Which character? ----------

export interface WhichCharQuestion {
  /** Index (in the word's characters, as written) of the blank. */
  blank: number;
  /** The missing character. */
  answer: string;
  /** Four characters (the answer among them), shuffled. */
  options: string[];
}

/**
 * Which character? A word with `target` blanked (or, without one, a random character of it),
 * and four characters to choose from: the answer, look-alikes, characters from the same lesson,
 * then other learned characters. A character that would make another word of the list (电_ →
 * 电话 when the word is 电脑) is never an option.
 */
export function whichCharQuestion(word: Word, target: string | undefined, allEntries: Word[], dict: HanziDict | null, rnd: () => number = Math.random): WhichCharQuestion | null {
  const chars = [...word.hanzi];
  const own = entryChars(word.hanzi);
  if (own.length < 2) return null;
  const answer = target && own.includes(target) ? target : own[Math.floor(rnd() * own.length)];
  const blank = chars.indexOf(answer);
  const listed = new Set(allEntries.map((w) => w.hanzi));
  const makesWord = (c: string) => listed.has(chars.map((x, i) => (i === blank ? c : x)).join(''));
  const answerEntry = allEntries.find((w) => isCharEntry(w) && w.hanzi === answer);
  const pool = allEntries.filter((w) => isCharEntry(w) && isLearned(w) && w.hanzi !== answer && !own.includes(w.hanzi) && !makesWord(w.hanzi));
  const looks = (w: Word) => !!answerEntry && wordsSimilar(answerEntry, w, dict);
  const similar = shuffleWith(pool.filter(looks), rnd);
  const related = shuffleWith(pool.filter((w) => !looks(w) && w.tags.some((t) => word.tags.includes(t))), rnd);
  const rest = shuffleWith(pool.filter((w) => !looks(w) && !related.includes(w)), rnd);
  const distractors = [...new Set([...similar, ...related, ...rest].map((w) => w.hanzi))].slice(0, 3);
  if (distractors.length < 2) return null;
  return { blank, answer, options: shuffleWith([answer, ...distractors], rnd) };
}

// ---------- Complete the chat ----------

/** Dialogues with at least this many lines can be used for Complete the chat. */
export const CHAT_MIN_LINES = 3;

/**
 * Complete the chat: after line `index - 1` of a dialogue, which reply comes next? The real next
 * line plus 1–2 lines from other dialogues of the same lesson (a tag in common), else from any
 * other dialogue, else other lines of this one that aren't next to it. Null when there aren't
 * enough lines.
 */
export function chatOptions(
  dialogue: Dialogue,
  lines: Sentence[],
  index: number,
  dialogues: Dialogue[],
  sentences: Sentence[],
  rnd: () => number = Math.random,
): Sentence[] | null {
  const right = lines[index];
  if (!right || index < 1 || lines.length < CHAT_MIN_LINES) return null;
  const byId = new Map(sentences.map((s) => [s.id, s]));
  const linesOf = (d: Dialogue) => d.lines.map((l) => byId.get(l.sentenceId)).filter((s): s is Sentence => !!s);
  const other = dialogues.filter((d) => d.id !== dialogue.id && d.kind !== 'reading');
  const sameLesson = other.filter((d) => d.tags.some((t) => dialogue.tags.includes(t)));
  const ok = (s: Sentence) => s.zh !== right.zh && s.zh !== lines[index - 1].zh;
  const pools = [
    shuffleWith(sameLesson.flatMap(linesOf).filter(ok), rnd),
    shuffleWith(other.filter((d) => !sameLesson.includes(d)).flatMap(linesOf).filter(ok), rnd),
    shuffleWith(lines.filter((s, k) => Math.abs(k - index) > 1 && ok(s)), rnd),
  ];
  const picked: Sentence[] = [];
  const want = rnd() < 0.5 ? 1 : 2;
  for (const s of pools.flat()) {
    if (picked.length >= want) break;
    if (!picked.some((p) => p.zh === s.zh)) picked.push(s);
  }
  if (!picked.length) return null;
  return shuffleWith([right, ...picked], rnd);
}
