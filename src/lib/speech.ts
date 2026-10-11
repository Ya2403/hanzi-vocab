import { getSettings } from './settings';

export const speechSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;

function pickVoice(): SpeechSynthesisVoice | null {
  const voices = speechSynthesis.getVoices();
  const norm = (v: SpeechSynthesisVoice) => v.lang.replace('_', '-').toLowerCase();
  return (
    voices.find((v) => norm(v) === 'zh-cn' && v.localService) ??
    voices.find((v) => norm(v) === 'zh-cn') ??
    voices.find((v) => norm(v).startsWith('zh')) ??
    null
  );
}

// Voices load asynchronously in Chromium; calling getVoices() early kicks that off.
if (speechSupported) speechSynthesis.getVoices();

export function hasChineseVoice(): boolean {
  return speechSupported && pickVoice() !== null;
}

export function onVoicesChanged(cb: () => void): () => void {
  if (!speechSupported) return () => {};
  speechSynthesis.addEventListener('voiceschanged', cb);
  return () => speechSynthesis.removeEventListener('voiceschanged', cb);
}

/**
 * Utterances being spoken. Chrome can drop (or cut off) an utterance that is garbage-collected
 * before it ends, so they're kept here until they finish.
 */
const live = new Set<SpeechSynthesisUtterance>();
let pendingTimer: ReturnType<typeof setTimeout> | null = null;

function utterance(text: string, rate: number | undefined, voice: SpeechSynthesisVoice | null): SpeechSynthesisUtterance {
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'zh-CN';
  if (voice) u.voice = voice;
  const r = rate ?? getSettings().speechRate;
  u.rate = Number.isFinite(r) && r > 0 ? r : 0.8;
  live.add(u);
  const done = () => live.delete(u);
  u.addEventListener('end', done);
  u.addEventListener('error', done);
  return u;
}

/**
 * Start speaking, working around browser quirks: speech left paused after the app was in the
 * background (resume it), and Chrome dropping an utterance queued right after cancel() (when
 * something was playing, wait a moment). With nothing playing it speaks at once, which iOS needs
 * for the first sound after a tap.
 */
function start(us: SpeechSynthesisUtterance[]) {
  if (pendingTimer) clearTimeout(pendingTimer);
  pendingTimer = null;
  const busy = speechSynthesis.speaking || speechSynthesis.pending;
  speechSynthesis.cancel();
  if (speechSynthesis.paused) speechSynthesis.resume();
  const go = () => {
    pendingTimer = null;
    us.forEach((u) => speechSynthesis.speak(u));
  };
  if (busy) pendingTimer = setTimeout(go, 60);
  else go();
}

/** `rate` overrides the speech-rate setting (e.g. the reader's speed control). */
export function speak(text: string, rate?: number): void {
  if (!speechSupported || !text.trim()) return;
  start([utterance(text, rate, pickVoice())]);
}

/** Read several texts one after another (e.g. a whole dialogue); `onEnd` runs after the last. */
export function speakAll(texts: string[], onEnd?: () => void, rate?: number): void {
  const list = texts.filter((t) => t.trim());
  if (!speechSupported || !list.length) return onEnd?.();
  const voice = pickVoice();
  const us = list.map((text) => utterance(text, rate, voice));
  if (onEnd) {
    const last = us[us.length - 1];
    last.addEventListener('end', () => onEnd());
    last.addEventListener('error', () => onEnd());
  }
  start(us);
}

export function stopSpeaking(): void {
  if (!speechSupported) return;
  if (pendingTimer) clearTimeout(pendingTimer);
  pendingTimer = null;
  speechSynthesis.cancel();
}
