import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../store';
import { chooseExercise, dueItems, orderItems, retryCard, weakestSkill, type Exercise } from '../lib/planner';
import {
  activeSkills,
  DIR_SKILL,
  Grade,
  isLearned,
  practiceMiss,
  recordAnswer,
  reviewWithLeech,
  SKILL_DIR,
  SKILL_LABEL,
  skillState,
  withSkill,
} from '../lib/srs';
import { shuffle } from '../lib/words';
import type { CardDirection, Direction, PracticeMode, Skill, Word } from '../lib/types';
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

/** 'auto': the planner picks each card's exercise from the tested skill's strength. */
export type SessionMode = PracticeMode | 'auto';

interface Props {
  title: string;
  words: Word[];
  mode: SessionMode;
  /** Practice only: which way cards go in manual mode (Review follows each due skill). */
  direction: Direction;
  /** Review: one card per due skill, answers update its SM-2 schedule. Practice: one card per word, only misses change the schedule. */
  updateSchedule: boolean;
  /** Leave early (✕). */
  onExit(): void;
  /** The summary's main button; defaults to onExit. Used to chain Review → Learn → Done. */
  onFinish?(): void;
  finishLabel?: string;
}

interface Step {
  id: string;
  skill: Skill;
  dir: CardDirection;
  /** Auto mode: which exercise this card is. */
  ex?: Exercise;
}

const keyOf = (s: { id: string; skill: Skill }) => `${s.id}|${s.skill}`;

const MIXED: CardDirection[] = ['zh-en', 'en-zh', 'zh-py'];
const resolveDir = (d: Direction): CardDirection => (d === 'mixed' ? MIXED[Math.floor(Math.random() * MIXED.length)] : d);

/** Words per Match-pairs round. */
const MATCH_BATCH = 5;

/**
 * Runs through a set of cards, each testing one skill of a word. Only the first answer to each
 * card changes that skill's schedule; cards answered wrong go to the back of the queue until
 * they're recalled (per SM-2's advice to repeat failed items in the same session). Every
 * answer counts toward the skill's accuracy.
 */
