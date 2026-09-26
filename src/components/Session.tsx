import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../store';
import { Grade, reviewWithLeech } from '../lib/srs';
import { shuffle } from '../lib/words';
import type { CardDirection, Direction, PracticeMode, Word } from '../lib/types';
import { Flashcard } from './Flashcard';
import { MultipleChoice } from './MultipleChoice';
import { Writing } from './Writing';
import { FreeDraw } from './FreeDraw';
import { updateSettings, usePinyinVisibility, useSettings } from '../lib/settings';
import { LeechPrompt } from './LeechPrompt';
import { Typing } from './Typing';
import { SentenceCloze } from './SentenceCloze';
import { MatchPairs } from './MatchPairs';
import { Icon } from './Icon';

interface Props {
  title: string;
  words: Word[];
  mode: PracticeMode;
  direction: Direction;
  /** Write SM-2 results back to the words (daily review) or just practice. */
  updateSchedule: boolean;
  onExit(): void;
}

interface Step {
  id: string;
  dir: CardDirection;
}

const MIXED: CardDirection[] = ['zh-en', 'en-zh', 'zh-py'];
const resolveDir = (d: Direction): CardDirection => (d === 'mixed' ? MIXED[Math.floor(Math.random() * MIXED.length)] : d);

/** Words per Match-pairs round. */
const MATCH_BATCH = 5;

/**
 * Runs through a set of cards. Only the first answer to each word is graded; words
 * answered "Again" go to the back of the queue until they're recalled (per SM-2's
 * advice to repeat failed items in the same session).
 */
