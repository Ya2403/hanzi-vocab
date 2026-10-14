/**
 * Characters and words. Characters (one hanzi, or a radical) are what you learn: they have the
 * Learn flow, skills and FSRS. Words (2+ hanzi, phrases with "…", entries tagged "phrases") and
 * names (tagged "names") are use cases of their characters: no Learn queue and no schedule, only
 * background statistics, and they unlock once all their characters are learned.
 * Pure functions (unit-tested).
 */
import { PLACEHOLDER } from './words';
import type { Skills, Word, WordStats } from './types';

export type EntryKind = 'char' | 'word' | 'name';

const CJK = /[㐀-鿿豈-﫿\u{20000}-\u{2fa1f}]/u;
const hasTag = (w: Pick<Word, 'tags'>, tag: string) => w.tags.some((t) => t.trim().toLowerCase() === tag);

/** The distinct characters of an entry, in order ("…" and punctuation left out). */
export const entryChars = (hanzi: string): string[] => [...new Set([...hanzi].filter((c) => CJK.test(c)))];

/** The kind detected from the entry itself (the editor can override it). */
export function detectKind(w: Pick<Word, 'hanzi' | 'tags'>): EntryKind {
  if (hasTag(w, 'names')) return 'name';
  if (w.hanzi.includes(PLACEHOLDER) || hasTag(w, 'phrases') || [...w.hanzi.trim()].filter((c) => CJK.test(c)).length >= 2) return 'word';
  return 'char';
}

export const entryKind = (w: Pick<Word, 'hanzi' | 'tags' | 'kind'>): EntryKind => w.kind ?? detectKind(w);
export const isCharEntry = (w: Pick<Word, 'hanzi' | 'tags' | 'kind'>): boolean => entryKind(w) === 'char';
/** Words and names: no schedule, unlocked by their characters. */
export const isWordEntry = (w: Pick<Word, 'hanzi' | 'tags' | 'kind'>): boolean => entryKind(w) !== 'char';

/** A character counts as learned once Learn has given it its skills. */
const charLearned = (w: Word) => !!w.skills.meaning;

// ---------- Links between words and characters ----------

export interface CharSlot {
  char: string;
  /** The character's own entry, if it's in the list. */
  entry?: Word;
}

export interface CharLinks {
  /** Word id → its characters, in order (with their entries when they're in the list). */
  charsOf: Map<string, CharSlot[]>;
  /** Character entry id → words that contain it. */
  usedIn: Map<string, Word[]>;
  /** Character → its entry (first one, if several). */
  charEntry: Map<string, Word>;
}

export function computeCharLinks(words: Word[]): CharLinks {
  const charEntry = new Map<string, Word>();
  for (const w of words) if (isCharEntry(w) && !charEntry.has(w.hanzi.trim())) charEntry.set(w.hanzi.trim(), w);
  const charsOf = new Map<string, CharSlot[]>();
  const usedIn = new Map<string, Word[]>();
  for (const w of words) {
    if (!isWordEntry(w)) continue;
    const slots = entryChars(w.hanzi).map((char) => ({ char, entry: charEntry.get(char) }));
    charsOf.set(w.id, slots);
    for (const s of slots) if (s.entry) usedIn.set(s.entry.id, [...(usedIn.get(s.entry.id) ?? []), w]);
  }
  return { charsOf, usedIn, charEntry };
}

/** Characters of a word that aren't in the list at all. */
export const missingChars = (slots: CharSlot[]): string[] => slots.filter((s) => !s.entry).map((s) => s.char);

/** Characters of a word that block it: not in the list, or not learned yet. */
export const lockingChars = (slots: CharSlot[]): string[] => slots.filter((s) => !s.entry || !charLearned(s.entry)).map((s) => s.char);

/**
 * Words whose unlocked state changed: `unlockedOn` is set (to `on`) when the last of their
 * characters is learned, and cleared when one isn't learned any more (e.g. its progress was reset).
 */
