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
  const { writingOutline } = useSettings();
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
          <label className="toggle">
            <input type="checkbox" checked={writingOutline} onChange={(e) => updateSettings({ writingOutline: e.target.checked })} />
            <span>Tracing mode: show a faint outline of the character</span>
          </label>
          <p className="hint">
            You see the meaning and pinyin, then draw each character stroke by stroke. After 3 misses on a stroke, a hint appears.
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
