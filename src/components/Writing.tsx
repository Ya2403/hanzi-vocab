import { useEffect, useRef, useState } from 'react';
import HanziWriter from 'hanzi-writer';
import { Grade } from '../lib/srs';
import { getSettings, useSettings } from '../lib/settings';
import { speak } from '../lib/speech';
import { charDataLoader, writableChars } from '../lib/strokes';
import type { Word } from '../lib/types';
import { BOARD_PADDING, CharSlots, cssVar, MAX_BOARD_SIZE, RiceGrid, WritingPrompt, WritingStyleToggle } from './writingParts';

interface Props {
  word: Word;
  onAnswer(quality: number): void;
  /** Leave the card ungraded (e.g. stroke data unavailable offline). */
  onSkip(): void;
}

type Status = 'loading' | 'writing' | 'animating' | 'done' | 'error';

/** Mistakes → SM-2 quality. Using "Show strokes" caps the grade at Hard; giving up is Again. */
function gradeFor(mistakes: number, chars: number, helped: boolean, gaveUp: boolean): number {
  if (gaveUp) return Grade.Again;
  if (mistakes > chars * 3) return Grade.Again;
  if (mistakes > 0 || helped) return Grade.Hard;
  return Grade.Good;
}

export function Writing({ word, onAnswer, onSkip }: Props) {
  const { writingOutline } = useSettings();
  const chars = writableChars(word.hanzi);
  const hostRef = useRef<HTMLDivElement>(null);
  const writerRef = useRef<HanziWriter | null>(null);
  const [index, setIndex] = useState(0);
  const [status, setStatus] = useState<Status>('loading');
  const [mistakes, setMistakes] = useState(0);
  const [helped, setHelped] = useState(false);
  const [gaveUp, setGaveUp] = useState(false);
  const [error, setError] = useState('');

  const finish = () => {
    setStatus('done');
    if (getSettings().autoPlay) speak(word.hanzi);
  };

  const startQuiz = (writer: HanziWriter) => {
    setStatus('writing');
    writer.quiz({
      showHintAfterMisses: 3,
      leniency: 1.1,
      onMistake: () => setMistakes((m) => m + 1),
      onComplete: () => {
        // Brief pause so the completion flash is visible before moving on.
        setTimeout(() => {
          if (index + 1 < chars.length) setIndex(index + 1);
          else finish();
        }, 450);
      },
    });
  };

  // One HanziWriter per character; rebuilt when moving to the next character.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    if (!chars.length) {
      setError('This word has no Chinese characters to write.');
      setStatus('error');
      return;
    }
    let active = true;
    const size = Math.min(MAX_BOARD_SIZE, host.parentElement?.clientWidth ?? MAX_BOARD_SIZE);
    setStatus('loading');
    const writer = HanziWriter.create(host, chars[index], {
      width: size,
      height: size,
      padding: BOARD_PADDING,
      showCharacter: false,
      showOutline: writingOutline,
      strokeColor: cssVar('--text'),
      outlineColor: cssVar('--border'),
      drawingColor: cssVar('--muted'),
      highlightColor: cssVar('--accent'),
      drawingWidth: 6,
      charDataLoader,
      onLoadCharDataSuccess: () => active && startQuiz(writer),
      onLoadCharDataError: (e) => {
        if (!active) return;
        setError(e instanceof Error ? e.message : 'Couldn’t load stroke data. Are you offline?');
        setStatus('error');
      },
    });
    writerRef.current = writer;
    return () => {
      active = false;
      writer.cancelQuiz();
      writerRef.current = null;
      host.innerHTML = '';
    };
  }, [index]);

  const showStrokes = () => {
    const writer = writerRef.current;
    if (!writer || status !== 'writing') return;
    setHelped(true);
    setStatus('animating');
    writer.cancelQuiz();
    writer.animateCharacter({
      onComplete: () => {
        writer.hideCharacter();
        startQuiz(writer);
      },
    });
  };

  const giveUp = () => {
    writerRef.current?.cancelQuiz();
    writerRef.current?.showCharacter();
    setGaveUp(true);
    finish();
  };

  const next = () => onAnswer(gradeFor(mistakes, chars.length, helped, gaveUp));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (status === 'done' && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        next();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const grade = gradeFor(mistakes, chars.length, helped, gaveUp);

  return (
    <div className="practice">
      <WritingPrompt word={word} />
      <WritingStyleToggle />
      <CharSlots chars={chars} index={index} done={status === 'done'} />

      <div className="writing-board">
        <RiceGrid />
        <div ref={hostRef} className="writer-host" />
        {status === 'loading' && <div className="board-overlay muted small">Loading strokes…</div>}
        {status === 'error' && (
          <div className="board-overlay">
            <p className="hint error">{error}</p>
            <button className="btn" onClick={onSkip}>
              Skip this word
            </button>
          </div>
        )}
      </div>

      {(status === 'writing' || status === 'animating') && (
        <div className="writing-actions">
          <span className="muted small">
            {mistakes === 0 ? 'Draw each stroke in order' : `${mistakes} mistake${mistakes > 1 ? 's' : ''}`}
          </span>
          <span className="row">
            <button className="btn small-btn" onClick={showStrokes} disabled={status !== 'writing'}>
              Show strokes
            </button>
            <button className="btn small-btn ghost" onClick={giveUp}>
              Reveal
            </button>
          </span>
        </div>
      )}

      {status === 'done' && (
        <div className={`feedback ${grade >= Grade.Good ? 'ok' : grade >= Grade.Hard ? 'meh' : 'bad'}`}>
          <span>
            <b lang="zh-CN">{word.hanzi}</b>{' '}
            {gaveUp
              ? '— revealed. It’ll come back.'
              : mistakes === 0 && !helped
                ? '— perfect!'
                : `— ${mistakes} mistake${mistakes === 1 ? '' : 's'}${helped ? ', used stroke demo' : ''}`}
          </span>
          <button className="btn primary" onClick={next} autoFocus>
            Continue
          </button>
        </div>
      )}
    </div>
  );
}
