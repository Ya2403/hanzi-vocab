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

/** `rate` overrides the speech-rate setting (e.g. the reader's speed control). */
export function speak(text: string, rate?: number): void {
  if (!speechSupported || !text.trim()) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'zh-CN';
  const voice = pickVoice();
  if (voice) u.voice = voice;
  u.rate = rate ?? getSettings().speechRate;
  speechSynthesis.speak(u);
}

/** Read several texts one after another (e.g. a whole dialogue); `onEnd` runs after the last. */
export function speakAll(texts: string[], onEnd?: () => void, rate?: number): void {
  const list = texts.filter((t) => t.trim());
  if (!speechSupported || !list.length) return onEnd?.();
  speechSynthesis.cancel();
  const voice = pickVoice();
  list.forEach((text, i) => {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'zh-CN';
    if (voice) u.voice = voice;
    u.rate = rate ?? getSettings().speechRate;
    if (i === list.length - 1 && onEnd) {
      u.onend = () => onEnd();
      u.onerror = () => onEnd();
    }
    speechSynthesis.speak(u);
  });
}

export function stopSpeaking(): void {
  if (speechSupported) speechSynthesis.cancel();
}
