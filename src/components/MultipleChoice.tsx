import { useEffect, useState } from 'react';
import { Grade } from '../lib/srs';
import { getSettings, usePinyinVisibility } from '../lib/settings';
import { speak } from '../lib/speech';
import { normalizeSearch, toneVariants } from '../lib/pinyin';
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

interface Option {
  key: string;
  /** Main text: a meaning, hanzi, or pinyin depending on the direction. */
  label: string;
  /** Pinyin under hanzi options (EN → 中). */
  sub?: string;
  correct: boolean;
}

const OPTION_COUNT = 4;
/** In 中 → 拼音, how many wrong answers are the right syllables with a different tone. */
const TONE_DISTRACTORS = 2;

/** Other words that can't be confused with the answer, preferring ones that share a tag. */
function otherWords(word: Word, pool: Word[]): Word[] {
  const key = (w: Word) => w.meaning.trim().toLowerCase();
  const candidates = pool.filter((w) => w.id !== word.id && w.hanzi !== word.hanzi && key(w) !== key(word));
  const related = shuffle(candidates.filter((w) => w.tags.some((t) => word.tags.includes(t))));
  const others = shuffle(candidates.filter((w) => !related.includes(w)));
  return [...related, ...others];
}

function buildOptions(word: Word, pool: Word[], direction: CardDirection): Option[] {
  const labelOf = (w: Word) => (direction === 'zh-en' ? w.meaning : direction === 'en-zh' ? w.hanzi : w.pinyin);
  // Compare pinyin/meanings loosely so near-identical labels never appear twice.
  const norm = (s: string) => (direction === 'zh-py' ? s.normalize('NFC').toLowerCase() : normalizeSearch(s));
  const options: Option[] = [{ key: word.id, label: labelOf(word), sub: direction === 'en-zh' ? word.pinyin : undefined, correct: true }];
  const seen = new Set([norm(options[0].label)]);
  const add = (o: Option) => {
    if (options.length >= OPTION_COUNT || seen.has(norm(o.label))) return;
    seen.add(norm(o.label));
    options.push(o);
  };
  if (direction === 'zh-py') {
    for (const v of toneVariants(word.pinyin, TONE_DISTRACTORS)) add({ key: `tone:${v}`, label: v, correct: false });
  }
  for (const w of otherWords(word, pool)) {
    add({ key: w.id, label: labelOf(w), sub: direction === 'en-zh' ? w.pinyin : undefined, correct: false });
  }
  if (direction === 'zh-py') {
    // Small lists: top up with more tone variants.
    for (const v of toneVariants(word.pinyin, 10)) add({ key: `tone:${v}`, label: v, correct: false });
  }
  return shuffle(options);
}

const KICKER: Record<CardDirection, string> = {
  'zh-en': 'Choose the meaning',
  'en-zh': 'Choose the Chinese',
  'zh-py': 'Choose the pinyin',
};

export function MultipleChoice({ word, allWords, direction, onAnswer }: Props) {
  // Options are fixed for the lifetime of this card (the parent re-keys per card).
  const [options] = useState(() => buildOptions(word, allWords, direction));
  const [picked, setPicked] = useState<string | null>(null);
  const answered = picked !== null;
  const correct = options.find((o) => o.key === picked)?.correct ?? false;
  const pv = usePinyinVisibility(direction);
  const [revealed, setRevealed] = useState(false);
  const pinyinShown = revealed || (answered ? pv.answer : pv.question);

  const pick = (key: string) => {
    if (answered) return;
    setPicked(key);
    if (getSettings().autoPlay) speak(word.hanzi);
  };

  const next = () => onAnswer(correct ? Grade.Good : Grade.Again);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.repeat) return;
      if (document.querySelector('.modal-backdrop')) return; // e.g. the leech prompt
      if (!answered) {
        const o = options[Number(e.key) - 1];
        if (o) pick(o.key);
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        next();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // In 中 → 拼音 the pinyin is the answer, so tapping can't reveal it early.
  const canReveal = direction === 'zh-en' && !pinyinShown;

  return (
    <div className="practice">
      <div className="card prompt-card">
        <div className="card-kicker">{KICKER[direction]}</div>
        {direction === 'en-zh' ? (
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
            ) : direction === 'zh-en' ? (
              <div className="reveal-hint">tap the characters for pinyin</div>
            ) : null}
            {direction === 'zh-py' && answered && <div className="answer-meaning">{word.meaning}</div>}
          </>
        )}
        {answered && <SpeakButton text={word.hanzi} />}
      </div>

      <div className="options">
        {options.map((o, i) => {
          const state = !answered ? '' : o.correct ? 'correct' : o.key === picked ? 'wrong' : 'dim';
          return (
            <button key={o.key} className={`option ${state}`} onClick={() => pick(o.key)} disabled={answered && state === 'dim'}>
              <span className="option-key">{i + 1}</span>
              {direction === 'en-zh' ? (
                <span className="option-text">
                  <span className="option-hanzi" lang="zh-CN">
                    {o.label}
                  </span>
                  {(answered ? pv.answer : pv.question) && <span className="pinyin">{o.sub}</span>}
                </span>
              ) : (
                <span className={`option-text ${direction === 'zh-py' ? 'option-pinyin' : ''}`}>{o.label}</span>
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
            {correct ? (
              'Correct!'
            ) : direction === 'zh-py' ? (
              <>
                It’s <b>{word.pinyin}</b> ({word.meaning})
              </>
            ) : (
              <>
                It’s <b lang="zh-CN">{word.hanzi}</b>
                {pinyinShown && ` (${word.pinyin})`} — {word.meaning}
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
