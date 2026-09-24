import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import HanziWriter, { type CharacterJson } from 'hanzi-writer';
import { boardToUnit, compareStrokes, refToUnit, type FreeDrawResult, type Pt, type Stroke, type Verdict } from '../lib/freeDraw';
import { Grade } from '../lib/srs';
import { getSettings, useSettings } from '../lib/settings';
import { speak } from '../lib/speech';
import { charDataLoader, loadStrokeData, writableChars } from '../lib/strokes';
import type { Word } from '../lib/types';
import { BOARD_PADDING, CharSlots, cssVar, MAX_BOARD_SIZE, RiceGrid, WritingPrompt, WritingStyleToggle } from './writingParts';

interface Props {
  word: Word;
  onAnswer(quality: number): void;
  /** Leave the card ungraded (e.g. stroke data unavailable offline). */
  onSkip(): void;
}

type Status = 'loading' | 'drawing' | 'checked' | 'animating' | 'error';

interface CharResult {
  result: FreeDrawResult;
  /** "I was right" */
  overridden?: boolean;
  /** "Don't know" */
  gaveUp?: boolean;
}

/** Same mapping as the stroke-by-stroke mode: Good / Hard / Again. */
const GRADE: Record<Verdict, number> = { correct: Grade.Good, close: Grade.Hard, wrong: Grade.Again };
const LABEL: Record<Verdict, string> = { correct: 'Correct', close: 'Close', wrong: 'Wrong' };
const RANK: Record<Verdict, number> = { wrong: 0, close: 1, correct: 2 };
const FEEDBACK_CLASS: Record<Verdict, string> = { correct: 'ok', close: 'meh', wrong: 'bad' };

const verdictOf = (r: CharResult): Verdict => (r.overridden ? 'correct' : r.result.verdict);

const toPath = (s: Stroke) =>
  s.length === 1 ? `M${s[0][0]} ${s[0][1]}L${s[0][0]} ${s[0][1]}` : `M${s.map((p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join('L')}`;

