import { updateSettings, useSettings } from '../lib/settings';
import type { Direction, PracticeMode } from '../lib/types';
import { Segmented } from './Segmented';

export const MIN_CHOICE_WORDS = 4;

/** Whether a session in `mode` can run with `totalWords` words in the list. */
export const modeAvailable = (mode: PracticeMode, totalWords: number) => mode !== 'choice' || totalWords >= MIN_CHOICE_WORDS;

export function SessionOptions({
  mode,
  direction,
  onMode,
  onDirection,
  totalWords,
}: {
  mode: PracticeMode;
  direction: Direction;
  onMode(m: PracticeMode): void;
  onDirection(d: Direction): void;
  totalWords: number;
}) {
  const { writingOutline, writingStyle } = useSettings();
  return (
    <>
      <Segmented
        label="Mode"
        value={mode}
        onChange={onMode}
        options={[
          { value: 'flashcards', label: 'Cards' },
          { value: 'choice', label: 'Choice' },
          { value: 'typing', label: 'Typing' },
          { value: 'writing', label: 'Writing' },
        ]}
      />
      {!modeAvailable(mode, totalWords) && (
        <p className="hint warn">Multiple choice needs at least {MIN_CHOICE_WORDS} words in your list.</p>
      )}
      {mode === 'writing' ? (
        <>
          <Segmented
            label="Writing style"
            value={writingStyle}
            onChange={(s) => updateSettings({ writingStyle: s })}
            options={[
              { value: 'strokes', label: 'Stroke by stroke' },
              { value: 'free', label: 'Free draw' },
            ]}
          />
          <label className="toggle">
            <input type="checkbox" checked={writingOutline} onChange={(e) => updateSettings({ writingOutline: e.target.checked })} />
            <span>Tracing mode: show a faint outline of the character</span>
          </label>
          <p className="hint">
            {writingStyle === 'free'
              ? 'Draw the whole character in any order, then tap Check. You get a score, with missing and extra strokes highlighted.'
              : 'Draw each character stroke by stroke; each stroke is checked as you go. After 3 misses on a stroke, a hint appears.'}
          </p>
        </>
      ) : (
        <>
          {mode === 'typing' && (
            <p className="hint">
              中 → EN: type the meaning. EN → 中: type hanzi or pinyin (tone marks or numbers like ni3 hao3; toneless counts as “close”).
            </p>
          )}
          <Segmented
            label="Direction"
            value={direction}
            onChange={onDirection}
            options={[
              { value: 'zh-en', label: '中 → EN' },
              { value: 'en-zh', label: 'EN → 中' },
              { value: 'mixed', label: 'Mixed' },
            ]}
          />
        </>
      )}
    </>
  );
}
