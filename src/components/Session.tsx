import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../store';
import { chooseExercise, RETRY_CARD, type Exercise } from '../lib/planner';
import { Grade, isLearned, practiceMiss, recordAnswer, reviewWithLeech } from '../lib/srs';
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
import { ListenChoice, listeningAvailable } from './LearnCards';
import { Icon } from './Icon';

/** 'auto': the planner picks each card's exercise from the word's strength. */
export type SessionMode = PracticeMode | 'auto';

interface Props {
  title: string;
  words: Word[];
  mode: SessionMode;
  direction: Direction;
  /** Review: answers update the SM-2 schedule. Practice: only misses do (due tomorrow at the latest). */
  updateSchedule: boolean;
  /** Leave early (✕). */
  onExit(): void;
  /** The summary's main button; defaults to onExit. Used to chain Review → Learn → Done. */
  onFinish?(): void;
  finishLabel?: string;
}

interface Step {
  id: string;
  dir: CardDirection;
  /** Auto mode: which exercise this card is. */
  ex?: Exercise;
  /** An extra, ungraded writing card (manual Review, after enough successful reviews). */
  extra?: 'writing';
}

const MIXED: CardDirection[] = ['zh-en', 'en-zh', 'zh-py'];
const resolveDir = (d: Direction): CardDirection => (d === 'mixed' ? MIXED[Math.floor(Math.random() * MIXED.length)] : d);

/** Words per Match-pairs round. */
const MATCH_BATCH = 5;

/**
 * Runs through a set of cards. Only the first answer to each word changes its schedule; words
 * answered wrong go to the back of the queue until they're recalled (per SM-2's advice to
 * repeat failed items in the same session). Every answer counts toward the word's accuracy.
 */
