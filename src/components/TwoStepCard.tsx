import { autoSpeak } from '../lib/quiet';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { checkMeaning, checkPinyin, type Check } from '../lib/answer';
import { normalizeSearch } from '../lib/pinyin';
import { pinyinDistractors, stripTones } from '../lib/pinyinOptions';
import { useSettings } from '../lib/settings';
import { Grade } from '../lib/srs';
import { shuffle } from '../lib/words';
import type { Word } from '../lib/types';
import { Icon } from './Icon';
import { SpeakButton } from './SpeakButton';
import { ExampleSentence, NotesBox } from './WordExtras';

export type StepExercise = 'choice' | 'typing';

export interface TwoStepResult {
  meaning: number;
  pinyin: number;
  /** Typed pinyin had the right syllables but wrong tones. */
  toneError: boolean;
}

interface Props {
  word: Word;
  /** Pool for the meaning distractors and similar-sounding pinyin. */
  pool: Word[];
  meaningEx: StepExercise;
  pinyinEx: StepExercise;
  onDone(result: TwoStepResult): void;
}

interface Option {
  label: string;
  correct: boolean;
}

const OPTIONS = 4;
const gradeOf: Record<Check['verdict'], number> = { correct: Grade.Good, close: Grade.Hard, wrong: Grade.Again };

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

/** One answered step: which option was picked (choice) or what was typed. */
interface StepState {
  picked?: number;
  typed?: string;
  check?: Check;
  /** "I was right" on a typed answer. */
  override?: boolean;
}

const quality = (ex: StepExercise, options: Option[], s: StepState): number =>
  s.override ? Grade.Good : ex === 'choice' ? (options[s.picked!]?.correct ? Grade.Good : Grade.Again) : gradeOf[s.check!.verdict];

/**
 * Meaning, then pinyin, for the same characters:
 * 1. the hanzi alone (no pinyin, no audio) → what does it mean?
 * 2. same hanzi → how is it pronounced?
 * 3. the full answer (hanzi, toned pinyin, meaning, example) with audio → Continue.
 */
