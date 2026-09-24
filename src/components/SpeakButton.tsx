import type { MouseEvent } from 'react';
import { speak, speechSupported } from '../lib/speech';
import { Icon } from './Icon';

export function SpeakButton({ text, size = 20, label = 'Play audio' }: { text: string; size?: number; label?: string }) {
  if (!speechSupported) return null;
  const onClick = (e: MouseEvent) => {
    e.stopPropagation();
    speak(text);
  };
  return (
    <button type="button" className="icon-btn speak" onClick={onClick} aria-label={label} title={label}>
      <Icon name="speaker" size={size} />
    </button>
  );
}
