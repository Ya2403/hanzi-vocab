/**
 * Daily reading: a short text made by an AI chat from my learned words (with the words that need
 * practice most), pasted back and saved as a reading. Pure functions, unit-tested.
 */
import { today } from './date';
import { wordPriority } from './planner';
import { tokenize, type Token } from './reader';
import { parseSentenceBulk, type SentenceRow } from './sentences';
import { isLearned } from './srs';
import type { Dialogue, Word } from './types';

/** The tag every reading and its sentences get. */
export const READING_TAG = 'reading';
/** How many words of the prompt are marked "use these" (highest priority first). */
export const FOCUS_WORDS = 30;
/** Above this share of unknown words the preview warns (saving is still allowed). */
export const UNKNOWN_WARN = 0.05;
/** An unfinished reading of today takes the place of this many exercises in a Practice session. */
export const READING_EXERCISES = 5;

export const isReading = (d: Dialogue): boolean => d.kind === 'reading';

/** Learned words, and the ones that need practice most (by priority). */
export function promptWords(words: Word[], now: number = Date.now()): { learned: Word[]; focus: Word[] } {
  const learned = words.filter(isLearned);
  const focus = learned
    .map((w) => wordPriority(w, now))
    .filter((p): p is NonNullable<typeof p> => !!p)
    .sort((a, b) => b.priority - a.priority)
    .slice(0, FOCUS_WORDS)
    .map((p) => p.word);
  return { learned, focus };
}

/** The prompt to paste into an AI chat. */
export function readingPrompt(words: Word[], now: number = Date.now()): string {
  const { learned, focus } = promptWords(words, now);
  const list = (ws: Word[]) => ws.map((w) => w.hanzi.trim()).join('、');
  return `Write a short Chinese reading for a beginner: 5 to 8 sentences that tell one small story or describe one everyday scene.

Words: use ONLY these words (names and numbers are fine too):
${list(learned)}

Use as many of these as you can (they need practice):
${list(focus)}

Grammar: HSK 1 level only. Simplified characters. Keep sentences short.

Output one sentence per line in this exact format, with no other text before or after:

chinese | translation

Rules:
- chinese: the sentence in simplified Chinese characters, with its punctuation
- translation: a natural English translation (never use "|" inside it)
- No title, no pinyin, no numbering, no markdown, no code block

Example output:
今天我去学校。 | Today I go to school.
我的老师很好。 | My teacher is very nice.`;
}

export interface ReadingPreview {
  rows: SentenceRow[];
  errors: { line: number; text: string; reason: string }[];
  tokens: Token[][];
  /** Word tokens that aren't a learned word ÷ all word tokens. */
  unknownShare: number;
  /** The distinct unknown (or not yet learned) words. */
  unknown: string[];
}

/** Parse a pasted reading (`chinese | translation`, one per line) and find the words I don't know. */
export function previewReading(text: string, words: Word[]): ReadingPreview {
  const { rows, errors } = parseSentenceBulk(text);
  const byHanzi = new Map(words.map((w) => [w.hanzi.trim(), w]));
  const tokens = rows.map((r) => tokenize(r.input.zh, byHanzi));
  const all = tokens.flat().filter((t) => t.kind !== 'other');
  const bad = all.filter((t) => t.kind !== 'learned');
  return {
    rows,
    errors,
    tokens,
    unknownShare: all.length ? bad.length / all.length : 0,
    unknown: [...new Set(bad.map((t) => t.text))],
  };
}

/** "Reading 10 Oct"-style default title. */
export function readingTitle(on: string = today()): string {
  const d = new Date(`${on}T12:00:00`);
  return `Reading ${d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`;
}

/** Today's reading that hasn't been read through yet (the newest one), if any. */
export function pendingReading(dialogues: Dialogue[], on: string = today()): Dialogue | undefined {
  return dialogues
    .filter((d) => isReading(d) && d.readingDate === on && !d.lastRead && d.lines.length > 0)
    .sort((a, b) => b.createdAt - a.createdAt)[0];
}
