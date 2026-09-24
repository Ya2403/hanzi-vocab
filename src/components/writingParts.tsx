import { updateSettings, useSettings } from '../lib/settings';
import type { Word } from '../lib/types';
import { SpeakButton } from './SpeakButton';

/** Inner padding of the writing board; Hanzi Writer and the free-draw pad must agree on it. */
export const BOARD_PADDING = 12;
export const MAX_BOARD_SIZE = 300;

export const cssVar = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

export function WritingPrompt({ word }: { word: Word }) {
  const { showPinyin } = useSettings();
  return (
    <div className="card prompt-card writing-prompt">
      <div className="card-kicker">Write in Chinese</div>
      <div className="prompt-meaning">{word.meaning}</div>
      <div className="answer-head">
        <span className="pinyin big">{word.pinyin}</span>
        <SpeakButton text={word.hanzi} />
      </div>
      {!showPinyin && <div className="reveal-hint">Pinyin stays visible in writing: it’s part of the prompt.</div>}
    </div>
  );
}

/** Progress boxes for multi-character words; finished characters are filled in. */
export function CharSlots({ chars, index, done }: { chars: string[]; index: number; done: boolean }) {
  if (chars.length < 2) return null;
  return (
    <div className="char-slots" aria-label={`Character ${Math.min(index + 1, chars.length)} of ${chars.length}`}>
      {chars.map((c, i) => (
        <span key={i} className={`char-slot ${i === index && !done ? 'current' : ''}`} lang="zh-CN">
          {i < index || done ? c : ''}
        </span>
      ))}
    </div>
  );
}

/** 米字格 practice grid. */
export function RiceGrid() {
  return (
    <svg className="rice-grid" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <rect x="0.5" y="0.5" width="99" height="99" />
      <line x1="0" y1="0" x2="100" y2="100" />
      <line x1="100" y1="0" x2="0" y2="100" />
      <line x1="50" y1="0" x2="50" y2="100" />
      <line x1="0" y1="50" x2="100" y2="50" />
    </svg>
  );
}

/** Switch between Hanzi Writer's stroke-by-stroke quiz and free drawing (restarts the card). */
export function WritingStyleToggle() {
  const { writingStyle } = useSettings();
  return (
    <div className="style-toggle" role="radiogroup" aria-label="Writing style">
      {(
        [
          ['strokes', 'Stroke by stroke'],
          ['free', 'Free draw'],
        ] as const
      ).map(([value, label]) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={writingStyle === value}
          className={writingStyle === value ? 'active' : ''}
          onClick={() => updateSettings({ writingStyle: value })}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
