import { updateSettings, useSettings } from '../lib/settings';
import type { Direction, PracticeMode } from '../lib/types';
import { Segmented } from './Segmented';
import { TraceOptions } from './TraceOptions';

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
  const { writingStyle, choiceStyle } = useSettings();
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
          <TraceOptions />
          <p className="hint">
            {writingStyle === 'free'
              ? 'Draw the whole character in any order, then tap Check. You get a score, with missing and extra strokes highlighted.'
              : 'Draw each character stroke by stroke; each stroke is checked as you go. After 3 misses on a stroke, a hint appears.'}
          </p>
        </>
      ) : (
        <>
          {mode === 'choice' && (
            <Segmented
              label="Style"
              value={choiceStyle}
              onChange={(v) => updateSettings({ choiceStyle: v })}
              options={[
                { value: 'single', label: 'One word · 4 answers' },
                { value: 'match', label: 'Match pairs' },
              ]}
            />
          )}
          {mode === 'choice' && choiceStyle === 'match' && (
            <p className="hint">Up to 5 words at a time: tap a word, then its match. Words you mismatch come back later.</p>
          )}
          {mode === 'typing' && (
            <p className="hint">
              EN → 中: type the Chinese characters (use a Chinese keyboard). 中 → EN and 中 → 拼音: pick the meaning, then type the pinyin (tone marks or numbers like ni3 hao3; how tones count follows the Tones setting).
            </p>
          )}
          <Segmented
            label="Direction"
            value={direction}
            onChange={onDirection}
            options={[
              { value: 'zh-en', label: '中 → EN' },
              { value: 'en-zh', label: 'EN → 中' },
              { value: 'zh-py', label: '中 → 拼音' },
              { value: 'mixed', label: 'Mixed' },
            ]}
          />
        </>
      )}
    </>
  );
}
