import { useSyncExternalStore } from 'react';
import type { Direction, PracticeMode } from './types';

/** Per-device UI preferences (not vocabulary data), kept in localStorage. */
export interface Settings {
  autoPlay: boolean;
  speechRate: number;
  reviewMode: PracticeMode;
  reviewDirection: Direction;
  practiceMode: PracticeMode;
  practiceDirection: Direction;
  /** Writing mode: show a faint outline to trace instead of writing from memory. */
  writingOutline: boolean;
  /** Writing mode: Hanzi Writer's stroke-by-stroke quiz, or draw the whole character then check. */
  writingStyle: 'strokes' | 'free';
  /** A word becomes a leech after this many lapses. */
  leechThreshold: number;
  /** Pinyin on practice question sides and under example sentences. */
  showPinyin: boolean;
  /** When pinyin is hidden, still show it once the card is answered. */
  pinyinAfterAnswer: boolean;
  /** Pinyin in the word list (separate from practice). */
  listPinyin: boolean;
  /** Whether the Breakdown section on flashcard backs is expanded. */
  breakdownOpen: boolean;
}

const KEY = 'hanzi-vocab:settings';
const defaults: Settings = {
  autoPlay: true,
  speechRate: 0.8,
  reviewMode: 'flashcards',
  reviewDirection: 'zh-en',
  practiceMode: 'choice',
  practiceDirection: 'mixed',
  writingOutline: false,
  breakdownOpen: false,
  writingStyle: 'strokes',
  leechThreshold: 5,
  showPinyin: true,
  pinyinAfterAnswer: true,
  listPinyin: true,
};

let current: Settings = load();
const listeners = new Set<() => void>();

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...defaults, ...JSON.parse(raw) } : defaults;
  } catch {
    return defaults;
  }
}

export const getSettings = (): Settings => current;

export function updateSettings(patch: Partial<Settings>): void {
  current = { ...current, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* storage unavailable: keep in memory */
  }
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function useSettings(): Settings {
  return useSyncExternalStore(subscribe, getSettings);
}

/**
 * Where practice pinyin is visible. `question`: before answering; `answer`: after answering
 * (hidden pinyin can still come back on the answer side via "Show pinyin after answering").
 */
export function usePinyinVisibility(): { question: boolean; answer: boolean } {
  const { showPinyin, pinyinAfterAnswer } = useSettings();
  return { question: showPinyin, answer: showPinyin || pinyinAfterAnswer };
}
