/**
 * "Can't listen now": audio exercises are off (and auto-play is muted) for the rest of the
 * session or 15 minutes, whichever is longer. Kept per device; the time survives a reload.
 */
import { useSyncExternalStore } from 'react';
import { getSettings } from './settings';
import { speak } from './speech';

export const QUIET_MINUTES = 15;
const KEY = 'hanzi-vocab:quietUntil';

let until = readUntil();
/** Set while the session that turned it on is still open. */
let sessionActive = false;
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

function readUntil(): number {
  try {
    return Number(localStorage.getItem(KEY)) || 0;
  } catch {
    return 0;
  }
}

function writeUntil(t: number) {
  try {
    if (t) localStorage.setItem(KEY, String(t));
    else localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable: keep in memory */
  }
}

let snapshot = computeQuiet();
function computeQuiet(now: number = Date.now()): boolean {
  return sessionActive || now < until;
}

function emit() {
  snapshot = computeQuiet();
  if (timer) clearTimeout(timer);
  timer = null;
  // Wake up when the 15 minutes are over, so the headphones icon disappears on its own.
  const left = until - Date.now();
  if (left > 0) timer = setTimeout(emit, left + 50);
  listeners.forEach((l) => l());
}
if (until > Date.now()) emit();

export const isQuiet = (): boolean => computeQuiet();

/** "Can't listen now": quiet for this session and at least 15 minutes. */
export function startQuiet(now: number = Date.now()) {
  until = Math.max(until, now + QUIET_MINUTES * 60_000);
  sessionActive = true;
  writeUntil(until);
  emit();
}

/** A session closed: the 15 minutes still apply, but "rest of the session" is over. */
export function endQuietSession() {
  if (!sessionActive) return;
  sessionActive = false;
  emit();
}

/** Tap on the headphones-off icon: listening is back on. */
export function stopQuiet() {
  until = 0;
  sessionActive = false;
  writeUntil(0);
  emit();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export const useQuiet = (): boolean => useSyncExternalStore(subscribe, () => snapshot);

/** Auto-play (when an answer is revealed), unless the setting is off or listening is paused. */
export function autoSpeak(text: string) {
  if (getSettings().autoPlay && !isQuiet()) speak(text);
}
