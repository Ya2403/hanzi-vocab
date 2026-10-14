import { autoSpeak } from '../lib/quiet';
import { useEffect, useRef, useState } from 'react';
import { normalizeSearch } from '../lib/pinyin';
import { pinyinDistractors, stripTones } from '../lib/pinyinOptions';
import { useSettings } from '../lib/settings';
import { Grade } from '../lib/srs';
import { shuffle } from '../lib/words';
import type { Word } from '../lib/types';
import { Icon } from './Icon';
import { SpeakButton } from './SpeakButton';
import { NotesBox, WordExamples } from './WordExtras';
import { HanziText } from './HanziText';

export interface TwoStepResult {
  meaning: number;
  pinyin: number;
  /** Always false: pinyin is picked from options, never typed. */
  toneError: boolean;
}

interface Props {
  word: Word;
  /** Pool for the meaning distractors and similar-sounding pinyin. */
  pool: Word[];
  onDone(result: TwoStepResult): void;
}

interface Option {
  label: string;
  correct: boolean;
}

const OPTIONS = 4;

function meaningOptions(word: Word, pool: Word[]): Option[] {
  const seen = new Set([normalizeSearch(word.meaning)]);
  const out: Option[] = [{ label: word.meaning, correct: true }];
  const related = shuffle(pool.filter((w) => w.tags.some((t) => word.tags.includes(t))));
  for (const w of [...related, ...shuffle(pool)]) {
    if (out.length >= OPTIONS) break;
    const key = normalizeSearch(w.meaning);
    if (w.id === word.id || w.hanzi === word.hanzi || seen.has(key)) continue;
    seen.add(key);
    out.push({ label: w.meaning, correct: false });
  }
  return shuffle(out);
}

function pinyinOptions(word: Word, pool: Word[], toneless: boolean): Option[] {
  const shown = (p: string) => (toneless ? stripTones(p) : p);
  return shuffle([
    { label: shown(word.pinyin), correct: true },
    ...pinyinDistractors(word, pool, OPTIONS - 1).map((p) => ({ label: shown(p), correct: false })),
  ]);
}

/** One answered step: which option was picked. */
interface StepState {
  picked?: number;
}

const quality = (options: Option[], s: StepState): number => (options[s.picked!]?.correct ? Grade.Good : Grade.Again);

/**
 * Meaning, then pinyin, for the same characters:
 * 1. the hanzi alone (no pinyin, no audio) → what does it mean? (multiple choice)
 * 2. same hanzi → how is it pronounced? (multiple choice)
 * 3. the full answer (hanzi, toned pinyin, meaning, example) with audio → Continue.
 */
export function TwoStepCard({ word, pool, onDone }: Props) {
  const { tones } = useSettings();
  const [mOptions] = useState(() => meaningOptions(word, pool));
  const [pOptions] = useState(() => pinyinOptions(word, pool, tones === 'ignore'));
  const [stage, setStage] = useState<'meaning' | 'pinyin' | 'done'>('meaning');
  const [m, setM] = useState<StepState>({});
  const [p, setP] = useState<StepState>({});
  const advanced = useRef(false);

  const mAnswered = m.picked !== undefined;
  const pAnswered = p.picked !== undefined;
  const mq = mAnswered ? quality(mOptions, m) : null;
  const pq = pAnswered ? quality(pOptions, p) : null;

  const toPinyin = () => {
    if (stage !== 'meaning' || advanced.current) return;
    advanced.current = true;
    setStage('pinyin');
  };
  const reveal = () => {
    setStage('done');
    autoSpeak(word.hanzi);
  };
  const finish = () => onDone({ meaning: mq ?? Grade.Again, pinyin: pq ?? Grade.Again, toneError: false });

  // A right multiple-choice meaning moves on by itself; a wrong one waits so the answer can be read.
  useEffect(() => {
    if (stage === 'meaning' && mq !== null && mq >= 3) {
      const t = setTimeout(toPinyin, 700);
      return () => clearTimeout(t);
    }
  }, [stage, mq]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.repeat || document.querySelector('.modal-backdrop')) return;
      const n = Number(e.key) - 1;
      if (stage === 'meaning' && !mAnswered && mOptions[n]) setM({ picked: n });
      else if (stage === 'pinyin' && !pAnswered && pOptions[n]) {
        setP({ picked: n });
        reveal();
      } else if (e.key === 'Enter' || e.key === ' ') {
        if (stage === 'meaning' && mAnswered) {
          e.preventDefault();
          toPinyin();
        } else if (stage === 'done') {
          e.preventDefault();
          finish();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const choiceList = (options: Option[], s: StepState, onPick: (i: number) => void, pinyinLabels = false) => (
    <div className="options">
      {options.map((o, i) => {
        const answered = s.picked !== undefined;
        const state = !answered ? '' : o.correct ? 'correct' : i === s.picked ? 'wrong' : 'dim';
        return (
          <button key={i} className={`option ${state}`} onClick={() => !answered && onPick(i)} disabled={answered && state === 'dim'}>
            <span className="option-key">{i + 1}</span>
            <span className={`option-text ${pinyinLabels ? 'option-pinyin' : ''}`}>{o.label}</span>
            {state === 'correct' && <Icon name="check" />}
            {state === 'wrong' && <Icon name="x" />}
          </button>
        );
      })}
    </div>
  );

  const resultLine = (label: string, q: number | null) =>
    q !== null && (
      <span className={`step-result ${q >= 4 ? 'ok' : q >= 3 ? 'meh' : 'bad'}`}>
        {label} {q >= 4 ? '✓' : q >= 3 ? '~' : '✗'}
      </span>
    );

  return (
    <div className="practice two-step">
      <div className="card prompt-card">
        <div className="card-kicker">
          {stage === 'meaning' ? 'What does it mean? (1/2)' : stage === 'pinyin' ? 'How is it pronounced? (2/2)' : 'Answer'}
        </div>
        <div className="prompt-hanzi" lang="zh-CN">
          <HanziText text={word.hanzi} />
        </div>
        {stage !== 'meaning' && <div className="answer-meaning">{word.meaning}</div>}
        {stage === 'done' && (
          <div className="two-step-answer">
            <div className="answer-head">
              <span className="pinyin big">{word.pinyin}</span>
              <SpeakButton text={word.hanzi} />
            </div>
            <NotesBox notes={word.notes} />
            <WordExamples word={word} pinyinVisible />
          </div>
        )}
      </div>

      {stage === 'meaning' && (
        <>
          {choiceList(mOptions, m, (i) => setM({ picked: i }))}
          {mAnswered && mq! < 3 && (
            <div className="feedback bad">
              <span>
                It means <b>{word.meaning}</b>
              </span>
              <button className="btn primary" onClick={toPinyin} autoFocus>
                Next: pinyin
              </button>
            </div>
          )}
        </>
      )}

      {stage === 'pinyin' &&
        choiceList(
          pOptions,
          p,
          (i) => {
            setP({ picked: i });
            reveal();
          },
          true,
        )}

      {stage === 'done' && (
        <>
          {choiceList(pOptions, p, () => {}, true)}
          <div className={`feedback ${(mq ?? 0) >= 3 && (pq ?? 0) >= 3 ? 'ok' : 'bad'}`}>
            <span className="step-results">
              {resultLine('Meaning', mq)}
              {resultLine('Pinyin', pq)}
            </span>
            <button className="btn primary" onClick={finish} autoFocus>
              Continue
            </button>
          </div>
        </>
      )}
    </div>
  );
}
