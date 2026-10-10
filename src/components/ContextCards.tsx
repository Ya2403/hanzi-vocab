import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useStore } from '../store';
import { toPinyin } from '../lib/pinyin';
import { diffChars, normalizeZh, wordResults, type ContextCard, type DiffPart } from '../lib/contextReview';
import { autoSpeak } from '../lib/quiet';
import { buildTiles, clozeOptions, tilesCorrect } from '../lib/sentenceLearn';
import { usePinyinVisibility } from '../lib/settings';
import { Grade, isLearned } from '../lib/srs';
import type { Sentence, Word } from '../lib/types';
import { ClozeChoice, SentenceReveal, TappableSentence } from './SentenceExercises';
import { SpeakButton } from './SpeakButton';

/** What a sentence card graded: the target word, words also highlighted, other words of a reply (right or wrong). */
export interface ContextResult {
  q: number;
  also?: Map<string, number>;
  others?: Map<string, boolean>;
}

function useEnter(action: (() => void) | null) {
  useEffect(() => {
    if (!action) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.repeat || document.querySelector('.modal-backdrop')) return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        action();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
}

/** A typed answer compared character by character: missing, extra and wrong characters highlighted. */
export function DiffView({ parts }: { parts: DiffPart[] }) {
  return (
    <span className="diff" lang="zh-CN">
      {parts.map((p, i) => (
        <span key={i} className={`diff-${p.kind}`} title={p.kind === 'wrong' ? `you typed ${p.got}` : p.kind}>
          {p.kind === 'wrong' ? (
            <>
              <s>{p.got}</s>
              {p.ch}
            </>
          ) : (
            p.ch
          )}
        </span>
      ))}
    </span>
  );
}

function Feedback({ ok, children, onNext, onOverride }: { ok: boolean; children?: React.ReactNode; onNext(): void; onOverride?(): void }) {
  return (
    <div className={`feedback ${ok ? 'ok' : 'bad'}`}>
      <span>{children ?? (ok ? 'Correct!' : 'Not quite.')}</span>
      <div className="row">
        {onOverride && (
          <button className="btn ghost" onClick={onOverride}>
            I was right
          </button>
        )}
        <button className="btn primary" onClick={onNext} autoFocus>
          Continue
        </button>
      </div>
    </div>
  );
}

/** Typed Chinese: input → normalized exact match, else the comparison and "I was right". */
function TypedChinese({
  expected,
  placeholder,
  onChecked,
  onDone,
}: {
  expected: string;
  placeholder: string;
  /** The answer was checked (show the full sentence). */
  onChecked?(): void;
  onDone(correct: boolean, typed: string, override: boolean): void;
}) {
  const [input, setInput] = useState('');
  const [hint, setHint] = useState<string | null>(null);
  const [result, setResult] = useState<{ ok: boolean; parts: DiffPart[] } | null>(null);
  const ref = useRef<HTMLInputElement>(null);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (result) return onDone(result.ok, input, false);
    if (!input.trim()) return;
    if (!/[㐀-鿿]/.test(input)) return setHint('Type the characters (汉字) with a Chinese keyboard.');
    const ok = normalizeZh(input) === normalizeZh(expected);
    setResult({ ok, parts: diffChars(normalizeZh(expected), normalizeZh(input)) });
    onChecked?.();
    ref.current?.focus();
  };
  return (
    <form className="typing-form" onSubmit={submit}>
      <input
        ref={ref}
        className={`input typing-input ${result ? (result.ok ? 'is-correct' : 'is-wrong') : ''}`}
        value={input}
        onChange={(e) => {
          setInput(e.target.value);
          setHint(null);
        }}
        readOnly={!!result}
        placeholder={placeholder}
        lang="zh-CN"
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
          <button
            type="button"
            className="btn ghost"
            onClick={() => {
              setResult({ ok: false, parts: diffChars(normalizeZh(expected), '') });
              onChecked?.();
            }}
          >
            Don’t know
          </button>
          <button type="submit" className="btn primary" disabled={!input.trim()}>
            Check
          </button>
        </div>
      ) : (
        <div className={`feedback ${result.ok ? 'ok' : 'bad'}`}>
          <span>{result.ok ? 'Correct!' : <DiffView parts={result.parts} />}</span>
          <div className="row">
            {!result.ok && input.trim() && (
              <button type="button" className="btn ghost" onClick={() => onDone(true, input, true)}>
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
  );
}

/** The sentence with one word blanked. */
function Blanked({ s, word }: { s: Sentence; word: Word }) {
  const at = s.zh.indexOf(word.hanzi);
  return (
    <div className="prompt-sentence cloze-sentence" lang="zh-CN">
      {s.zh.slice(0, at)}
      <span className="cloze-gap">{'＿'.repeat([...word.hanzi].length)}</span>
      {s.zh.slice(at + word.hanzi.length)}
    </div>
  );
}

/** Fill the blank, typed: the full translation and the sentence with the word blanked. */
function ClozeTyped({ s, word, onAnswer }: { s: Sentence; word: Word; onAnswer(q: number): void }) {
  const [done, setDone] = useState<boolean | null>(null);
  return (
    <div className="practice sentence-practice">
      <div className="card prompt-card">
        <div className="card-kicker">Fill in the blank</div>
        <div className="prompt-meaning cloze-translation">{s.translation}</div>
        {done === null ? <Blanked s={s} word={word} /> : <SentenceReveal sentence={s} />}
      </div>
      <TypedChinese
        expected={word.hanzi}
        placeholder="汉字"
        onChecked={() => {
          setDone(true);
          autoSpeak(s.zh);
        }}
        onDone={(ok) => onAnswer(ok ? Grade.Good : Grade.Again)}
      />
    </div>
  );
}

/** Reply in the dialogue: the line before (with audio) and the English of the reply; build or type the reply. */
function Reply({
  s,
  prev,
  prevSpeaker,
  part,
  pool,
  known,
  linked,
  onAnswer,
}: {
  s: Sentence;
  prev: Sentence;
  prevSpeaker?: string;
  part: 'tiles' | 'typing';
  pool: Sentence[];
  known: Set<string>;
  linked: Word[];
  onAnswer(q: number, others: Map<string, boolean>): void;
}) {
  const pv = usePinyinVisibility();
  const [{ tiles, answer }] = useState(() => buildTiles(s, pool, Math.random, known));
  const [placed, setPlaced] = useState<number[]>([]);
  const [result, setResult] = useState<{ ok: boolean; got: string; override?: boolean } | null>(null);
  useEffect(() => autoSpeak(prev.zh), []);

  const finish = (ok: boolean, got: string, override = false) => {
    setResult({ ok: ok || override, got, override });
    autoSpeak(s.zh);
  };
  const next = () => {
    if (!result) return;
    const others = result.ok ? new Map(linked.map((w) => [w.id, true])) : wordResults(s.zh, result.got, linked);
    // The target word is graded on its own characters (linked[0] is the target).
    const targetOk = result.ok || others.get(linked[0]?.id) === true;
    others.delete(linked[0]?.id); // graded above, not again as an "other" word
    onAnswer(targetOk ? Grade.Good : Grade.Again, others);
  };
  useEnter(result && part === 'tiles' ? next : null);

  const prompt = (
    <div className="card prompt-card">
      <div className="card-kicker">Reply in the dialogue</div>
      <div className="sentence-head center">
        {prevSpeaker && <span className="speaker">{prevSpeaker}</span>}
        <TappableSentence zh={prev.zh} className="prompt-sentence" />
        <SpeakButton text={prev.zh} size={18} />
      </div>
      {pv.question && <div className="pinyin small">{prev.pinyin}</div>}
      <div className="reply-english">
        <span className="muted small">Your reply: </span>
        <b>{s.translation}</b>
      </div>
    </div>
  );

  if (result) {
    return (
      <div className="practice sentence-practice">
        {prompt}
        {part === 'tiles' && <div className={`tile-line is-${result.ok ? 'right' : 'wrong'}`}>{placed.map((i) => <span key={i} className="tile placed" lang="zh-CN">{tiles[i]}</span>)}</div>}
        {!result.ok && part === 'typing' && (
          <p className="diff-line">
            <DiffView parts={diffChars(normalizeZh(s.zh), normalizeZh(result.got))} />
          </p>
        )}
        <div className="card">
          <SentenceReveal sentence={s} />
        </div>
        <Feedback ok={result.ok} onNext={next} onOverride={!result.ok && part === 'typing' && result.got.trim() ? () => setResult({ ...result, ok: true, override: true }) : undefined}>
          {result.override ? 'Counted as right.' : undefined}
        </Feedback>
      </div>
    );
  }

  return (
    <div className="practice sentence-practice">
      {prompt}
      {part === 'typing' ? (
        <TypedReply expected={s.zh} onDone={(got) => finish(normalizeZh(got) === normalizeZh(s.zh), got)} />
      ) : (
        <>
          <div className="tile-line" aria-label="Your reply">
            {placed.length === 0 && <span className="muted small">Tap the words below in order</span>}
            {placed.map((ti, k) => (
              <button key={k} type="button" className="tile placed" onClick={() => setPlaced((p) => p.filter((_, j) => j !== k))} lang="zh-CN">
                {tiles[ti]}
              </button>
            ))}
          </div>
          <div className="tile-bank">
            {tiles.map((t, i) => (
              <button key={i} type="button" className="tile" disabled={placed.includes(i)} onClick={() => setPlaced((p) => [...p, i])} lang="zh-CN">
                <span>{t}</span>
                {pv.question && <small className="pinyin">{toPinyin(t)}</small>}
              </button>
            ))}
          </div>
          <div className="row typing-buttons">
            <button type="button" className="btn ghost" onClick={() => finish(false, '')}>
              Don’t know
            </button>
            <button
              type="button"
              className="btn primary"
              disabled={!placed.length}
              onClick={() => {
                const got = placed.map((i) => tiles[i]).join('');
                finish(tilesCorrect(placed.map((i) => tiles[i]), answer), got);
              }}
            >
              Check
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/** Typing a whole reply (no inline result: the reply card shows it). */
function TypedReply({ expected, onDone }: { expected: string; onDone(got: string): void }) {
  const [input, setInput] = useState('');
  const [hint, setHint] = useState<string | null>(null);
  void expected;
  return (
    <form
      className="typing-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!input.trim()) return;
        if (!/[㐀-鿿]/.test(input)) return setHint('Type the characters (汉字) with a Chinese keyboard.');
        onDone(input);
      }}
    >
      <input
        className="input typing-input"
        value={input}
        onChange={(e) => {
          setInput(e.target.value);
          setHint(null);
        }}
        placeholder="汉字"
        lang="zh-CN"
        autoFocus
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        enterKeyHint="done"
        aria-label="Your reply"
      />
      {hint && <p className="hint warn">{hint}</p>}
      <div className="row typing-buttons">
        <button type="button" className="btn ghost" onClick={() => onDone('')}>
          Don’t know
        </button>
        <button type="submit" className="btn primary" disabled={!input.trim()}>
          Check
        </button>
      </div>
    </form>
  );
}

/** Read and check: highlighted words; "I understand" (then confirm) or "Show translation" (a miss). */
function ReadCheck({ s, targets, onAnswer }: { s: Sentence; targets: Word[]; onAnswer(q: number): void }) {
  const pv = usePinyinVisibility();
  const [state, setState] = useState<'ask' | 'understood' | 'shown'>('ask');
  const [wrong, setWrong] = useState(false);
  const parts = useMemo(() => {
    // Split the sentence around the highlighted words.
    const marks: { at: number; len: number }[] = [];
    for (const w of targets) {
      const at = s.zh.indexOf(w.hanzi);
      if (at >= 0) marks.push({ at, len: w.hanzi.length });
    }
    marks.sort((a, b) => a.at - b.at);
    const out: { t: string; mark: boolean }[] = [];
    let i = 0;
    for (const m of marks) {
      if (m.at < i) continue;
      if (m.at > i) out.push({ t: s.zh.slice(i, m.at), mark: false });
      out.push({ t: s.zh.slice(m.at, m.at + m.len), mark: true });
      i = m.at + m.len;
    }
    if (i < s.zh.length) out.push({ t: s.zh.slice(i), mark: false });
    return out;
  }, [s, targets]);
  const next = () => onAnswer(state === 'understood' && !wrong ? Grade.Good : Grade.Again);
  useEnter(state === 'ask' ? null : next);

  return (
    <div className="practice sentence-practice">
      <div className="card prompt-card">
        <div className="card-kicker">Read it: do you understand the highlighted word{targets.length > 1 ? 's' : ''}?</div>
        <div className="prompt-sentence" lang="zh-CN">
          {parts.map((p, i) => (p.mark ? <mark key={i} className="target">{p.t}</mark> : <span key={i}>{p.t}</span>))}
        </div>
        {pv.question && state === 'ask' && <div className="pinyin small">{s.pinyin}</div>}
        {state !== 'ask' && <SentenceReveal sentence={s} />}
      </div>
      {state === 'ask' ? (
        <div className="row center read-check-buttons">
          <button
            className="btn"
            onClick={() => {
              setState('shown');
              autoSpeak(s.zh);
            }}
          >
            Show translation
          </button>
          <button
            className="btn primary"
            autoFocus
            onClick={() => {
              setState('understood');
              autoSpeak(s.zh);
            }}
          >
            I understand
          </button>
        </div>
      ) : (
        <div className={`feedback ${state === 'understood' && !wrong ? 'ok' : 'bad'}`}>
          <span>{state === 'shown' ? `Counted as a miss for the highlighted word${targets.length > 1 ? 's' : ''}.` : wrong ? 'Counted as a miss.' : 'Check the translation above.'}</span>
          <div className="row">
            {state === 'understood' && !wrong && (
              <button className="btn ghost" onClick={() => setWrong(true)}>
                Actually I was wrong
              </button>
            )}
            <button className="btn primary" onClick={next} autoFocus>
              Continue
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** A word review in a sentence (fill the blank, reply in the dialogue, read and check). */
export function ContextCardView({
  card,
  word,
  sentence: s,
  prev,
  onAnswer,
}: {
  card: ContextCard;
  word: Word;
  sentence: Sentence;
  /** Reply: the dialogue line before, and its speaker. */
  prev?: { sentence: Sentence; speaker?: string; lines: Sentence[] };
  onAnswer(r: ContextResult): void;
}) {
  const { words, links } = useStore();
  const linked = links.bySentence.get(s.id) ?? [];
  const known = useMemo(() => new Set(words.map((w) => w.hanzi.trim())), [words]);
  const [options] = useState(() => {
    if (card.ex !== 'cloze' || card.part !== 'choice') return [];
    // Distractors: learned words sharing a tag with the target first, then any learned word.
    const learned = words.filter(isLearned);
    const near = learned.filter((w) => w.tags.some((t) => word.tags.includes(t)));
    return clozeOptions(word, s, near.length >= 6 ? near : learned);
  });

  if (card.ex === 'cloze' && card.part === 'choice') return <ClozeChoice sentence={s} target={word} options={options} onAnswer={(q) => onAnswer({ q })} />;
  if (card.ex === 'cloze') return <ClozeTyped s={s} word={word} onAnswer={(q) => onAnswer({ q })} />;
  if (card.ex === 'reply' && prev) {
    const others = linked.filter((w) => w.id !== word.id && isLearned(w));
    return (
      <Reply
        s={s}
        prev={prev.sentence}
        prevSpeaker={prev.speaker}
        part={card.part === 'typing' ? 'typing' : 'tiles'}
        pool={prev.lines}
        known={known}
        linked={[word, ...others]}
        onAnswer={(q, res) => {
          res.delete(word.id);
          onAnswer({ q, others: res });
        }}
      />
    );
  }
  const also = (card.alsoIds ?? []).map((id) => words.find((w) => w.id === id)).filter((w): w is Word => !!w);
  return (
    <ReadCheck
      s={s}
      targets={[word, ...also]}
      onAnswer={(q) => onAnswer({ q, also: new Map(also.map((w) => [w.id, q])) })}
    />
  );
}

