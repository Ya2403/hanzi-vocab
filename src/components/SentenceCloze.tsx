import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useStore } from '../store';
import { checkChinese, type Check } from '../lib/answer';
import { toPinyin } from '../lib/pinyin';
import { getSettings, usePinyinVisibility, useSettings } from '../lib/settings';
import { speak } from '../lib/speech';
import { Grade } from '../lib/srs';
import { findSentences, matchLabel, pickRotating, useCorpus } from '../lib/tatoeba';
import type { Word } from '../lib/types';
import { Highlighted } from './Sentences';
import { SpeakButton } from './SpeakButton';
import { TatoebaCredit } from './WordExtras';

interface Props {
  word: Word;
  onAnswer(quality: number): void;
  /** Leave the card ungraded (no sentence available). */
  onSkip(): void;
}

interface Candidate {
  key: string;
  zh: string;
  en?: string;
  /** Tatoeba id, for attribution. */
  zhId?: number;
  /** "all known" / "2 new words" (Tatoeba sentences). */
  label?: string;
}

/** How many of the best-ranked Tatoeba sentences to rotate through. */
const TATOEBA_CHOICES = 6;

const gradeOf: Record<Check['verdict'], number> = { correct: Grade.Good, close: Grade.Hard, wrong: Grade.Again };

export function SentenceCloze({ word, onAnswer, onSkip }: Props) {
  const { sentenceSource } = useSettings();
  const { words } = useStore();
  const pv = usePinyinVisibility();
  const target = word.hanzi.trim();
  const useTatoeba = sentenceSource === 'both';
  const { status, corpus, retry } = useCorpus(useTatoeba);
  const mine: Candidate | null =
    word.example && target && word.example.includes(target)
      ? { key: `mine:${word.example}`, zh: word.example, en: word.exampleTranslation, zhId: word.exampleRef }
      : null;
  const ready = !useTatoeba || status === 'ready' || status === 'error';

  const [choice, setChoice] = useState<Candidate | null | undefined>(undefined);
  const picked = useRef(false); // pick (and record the rotation) once, even under StrictMode

  useEffect(() => {
    if (picked.current || !ready) return;
    if (useTatoeba && status === 'error' && !mine) return; // offline: offer Retry below
    picked.current = true;
    const list: Candidate[] = mine ? [mine] : [];
    if (corpus) {
      for (const m of findSentences(corpus, word, words, TATOEBA_CHOICES)) {
        if (list.some((c) => c.zh === m.sentence.zh)) continue;
        list.push({ key: `t:${m.sentence.zhId}`, zh: m.sentence.zh, en: m.sentence.en, zhId: m.sentence.zhId, label: matchLabel(m) });
      }
    }
    setChoice(pickRotating(word.id, list));
  }, [ready, status, corpus]); // word and words are fixed for the lifetime of this card

  const [input, setInput] = useState('');
  const [result, setResult] = useState<Check | null>(null);
  const [revealed, setRevealed] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const pinyinShown = revealed || (result ? pv.answer : pv.question);

  const check = () => {
    setResult(checkChinese(input, word));
    if (getSettings().autoPlay && choice) speak(choice.zh);
    inputRef.current?.focus();
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!result) {
      if (input.trim()) check();
    } else {
      onAnswer(gradeOf[result.verdict]);
    }
  };

  // ---------- States without a sentence ----------

  if (useTatoeba && status === 'error' && !mine) {
    return (
      <div className="practice">
        <div className="card prompt-card">
          <p className="hint">Couldn’t load Tatoeba sentences. You seem to be offline.</p>
          <div className="row center">
            <button className="btn" onClick={retry}>
              Retry
            </button>
            <button className="btn ghost" onClick={onSkip}>
              Skip this word
            </button>
          </div>
        </div>
      </div>
    );
  }
  if (choice === undefined) {
    return (
      <div className="practice">
        <div className="card prompt-card muted small">Finding a sentence…</div>
      </div>
    );
  }
  if (choice === null) {
    return (
      <div className="practice">
        <div className="card prompt-card">
          <p>
            No sentence for <b lang="zh-CN">{word.hanzi}</b> ({word.meaning}).
          </p>
          <p className="hint">
            {useTatoeba
              ? 'Tatoeba has no sentence with this word. Add your own example sentence in the word editor.'
              : 'Add an example sentence in the word editor, or set the sentence source to “Mine + Tatoeba”.'}
          </p>
          <button className="btn" onClick={onSkip}>
            Skip this word
          </button>
        </div>
      </div>
    );
  }

  // ---------- The cloze ----------

  const at = choice.zh.indexOf(target);
  const before = choice.zh.slice(0, at);
  const after = choice.zh.slice(at + target.length);
  const blank = '＿'.repeat([...target].length);
  const questionPinyin = [toPinyin(before), '＿＿', toPinyin(after)].filter(Boolean).join(' ');

  return (
    <div className="practice">
      <div className="card prompt-card cloze-card">
        <div className="card-kicker">Fill in the missing word</div>
        <div
          className={`cloze-sentence ${pinyinShown ? '' : 'can-reveal'}`}
          lang="zh-CN"
          onClick={pinyinShown ? undefined : () => setRevealed(true)}
          title={pinyinShown ? undefined : 'Tap to show pinyin'}
        >
          {result ? (
            <Highlighted text={choice.zh} target={target} />
          ) : (
            <>
              {before}
              <span className="cloze-blank">{blank}</span>
              {after}
            </>
          )}
        </div>
        {pinyinShown ? (
          <div className="muted small">{result ? toPinyin(choice.zh) : questionPinyin}</div>
        ) : (
          <div className="reveal-hint">tap the sentence for pinyin</div>
        )}
        {choice.en && <div className="cloze-translation">{choice.en}</div>}
        <div className="small">
          <span className="muted">Missing word: </span>
          {word.meaning}
        </div>
        {(choice.label || choice.zhId) && (
          <div className="sentence-meta">
            {choice.label && <span className={`known-label ${choice.label === 'all known' ? 'all' : ''}`}>{choice.label}</span>}
            {choice.zhId ? <TatoebaCredit id={choice.zhId} /> : null}
          </div>
        )}
      </div>

      <form className="typing-form" onSubmit={submit}>
        <input
          ref={inputRef}
          className={`input typing-input ${result ? `is-${result.verdict}` : ''}`}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          readOnly={result !== null}
          placeholder="汉字 or pinyin"
          lang="zh-CN"
          autoFocus
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          enterKeyHint={result ? 'next' : 'done'}
          aria-label="Missing word"
        />
        {!result ? (
          <div className="row typing-buttons">
            <button type="button" className="btn ghost" onClick={() => setResult({ verdict: 'wrong' })}>
              Don’t know
            </button>
            <button type="submit" className="btn primary" disabled={!input.trim()}>
              Check
            </button>
          </div>
        ) : (
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
                {pinyinShown && <span className="pinyin">{word.pinyin}</span>}
                <SpeakButton text={choice.zh} label="Play sentence" />
              </div>
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
