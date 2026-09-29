import { autoSpeak } from '../lib/quiet';
import { useEffect, useMemo, useState } from 'react';
import { Grade } from '../lib/srs';
import { usePinyinVisibility } from '../lib/settings';
import { shuffle } from '../lib/words';
import type { CardDirection, Word } from '../lib/types';

interface Props {
  /** The words in this round (2–6 works best). */
  words: Word[];
  direction: CardDirection;
  /** Called once every pair is matched: Good for words matched first time, Again otherwise. */
  onDone(results: { id: string; quality: number }[]): void;
}

type Side = 'left' | 'right';

/** Left: what you're shown. Right: what you match it to. */
const promptOf = (w: Word, d: CardDirection) => (d === 'en-zh' ? w.meaning : w.hanzi);
const answerOf = (w: Word, d: CardDirection) => (d === 'zh-en' ? w.meaning : d === 'en-zh' ? w.hanzi : w.pinyin);

const KICKER: Record<CardDirection, string> = {
  'zh-en': 'Match each word to its meaning',
  'en-zh': 'Match each meaning to the Chinese',
  'zh-py': 'Match each word to its pinyin',
};

export function MatchPairs({ words, direction, onDone }: Props) {
  const pv = usePinyinVisibility(direction);
  const [left] = useState(() => shuffle(words));
  const [right] = useState(() => shuffle(words));
  const [selected, setSelected] = useState<{ side: Side; id: string } | null>(null);
  /** Matched word ids per side (a right-side item can stand in for a word with the same answer). */
  const [doneLeft, setDoneLeft] = useState<Set<string>>(new Set());
  const [doneRight, setDoneRight] = useState<Set<string>>(new Set());
  const [mistakes, setMistakes] = useState<Map<string, number>>(new Map());
  const [wrong, setWrong] = useState<{ left: string; right: string } | null>(null);
  const finished = doneLeft.size === words.length;
  const byId = useMemo(() => new Map(words.map((w) => [w.id, w])), [words]);

  const tryPair = (leftId: string, rightId: string) => {
    const l = byId.get(leftId)!;
    const r = byId.get(rightId)!;
    // Compare the answers themselves, so two words sharing a meaning/pinyin can't cause a false miss.
    if (answerOf(l, direction) === answerOf(r, direction)) {
      setDoneLeft((s) => new Set(s).add(leftId));
      setDoneRight((s) => new Set(s).add(rightId));
      autoSpeak(l.hanzi);
    } else {
      setMistakes((m) => new Map(m).set(leftId, (m.get(leftId) ?? 0) + 1));
      setWrong({ left: leftId, right: rightId });
      setTimeout(() => setWrong(null), 550);
    }
    setSelected(null);
  };

  const tap = (side: Side, id: string) => {
    if (finished) return;
    if ((side === 'left' ? doneLeft : doneRight).has(id)) return;
    if (!selected || selected.side === side) {
      setSelected(selected?.id === id && selected.side === side ? null : { side, id });
      return;
    }
    if (side === 'right') tryPair(selected.id, id);
    else tryPair(id, selected.id);
  };

  const finish = () => onDone(words.map((w) => ({ id: w.id, quality: mistakes.get(w.id) ? Grade.Again : Grade.Good })));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (document.querySelector('.modal-backdrop')) return;
      if (finished && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        finish();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const missed = words.filter((w) => mistakes.get(w.id));
  const itemClass = (side: Side, id: string) =>
    [
      'match-item',
      (side === 'left' ? doneLeft : doneRight).has(id) ? 'matched' : '',
      selected?.side === side && selected.id === id ? 'selected' : '',
      wrong && wrong[side] === id ? 'wrong' : '',
    ].join(' ');

  const showPinyin = finished ? pv.answer : pv.question;

  return (
    <div className="practice match-practice">
      <div className="card match-card">
        <div className="card-kicker">{KICKER[direction]}</div>
        <div className="match-grid">
          <div className="match-col">
            {left.map((w) => (
              <button key={w.id} className={itemClass('left', w.id)} onClick={() => tap('left', w.id)} disabled={doneLeft.has(w.id)}>
                {direction === 'en-zh' ? (
                  <span>{promptOf(w, direction)}</span>
                ) : (
                  <>
                    <span className="match-hanzi" lang="zh-CN">
                      {w.hanzi}
                    </span>
                    {showPinyin && direction === 'zh-en' && <span className="pinyin">{w.pinyin}</span>}
                  </>
                )}
              </button>
            ))}
          </div>
          <div className="match-col">
            {right.map((w) => (
              <button key={w.id} className={itemClass('right', w.id)} onClick={() => tap('right', w.id)} disabled={doneRight.has(w.id)}>
                {direction === 'en-zh' ? (
                  <>
                    <span className="match-hanzi" lang="zh-CN">
                      {w.hanzi}
                    </span>
                    {showPinyin && <span className="pinyin">{w.pinyin}</span>}
                  </>
                ) : (
                  <span className={direction === 'zh-py' ? 'option-pinyin' : undefined}>{answerOf(w, direction)}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {finished && (
        <div className={`feedback ${missed.length ? 'meh' : 'ok'}`}>
          <span>
            {missed.length ? (
              <>
                All matched. Missed first time: <b lang="zh-CN">{missed.map((w) => w.hanzi).join('、')}</b>
              </>
            ) : (
              'All matched, no mistakes!'
            )}
          </span>
          <button className="btn primary" onClick={finish} autoFocus>
            Continue
          </button>
        </div>
      )}
    </div>
  );
}
