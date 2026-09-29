import { useLayoutEffect, useRef, useState } from 'react';
import { useSettings } from '../lib/settings';
import { Grade, skillState, WRITING_START_INTERVAL } from '../lib/srs';
import { writableChars } from '../lib/strokes';
import type { Word } from '../lib/types';
import { FreeDraw, StrokeOrderAnimation } from './FreeDraw';
import { Writing, type WritingAttempt } from './Writing';
import { MAX_BOARD_SIZE, RiceGrid, WritingPrompt, WritingStyleToggle } from './writingParts';

/** Stroke by stroke: a blank attempt with more mistakes than this is traced and written once more. */
export const REPEAT_MISTAKES = 2;

type Phase = 'animate' | 'trace' | 'blank' | 'retrace' | 'reblank';

const LABEL: Record<Phase, string> = {
  animate: 'Watch the stroke order',
  trace: 'Trace it',
  blank: 'Write it from memory',
  retrace: 'Once more: trace it',
  reblank: 'Once more: from memory',
};

/** Tracing applies to every word, to new or weak ones (writing interval under 6 days), or never. */
export function tracesFor(word: Word, mode: 'always' | 'weak' | 'never'): boolean {
  if (mode === 'never') return false;
  if (mode === 'always') return true;
  return !word.skills.writing || skillState(word, 'writing').interval < WRITING_START_INTERVAL;
}

/** Whether a first blank attempt went badly enough to trace and write the character again. */
export function needsRepeat(q: number, a: WritingAttempt | undefined, style: 'strokes' | 'free'): boolean {
  if (q < Grade.Hard || a?.gaveUp) return true;
  return style === 'strokes' ? (a?.mistakes ?? 0) > REPEAT_MISTAKES : q < Grade.Good;
}

/**
 * The writing exercise, one character at a time:
 * 1. the stroke-order animation (optional, with Skip);
 * 2. trace over the faint outline (not graded);
 * 3. write it from memory on a blank grid: this first blank attempt is the grade;
 * 4. if it went badly, trace and write it once more (the grade stays).
 * `blankOnly`: the delayed recall later in a session, just the blank grid.
 */
export function WritingFlow({
  word,
  onAnswer,
  onSkip,
  blankOnly = false,
}: {
  word: Word;
  onAnswer(q: number): void;
  onSkip(): void;
  blankOnly?: boolean;
}) {
  const { writingStyle, traceMode, strokeOrderFirst } = useSettings();
  const chars = writableChars(word.hanzi);
  const [trace] = useState(() => !blankOnly && tracesFor(word, traceMode));
  const firstPhase = (): Phase => (trace ? (strokeOrderFirst ? 'animate' : 'trace') : 'blank');
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>(firstPhase);
  const [grades, setGrades] = useState<number[]>([]);

  const nextChar = (all: number[]) => {
    if (index + 1 < chars.length) {
      setIndex(index + 1);
      setPhase(firstPhase());
    } else {
      // The word is as good as its weakest character.
      onAnswer(Math.min(...all));
    }
  };

  const done = (q: number, a?: WritingAttempt) => {
    if (phase === 'animate') return setPhase('trace');
    if (phase === 'trace') return setPhase('blank');
    if (phase === 'retrace') return setPhase('reblank');
    if (phase === 'reblank') return nextChar(grades);
    // First blank attempt: the grade.
    const all = [...grades, q];
    setGrades(all);
    // The delayed recall is blank only: no tracing, even after a miss.
    if (!blankOnly && needsRepeat(q, a, writingStyle)) setPhase('retrace');
    else nextChar(all);
  };

  if (!chars.length) {
    return <Writing word={word} onAnswer={onAnswer} onSkip={onSkip} />;
  }

  const char = chars[index];
  const label = `${LABEL[phase]}${chars.length > 1 ? ` · character ${index + 1} of ${chars.length}` : ''}`;
  const tracing = phase === 'trace' || phase === 'retrace';
  const key = `${writingStyle}-${index}-${phase}`;

  if (phase === 'animate') {
    return <AnimateStep key={key} word={word} char={char} label={label} onDone={() => done(Grade.Good)} />;
  }
  return writingStyle === 'free' ? (
    <FreeDraw key={key} word={word} chars={[char]} outline={tracing} label={label} onAnswer={done} onSkip={onSkip} />
  ) : (
    <Writing key={key} word={word} chars={[char]} outline={tracing} label={label} autoAdvance={tracing} onAnswer={done} onSkip={onSkip} />
  );
}

/** Step 1: the stroke-order animation on the board, once, with Skip. */
function AnimateStep({ word, char, label, onDone }: { word: Word; char: string; label: string; onDone(): void }) {
  // Same size as the other writing boards (CSS decides; the animation needs it in pixels).
  const boardRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(0);
  useLayoutEffect(() => setSize(Math.min(MAX_BOARD_SIZE, boardRef.current?.clientWidth ?? MAX_BOARD_SIZE)), []);
  return (
    <div className="practice writing-practice">
      <WritingPrompt word={word} label={label} />
      <WritingStyleToggle />
      <div className="writing-board" ref={boardRef}>
        <RiceGrid />
        {size > 0 && <StrokeOrderAnimation char={char} size={size} onDone={onDone} />}
      </div>
      <div className="writing-actions">
        <span className="muted small">Watch how {char} is written</span>
        <button className="btn small-btn" onClick={onDone} autoFocus>
          Skip
        </button>
      </div>
    </div>
  );
}
