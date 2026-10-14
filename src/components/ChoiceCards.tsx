import { useEffect, useState } from 'react';
import { useStore } from '../store';
import { chatOptions, whichCharQuestion } from '../lib/choiceExercises';
import { hanziDictNow } from '../lib/hanziDict';
import { autoSpeak } from '../lib/quiet';
import { usePinyinVisibility } from '../lib/settings';
import { Grade } from '../lib/srs';
import type { Dialogue, Sentence, Word } from '../lib/types';
import { CharFormula } from './Entries';
import { HanziText } from './HanziText';
import { Icon } from './Icon';
import { SentenceReveal } from './SentenceExercises';
import { SpeakButton } from './SpeakButton';

/** 1–4 pick an option, Enter / Space continues once answered. */
function useChoiceKeys(count: number, onPick: (i: number) => void, onNext: (() => void) | null) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.repeat || document.querySelector('.modal-backdrop')) return;
      if (onNext && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        onNext();
        return;
      }
      const n = Number(e.key) - 1;
      if (!onNext && n >= 0 && n < count) onPick(n);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
}

function Feedback({ ok, onNext }: { ok: boolean; onNext(): void }) {
  return (
    <div className={`feedback ${ok ? 'ok' : 'bad'}`}>
      <span>{ok ? 'Correct!' : 'Not quite.'}</span>
      <button className="btn primary" onClick={onNext} autoFocus>
        Continue
      </button>
    </div>
  );
}

/**
 * Which character? A learned word with one character blanked (电_) and its meaning; pick the
 * missing character out of 4. A wrong pick is a miss for the blanked character.
 */
export function WhichChar({ word, target, onAnswer, onSkip }: { word: Word; target?: string; onAnswer(q: number, wrongChars?: string[]): void; onSkip(): void }) {
  const { words } = useStore();
  const [q] = useState(() => whichCharQuestion(word, target, words, hanziDictNow()));
  const [picked, setPicked] = useState<number | null>(null);
  const pv = usePinyinVisibility('en-zh');
  useEffect(() => {
    if (!q) onSkip();
  }, []);
  if (!q) return null;
  const answered = picked !== null;
  const correct = answered && q.options[picked] === q.answer;
  const pick = (i: number) => {
    if (answered) return;
    setPicked(i);
    autoSpeak(word.hanzi);
  };
  const next = () => onAnswer(correct ? Grade.Good : Grade.Again, correct ? undefined : [q.answer]);
  useChoiceKeys(q.options.length, pick, answered ? next : null);
  const chars = [...word.hanzi];

  return (
    <div className="practice">
      <div className="card prompt-card">
        <div className="card-kicker">Which character is missing?</div>
        <div className="prompt-hanzi which-char" lang="zh-CN">
          {chars.map((c, i) =>
            i === q.blank ? (
              <span key={i} className={`blank-slot ${answered ? (correct ? 'ok' : 'bad') : ''}`}>
                {answered ? c : ' '}
              </span>
            ) : (
              <HanziText key={i} text={c} />
            ),
          )}
        </div>
        <div className="prompt-meaning small-meaning">{word.meaning}</div>
        {answered && (
          <div className="which-char-answer">
            <div className="answer-head">
              {pv.answer && <span className="pinyin">{word.pinyin}</span>}
              <SpeakButton text={word.hanzi} />
            </div>
            <CharFormula word={word} />
          </div>
        )}
      </div>
      <div className="options char-options">
        {q.options.map((o, i) => {
          const state = !answered ? '' : o === q.answer ? 'correct' : i === picked ? 'wrong' : 'dim';
          return (
            <button key={o} className={`option ${state}`} onClick={() => pick(i)} disabled={answered && state === 'dim'}>
              <span className="option-key">{i + 1}</span>
              <span className="option-text">
                <span className="option-hanzi" lang="zh-CN">
                  {o}
                </span>
              </span>
              {state === 'correct' && <Icon name="check" />}
              {state === 'wrong' && <Icon name="x" />}
            </button>
          );
        })}
      </div>
      {answered && <Feedback ok={correct} onNext={next} />}
    </div>
  );
}

/**
 * Complete the chat: speaker A's line (Chinese, audio) and an empty bubble for B; pick B's reply
 * out of 2–3 lines. Null options (not enough lines) → `fallback`.
 */
export function ChatChoice({
  dialogue,
  lines,
  index,
  onAnswer,
  fallback,
}: {
  dialogue: Dialogue;
  lines: Sentence[];
  index: number;
  onAnswer(q: number): void;
  fallback: React.ReactNode;
}) {
  const { dialogues, sentences } = useStore();
  const [options] = useState(() => chatOptions(dialogue, lines, index, dialogues, sentences));
  const [picked, setPicked] = useState<number | null>(null);
  const pv = usePinyinVisibility();
  const prompt = lines[index - 1];
  const answer = lines[index];
  const speakerOf = (k: number) => dialogue.lines[k]?.speaker;
  useEffect(() => {
    if (options && prompt) autoSpeak(prompt.zh);
  }, []);
  const answered = picked !== null;
  const correct = answered && !!options && options[picked].id === answer.id;
  const pick = (i: number) => {
    if (answered || !options?.[i]) return;
    setPicked(i);
    autoSpeak(answer.zh);
  };
  const next = () => onAnswer(correct ? Grade.Good : Grade.Again);
  useChoiceKeys(options?.length ?? 0, pick, answered ? next : null);
  if (!options || !prompt) return <>{fallback}</>;

  return (
    <div className="practice sentence-practice">
      <div className="card prompt-card chat-card">
        <div className="card-kicker">Complete the chat</div>
        <div className="chat-row a">
          <span className="speaker">{speakerOf(index - 1) ?? 'A'}</span>
          <div className="chat-bubble">
            <span lang="zh-CN">{prompt.zh}</span> <SpeakButton text={prompt.zh} size={16} />
            {pv.question && <div className="pinyin small">{prompt.pinyin}</div>}
            {answered && <div className="muted small">{prompt.translation}</div>}
          </div>
        </div>
        <div className="chat-row b">
          <div className={`chat-bubble ${answered ? (correct ? 'ok' : 'bad') : 'empty'}`}>
            {answered ? <span lang="zh-CN">{answer.zh}</span> : '…'}
          </div>
          <span className="speaker">{speakerOf(index) ?? 'B'}</span>
        </div>
      </div>
      <div className="options">
        {options.map((o, i) => {
          const state = !answered ? '' : o.id === answer.id ? 'correct' : i === picked ? 'wrong' : 'dim';
          return (
            <button key={o.id} className={`option ${state}`} onClick={() => pick(i)} disabled={answered && state === 'dim'}>
              <span className="option-key">{i + 1}</span>
              <span className="option-text">
                <span lang="zh-CN">{o.zh}</span>
                {(answered || pv.question) && <small className="pinyin">{o.pinyin}</small>}
              </span>
              {state === 'correct' && <Icon name="check" />}
              {state === 'wrong' && <Icon name="x" />}
            </button>
          );
        })}
      </div>
      {answered && (
        <>
          <div className="card">
            <SentenceReveal sentence={answer} />
          </div>
          <Feedback ok={correct} onNext={next} />
        </>
      )}
    </div>
  );
}
