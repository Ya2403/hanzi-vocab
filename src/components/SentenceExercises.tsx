import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../store';
import { describe as describeChar, useHanziDict } from '../lib/hanziDict';
import { toPinyin } from '../lib/pinyin';
import { autoSpeak } from '../lib/quiet';
import { segment } from '../lib/sentences';
import { splitKnown, tilesCorrect } from '../lib/sentenceLearn';
import { usePinyinVisibility } from '../lib/settings';
import { speak, speakAll, speechSupported, stopSpeaking } from '../lib/speech';
import { Grade } from '../lib/srs';
import { writableChars } from '../lib/strokes';
import type { Sentence, Word } from '../lib/types';
import { Icon } from './Icon';
import { SpeakButton } from './SpeakButton';

/** 1–9 pick an option, Enter / Space continue (unless typing or a popup is open). */
function useKeys(onNumber: (n: number) => void, onEnter: (() => void) | null) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.repeat) return;
      if (document.querySelector('.modal-backdrop')) return;
      const n = Number(e.key);
      if (n >= 1 && n <= 9) onNumber(n - 1);
      else if (onEnter && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        onEnter();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
}

// ---------- Tappable sentence ----------

/** A sentence whose words can be tapped to see their pinyin and meaning. */
export function TappableSentence({ zh, className = '' }: { zh: string; className?: string }) {
  const { words } = useStore();
  const [open, setOpen] = useState<number | null>(null);
  const byHanzi = useMemo(() => new Map(words.map((w) => [w.hanzi.trim(), w])), [words]);
  const parts = useMemo(() => {
    const segs = segment(zh);
    if (!segs) return [...zh].map((t) => ({ t, word: /[㐀-鿿]/.test(t) }));
    const out: { t: string; word: boolean }[] = [];
    let at = 0;
    for (const sg of segs) {
      if (sg.index > at) out.push({ t: zh.slice(at, sg.index), word: false });
      // A segment made of several of your words (我是) is split into them.
      const pieces = [...sg.text].length > 1 && !byHanzi.has(sg.text) ? splitKnown(sg.text, new Set(byHanzi.keys())) : null;
      for (const p of pieces ?? [sg.text]) out.push({ t: p, word: true });
      at = sg.index + sg.text.length;
    }
    if (at < zh.length) out.push({ t: zh.slice(at), word: false });
    return out;
  }, [zh, byHanzi]);
  const { dict } = useHanziDict(open !== null);

  const info = open !== null ? parts[open].t : null;
  const known = info ? byHanzi.get(info) : undefined;
  const charMeanings = info && !known && dict ? writableChars(info).map((c) => byHanzi.get(c)?.meaning ?? describeChar(dict, c)?.definition) : [];

  return (
    <span className={`tappable ${className}`} lang="zh-CN">
      {parts.map((p, i) =>
        p.word ? (
          <button
            key={i}
            type="button"
            className={`seg ${open === i ? 'open' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              setOpen(open === i ? null : i);
            }}
          >
            {p.t}
          </button>
        ) : (
          <span key={i}>{p.t}</span>
        ),
      )}
      {info && (
        <span className="seg-info" role="status">
          <b lang="zh-CN">{info}</b> <span className="pinyin">{known?.pinyin ?? toPinyin(info)}</span>{' '}
          <span>
            {known
              ? known.meaning
              : charMeanings.filter(Boolean).length
                ? charMeanings.map((m, k) => (m ? `${writableChars(info)[k]}: ${m}` : '')).filter(Boolean).join(' · ')
                : 'not in your list'}
          </span>
        </span>
      )}
    </span>
  );
}

// ---------- Reveal ----------

/** The full answer after every sentence exercise: Chinese, pinyin, translation, audio and the words in it. */
export function SentenceReveal({ sentence: s }: { sentence: Sentence }) {
  const { links } = useStore();
  const words = links.bySentence.get(s.id) ?? [];
  return (
    <div className="sentence-reveal">
      <div className="sentence-head">
        <TappableSentence zh={s.zh} className="sentence-zh" />
        <SpeakButton text={s.zh} size={18} />
      </div>
      <div className="pinyin small">{s.pinyin}</div>
      <div className="sentence-translation">{s.translation}</div>
      {words.length > 0 && (
        <div className="word-chips">
          {words.map((w) => (
            <span key={w.id} className="word-chip static" lang="zh-CN">
              {w.hanzi} <small className="muted">{w.meaning}</small>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function Feedback({ ok, onNext, children }: { ok: boolean; onNext(): void; children?: React.ReactNode }) {
  return (
    <div className={`feedback ${ok ? 'ok' : 'bad'}`}>
      <span>{children ?? (ok ? 'Correct!' : 'Not quite.')}</span>
      <button className="btn primary" onClick={onNext} autoFocus>
        Continue
      </button>
    </div>
  );
}

// ---------- Translate / listen ----------

/** Read (or only hear) a sentence and pick its translation. */
export function TranslationChoice({
  sentence: s,
  options,
  audioOnly = false,
  kicker,
  onAnswer,
  onCantListen,
}: {
  sentence: Sentence;
  options: string[];
  audioOnly?: boolean;
  kicker?: string;
  onAnswer(q: number): void;
  /** Listening card: "Can't listen now" skips it ungraded. */
  onCantListen?(): void;
}) {
  const [picked, setPicked] = useState<number | null>(null);
  const pv = usePinyinVisibility();
  const answered = picked !== null;
  const correct = answered && options[picked] === s.translation;
  useEffect(() => {
    if (audioOnly) speak(s.zh);
  }, []);
  const pick = (i: number) => {
    if (answered || !options[i]) return;
    setPicked(i);
    if (!audioOnly) autoSpeak(s.zh);
  };
  const next = () => onAnswer(correct ? Grade.Good : Grade.Again);
  useKeys(pick, answered ? next : null);

  return (
    <div className="practice sentence-practice">
      <div className="card prompt-card">
        <div className="card-kicker">{kicker ?? (audioOnly ? 'Listen: what does it mean?' : 'What does it mean?')}</div>
        {audioOnly && !answered ? (
          <button className="btn listen-btn" onClick={() => speak(s.zh)} aria-label="Play again">
            <Icon name="speaker" size={34} />
          </button>
        ) : answered ? (
          <SentenceReveal sentence={s} />
        ) : (
          <>
            <TappableSentence zh={s.zh} className="prompt-sentence" />
            {pv.question && <div className="pinyin">{s.pinyin}</div>}
          </>
        )}
      </div>
      <div className="options">
        {options.map((o, i) => {
          const state = !answered ? '' : o === s.translation ? 'correct' : i === picked ? 'wrong' : 'dim';
          return (
            <button key={i} className={`option ${state}`} onClick={() => pick(i)} disabled={answered && state === 'dim'}>
              <span className="option-key">{i + 1}</span>
              <span className="option-text">{o}</span>
              {state === 'correct' && <Icon name="check" />}
              {state === 'wrong' && <Icon name="x" />}
            </button>
          );
        })}
      </div>
      {audioOnly && !answered && onCantListen && (
        <button className="btn ghost cant-listen" onClick={onCantListen}>
          <Icon name="headphonesOff" size={18} /> Can’t listen now
        </button>
      )}
      {answered && <Feedback ok={correct} onNext={next} />}
    </div>
  );
}

// ---------- Fill the blank ----------

/**
 * The full English translation and the sentence with one learned word blanked: pick the word
 * out of 4. Then the whole sentence is revealed with pinyin, translation and audio.
 */
export function ClozeChoice({ sentence: s, target, options, onAnswer }: { sentence: Sentence; target: Word; options: Word[]; onAnswer(q: number): void }) {
  const pv = usePinyinVisibility();
  const [picked, setPicked] = useState<number | null>(null);
  const answered = picked !== null;
  const correct = answered && options[picked].id === target.id;
  const at = s.zh.indexOf(target.hanzi);
  const pick = (i: number) => {
    if (answered || !options[i]) return;
    setPicked(i);
    autoSpeak(s.zh);
  };
  const next = () => onAnswer(correct ? Grade.Good : Grade.Again);
  useKeys(pick, answered ? next : null);

  return (
    <div className="practice sentence-practice">
      <div className="card prompt-card">
        <div className="card-kicker">Fill in the blank</div>
        <div className="prompt-meaning cloze-translation">{s.translation}</div>
        {answered ? (
          <SentenceReveal sentence={s} />
        ) : (
          <div className="prompt-sentence cloze-sentence" lang="zh-CN">
            {s.zh.slice(0, at)}
            <span className="cloze-gap">{'＿'.repeat([...target.hanzi].length)}</span>
            {s.zh.slice(at + target.hanzi.length)}
          </div>
        )}
      </div>
      <div className="options">
        {options.map((o, i) => {
          const state = !answered ? '' : o.id === target.id ? 'correct' : i === picked ? 'wrong' : 'dim';
          return (
            <button key={o.id} className={`option ${state}`} onClick={() => pick(i)} disabled={answered && state === 'dim'}>
              <span className="option-key">{i + 1}</span>
              <span className="option-text">
                <span className="option-hanzi" lang="zh-CN">
                  {o.hanzi}
                </span>
                {(answered || pv.question) && <span className="pinyin">{o.pinyin}</span>}
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

// ---------- Build the sentence ----------

/** See the translation, tap the Chinese word tiles in order. Tap a placed tile to take it back. */
export function BuildSentence({ sentence: s, tiles, answer, onAnswer }: { sentence: Sentence; tiles: string[]; answer: string[]; onAnswer(q: number): void }) {
  const pv = usePinyinVisibility();
  const [placed, setPlaced] = useState<number[]>([]);
  const [result, setResult] = useState<'right' | 'wrong' | null>(null);
  const check = () => {
    const ok = tilesCorrect(
      placed.map((i) => tiles[i]),
      answer,
    );
    setResult(ok ? 'right' : 'wrong');
    autoSpeak(s.zh);
  };
  const giveUp = () => {
    setResult('wrong');
    autoSpeak(s.zh);
  };
  const next = () => onAnswer(result === 'right' ? Grade.Good : Grade.Again);
  useKeys(
    () => {},
    result ? next : placed.length ? check : null,
  );

  return (
    <div className="practice sentence-practice">
      <div className="card prompt-card">
        <div className="card-kicker">Build the sentence</div>
        <div className="prompt-meaning">{s.translation}</div>
      </div>
      <div className={`tile-line ${result ? `is-${result}` : ''}`} aria-label="Your sentence">
        {placed.length === 0 && <span className="muted small">Tap the words below in order</span>}
        {placed.map((ti, k) => (
          <button key={k} type="button" className="tile placed" disabled={!!result} onClick={() => setPlaced((p) => p.filter((_, j) => j !== k))} lang="zh-CN">
            {tiles[ti]}
          </button>
        ))}
      </div>
      {!result && (
        <div className="tile-bank">
          {tiles.map((t, i) => (
            <button
              key={i}
              type="button"
              className="tile"
              disabled={placed.includes(i)}
              onClick={() => setPlaced((p) => [...p, i])}
              lang="zh-CN"
            >
              <span>{t}</span>
              {pv.question && <small className="pinyin">{toPinyin(t)}</small>}
            </button>
          ))}
        </div>
      )}
      {!result ? (
        <div className="row typing-buttons">
          <button type="button" className="btn ghost" onClick={giveUp}>
            Don’t know
          </button>
          <button type="button" className="btn primary" onClick={check} disabled={!placed.length}>
            Check
          </button>
        </div>
      ) : (
        <>
          <div className="card">
            <SentenceReveal sentence={s} />
          </div>
          <Feedback ok={result === 'right'} onNext={next} />
        </>
      )}
    </div>
  );
}

// ---------- Dialogue response ----------

/** Hear/see one line of a dialogue and pick the reply that comes next. */
export function DialogueResponse({
  prompt,
  promptSpeaker,
  answer,
  options,
  onAnswer,
}: {
  prompt: Sentence;
  promptSpeaker?: string;
  answer: Sentence;
  options: Sentence[];
  onAnswer(q: number): void;
}) {
  const pv = usePinyinVisibility();
  const [picked, setPicked] = useState<number | null>(null);
  const answered = picked !== null;
  const correct = answered && options[picked].id === answer.id;
  useEffect(() => autoSpeak(prompt.zh), []);
  const pick = (i: number) => {
    if (answered || !options[i]) return;
    setPicked(i);
    autoSpeak(answer.zh);
  };
  const next = () => onAnswer(correct ? Grade.Good : Grade.Again);
  useKeys(pick, answered ? next : null);

  return (
    <div className="practice sentence-practice">
      <div className="card prompt-card">
        <div className="card-kicker">What comes next?</div>
        <div className="sentence-head center">
          {promptSpeaker && <span className="speaker">{promptSpeaker}</span>}
          <TappableSentence zh={prompt.zh} className="prompt-sentence" />
          <SpeakButton text={prompt.zh} size={18} />
        </div>
        {pv.question && <div className="pinyin small">{prompt.pinyin}</div>}
        {answered && <div className="muted small">{prompt.translation}</div>}
      </div>
      <div className="options">
        {options.map((o, i) => {
          const state = !answered ? '' : o.id === answer.id ? 'correct' : i === picked ? 'wrong' : 'dim';
          return (
            <button key={o.id} className={`option ${state}`} onClick={() => pick(i)} disabled={answered && state === 'dim'}>
              <span className="option-key">{i + 1}</span>
              <span className="option-text">
                <span lang="zh-CN">{o.zh}</span>
                {(answered ? true : pv.question) && <small className="pinyin">{o.pinyin}</small>}
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

// ---------- Read-through ----------

export interface ReadLine {
  sentence: Sentence;
  speaker?: string;
}

/** The whole dialogue: speaker, Chinese (tap words), pinyin, translation, audio per line and Play all. */
export function ReadThrough({
  lines,
  title,
  hideTranslations = false,
  doneLabel,
  onDone,
}: {
  lines: ReadLine[];
  title: string;
  hideTranslations?: boolean;
  doneLabel: string;
  onDone(): void;
}) {
  const [shown, setShown] = useState<Set<string>>(new Set());
  const [playing, setPlaying] = useState(false);
  const toggleAll = () => {
    if (playing) {
      stopSpeaking();
      setPlaying(false);
      return;
    }
    setPlaying(true);
    speakAll(
      lines.map((l) => l.sentence.zh),
      () => setPlaying(false),
    );
  };
  useEffect(() => () => stopSpeaking(), []);

  return (
    <div className="practice read-through">
      <div className="card">
        <div className="card-kicker">{hideTranslations ? 'Read it once more · tap a line for its translation' : 'Read through · tap any word'}</div>
        <h2 className="read-title" lang="zh-CN">
          {title}
        </h2>
        {speechSupported && (
          <button className="btn small-btn" onClick={toggleAll}>
            <Icon name="speaker" size={16} /> {playing ? 'Stop' : 'Play all'}
          </button>
        )}
        <ol className="dialogue-lines read-lines">
          {lines.map(({ sentence: s, speaker }) => {
            const open = !hideTranslations || shown.has(s.id);
            return (
              <li key={s.id} className="dialogue-line" onClick={() => hideTranslations && setShown((x) => new Set(x).add(s.id))}>
                {speaker && <span className="speaker">{speaker}</span>}
                <div className="dialogue-line-body">
                  <div className="sentence-head">
                    <TappableSentence zh={s.zh} className="sentence-zh" />
                    <SpeakButton text={s.zh} size={18} />
                  </div>
                  <div className="pinyin small">{s.pinyin}</div>
                  {open ? <div className="sentence-translation">{s.translation}</div> : <div className="reveal-hint">tap for the translation</div>}
                </div>
              </li>
            );
          })}
        </ol>
      </div>
      <button className="btn primary block" onClick={onDone} autoFocus>
        {doneLabel}
      </button>
    </div>
  );
}