export function Session({ title, words: initialWords, mode, direction, updateSchedule: initialUpdate, onExit, onFinish, finishLabel }: Props) {
  const { words: allWords, updateWord, recordReview } = useStore();
  const { writingStyle, leechThreshold, showPinyin, choiceStyle, writingAfterReviews } = useSettings();

  // Full-screen practice: the app header is hidden while a session is open (see .in-session in CSS).
  useEffect(() => {
    document.body.classList.add('in-session');
    return () => document.body.classList.remove('in-session');
  }, []);
  const pinyin = usePinyinVisibility();
  const auto = mode === 'auto';
  const planCard = (w: Word): Step =>
    auto ? { id: w.id, ...chooseExercise(w, { listening: listeningAvailable }) } : { id: w.id, dir: resolveDir(direction) };

  const [leech, setLeech] = useState<{ id: string; lapses: number } | null>(null);
  const [pool, setPool] = useState(initialWords);
  const [updateSchedule, setUpdateSchedule] = useState(initialUpdate);
  const [queue, setQueue] = useState<Step[]>(() => initialWords.map(planCard));
  const [results, setResults] = useState<Map<string, number>>(new Map());
  const [step, setStep] = useState(0);

  const byId = useMemo(() => new Map(pool.map((w) => [w.id, w])), [pool]);
  const liveById = useMemo(() => new Map(allWords.map((w) => [w.id, w])), [allWords]);
  const learnedPool = useMemo(() => allWords.filter(isLearned), [allWords]);
  const current = queue[0];
  // Prefer the stored version, so edits made mid-session (e.g. a note from the leech prompt) show up.
  const word = current && (liveById.get(current.id) ?? byId.get(current.id));
  const remaining = new Set(queue.map((s) => s.id)).size;
  const done = pool.length - remaining;

  /**
   * Save one answer: statistics always; the schedule only on the word's first answer this
   * session (Review: SM-2; Practice: a miss brings the review forward). Returns true if the
   * word has now earned an extra writing card (manual Review only).
   */
  const grade = (w: Word, q: number, ungraded = false): boolean => {
    const first = !ungraded && !results.has(w.id);
    let srs = w.srs;
    let earnsWriting = false;
    let becameLeech = false;
    if (first) {
      setResults((r) => new Map(r).set(w.id, q));
      recordReview().catch(() => {});
      if (updateSchedule) {
        const r = reviewWithLeech(srs, q, leechThreshold);
        srs = r.srs;
        becameLeech = r.becameLeech;
        earnsWriting = !auto && q >= 3 && mode !== 'writing' && writingAfterReviews > 0 && (srs.successes ?? 0) >= writingAfterReviews;
      } else if (q < 3) {
        const r = practiceMiss(srs, leechThreshold);
        srs = r.srs;
        becameLeech = r.becameLeech;
      }
    }
    srs = recordAnswer(srs, q >= 3);
    updateWord({ ...w, srs }).catch((e) => console.error('Failed to save answer', e));
    if (becameLeech) setLeech({ id: w.id, lapses: srs.lapses });
    return earnsWriting;
  };

  const answer = (q: number) => {
    if (!current || !word) return;
    if (current.extra) {
      // Extra writing card: counts toward accuracy, but the word was already graded.
      grade(word, q, true);
      setQueue(([, ...rest]) => rest);
      setStep((s) => s + 1);
      return;
    }
    const writing = grade(word, q);
    setQueue(([head, ...rest]) => {
      if (q < 3) return [...rest, auto ? { id: head.id, ...RETRY_CARD } : { ...head, dir: resolveDir(direction) }];
      return writing ? [{ ...head, extra: 'writing' }, ...rest] : rest;
    });
    setStep((s) => s + 1);
  };

  // Match pairs: several words per round; missed ones go to the back of the queue.
  const matchRound = mode === 'choice' && choiceStyle === 'match' && queue.length > 1 && !current?.extra;
  const batch = matchRound
    ? queue.slice(0, MATCH_BATCH).map((st) => liveById.get(st.id) ?? byId.get(st.id)).filter((w): w is Word => !!w)
    : [];
  const answerBatch = (list: { id: string; quality: number }[]) => {
    const q = new Map(list.map((r) => [r.id, r.quality]));
    const writing = new Set(batch.filter((w) => grade(w, q.get(w.id) ?? Grade.Again)).map((w) => w.id));
    setQueue((qu) => {
      const round = qu.slice(0, batch.length);
      const failed = round.filter((st) => (q.get(st.id) ?? 0) < 3).map((st) => ({ ...st, dir: resolveDir(direction) }));
      const extras = round.filter((st) => writing.has(st.id)).map((st) => ({ ...st, extra: 'writing' as const }));
      return [...extras, ...qu.slice(batch.length), ...failed];
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
    setQueue(shuffled.map(planCard));
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
          {firstTry} of {graded.length} right on the first try
          {updateSchedule || initialUpdate ? ' · schedule updated' : missed.length ? ' · missed words come back in Review tomorrow' : ''}
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
          <button className="btn primary" onClick={onFinish ?? onExit} autoFocus>
            {finishLabel ?? 'Done'}
          </button>
        </div>
        {leechPrompt}
      </div>
    );
  }

  const writingCard = (key: string, onSkip: () => void) =>
    writingStyle === 'free' ? (
      <FreeDraw key={key} word={word} onAnswer={answer} onSkip={onSkip} />
    ) : (
      <Writing key={key} word={word} onAnswer={answer} onSkip={onSkip} />
    );

  let card;
  if (current.extra === 'writing') card = writingCard(`extra-${step}`, answer.bind(null, 0));
  else if (auto) {
    const ex = current.ex ?? 'choice';
    card =
      ex === 'listen' ? (
        <ListenChoice key={step} word={word} pool={learnedPool.length >= 4 ? learnedPool : allWords} onAnswer={answer} />
      ) : ex === 'typing' ? (
        <Typing key={step} word={word} direction={current.dir} onAnswer={answer} />
      ) : ex === 'writing' ? (
        writingCard(`auto-${step}`, skip)
      ) : (
        <MultipleChoice key={step} word={word} allWords={learnedPool.length >= 4 ? learnedPool : allWords} direction={current.dir} onAnswer={answer} />
      );
  } else if (mode === 'flashcards') card = <Flashcard key={step} word={word} direction={current.dir} graded={updateSchedule} onAnswer={answer} />;
  else if (matchRound) card = <MatchPairs key={step} words={batch} direction={current.dir} onDone={answerBatch} />;
  else if (mode === 'choice') card = <MultipleChoice key={step} word={word} allWords={allWords} direction={current.dir} onAnswer={answer} />;
  else if (mode === 'sentence') card = <SentenceCloze key={step} word={word} onAnswer={answer} onSkip={skip} />;
  else if (mode === 'typing') card = <Typing key={step} word={word} direction={current.dir} onAnswer={answer} />;
  // Switching style (in-card toggle) remounts the card for the same word.
  else card = writingCard(`${writingStyle}-${step}`, skip);

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
        {current.extra ? ' · writing practice' : results.has(word.id) && ' · retry'}
      </div>
      {card}
    </div>
  );
}
