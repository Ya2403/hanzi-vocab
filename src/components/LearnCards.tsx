import { autoSpeak } from '../lib/quiet';
import { useEffect, useRef, useState } from 'react';
import { describe, useHanziDict } from '../lib/hanziDict';
import { isRadicalOnly } from '../lib/learn';
import { speak, speechSupported } from '../lib/speech';
import { Grade } from '../lib/srs';
import { writableChars } from '../lib/strokes';
import { shuffle } from '../lib/words';
import type { Word } from '../lib/types';
import { Icon } from './Icon';
import { SpeakButton } from './SpeakButton';
import { WordExamples, NotesBox } from './WordExtras';
import { HanziText } from './HanziText';
import { CharFormula, UsedIn } from './Entries';
import { distractorOrder } from '../lib/entries';

/** Play once when a card appears (respecting the auto-play setting), even under StrictMode. */
function useAutoPlay(text: string) {
  const played = useRef(false);
  useEffect(() => {
    if (played.current) return;
    played.current = true;
    autoSpeak(text);
  }, [text]);
}

/** Enter / Space triggers `action` (unless a popup is open). */
function useEnterKey(action: () => void, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (document.querySelector('.modal-backdrop') || e.repeat) return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        action();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
}

/** "好 = 女 woman + 子 child", one line per character (from the Make Me a Hanzi data). */
function ComponentLines({ word }: { word: Word }) {
  const { dict } = useHanziDict(true);
  if (!dict) return null;
  const lines = [...new Set(writableChars(word.hanzi))]
    .map((c) => ({ c, info: describe(dict, c) }))
    .filter(({ info }) => info && !info.basic && info.components.some((p) => p.char));
  if (!lines.length) return null;
  return (
    <div className="teach-components">
      {lines.map(({ c, info }) => (
        <div key={c} className="teach-formula" lang="zh-CN">
          <span className="teach-char">{c}</span> ={' '}
          {info!.components.map((p, i) => (
            <span key={i}>
              {i > 0 && ' + '}
              {p.char ? (
                <>
                  <b>{p.char}</b> <span className="muted">{p.meaning ?? 'component'}</span>
                  {p.role && <span className={`role ${p.role}`}>{p.role}</span>}
                </>
              ) : (
                <span className="muted">？</span>
              )}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

/** Teaching card: everything about one new word, then "Got it". */
export function TeachCard({ word, onDone }: { word: Word; onDone(): void }) {
  useAutoPlay(word.hanzi);
  useEnterKey(onDone);
  const radical = isRadicalOnly(word);
  return (
    <div className="practice teach-practice">
      <div className="card teach-card">
        <div className="card-kicker">{radical ? 'New component' : 'New character'}</div>
        <div className="teach-head">
          <span className="teach-hanzi" lang="zh-CN">
            <HanziText text={word.hanzi} />
          </span>
          <SpeakButton text={word.hanzi} size={26} />
        </div>
        <div className="pinyin big">{word.pinyin}</div>
        <div className="teach-meaning">{word.meaning}</div>
        {radical && <p className="hint">A radical form: you’ll learn to recognize it inside other characters.</p>}
        <ComponentLines word={word} />
        <NotesBox notes={word.notes} />
        <UsedIn char={word} max={3} />
        <WordExamples word={word} pinyinVisible />
      </div>
      <button className="btn primary teach-done" onClick={onDone} autoFocus>
        Got it
      </button>
    </div>
  );
}

/** Listening round: hear the word, pick its characters. */
export function ListenChoice({
  word,
  pool,
  onAnswer,
  onCantListen,
}: {
  word: Word;
  pool: Word[];
  onAnswer(q: number): void;
  /** "Can't listen now": skip this card ungraded and pause audio exercises. */
  onCantListen?(): void;
}) {
  const [options] = useState(() =>
    shuffle([word, ...distractorOrder(word, pool.filter((w) => w.id !== word.id && w.hanzi !== word.hanzi), shuffle).slice(0, 3)]),
  );
  const [picked, setPicked] = useState<string | null>(null);
  const played = useRef(false);
  useEffect(() => {
    if (played.current) return;
    played.current = true;
    speak(word.hanzi); // listening round: always play, regardless of auto-play
  }, [word.hanzi]);
  const correct = picked === word.id;
  const next = () => onAnswer(correct ? Grade.Good : Grade.Again);
  useEnterKey(next, picked !== null);

  return (
    <div className="practice">
      <div className="card prompt-card">
        <div className="card-kicker">Listen and pick the word</div>
        <button className="btn listen-btn" onClick={() => speak(word.hanzi)} aria-label="Play again">
          <Icon name="speaker" size={34} />
        </button>
        {picked ? (
          <>
            <div className="pinyin big">{word.pinyin}</div>
            <div className="answer-meaning">{word.meaning}</div>
          </>
        ) : (
          <div className="reveal-hint">tap to hear it again</div>
        )}
      </div>
      <div className="options">
        {options.map((o, i) => {
          const state = !picked ? '' : o.id === word.id ? 'correct' : o.id === picked ? 'wrong' : 'dim';
          return (
            <button key={o.id} className={`option ${state}`} onClick={() => !picked && setPicked(o.id)} disabled={!!picked && state === 'dim'}>
              <span className="option-key">{i + 1}</span>
              <span className="option-text">
                <span className="option-hanzi" lang="zh-CN">
                  <HanziText text={o.hanzi} />
                </span>
              </span>
              {state === 'correct' && <Icon name="check" />}
              {state === 'wrong' && <Icon name="x" />}
            </button>
          );
        })}
      </div>
      {!picked && onCantListen && (
        <button className="btn ghost cant-listen" onClick={onCantListen}>
          <Icon name="headphonesOff" size={18} /> Can’t listen now
        </button>
      )}
      {picked && (
        <div className={`feedback ${correct ? 'ok' : 'bad'}`}>
          <span>{correct ? 'Correct!' : 'Not quite: it comes back later in this round.'}</span>
          <button className="btn primary" onClick={next} autoFocus>
            Continue
          </button>
        </div>
      )}
    </div>
  );
}

export const listeningAvailable = speechSupported;

/** After a batch: a word whose last character was just learned ("上课 = 上 + 课, to attend class"). */
export function UnlockCard({ word, onDone }: { word: Word; onDone(): void }) {
  useAutoPlay(word.hanzi);
  useEnterKey(onDone);
  return (
    <div className="practice teach-practice">
      <div className="card teach-card unlock-card">
        <div className="card-kicker">🔓 New word unlocked</div>
        <div className="teach-head">
          <span className="teach-hanzi" lang="zh-CN">
            <HanziText text={word.hanzi} />
          </span>
          <SpeakButton text={word.hanzi} size={26} />
        </div>
        <div className="pinyin big">{word.pinyin}</div>
        <div className="teach-meaning">{word.meaning}</div>
        <CharFormula word={word} />
        <WordExamples word={word} pinyinVisible />
      </div>
      <button className="btn primary teach-done" onClick={onDone} autoFocus>
        Got it
      </button>
    </div>
  );
}
