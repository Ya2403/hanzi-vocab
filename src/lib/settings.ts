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
