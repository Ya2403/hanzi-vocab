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

export function speak(text: string): void {
  if (!speechSupported || !text.trim()) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'zh-CN';
  const voice = pickVoice();
  if (voice) u.voice = voice;
  u.rate = getSettings().speechRate;
  speechSynthesis.speak(u);
}
