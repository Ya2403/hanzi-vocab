import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useStore } from '../store';
import { toPinyin } from '../lib/pinyin';
import { diffChars, normalizeZh, wordResults, type ContextCard, type DiffPart } from '../lib/contextReview';
import { checkTypedChinese, type TypedCheck, type TypedVerdict } from '../lib/typedChinese';
import { autoSpeak } from '../lib/quiet';
import { buildTiles, clozeOptions, tilesCorrect } from '../lib/sentenceLearn';
import { usePinyinVisibility } from '../lib/settings';
import { Grade, isLearned } from '../lib/srs';
import type { Sentence, Word } from '../lib/types';
import { ClozeChoice, SentenceReveal } from './SentenceExercises';
import { BuildChinese, CompleteSentence } from './TileCards';
import { SentenceDictation, TypeSentence } from './TypedCards';
import { blankTiles, sentenceBuildTiles, type Blank } from '../lib/tiles';
import { hanziDictNow } from '../lib/hanziDict';
import { SpeakButton } from './SpeakButton';
import { HintEn, HintZh } from './Hints';

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

function Feedback({ ok, almost, children, onNext, onOverride }: { ok: boolean; almost?: boolean; children?: React.ReactNode; onNext(): void; onOverride?(): void }) {
  return (
    <div className={`feedback ${ok ? 'ok' : almost ? 'meh' : 'bad'}`}>
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

/** The grade for a typed answer: correct (or "I was right") Good, almost Hard, wrong Again. */
export const typedGrade = (verdict: TypedVerdict, override = false): number =>
  override || verdict === 'correct' ? Grade.Good : verdict === 'almost' ? Grade.Hard : Grade.Again;

/**
 * Typed Chinese: exact (spaces, punctuation and "…" ignored) is correct; one wrong character in
 * 6+ is "Almost"; otherwise wrong. Whenever it isn't exact: the comparison and "I was right".
 */
export function TypedChinese({
  expected,
  alternatives,
  sameSound,
  placeholder,
  onChecked,
  onDone,
}: {
  expected: string;
  alternatives?: string[];
  /** Dictation: other characters with the same reading count as correct. */
  sameSound?: boolean;
  placeholder: string;
  /** The answer was checked (show the full sentence). */
  onChecked?(check: TypedCheck): void;
  onDone(result: { verdict: TypedVerdict; typed: string; override: boolean; check: TypedCheck }): void;
}) {
  const [input, setInput] = useState('');
  const [hint, setHint] = useState<string | null>(null);
  const [result, setResult] = useState<(TypedCheck & { ok: boolean }) | null>(null);
  const ref = useRef<HTMLInputElement>(null);
  const finish = (override = false) => result && onDone({ verdict: result.verdict, typed: input, override, check: result });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (result) return finish();
    if (!input.trim()) return;
    if (!/[㐀-鿿]/.test(input)) return setHint('Type the characters (汉字) with a Chinese keyboard.');
    const check = checkTypedChinese(expected, input, { alternatives, sameSound });
    setResult({ ...check, ok: check.verdict === 'correct' });
    onChecked?.(check);
    ref.current?.focus();
  };
  return (
    <form className="typing-form" onSubmit={submit}>
      <input
        ref={ref}
        className={`input typing-input ${result ? (result.ok ? 'is-correct' : result.verdict === 'almost' ? 'is-close' : 'is-wrong') : ''}`}
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
              const check = checkTypedChinese(expected, '');
              setResult({ ...check, ok: false });
              onChecked?.(check);
            }}
          >
            Don’t know
          </button>
          <button type="submit" className="btn primary" disabled={!input.trim()}>
            Check
          </button>
        </div>
      ) : (
        <div className={`feedback ${result.ok ? 'ok' : result.verdict === 'almost' ? 'meh' : 'bad'}`}>
          <span>
            {result.ok && !result.note ? (
              'Correct!'
            ) : (
              <>
                {result.ok ? <b>Correct · {result.note}</b> : result.verdict === 'almost' && <b>Almost: </b>}
                {input.trim() && <DiffView parts={result.parts} />}
                {!input.trim() && <span lang="zh-CN">{expected}</span>}
              </>
            )}
          </span>
          <div className="row">
            {!result.ok && input.trim() && (
              <button type="button" className="btn ghost" onClick={() => finish(true)}>
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
      <HintZh text={s.zh.slice(0, at)} exclude={[word]} />
      <span className="cloze-gap">{'＿'.repeat([...word.hanzi].length)}</span>
      <HintZh text={s.zh.slice(at + word.hanzi.length)} exclude={[word]} />
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
        <div className="prompt-meaning cloze-translation">
          <HintEn text={s.translation} sentence={s} exclude={[word]} />
        </div>
        {done === null ? <Blanked s={s} word={word} /> : <SentenceReveal sentence={s} />}
      </div>
      <TypedChinese
        expected={word.hanzi}
        placeholder="汉字"
        onChecked={() => {
          setDone(true);
          autoSpeak(s.zh);
        }}
        onDone={(r) => onAnswer(typedGrade(r.verdict, r.override))}
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
  const [result, setResult] = useState<{ ok: boolean; got: string; override?: boolean; almost?: boolean } | null>(null);
  useEffect(() => autoSpeak(prev.zh), []);

  const finish = (ok: boolean, got: string, override = false, almost = false) => {
    setResult({ ok: ok || override, got, override, almost: almost && !ok && !override });
    autoSpeak(s.zh);
  };
  const next = () => {
    if (!result) return;
    const others = result.ok ? new Map(linked.map((w) => [w.id, true])) : wordResults(s.zh, result.got, linked);
    // The target is graded on its own characters (linked[0] is the target); "Almost" on them is Hard.
    const targetOk = result.ok || others.get(linked[0]?.id) === true;
    others.delete(linked[0]?.id); // graded above, not again as an "other" item
    onAnswer(targetOk ? Grade.Good : result.almost ? Grade.Hard : Grade.Again, others);
  };
  useEnter(result && part === 'tiles' ? next : null);

  const prompt = (
    <div className="card prompt-card">
      <div className="card-kicker">Reply in the dialogue</div>
      <div className="sentence-head center">
        {prevSpeaker && <span className="speaker">{prevSpeaker}</span>}
        <HintZh text={prev.zh} exclude={[linked[0]]} className="prompt-sentence" />
        <SpeakButton text={prev.zh} size={18} />
      </div>
      {pv.question && <div className="pinyin small">{prev.pinyin}</div>}
      <div className="reply-english">
        <span className="muted small">Your reply: </span>
        <b>
          <HintEn text={s.translation} sentence={s} exclude={[linked[0]]} />
        </b>
      </div>
    </div>
  );

  if (result) {
    return (
      <div className="practice sentence-practice">
        {prompt}
        {part === 'tiles' && <div className={`tile-line is-${result.ok ? 'right' : 'wrong'}`}>{placed.map((i) => <span key={i} className="tile placed" lang="zh-CN">{tiles[i]}</span>)}</div>}
        {!result.ok && part === 'typing' && result.got.trim() && (
          <p className="diff-line">
            {result.almost && <b>Almost: </b>}
            <DiffView parts={diffChars(normalizeZh(s.zh), normalizeZh(result.got))} />
          </p>
        )}
        <div className="card">
          <SentenceReveal sentence={s} />
        </div>
        <Feedback
          ok={result.ok}
          almost={result.almost}
          onNext={next}
          onOverride={!result.ok && part === 'typing' && result.got.trim() ? () => setResult({ ...result, ok: true, override: true, almost: false }) : undefined}
        >
          {result.override ? 'Counted as right.' : result.almost ? 'Almost: one character is off.' : undefined}
        </Feedback>
      </div>
    );
  }

  return (
    <div className="practice sentence-practice">
      {prompt}
      {part === 'typing' ? (
        <TypedReply
          expected={s.zh}
          onDone={(got) => {
            const check = checkTypedChinese(s.zh, got, { alternatives: s.alternatives });
            finish(check.verdict === 'correct', got, false, check.verdict === 'almost');
          }}
        />
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

/** An item reviewed in a sentence (fill the blank, reply in the dialogue, build in Chinese, complete the sentence). */
export function ContextCardView({
  card,
  word,
  sentence: s,
  prev,
  onAnswer,
  onCantListen,
}: {
  card: ContextCard;
  word: Word;
  sentence: Sentence;
  /** Reply: the dialogue line before, and its speaker. */
  prev?: { sentence: Sentence; speaker?: string; lines: Sentence[] };
  onAnswer(r: ContextResult): void;
  /** Dictation: "Can't listen now". */
  onCantListen?(): void;
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
  if (card.ex === 'complete') return <CompleteCard s={s} word={word} blankIds={card.blankIds ?? []} onAnswer={onAnswer} />;
  if (card.ex === 'type') return <TypeSentence s={s} word={word} linked={linked} onAnswer={onAnswer} />;
  if (card.ex === 'dictation') return <SentenceDictation s={s} word={word} linked={linked} onAnswer={onAnswer} onCantListen={onCantListen} />;
  return <BuildCard s={s} word={word} linked={linked} onAnswer={onAnswer} />;
}

/**
 * Build in Chinese for a sentence: its English, then its word tiles. The target is right when its
 * own characters are; the other learned items of the sentence record right or wrong.
 */
function BuildCard({ s, word, linked, onAnswer }: { s: Sentence; word: Word; linked: Word[]; onAnswer(r: ContextResult): void }) {
  const { words } = useStore();
  const [set] = useState(() => sentenceBuildTiles(s, words, hanziDictNow()));
  const items = [word, ...linked.filter((w) => w.id !== word.id && isLearned(w))];
  return (
    <BuildChinese
      kicker="Build it in Chinese"
      prompt={
        <div className="prompt-meaning">
          <HintEn text={s.translation} sentence={s} exclude={[word]} />
        </div>
      }
      answer={set.answer}
      tiles={set.tiles}
      alternatives={s.alternatives}
      speakText={s.zh}
      reveal={<SentenceReveal sentence={s} />}
      onDone={(result, placed) => {
        const res = result.ok ? new Map(items.map((w) => [w.id, true])) : wordResults(s.zh, placed.join(''), items);
        const targetOk = result.ok || res.get(word.id) === true;
        res.delete(word.id);
        onAnswer({ q: targetOk ? Grade.Good : Grade.Again, others: res });
      }}
    />
  );
}

/** Complete the sentence: the target and the other blanked items, each graded on its own. */
function CompleteCard({ s, word, blankIds, onAnswer }: { s: Sentence; word: Word; blankIds: string[]; onAnswer(r: ContextResult): void }) {
  const { words } = useStore();
  const [setup] = useState(() => {
    const items = [word, ...blankIds.map((id) => words.find((w) => w.id === id)).filter((w): w is Word => !!w)];
    const blanks: Blank[] = items
      .map((item) => ({ item, at: s.zh.indexOf(item.hanzi.trim()) }))
      .filter((b) => b.at >= 0)
      .sort((x, y) => x.at - y.at);
    return { blanks, tiles: blankTiles(blanks, s, words) };
  });
  return (
    <CompleteSentence
      s={s}
      blanks={setup.blanks}
      tiles={setup.tiles}
      onDone={(results) => {
        const res = new Map(setup.blanks.map((b, k) => [b.item.id, results[k]]));
        const targetOk = res.get(word.id) === true;
        res.delete(word.id);
        onAnswer({ q: targetOk ? Grade.Good : Grade.Again, others: res });
      }}
    />
  );
}

