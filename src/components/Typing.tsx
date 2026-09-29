import { autoSpeak } from '../lib/quiet';
import { useRef, useState, type FormEvent } from 'react';
import { checkChinese, checkMeaning, checkPinyin, type Check } from '../lib/answer';
import { Grade } from '../lib/srs';
import { usePinyinVisibility, useSettings } from '../lib/settings';
import type { CardDirection, Word } from '../lib/types';
import { SpeakButton } from './SpeakButton';

interface Props {
  word: Word;
  direction: CardDirection;
  /** toneError: typed pinyin had the right syllables but wrong tones (Tones setting not "ignore"). */
  onAnswer(quality: number, toneError?: boolean): void;
}

const gradeOf: Record<Check['verdict'], number> = { correct: Grade.Good, close: Grade.Hard, wrong: Grade.Again };

export function Typing({ word, direction, onAnswer }: Props) {
  const [input, setInput] = useState('');
  const [result, setResult] = useState<Check | null>(null);
  const pv = usePinyinVisibility(direction);
  const { tones } = useSettings();
  const [revealed, setRevealed] = useState(false);
  const pinyinShown = revealed || (result ? pv.answer : pv.question);
  const inputRef = useRef<HTMLInputElement>(null);
  const toChinese = direction === 'en-zh';
  const toPinyinDir = direction === 'zh-py';
  const [hint, setHint] = useState<string | null>(null);
  // In 中 → 拼音 the pinyin is the answer, so it can't be revealed early.
  const canReveal = !pinyinShown && !toPinyinDir;

  const check = (answer: string) => {
    if (toPinyinDir && /[㐀-鿿]/.test(answer)) {
      setHint('Type the pinyin, e.g. ni3 hao3 or nǐ hǎo.');
      return;
    }
    const r = toChinese ? checkChinese(answer, word, tones) : toPinyinDir ? checkPinyin(answer, word.pinyin, tones) : checkMeaning(answer, word.meaning);
    setResult(r);
    autoSpeak(word.hanzi);
    // Keep focus in the field so Enter / the keyboard's Go button continues.
    inputRef.current?.focus();
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!result) {
      if (input.trim()) check(input);
    } else {
      onAnswer(gradeOf[result.verdict], !!result.toneError && tones !== 'ignore');
    }
  };

  const giveUp = () => {
    setResult({ verdict: 'wrong' });
    autoSpeak(word.hanzi);
  };

  return (
    <div className="practice">
      <div className="card prompt-card">
        <div className="card-kicker">
          {toChinese ? 'Type it in Chinese (hanzi or pinyin)' : toPinyinDir ? 'Type the pinyin' : 'Type the meaning'}
        </div>
        {toChinese ? (
          <div className="prompt-meaning">{word.meaning}</div>
        ) : (
          <>
            <div
              className={`prompt-hanzi ${canReveal ? 'can-reveal' : ''}`}
              lang="zh-CN"
              onClick={canReveal ? () => setRevealed(true) : undefined}
              title={canReveal ? 'Tap to show pinyin' : undefined}
            >
              {word.hanzi}
            </div>
            {pinyinShown ? (
              <div className="pinyin big">{word.pinyin}</div>
            ) : canReveal ? (
              <div className="reveal-hint">tap the characters for pinyin</div>
            ) : null}
          </>
        )}
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
          placeholder={toChinese ? (tones === 'ignore' ? '汉字 / ni hao' : '汉字 / ni3 hao3 / nǐ hǎo') : toPinyinDir ? (tones === 'ignore' ? 'ni hao' : 'ni3 hao3 / nǐ hǎo') : 'meaning'}
          lang={toChinese ? 'zh-CN' : 'en'}
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
                  {word.hanzi}
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