export function Session({ title, words: initialWords, mode, direction, updateSchedule: initialUpdate, onExit, onFinish, finishLabel }: Props) {
  const { words: allWords, updateWord, recordReview } = useStore();
  const { writingStyle, leechThreshold, showPinyin, choiceStyle } = useSettings();

  // Full-screen practice: the app header is hidden while a session is open (see .in-session in CSS).
  useEffect(() => {
    document.body.classList.add('in-session');
    return () => document.body.classList.remove('in-session');
  }, []);
  const pinyin = usePinyinVisibility();
  const auto = mode === 'auto';

  /** The card for one skill of a word. */
  const cardFor = (w: Word, skill: Skill): Step =>
    auto ? { id: w.id, skill, ...chooseExercise(w, skill, { listening: listeningAvailable }) } : { id: w.id, skill, dir: SKILL_DIR[skill] };

  /** Practice: which skill a word's card tests. */
  const practiceStep = (w: Word): Step => {
    if (auto) return cardFor(w, weakestSkill(w) ?? 'meaning');
    if (mode === 'writing') return { id: w.id, skill: 'writing', dir: 'en-zh' };
    if (mode === 'sentence') return { id: w.id, skill: 'recall', dir: 'en-zh' };
    const dir = resolveDir(direction);
    return { id: w.id, skill: DIR_SKILL[dir], dir };
  };

  const initialSteps = () =>
    initialUpdate ? orderItems(dueItems(initialWords)).map((it) => cardFor(it.word, it.skill)) : initialWords.map(practiceStep);

  const [leech, setLeech] = useState<{ id: string; lapses: number; skill: Skill } | null>(null);
  const [pool, setPool] = useState(initialWords);
  const [updateSchedule, setUpdateSchedule] = useState(initialUpdate);
  const [queue, setQueue] = useState<Step[]>(initialSteps);
  const [total, setTotal] = useState(() => new Set(queue.map(keyOf)).size);
  const [results, setResults] = useState<Map<string, number>>(new Map());
  const [step, setStep] = useState(0);

  const byId = useMemo(() => new Map(pool.map((w) => [w.id, w])), [pool]);
  const liveById = useMemo(() => new Map(allWords.map((w) => [w.id, w])), [allWords]);
  const learnedPool = useMemo(() => allWords.filter(isLearned), [allWords]);
  const current = queue[0];
  // Prefer the stored version, so edits made mid-session (e.g. a note from the leech prompt) show up.
  const wordOf = (id: string) => liveById.get(id) ?? byId.get(id);
  const word = current && wordOf(current.id);
  const done = total - new Set(queue.map(keyOf)).size;

  /**
   * Save one answer to the tested skill: statistics always; the schedule only on the card's
   * first answer this session (Review: SM-2; Practice: a miss brings the review forward).
   * Skills the word isn't reviewed on (e.g. writing while it's off) only count for the streak.
   */
  const grade = (w: Word, skill: Skill, q: number) => {
    const key = keyOf({ id: w.id, skill });
    const first = !results.has(key);
    if (first) {
      setResults((r) => new Map(r).set(key, q));
      recordReview().catch(() => {});
    }
    if (!activeSkills(w).includes(skill)) return;
    let st = skillState(w, skill);
    let becameLeech = false;
    if (first) {
      const r = updateSchedule ? reviewWithLeech(st, q, leechThreshold) : q < 3 ? practiceMiss(st, leechThreshold) : null;
      if (r) [st, becameLeech] = [r.srs, r.becameLeech];
    }
    st = recordAnswer(st, q >= 3);
    updateWord(withSkill(w, skill, st)).catch((e) => console.error('Failed to save answer', e));
    if (becameLeech) setLeech({ id: w.id, lapses: st.lapses, skill });
  };

  const retry = (s: Step): Step => (auto ? { ...s, ...retryCard(s.skill) } : s);

  const answer = (q: number) => {
    if (!current || !word) return;
    grade(word, current.skill, q);
    setQueue(([head, ...rest]) => (q < 3 ? [...rest, retry(head)] : rest));
    setStep((s) => s + 1);
  };

  // Match pairs: several cards of the same direction per round (different words); missed ones go to the back.
  const matchSteps = useMemo(() => {
    if (!(mode === 'choice' && choiceStyle === 'match' && current)) return [];
    const seen = new Set<string>();
    return queue
      .filter((s) => s.dir === current.dir && !seen.has(s.id) && seen.add(s.id))
      .slice(0, MATCH_BATCH);
  }, [mode, choiceStyle, current, queue]);
  const matchRound = matchSteps.length > 1;
  const batch = matchRound ? matchSteps.map((s) => wordOf(s.id)).filter((w): w is Word => !!w) : [];
  const answerBatch = (list: { id: string; quality: number }[]) => {
    const q = new Map(list.map((r) => [r.id, r.quality]));
    for (const s of matchSteps) {
      const w = wordOf(s.id);
      if (w) grade(w, s.skill, q.get(s.id) ?? Grade.Again);
    }
    const inRound = new Set(matchSteps.map(keyOf));
    setQueue((qu) => [...qu.filter((s) => !inRound.has(keyOf(s))), ...matchSteps.filter((s) => (q.get(s.id) ?? 0) < 3)]);
    setStep((s) => s + 1);
  };

  /** Drop the current card without grading it. */
  const skip = () => {
    setQueue(([, ...rest]) => rest);
    setStep((s) => s + 1);
  };

  const missedSteps = (): Step[] => {
    const seen = new Set<string>();
    const out: Step[] = [];
    for (const [key, q] of results) {
      if (q >= 3 || seen.has(key)) continue;
      seen.add(key);
      const [id, skill] = key.split('|') as [string, Skill];
      const w = wordOf(id);
      if (w) out.push(auto ? cardFor(w, skill) : { id, skill, dir: SKILL_DIR[skill] });
    }
    return out;
  };

  const restartWith = (steps: Step[]) => {
    const shuffled = shuffle(steps);
    setPool(shuffled.map((s) => wordOf(s.id)!).filter(Boolean));
    setUpdateSchedule(false);
    setQueue(shuffled);
    setTotal(new Set(shuffled.map(keyOf)).size);
    setResults(new Map());
  };

  // Rendered on top of whatever is showing (the next card, or the summary after the last one).
  const leechPrompt = leech && <LeechPrompt wordId={leech.id} lapses={leech.lapses} skill={SKILL_LABEL[leech.skill]} onClose={() => setLeech(null)} />;

  if (!word) {
    const graded = [...results.values()];
    const firstTry = graded.filter((q) => q >= 3).length;
    const missedIds = new Set([...results].filter(([, q]) => q < 3).map(([k]) => k.split('|')[0]));
    const missed = [...missedIds].map(wordOf).filter((w): w is Word => !!w);
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
            <button className="btn" onClick={() => restartWith(missedSteps())}>
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
  const choicePool = learnedPool.length >= 4 ? learnedPool : allWords;

  let card;
  if (auto) {
    const ex = current.ex ?? 'choice';
    card =
      ex === 'listen' ? (
        <ListenChoice key={step} word={word} pool={choicePool} onAnswer={answer} />
      ) : ex === 'typing' ? (
        <Typing key={step} word={word} direction={current.dir} onAnswer={answer} />
      ) : ex === 'writing' ? (
        writingCard(`auto-${writingStyle}-${step}`, skip)
      ) : (
        <MultipleChoice key={step} word={word} allWords={choicePool} direction={current.dir} onAnswer={answer} />
      );
  } else if (current.skill === 'writing' || mode === 'writing') card = writingCard(`${writingStyle}-${step}`, skip);
  else if (mode === 'flashcards')
    card = <Flashcard key={step} word={word} direction={current.dir} graded={updateSchedule} state={skillState(word, current.skill)} onAnswer={answer} />;
  else if (matchRound) card = <MatchPairs key={step} words={batch} direction={current.dir} onDone={answerBatch} />;
  else if (mode === 'choice') card = <MultipleChoice key={step} word={word} allWords={allWords} direction={current.dir} onAnswer={answer} />;
  else if (mode === 'sentence') card = <SentenceCloze key={step} word={word} onAnswer={answer} onSkip={skip} />;
  else card = <Typing key={step} word={word} direction={current.dir} onAnswer={answer} />;

  return (
    <div className="session">
      <div className="session-bar">
        <button className="icon-btn" onClick={onExit} aria-label="End session" title="End session">
          <Icon name="close" />
        </button>
        <div className="progress" aria-label={`${done} of ${total} done`}>
          <div className="progress-fill" style={{ width: `${(done / total) * 100}%` }} />
        </div>
        <span className="muted small">
          {done}/{total}
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
        {title} · {SKILL_LABEL[current.skill].toLowerCase()}
        {results.has(keyOf(current)) && ' · retry'}
      </div>
      {card}
    </div>
  );
}