export function FreeDraw({ word, onAnswer, onSkip }: Props) {
  const { writingOutline } = useSettings();
  const chars = writableChars(word.hanzi);
  const boardRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(MAX_BOARD_SIZE);
  const [index, setIndex] = useState(0);
  const [data, setData] = useState<CharacterJson | null>(null);
  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState('');
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [live, setLive] = useState<Stroke | null>(null);
  const liveRef = useRef<Stroke | null>(null);
  const [results, setResults] = useState<CharResult[]>([]);

  const isLast = index >= chars.length - 1;
  const current = results[index];

  // The pad uses the same pixel size and padding as Hanzi Writer, so the grid and outline line up.
  useLayoutEffect(() => {
    const w = boardRef.current?.clientWidth;
    if (w) setSize(Math.min(MAX_BOARD_SIZE, w));
  }, []);

  useEffect(() => {
    if (!chars.length) {
      setError('This word has no Chinese characters to write.');
      setStatus('error');
      return;
    }
    let active = true;
    setStatus('loading');
    setData(null);
    setStrokes([]);
    loadStrokeData(chars[index]).then(
      (d) => {
        if (!active) return;
        setData(d);
        setStatus('drawing');
      },
      (e: unknown) => {
        if (!active) return;
        setError(e instanceof Error && e.message.startsWith('No stroke') ? e.message : 'Couldn’t load stroke data. Are you offline?');
        setStatus('error');
      },
    );
    return () => {
      active = false;
    };
  }, [index]);

  // ---------- Drawing ----------

  const pointOf = (e: ReactPointerEvent<SVGSVGElement>): Pt => {
    const rect = e.currentTarget.getBoundingClientRect();
    const k = size / rect.width;
    return [(e.clientX - rect.left) * k, (e.clientY - rect.top) * k];
  };

  const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (status !== 'drawing') return;
    e.preventDefault();
    try {
      // Keep receiving moves if the finger leaves the board mid-stroke.
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* pointer no longer active; the stroke still works while inside the board */
    }
    liveRef.current = [pointOf(e)];
    setLive(liveRef.current);
  };

  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    const s = liveRef.current;
    if (!s) return;
    const p = pointOf(e);
    const last = s[s.length - 1];
    if (Math.hypot(p[0] - last[0], p[1] - last[1]) < 1.5) return; // skip jitter
    liveRef.current = [...s, p];
    setLive(liveRef.current);
  };

  const endStroke = () => {
    const s = liveRef.current;
    if (!s) return;
    liveRef.current = null;
    setLive(null);
    setStrokes((st) => [...st, s]);
  };

  const undo = () => setStrokes((st) => st.slice(0, -1));
  const clear = () => setStrokes([]);

  // ---------- Checking ----------

  const record = (r: CharResult) => {
    setResults((rs) => {
      const next = rs.slice();
      next[index] = r;
      return next;
    });
    setStatus('checked');
    if (isLast && getSettings().autoPlay) speak(word.hanzi);
  };

  const check = () => {
    if (!data || !strokes.length) return;
    record({ result: compareStrokes(boardToUnit(strokes, size, BOARD_PADDING), refToUnit(data.medians), chars[index]) });
  };

  // Scored as an empty drawing: every stroke shows up as "missing", which reveals the character.
  const dontKnow = () => {
    if (!data) return;
    setStrokes([]);
    record({ result: compareStrokes([], refToUnit(data.medians), chars[index]), gaveUp: true });
  };

  const advance = (overrideThis = false) => {
    const rs = results.slice();
    if (overrideThis && rs[index]) rs[index] = { ...rs[index], overridden: true };
    if (!isLast) {
      setResults(rs);
      setIndex(index + 1);
      return;
    }
    // Word verdict = the weakest character's verdict.
    const worst = rs.map(verdictOf).reduce<Verdict>((w, v) => (RANK[v] < RANK[w] ? v : w), 'correct');
    onAnswer(GRADE[worst]);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (document.querySelector('.modal-backdrop') || e.target instanceof HTMLInputElement) return;
      if (status === 'drawing' && e.key === 'Enter' && strokes.length) {
        e.preventDefault();
        check();
      } else if (status === 'checked' && e.key === 'Enter') {
        e.preventDefault();
        advance();
      } else if (status === 'drawing' && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        undo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // ---------- Rendering ----------

  const k = (size - 2 * BOARD_PADDING) / 1024;
  // Hanzi Writer's glyph paths: 1024 box, y up, baseline at -124.
  const refTransform = `translate(${BOARD_PADDING} ${BOARD_PADDING + 900 * k}) scale(${k} ${-k})`;
  const checked = status === 'checked' && current && data;
  const extra = new Set(checked ? current.result.extraUser : []);

  const wordSummary = () => {
    const vs = results.map(verdictOf);
    const worst = vs.reduce<Verdict>((w, v) => (RANK[v] < RANK[w] ? v : w), 'correct');
    const avg = Math.round(results.reduce((s, r) => s + (r.overridden ? 100 : r.result.percent), 0) / results.length);
    return { worst, avg };
  };

  return (
    <div className="practice">
      <WritingPrompt word={word} />
      <WritingStyleToggle />
      <CharSlots chars={chars} index={index} done={status === 'checked' && isLast} />

      <div className="writing-board" ref={boardRef}>
        <RiceGrid />
        <svg
          className={`draw-pad ${status === 'drawing' ? 'active' : ''}`}
          viewBox={`0 0 ${size} ${size}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endStroke}
          onPointerCancel={endStroke}
          aria-label="Drawing area"
          role="img"
        >
          {data && status === 'drawing' && writingOutline && (
            <g transform={refTransform} className="ref-outline">
              {data.strokes.map((d, i) => (
                <path key={i} d={d} />
              ))}
            </g>
          )}
          {checked && (
            <g transform={refTransform}>
              {data.strokes.map((d, i) => (
                <path key={i} d={d} className={current.result.refs[i]?.status === 'ok' ? 'ref-ok' : 'ref-missing'} />
              ))}
            </g>
          )}
          {strokes.map((s, i) => (
            <path key={i} d={toPath(s)} className={`user-stroke ${checked ? (extra.has(i) ? 'extra' : 'matched') : ''}`} />
          ))}
          {live && <path d={toPath(live)} className="user-stroke" />}
        </svg>
        {status === 'animating' && data && (
          <StrokeOrderAnimation char={chars[index]} size={size} onDone={() => setStatus('checked')} />
        )}
        {status === 'loading' && <div className="board-overlay muted small">Loading strokes…</div>}
        {status === 'error' && (
          <div className="board-overlay">
            <p className="hint error">{error}</p>
            <button className="btn" onClick={onSkip}>
              Skip this word
            </button>
          </div>
        )}
      </div>

      {status === 'drawing' && (
        <div className="free-actions">
          <div className="row">
            <button className="btn small-btn" onClick={undo} disabled={!strokes.length}>
              Undo stroke
            </button>
            <button className="btn small-btn" onClick={clear} disabled={!strokes.length}>
              Clear
            </button>
            <button className="btn small-btn ghost" onClick={dontKnow}>
              Don’t know
            </button>
          </div>
          <button className="btn primary block" onClick={check} disabled={!strokes.length}>
            Check{strokes.length ? ` (${strokes.length} stroke${strokes.length === 1 ? '' : 's'})` : ''}
          </button>
        </div>
      )}

      {(status === 'checked' || status === 'animating') && current && (
        <div className={`feedback free-result ${FEEDBACK_CLASS[verdictOf(current)]}`}>
          <div className="free-score">
            {current.gaveUp ? (
              <b>
                Here’s <span lang="zh-CN">{chars[index]}</span>. It’ll come back.
              </b>
            ) : (
              <>
                <b>{current.result.percent}%</b> · {LABEL[current.result.verdict]}
                {current.overridden && ' (you marked it right)'}
              </>
            )}
          </div>
          {!current.gaveUp && current.result.notes.length > 0 && (
            <ul className="free-notes">
              {current.result.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}
          <div className="legend small">
            {!current.gaveUp && (
              <>
                <span><i className="swatch matched" /> your strokes</span>
                {current.result.extraUser.length > 0 && <span><i className="swatch extra" /> extra / wrong</span>}
              </>
            )}
            {current.result.refs.some((r) => r.status === 'missing') && <span><i className="swatch missing" /> missing</span>}
          </div>
          {isLast && chars.length > 1 && (() => {
            const { worst, avg } = wordSummary();
            return (
              <div className="small">
                Whole word: <b>{avg}%</b> · {LABEL[worst]}
              </div>
            );
          })()}
          <div className="row free-buttons">
            <button className="btn small-btn" onClick={() => setStatus('animating')} disabled={status === 'animating'}>
              Show stroke order
            </button>
            {current.result.verdict !== 'correct' && !current.gaveUp && !current.overridden && (
              <button className="btn small-btn ghost" onClick={() => advance(true)}>
                I was right
              </button>
            )}
            <button className="btn primary" onClick={() => advance()} autoFocus>
              {isLast ? 'Continue' : 'Next character'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Plays Hanzi Writer's stroke-order animation over the board; tap to close early. */
function StrokeOrderAnimation({ char, size, onDone }: { char: string; size: number; onDone(): void }) {
  const hostRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let active = true;
    const writer = HanziWriter.create(host, char, {
      width: size,
      height: size,
      padding: BOARD_PADDING,
      showCharacter: false,
      showOutline: true,
      strokeColor: cssVar('--text'),
      outlineColor: cssVar('--border'),
      charDataLoader,
      delayBetweenStrokes: 250,
    });
    writer.animateCharacter({
      onComplete: () => {
        setTimeout(() => active && onDone(), 700);
      },
    });
    return () => {
      active = false;
      host.innerHTML = '';
    };
  }, [char, size]);
  return <div ref={hostRef} className="board-animation" onClick={onDone} title="Tap to close" />;
}
