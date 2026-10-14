import { autoSpeak } from '../lib/quiet';
import { useRef, useState, type FormEvent } from 'react';
import { checkChinese, type Check } from '../lib/answer';
import { Grade } from '../lib/srs';
import { usePinyinVisibility } from '../lib/settings';
import type { Word } from '../lib/types';
import { HanziText } from './HanziText';
import { SpeakButton } from './SpeakButton';

interface Props {
  word: Word;
  onAnswer(quality: number): void;
}

const gradeOf: Record<Check['verdict'], number> = { correct: Grade.Good, close: Grade.Hard, wrong: Grade.Again };

/** EN → 中: see the meaning, type the characters (with the phone's Chinese keyboard). */
export function Typing({ word, onAnswer }: Props) {
  const [input, setInput] = useState('');
  const [result, setResult] = useState<Check | null>(null);
  const pv = usePinyinVisibility('en-zh');
  const [revealed, setRevealed] = useState(false);
  const pinyinShown = revealed || (result ? pv.answer : pv.question);
  const inputRef = useRef<HTMLInputElement>(null);
  const [hint, setHint] = useState<string | null>(null);

  const check = (answer: string) => {
    if (!/[㐀-鿿]/.test(answer)) {
      setHint('Type the characters (汉字) — switch to a Chinese keyboard, e.g. Chinese pinyin input.');
      return;
    }
    setResult(checkChinese(answer, word));
    autoSpeak(word.hanzi);
    // Keep focus in the field so Enter / the keyboard's Go button continues.
    inputRef.current?.focus();
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!result) {
      if (input.trim()) check(input);
    } else {
      onAnswer(gradeOf[result.verdict]);
    }
  };

  const giveUp = () => {
    setResult({ verdict: 'wrong' });
    autoSpeak(word.hanzi);
  };

  return (
    <div className="practice">
      <div className="card prompt-card">
        <div className="card-kicker">Type the Chinese characters</div>
        <div className="prompt-meaning">{word.meaning}</div>
      </div>

      <form className="typing-form" onSubmit={submit}>
        <input
          ref={inputRef}
          className={`input typing-input ${result ? `is-${result.verdict}` : ''}`}
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setHint(null);
          }}
          readOnly={result !== null}
          placeholder="汉字"
          lang="zh-CN"
          autoFocus
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          enterKeyHint={result ? 'next' : 'done'}
          aria-label="Your answer"
        />
        {hint && !result && <p className="hint warn">{hint}</p>}
        {!result && (
          <div className="row typing-buttons">
            <button type="button" className="btn ghost" onClick={giveUp}>
              Don’t know
            </button>
            <button type="submit" className="btn primary" disabled={!input.trim()}>
              Check
            </button>
          </div>
        )}

        {result && (
          <div className={`feedback typing-feedback ${result.verdict === 'correct' ? 'ok' : result.verdict === 'close' ? 'meh' : 'bad'}`}>
            <div className="typing-answer">
              <div>
                <b>{result.verdict === 'correct' ? 'Correct!' : result.verdict === 'close' ? 'Close' : input.trim() ? 'Not quite' : 'Answer'}</b>
                {result.note && <span> · {result.note}</span>}
              </div>
              <div className="answer-head">
                <span
                  className={`answer-hanzi small-hanzi ${pinyinShown ? '' : 'can-reveal'}`}
                  lang="zh-CN"
                  onClick={pinyinShown ? undefined : () => setRevealed(true)}
                  title={pinyinShown ? undefined : 'Tap to show pinyin'}
                >
                  <HanziText text={word.hanzi} />
                </span>
                {pinyinShown ? <span className="pinyin">{word.pinyin}</span> : <span className="reveal-hint">tap for pinyin</span>}
                <SpeakButton text={word.hanzi} />
              </div>
              <div>{word.meaning}</div>
            </div>
            <div className="row typing-buttons">
              {result.verdict !== 'correct' && input.trim() && (
                <button type="button" className="btn ghost" onClick={() => onAnswer(Grade.Good)}>
                  I was right
                </button>
              )}
              <button type="submit" className="btn primary">
                Continue
              </button>
            </div>
          </div>
        )}
      </form>
    </div>
  );
}
