import { useEffect, useState, type ReactNode } from 'react';
import { toPinyin } from '../lib/pinyin';
import { autoSpeak, isQuiet } from '../lib/quiet';
import { usePinyinVisibility } from '../lib/settings';
import { speak } from '../lib/speech';
import { blankedParts, charsAt, checkTiles, wordBuildTiles, type Blank, type TileCheck } from '../lib/tiles';
import { useStore } from '../store';
import { hanziDictNow } from '../lib/hanziDict';
import { Grade } from '../lib/srs';
import { CharFormula } from './Entries';
import { HanziText } from './HanziText';
import { SpeakButton } from './SpeakButton';
import type { Sentence, Word } from '../lib/types';
import { SentenceReveal } from './SentenceExercises';

/** Tapping a tile says it (unless listening is paused). */
const sayTile = (t: string) => {
  if (!isQuiet()) speak(t);
};

function useKeys(onEnter: (() => void) | null) {
  useEffect(() => {
    if (!onEnter) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.repeat || document.querySelector('.modal-backdrop')) return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onEnter();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
}

function Tile({ text, pinyin, onClick, disabled, className = '' }: { text: string; pinyin: boolean; onClick(): void; disabled?: boolean; className?: string }) {
  return (
    <button type="button" className={`tile ${className}`} disabled={disabled} onClick={onClick} lang="zh-CN">
      {pinyin && <small className="pinyin tile-pinyin">{toPinyin(text)}</small>}
      <span>{text}</span>
    </button>
  );
}

/**
 * Build in Chinese: the English (no audio before answering), then tap the tiles in order (a tile
 * says itself and moves to the answer line; tap a placed tile to send it back) and Check. The
 * order must match (punctuation ignored, stored alternatives accepted); a wrong answer shows the
 * right one with the tiles you got wrong marked.
 */
export function BuildChinese({
  kicker,
  prompt,
  answer,
  tiles,
  alternatives,
  speakText,
  reveal,
  onDone,
}: {
  kicker: string;
  prompt: ReactNode;
  answer: string[];
  tiles: string[];
  alternatives?: string[];
  /** What to say once answered (the whole sentence or word). */
  speakText: string;
  /** The full answer shown after checking. */
  reveal: ReactNode;
  onDone(result: TileCheck, placed: string[]): void;
}) {
  const pv = usePinyinVisibility('en-zh');
  const [placed, setPlaced] = useState<number[]>([]);
  const [result, setResult] = useState<TileCheck | null>(null);
  const placedText = placed.map((i) => tiles[i]);
  const check = () => {
    setResult(checkTiles(placedText, answer, alternatives));
    autoSpeak(speakText);
  };
  const giveUp = () => {
    setResult({ ok: false, wrong: answer.map((_, i) => i) });
    autoSpeak(speakText);
  };
  const next = () => result && onDone(result, placedText);
  useKeys(result ? next : placed.length ? check : null);

  return (
    <div className="practice sentence-practice">
      <div className="card prompt-card">
        <div className="card-kicker">{kicker}</div>
        {prompt}
      </div>
      <div className={`tile-line ${result ? (result.ok ? 'is-right' : 'is-wrong') : ''}`} aria-label="Your answer">
        {placed.length === 0 && !result && <span className="muted small">Tap the tiles below in order</span>}
        {placed.map((ti, k) => (
          <Tile key={k} text={tiles[ti]} pinyin={false} className="placed" disabled={!!result} onClick={() => setPlaced((p) => p.filter((_, j) => j !== k))} />
        ))}
      </div>
      {!result && (
        <div className="tile-bank">
          {tiles.map((t, i) =>
            placed.includes(i) ? (
              <span key={i} className="tile ghost-tile" aria-hidden="true">
                {t}
              </span>
            ) : (
              <Tile
                key={i}
                text={t}
                pinyin={pv.question}
                onClick={() => {
                  sayTile(t);
                  setPlaced((p) => [...p, i]);
                }}
              />
            ),
          )}
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
          {!result.ok && (
            <div className="tile-answer" lang="zh-CN" aria-label="The right answer">
              {answer.map((t, i) => (
                <span key={i} className={`tile static ${result.wrong.includes(i) ? 'wrong-tile' : ''}`}>
                  {t}
                </span>
              ))}
            </div>
          )}
          <div className="card">{reveal}</div>
          <div className={`feedback ${result.ok ? 'ok' : 'bad'}`}>
            <span>{result.ok ? 'Correct!' : 'Not quite: the tiles you got wrong are marked.'}</span>
            <button className="btn primary" onClick={next} autoFocus>
              Continue
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Complete the sentence: the English above, the sentence with 1–3 blanks, and tiles for them
 * (plus a few others). Tap a tile to fill the next blank; tap a filled blank to empty it. Each
 * blank is graded on its own.
 */
export function CompleteSentence({ s, blanks, tiles, onDone }: { s: Sentence; blanks: Blank[]; tiles: string[]; onDone(results: boolean[]): void }) {
  const pv = usePinyinVisibility('en-zh');
  // Tile index per blank (null = empty).
  const [filled, setFilled] = useState<(number | null)[]>(() => blanks.map(() => null));
  const [results, setResults] = useState<boolean[] | null>(null);
  const parts = blankedParts(s.zh, blanks);
  const used = new Set(filled.filter((x): x is number => x !== null));
  const full = filled.every((x) => x !== null);
  const place = (ti: number) => {
    const k = filled.findIndex((x) => x === null);
    if (k < 0) return;
    sayTile(tiles[ti]);
    setFilled((f) => f.map((x, j) => (j === k ? ti : x)));
  };
  const check = () => {
    setResults(blanks.map((b, k) => filled[k] !== null && tiles[filled[k]!] === b.item.hanzi));
    autoSpeak(s.zh);
  };
  const giveUp = () => {
    setResults(blanks.map(() => false));
    autoSpeak(s.zh);
  };
  const next = () => results && onDone(results);
  useKeys(results ? next : full ? check : null);
  const ok = !!results && results.every(Boolean);

  return (
    <div className="practice sentence-practice">
      <div className="card prompt-card">
        <div className="card-kicker">Complete the sentence</div>
        <div className="prompt-meaning">{s.translation}</div>
        <div className="complete-line" lang="zh-CN">
          {parts.map((p, i) =>
            'text' in p ? (
              <span key={i}>{p.text}</span>
            ) : (
              <button
                key={i}
                type="button"
                className={`blank-tile ${filled[p.blank] === null ? 'empty' : ''} ${results ? (results[p.blank] ? 'ok' : 'bad') : ''}`}
                disabled={!!results || filled[p.blank] === null}
                onClick={() => setFilled((f) => f.map((x, j) => (j === p.blank ? null : x)))}
              >
                {results && !results[p.blank] ? (
                  <>
                    {filled[p.blank] !== null && <s>{tiles[filled[p.blank]!]}</s>}
                    {blanks[p.blank].item.hanzi}
                  </>
                ) : filled[p.blank] !== null ? (
                  tiles[filled[p.blank]!]
                ) : (
                  ' '
                )}
              </button>
            ),
          )}
        </div>
      </div>
      {!results && (
        <div className="tile-bank">
          {tiles.map((t, i) =>
            used.has(i) ? (
              <span key={i} className="tile ghost-tile" aria-hidden="true">
                {t}
              </span>
            ) : (
              <Tile key={i} text={t} pinyin={pv.question} onClick={() => place(i)} disabled={full} />
            ),
          )}
        </div>
      )}
      {!results ? (
        <div className="row typing-buttons">
          <button type="button" className="btn ghost" onClick={giveUp}>
            Don’t know
          </button>
          <button type="button" className="btn primary" onClick={check} disabled={!full}>
            Check
          </button>
        </div>
      ) : (
        <>
          <div className="card">
            <SentenceReveal sentence={s} />
          </div>
          <div className={`feedback ${ok ? 'ok' : 'bad'}`}>
            <span>{ok ? 'Correct!' : `${results.filter(Boolean).length} of ${results.length} right.`}</span>
            <button className="btn primary" onClick={next} autoFocus>
              Continue
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/** Build in Chinese for a word: its meaning, then its character tiles (plus look-alikes). */
export function BuildWord({ word, onAnswer }: { word: Word; onAnswer(q: number, wrongChars?: string[]): void }) {
  const { words } = useStore();
  const pv = usePinyinVisibility('en-zh');
  const [set] = useState(() => wordBuildTiles(word, words, hanziDictNow()));
  return (
    <BuildChinese
      kicker="Build it in Chinese"
      prompt={<div className="prompt-meaning">{word.meaning}</div>}
      answer={set.answer}
      tiles={set.tiles}
      speakText={word.hanzi}
      reveal={
        <div className="word-reveal">
          <div className="answer-head">
            <span className="answer-hanzi small-hanzi" lang="zh-CN">
              <HanziText text={word.hanzi} />
            </span>
            {pv.answer && <span className="pinyin">{word.pinyin}</span>}
            <SpeakButton text={word.hanzi} />
          </div>
          <div>{word.meaning}</div>
          <CharFormula word={word} />
        </div>
      }
      onDone={(result) => onAnswer(result.ok ? Grade.Good : Grade.Again, result.ok ? undefined : charsAt(set.answer, result.wrong))}
    />
  );
}