export function Session({ title, words: initialWords, mode, direction, updateSchedule: initialUpdate, onExit }: Props) {
  const { words: allWords, updateWord, recordReview } = useStore();
  const { writingStyle, leechThreshold, showPinyin, choiceStyle } = useSettings();

  // Full-screen practice: the app header is hidden while a session is open (see .in-session in CSS).
  useEffect(() => {
    document.body.classList.add('in-session');
    return () => document.body.classList.remove('in-session');
  }, []);
  const pinyin = usePinyinVisibility();
  const [leech, setLeech] = useState<{ id: string; lapses: number } | null>(null);
  const [pool, setPool] = useState(initialWords);
  const [updateSchedule, setUpdateSchedule] = useState(initialUpdate);
  const [queue, setQueue] = useState<Step[]>(() => initialWords.map((w) => ({ id: w.id, dir: resolveDir(direction) })));
  const [results, setResults] = useState<Map<string, number>>(new Map());
  const [step, setStep] = useState(0);

  const byId = useMemo(() => new Map(pool.map((w) => [w.id, w])), [pool]);
  const liveById = useMemo(() => new Map(allWords.map((w) => [w.id, w])), [allWords]);
  const current = queue[0];
  // Prefer the stored version, so edits made mid-session (e.g. a note from the leech prompt) show up.
  const word = current && (liveById.get(current.id) ?? byId.get(current.id));
  const remaining = new Set(queue.map((s) => s.id)).size;
  const done = pool.length - remaining;

  /** Record a word's first answer in this session (later retries aren't graded). */
  const grade = (w: Word, q: number) => {
    if (results.has(w.id)) return;
    setResults((r) => new Map(r).set(w.id, q));
    const writes: Promise<void>[] = [recordReview()];
    if (updateSchedule) {
      const { srs, becameLeech } = reviewWithLeech(w.srs, q, leechThreshold);
      writes.push(updateWord({ ...w, srs }));
      if (becameLeech) setLeech({ id: w.id, lapses: srs.lapses });
    }
    Promise.all(writes).catch((e) => console.error('Failed to save review', e));
  };

  const answer = (q: number) => {
    if (!current || !word) return;
    grade(word, q);
    setQueue(([head, ...rest]) => (q < 3 ? [...rest, { ...head, dir: resolveDir(direction) }] : rest));
    setStep((s) => s + 1);
  };

  // Match pairs: several words per round; missed ones go to the back of the queue.
  const matchRound = mode === 'choice' && choiceStyle === 'match' && queue.length > 1;
  const batch = matchRound
    ? queue.slice(0, MATCH_BATCH).map((st) => liveById.get(st.id) ?? byId.get(st.id)).filter((w): w is Word => !!w)
    : [];
  const answerBatch = (list: { id: string; quality: number }[]) => {
    const q = new Map(list.map((r) => [r.id, r.quality]));
    for (const w of batch) grade(w, q.get(w.id) ?? Grade.Again);
    setQueue((qu) => {
      const round = qu.slice(0, batch.length);
      const failed = round.filter((st) => (q.get(st.id) ?? 0) < 3).map((st) => ({ ...st, dir: resolveDir(direction) }));
      return [...qu.slice(batch.length), ...failed];
    });
    setStep((s) => s + 1);
  };

  /** Drop the current card without grading it. */
  const skip = () => {
    setQueue(([, ...rest]) => rest);
    setStep((s) => s + 1);
  };

  const restartWith = (list: Word[]) => {
    const shuffled = shuffle(list);
    setPool(shuffled);
    setUpdateSchedule(false);
    setQueue(shuffled.map((w) => ({ id: w.id, dir: resolveDir(direction) })));
    setResults(new Map());
  };

  // Rendered on top of whatever is showing (the next card, or the summary after the last one).
  const leechPrompt = leech && <LeechPrompt wordId={leech.id} lapses={leech.lapses} onClose={() => setLeech(null)} />;

  if (!word) {
    const graded = [...results.values()];
    const firstTry = graded.filter((q) => q >= 3).length;
    const missed = pool.filter((w) => (results.get(w.id) ?? 5) < 3);
    const pct = graded.length ? Math.round((firstTry / graded.length) * 100) : 0;
    return (
      <div className="summary card">
        <div className="summary-score">{pct}%</div>
        <h2>Session complete</h2>
        <p className="muted">
          {firstTry} of {graded.length} recalled on the first try
          {updateSchedule || initialUpdate ? ' · schedule updated' : ''}
        </p>
        {missed.length > 0 && (
          <>
            <h3>To work on</h3>
            <ul className="missed">
              {missed.map((w) => (
                <li key={w.id}>
                  <span className="hanzi" lang="zh-CN">{w.hanzi}</span>
                  {pinyin.answer && <span className="pinyin">{w.pinyin}</span>}
                  <span className="meaning">{w.meaning}</span>
                </li>
              ))}
            </ul>
          </>
        )}
        <div className="row center">
          {missed.length > 0 && (
            <button className="btn" onClick={() => restartWith(missed)}>
              Practice missed
            </button>
          )}
          <button className="btn primary" onClick={onExit}>
            Done
          </button>
        </div>
        {leechPrompt}
      </div>
    );
  }

  return (
    <div className="session">
      <div className="session-bar">
        <button className="icon-btn" onClick={onExit} aria-label="End session" title="End session">
          <Icon name="close" />
        </button>
        <div className="progress" aria-label={`${done} of ${pool.length} done`}>
          <div className="progress-fill" style={{ width: `${(done / pool.length) * 100}%` }} />
        </div>
        <span className="muted small">
          {done}/{pool.length}
        </span>
        <button
          className={`pinyin-toggle ${showPinyin ? 'on' : ''}`}
          onClick={() => updateSettings({ showPinyin: !showPinyin })}
          aria-pressed={showPinyin}
          title={showPinyin ? 'Pinyin shown: tap to hide' : 'Pinyin hidden: tap to show'}
        >
          拼音
        </button>
      </div>
      {leechPrompt}
      <div className="session-title muted small">
        {title}
        {results.has(word.id) && ' · retry'}
      </div>
      {mode === 'flashcards' ? (
        <Flashcard key={step} word={word} direction={current.dir} graded={updateSchedule} onAnswer={answer} />
      ) : matchRound ? (
        <MatchPairs key={step} words={batch} direction={current.dir} onDone={answerBatch} />
      ) : mode === 'choice' ? (
        <MultipleChoice key={step} word={word} allWords={allWords} direction={current.dir} onAnswer={answer} />
      ) : mode === 'sentence' ? (
        <SentenceCloze key={step} word={word} onAnswer={answer} onSkip={skip} />
      ) : mode === 'typing' ? (
        <Typing key={step} word={word} direction={current.dir} onAnswer={answer} />
      ) : (
        // Switching style (in-card toggle) remounts the card for the same word.
        writingStyle === 'free' ? (
          <FreeDraw key={`free-${step}`} word={word} onAnswer={answer} onSkip={skip} />
        ) : (
          <Writing key={`strokes-${step}`} word={word} onAnswer={answer} onSkip={skip} />
        )
      )}
    </div>
  );
}
