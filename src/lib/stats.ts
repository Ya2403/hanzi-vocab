import { isRusty, strength, type Strength } from './planner';
import { isReadable } from './sentenceLearn';
import type { Links } from './sentences';
import { isLearned } from './srs';
import { isCharEntry } from './entries';
import type { Dialogue, Sentence, Word } from './types';

export interface StrengthCounts {
  new: number;
  weak: number;
  medium: number;
  strong: number;
  /** Learned words with a skill under 70% retrievability. */
  rusty: number;
}

/** Characters by strength (words and names have no schedule). */
export function strengthCounts(words: Word[], now: number = Date.now()): StrengthCounts {
  const c: StrengthCounts = { new: 0, weak: 0, medium: 0, strong: 0, rusty: 0 };
  for (const w of words) {
    if (!isCharEntry(w)) continue;
    if (!isLearned(w)) {
      c.new++;
      continue;
    }
    c[strength(w) as Strength]++;
    if (isRusty(w, now)) c.rusty++;
  }
  return c;
}

/** Words by strength, per tag. */
export function strengthByTag(words: Word[], now: number = Date.now()): ({ tag: string } & StrengthCounts)[] {
  const chars = words.filter(isCharEntry);
  const tags = [...new Set(chars.flatMap((w) => w.tags))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  return tags.map((tag) => ({ tag, ...strengthCounts(chars.filter((w) => w.tags.includes(tag)), now) }));
}

/** Learned words with tone errors, most first. */
export const toneTrouble = (words: Word[]): Word[] =>
  words.filter((w) => isLearned(w) && (w.toneErrors ?? 0) > 0).sort((a, b) => (b.toneErrors ?? 0) - (a.toneErrors ?? 0));

export interface Readable {
  readable: number;
  total: number;
}

const readableOf = (list: Sentence[], links: Links): Readable => ({ readable: list.filter((s) => isReadable(s, links)).length, total: list.length });

/** Readable sentences (all their words learned): overall, per tag and per dialogue. */
export function readableStats(sentences: Sentence[], dialogues: Dialogue[], links: Links) {
  const byId = new Map(sentences.map((s) => [s.id, s]));
  const tags = [...new Set(sentences.flatMap((s) => s.tags))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  return {
    all: readableOf(sentences, links),
    tags: tags.map((tag) => ({ tag, ...readableOf(sentences.filter((s) => s.tags.includes(tag)), links) })),
    dialogues: dialogues
      .filter((d) => d.kind !== 'reading')
      .sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true }))
      .map((d) => ({ dialogue: d, ...readableOf(d.lines.map((l) => byId.get(l.sentenceId)).filter((s): s is Sentence => !!s), links) })),
  };
}

export interface EntryProgress {
  charsLearned: number;
  chars: number;
  wordsUnlocked: number;
  words: number;
}

function progressOf(list: Word[]): EntryProgress {
  const p: EntryProgress = { charsLearned: 0, chars: 0, wordsUnlocked: 0, words: 0 };
  for (const w of list) {
    if (isCharEntry(w)) {
      p.chars++;
      if (isLearned(w)) p.charsLearned++;
    } else {
      p.words++;
      if (isLearned(w)) p.wordsUnlocked++;
    }
  }
  return p;
}

/** Characters learned and words (and names) unlocked: overall and per tag. */
export function entryProgress(words: Word[]): { all: EntryProgress; tags: ({ tag: string } & EntryProgress)[] } {
  const tags = [...new Set(words.flatMap((w) => w.tags))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  return { all: progressOf(words), tags: tags.map((tag) => ({ tag, ...progressOf(words.filter((w) => w.tags.includes(tag))) })) };
}