export function unlockChanges(words: Word[], on: string): Word[] {
  const { charsOf } = computeCharLinks(words);
  const out: Word[] = [];
  for (const w of words) {
    const slots = charsOf.get(w.id);
    if (!slots) {
      // A character (or an entry whose kind changed back): no unlock date.
      if (w.unlockedOn) out.push({ ...w, unlockedOn: undefined });
      continue;
    }
    const open = slots.length > 0 && lockingChars(slots).length === 0;
    if (open && !w.unlockedOn) out.push({ ...w, unlockedOn: on });
    else if (!open && w.unlockedOn) out.push({ ...w, unlockedOn: undefined });
  }
  return out;
}

// ---------- Background statistics of words ----------

/** A word stops needing work after this many right answers in a row. */
export const NEEDS_WORK_CLEAR = 2;

/** Record one answer for a word: accuracy, last 5 results, when it was seen, "needs work". */
export function recordWordAnswer(w: Word, ok: boolean, now: number = Date.now()): Word {
  const s = w.stats ?? { answered: 0, correct: 0, recent: '' };
  const okStreak = ok ? (s.okStreak ?? 0) + 1 : 0;
  const stats: WordStats = {
    answered: s.answered + 1,
    correct: s.correct + (ok ? 1 : 0),
    recent: (s.recent + (ok ? '1' : '0')).slice(-5),
    lastSeen: now,
    okStreak,
    needsWork: !ok ? true : s.needsWork && okStreak < NEEDS_WORK_CLEAR ? true : undefined,
  };
  return { ...w, stats };
}

/** A lookup (tapping the word for a hint): counts as a miss and flags it. */
export const recordWordLookup = (w: Word, now: number = Date.now()): Word => recordWordAnswer(w, false, now);

export const needsWork = (w: Word): boolean => !!w.stats?.needsWork;
export const wordAccuracy = (w: Word): number | null => (w.stats?.answered ? w.stats.correct / w.stats.answered : null);

/** Statistics carried over from a word's old per-skill progress (totals, latest results, last seen). */
export function statsFromSkills(skills: Skills): WordStats | undefined {
  const list = Object.values(skills).filter((s): s is NonNullable<typeof s> => !!s);
  if (!list.length) return undefined;
  const answered = list.reduce((n, s) => n + (s.answered ?? 0), 0);
  const correct = list.reduce((n, s) => n + (s.correct ?? 0), 0);
  const latest = [...list].sort((a, b) => (b.lastSeen ?? 0) - (a.lastSeen ?? 0))[0];
  const lastSeen = Math.max(0, ...list.map((s) => s.lastSeen ?? 0)) || undefined;
  return { answered, correct, recent: latest.recent ?? '', lastSeen };
}

/**
 * Bring an entry in line with its kind:
 * - a word or name that still has skills (from before characters and words, or from a device on
 *   an older version) keeps them in `legacySkills` (nothing is deleted) and gets background
 *   statistics from them;
 * - a character without skills that has legacy ones (its kind was changed back) gets them back.
 * Returns the same object when nothing changes.
 */
export function reconcileKind(w: Word): Word {
  const hasSkills = Object.keys(w.skills).length > 0;
  if (isWordEntry(w) && hasSkills) {
    const legacySkills: Skills = { ...w.legacySkills, ...w.skills };
    return { ...w, skills: {}, legacySkills, stats: w.stats ?? statsFromSkills(w.skills) };
  }
  if (isCharEntry(w) && !hasSkills && w.legacySkills && Object.keys(w.legacySkills).length) {
    const { legacySkills, ...rest } = w;
    return { ...rest, skills: legacySkills };
  }
  return w;
}

/** Whether an entry needs reconcileKind (for one-time migrations of stored data). */
export const needsReconcile = (w: Word): boolean => reconcileKind(w) !== w;

