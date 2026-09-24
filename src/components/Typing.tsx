import { useRef, useState, type FormEvent } from 'react';
import { checkChinese, checkMeaning, type Check } from '../lib/answer';
import { Grade } from '../lib/srs';
import { getSettings } from '../lib/settings';
import { speak } from '../lib/speech';
import type { CardDirection, Word } from '../lib/types';
import { SpeakButton } from './SpeakButton';

interface Props {
  word: Word;
  direction: CardDirection;
  onAnswer(quality: number): void;
}

const gradeOf: Record<Check['verdict'], number> = { correct: Grade.Good, close: Grade.Hard, wrong: Grade.Again };

export function Typing({ word, direction, onAnswer }: Props) {
  const [input, setInput] = useState('');
  const [result, setResult] = useState<Check | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const toChinese = direction === 'en-zh';

  const check = (answer: string) => {
    const r = toChinese ? checkChinese(answer, word) : checkMeaning(answer, word.meaning);
    setResult(r);
    if (getSettings().autoPlay) speak(word.hanzi);
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
    if (getSettings().autoPlay) speak(word.hanzi);
  };

  return (
    <div className="practice">
      <div className="card prompt-card">
        <div className="card-kicker">{toChinese ? 'Type it in Chinese (hanzi or pinyin)' : 'Type the meaning'}</div>
        {toChinese ? (
          <div className="prompt-meaning">{word.meaning}</div>
        ) : (
          <>
            <div className="prompt-hanzi" lang="zh-CN">
              {word.hanzi}
            </div>
            {result && <div className="pinyin big">{word.pinyin}</div>}
          </>
        )}
      </div>

      <form className="typing-form" onSubmit={submit}>
        <input
          ref={inputRef}
          className={`input typing-input ${result ? `is-${result.verdict}` : ''}`}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          readOnly={result !== null}
          placeholder={toChinese ? '汉字 / ni3 hao3 / nǐ hǎo' : 'meaning'}
          lang={toChinese ? 'zh-CN' : 'en'}
          autoFocus
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          enterKeyHint={result ? 'next' : 'done'}
          aria-label="Your answer"
        />
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
                <span className="answer-hanzi small-hanzi" lang="zh-CN">
                  {word.hanzi}
                </span>
                <span className="pinyin">{word.pinyin}</span>
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
