import { useEffect, useState } from 'react';
import { Grade } from '../lib/srs';
import { getSettings } from '../lib/settings';
import { speak } from '../lib/speech';
import { shuffle } from '../lib/words';
import type { CardDirection, Word } from '../lib/types';
import { SpeakButton } from './SpeakButton';
import { Icon } from './Icon';

interface Props {
  word: Word;
  /** Pool to draw distractors from. */
  allWords: Word[];
  direction: CardDirection;
  onAnswer(quality: number): void;
}

const OPTION_COUNT = 4;

/** Pick distractors that can't be confused with the answer, preferring words that share a tag. */
function buildOptions(word: Word, pool: Word[]): Word[] {
  const key = (w: Word) => w.meaning.trim().toLowerCase();
  const candidates = pool.filter((w) => w.id !== word.id && w.hanzi !== word.hanzi && key(w) !== key(word));
  const related = shuffle(candidates.filter((w) => w.tags.some((t) => word.tags.includes(t))));
  const others = shuffle(candidates.filter((w) => !related.includes(w)));
  const picked: Word[] = [];
  const seen = new Set([key(word), word.hanzi]);
  for (const w of [...related, ...others]) {
    if (picked.length >= OPTION_COUNT - 1) break;
    if (seen.has(key(w)) || seen.has(w.hanzi)) continue;
    seen.add(key(w));
    seen.add(w.hanzi);
    picked.push(w);
  }
  return shuffle([word, ...picked]);
}

export function MultipleChoice({ word, allWords, direction, onAnswer }: Props) {
  // Options are fixed for the lifetime of this card (the parent re-keys per card).
  const [options] = useState(() => buildOptions(word, allWords));
  const [picked, setPicked] = useState<string | null>(null);
  const answered = picked !== null;
  const correct = picked === word.id;

  const pick = (id: string) => {
    if (answered) return;
    setPicked(id);
    if (getSettings().autoPlay) speak(word.hanzi);
  };

  const next = () => onAnswer(correct ? Grade.Good : Grade.Again);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.repeat) return;
      if (!answered) {
        const o = options[Number(e.key) - 1];
        if (o) pick(o.id);
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        next();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className="practice">
      <div className="card prompt-card">
        <div className="card-kicker">{direction === 'zh-en' ? 'Choose the meaning' : 'Choose the Chinese'}</div>
        {direction === 'zh-en' ? (
          <>
            <div className="prompt-hanzi" lang="zh-CN">
              {word.hanzi}
            </div>
            <div className={`pinyin big ${answered ? '' : 'concealed'}`}>{answered ? word.pinyin : '·  ·  ·'}</div>
          </>
        ) : (
          <div className="prompt-meaning">{word.meaning}</div>
        )}
        {answered && <SpeakButton text={word.hanzi} />}
      </div>

      <div className="options">
        {options.map((o, i) => {
          const state = !answered ? '' : o.id === word.id ? 'correct' : o.id === picked ? 'wrong' : 'dim';
          return (
            <button key={o.id} className={`option ${state}`} onClick={() => pick(o.id)} disabled={answered && state === 'dim'}>
              <span className="option-key">{i + 1}</span>
              {direction === 'zh-en' ? (
                <span className="option-text">{o.meaning}</span>
              ) : (
                <span className="option-text">
                  <span className="option-hanzi" lang="zh-CN">
                    {o.hanzi}
                  </span>
                  {answered && <span className="pinyin">{o.pinyin}</span>}
                </span>
              )}
              {state === 'correct' && <Icon name="check" />}
              {state === 'wrong' && <Icon name="x" />}
            </button>
          );
        })}
      </div>

      {answered && (
        <div className={`feedback ${correct ? 'ok' : 'bad'}`}>
          <span>
            {correct ? 'Correct!' : (
              <>
                It’s <b lang="zh-CN">{word.hanzi}</b> ({word.pinyin}) — {word.meaning}
              </>
            )}
          </span>
          <button className="btn primary" onClick={next} autoFocus>
            Continue
          </button>
        </div>
      )}
    </div>
  );
}