export function TwoStepCard({ word, pool, meaningEx, pinyinEx, onDone }: Props) {
  const { tones } = useSettings();
  const [mOptions] = useState(() => meaningOptions(word, pool));
  const [pOptions] = useState(() => pinyinOptions(word, pool, tones === 'ignore'));
  const [stage, setStage] = useState<'meaning' | 'pinyin' | 'done'>('meaning');
  const [m, setM] = useState<StepState>({});
  const [p, setP] = useState<StepState>({});
  const advanced = useRef(false);

  const mAnswered = m.picked !== undefined || !!m.check;
  const pAnswered = p.picked !== undefined || !!p.check;
  const mq = mAnswered ? quality(meaningEx, mOptions, m) : null;
  const pq = pAnswered ? quality(pinyinEx, pOptions, p) : null;

  const toPinyin = () => {
    if (stage !== 'meaning' || advanced.current) return;
    advanced.current = true;
    setStage('pinyin');
  };
  const reveal = () => {
    setStage('done');
    autoSpeak(word.hanzi);
  };
  const finish = () =>
    onDone({ meaning: mq ?? Grade.Again, pinyin: pq ?? Grade.Again, toneError: !!p.check?.toneError && !p.override && tones !== 'ignore' });

  // A right multiple-choice meaning moves on by itself; a wrong one waits so the answer can be read.
  useEffect(() => {
    if (stage === 'meaning' && meaningEx === 'choice' && mq !== null && mq >= 3) {
      const t = setTimeout(toPinyin, 700);
      return () => clearTimeout(t);
    }
  }, [stage, mq]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.repeat || document.querySelector('.modal-backdrop')) return;
      const n = Number(e.key) - 1;
      if (stage === 'meaning' && meaningEx === 'choice' && !mAnswered && mOptions[n]) setM({ picked: n });
      else if (stage === 'pinyin' && pinyinEx === 'choice' && !pAnswered && pOptions[n]) {
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
          {word.hanzi}
        </div>
        {stage !== 'meaning' && <div className="answer-meaning">{word.meaning}</div>}
        {stage === 'done' && (
          <div className="two-step-answer">
            <div className="answer-head">
              <span className="pinyin big">{word.pinyin}</span>
              <SpeakButton text={word.hanzi} />
            </div>
            <NotesBox notes={word.notes} />
            {word.example && <ExampleSentence text={word.example} pinyinVisible translation={word.exampleTranslation} tatoebaId={word.exampleRef} />}
          </div>
        )}
      </div>

      {stage === 'meaning' &&
        (meaningEx === 'choice' ? (
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
        ) : (
          <TypedStep
            key="m"
            placeholder="meaning"
            state={m}
            check={(t) => checkMeaning(t, word.meaning)}
            answerText={word.meaning}
            onChange={setM}
            onNext={toPinyin}
            nextLabel="Next: pinyin"
          />
        ))}

      {stage === 'pinyin' &&
        (pinyinEx === 'choice' ? (
          choiceList(
            pOptions,
            p,
            (i) => {
              setP({ picked: i });
              reveal();
            },
            true,
          )
        ) : (
          <TypedStep
            key="p"
            placeholder={tones === 'ignore' ? 'ni hao' : 'ni3 hao3 / nǐ hǎo'}
            state={p}
            check={(t) => checkPinyin(t, word.pinyin, tones)}
            rejectHanzi
            answerText={word.pinyin}
            onChange={setP}
            onNext={reveal}
            nextLabel="Show answer"
          />
        ))}

      {stage === 'done' && (
        <>
          {pinyinEx === 'choice' && choiceList(pOptions, p, () => {}, true)}
          <div className={`feedback ${(mq ?? 0) >= 3 && (pq ?? 0) >= 3 ? 'ok' : 'bad'}`}>
            <span className="step-results">
              {resultLine('Meaning', mq)}
              {resultLine('Pinyin', pq)}
              {p.check?.toneError && tones !== 'ignore' && !p.override && <span className="muted small"> · wrong tone</span>}
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

/** A typed answer inside the two-step card, with "Don't know" and "I was right". */
function TypedStep({
  placeholder,
  state,
  check,
  rejectHanzi = false,
  answerText,
  onChange,
  onNext,
  nextLabel,
}: {
  placeholder: string;
  state: StepState;
  check(text: string): Check;
  rejectHanzi?: boolean;
  answerText: string;
  onChange(s: StepState): void;
  onNext(): void;
  nextLabel: string;
}) {
  const [input, setInput] = useState('');
  const [hint, setHint] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);
  const result = state.check;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (result) return onNext();
    if (!input.trim()) return;
    if (rejectHanzi && /[㐀-鿿]/.test(input)) return setHint('Type the pinyin, e.g. ni hao.');
    onChange({ typed: input, check: check(input) });
    ref.current?.focus();
  };

  return (
    <form className="typing-form" onSubmit={submit}>
      <input
        ref={ref}
        className={`input typing-input ${result ? `is-${state.override ? 'correct' : result.verdict}` : ''}`}
        value={input}
        onChange={(e) => {
          setInput(e.target.value);
          setHint(null);
        }}
        readOnly={!!result}
        placeholder={placeholder}
        autoFocus
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        enterKeyHint={result ? 'next' : 'done'}
        aria-label="Your answer"
      />
      {hint && !result && <p className="hint warn">{hint}</p>}
      {!result ? (
        <div className="row typing-buttons">
          <button type="button" className="btn ghost" onClick={() => onChange({ typed: '', check: { verdict: 'wrong' } })}>
            Don’t know
          </button>
          <button type="submit" className="btn primary" disabled={!input.trim()}>
            Check
          </button>
        </div>
      ) : (
        <div className={`feedback ${state.override || result.verdict === 'correct' ? 'ok' : result.verdict === 'close' ? 'meh' : 'bad'}`}>
          <span>
            <b>{state.override || result.verdict === 'correct' ? 'Correct!' : result.verdict === 'close' ? 'Close' : 'Answer'}</b>
            {result.note && !state.override && ` · ${result.note}`}
            {result.verdict !== 'correct' && !state.override && (
              <>
                {' '}
                · <b>{answerText}</b>
              </>
            )}
          </span>
          <div className="row">
            {result.verdict !== 'correct' && input.trim() && !state.override && (
              <button type="button" className="btn ghost" onClick={() => onChange({ ...state, override: true })}>
                I was right
              </button>
            )}
            <button type="submit" className="btn primary">
              {nextLabel}
            </button>
          </div>
        </div>
      )}
    </form>
  );
}
