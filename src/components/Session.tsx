import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../store';
import { cardsFor, orderSteps, practiceCard, retryOf, reviewCards, testedSkills, type SessionMode, type Step } from '../lib/planner';
import { activeSkills, Grade, isLearned, practiceMiss, recordAnswer, reviewWithLeech, SKILL_LABEL, skillState } from '../lib/srs';
import { shuffle } from '../lib/words';
import type { Direction, Skill, Skills, Word } from '../lib/types';
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
import { TwoStepCard } from './TwoStepCard';
import { Icon } from './Icon';

export type { SessionMode } from '../lib/planner';

interface Props {
  title: string;
  words: Word[];
  mode: SessionMode;
  /** Practice only: which way cards go in manual mode (Review follows each due skill). */
  direction: Direction;
  /** Review: cards for the due skills, answers update their SM-2 schedules. Practice: one card per word, only misses change the schedule. */
  updateSchedule: boolean;
  /** Leave early (✕). */
  onExit(): void;
  /** The summary's main button; defaults to onExit. Used to chain Review → Learn → Done. */
  onFinish?(): void;
  finishLabel?: string;
  /** Practice: test this skill on every word (e.g. pinyin for "Tones to practice"). */
  skill?: Skill;
}

type Grades = Partial<Record<Skill, number>>;

const skillKey = (id: string, k: Skill) => `${id}|${k}`;
const stepKey = (s: Step) => `${s.id}|${s.card.kind}|${testedSkills(s.card).join(',')}`;

/** Words per Match-pairs round. */
const MATCH_BATCH = 5;

/**
 * Runs through a set of cards. Each card tests one or more skills of a word; only the first
 * answer to a skill in a session changes its schedule, and only for the card's scheduled
 * skills (Review: the due ones). Cards with a miss go to the back of the queue as an easier
 * card until they're right. Every answer counts toward the skill's accuracy.
 */
export function Session({ title, words: initialWords, mode, direction, updateSchedule: initialUpdate, onExit, onFinish, finishLabel, skill }: Props) {
  const { words: allWords, updateWord, recordReview } = useStore();
  const { writingStyle, leechThreshold, showPinyin, choiceStyle } = useSettings();

  // Full-screen practice: the app header is hidden while a session is open (see .in-session in CSS).
  useEffect(() => {
    document.body.classList.add('in-session');
    return () => document.body.classList.remove('in-session');
  }, []);
  const pinyin = usePinyinVisibility();
  const planOpts = { mode, listening: listeningAvailable, choiceStyle };

  const [leech, setLeech] = useState<{ id: string; lapses: number; skill: Skill } | null>(null);
  const [pool, setPool] = useState(initialWords);
  const [updateSchedule, setUpdateSchedule] = useState(initialUpdate);
  const [queue, setQueue] = useState<Step[]>(() =>
    initialUpdate
      ? orderSteps(reviewCards(initialWords, planOpts), new Map(initialWords.map((w) => [w.id, w])))
      : initialWords.map((w) =>
          skill === 'pinyin'
            ? // Tone practice: type the pinyin, so the tones are really checked.
              { id: w.id, card: { kind: 'single', skill, ex: 'typing', dir: 'zh-py' }, scheduled: [skill] }
            : skill
            ? { ...cardsFor(w, [skill], planOpts)[0], scheduled: [skill] }
            : practiceCard(w, direction, planOpts),
        ),
  );
  const [total, setTotal] = useState(() => queue.length);
  /** First answer per word|skill this session. */
  const [results, setResults] = useState<Map<string, number>>(new Map());
  const [retried, setRetried] = useState<Set<string>>(new Set());
  const [step, setStep] = useState(0);

  const byId = useMemo(() => new Map(pool.map((w) => [w.id, w])), [pool]);
  const liveById = useMemo(() => new Map(allWords.map((w) => [w.id, w])), [allWords]);
  const learnedPool = useMemo(() => allWords.filter(isLearned), [allWords]);
  const current = queue[0];
  // Prefer the stored version, so edits made mid-session (e.g. a note from the leech prompt) show up.
  const wordOf = (id: string) => liveById.get(id) ?? byId.get(id);
  const word = current && wordOf(current.id);
  // A missed card is replaced by its retry, so every queued card is one still to get right.
  const done = total - queue.length;

  /**
   * Save one card's answers in a single write. Scheduled skills change their schedule on
   * their first answer this session (Review: SM-2; Practice: a miss brings the review
   * forward); every tested skill records accuracy. Skills the word isn't reviewed on (e.g.
   * writing while it's off) only count for the streak.
   */
  const gradeCard = (w: Word, s: Step, grades: Grades, toneError = false, fresh = results) => {
    recordReview().catch(() => {});
    const active = activeSkills(w);
    const skills: Skills = { ...w.skills };
    const firsts = new Map<string, number>();
    let becameLeech: { lapses: number; skill: Skill } | null = null;
    for (const [k, q] of Object.entries(grades) as [Skill, number][]) {
      if (!active.includes(k)) continue;
      const key = skillKey(w.id, k);
      let st = skillState(w, k);
      if (!fresh.has(key)) {
        firsts.set(key, q);
        if (s.scheduled.includes(k)) {
          const r = updateSchedule ? reviewWithLeech(st, q, leechThreshold) : q < 3 ? practiceMiss(st, leechThreshold) : null;
          if (r) {
            st = r.srs;
            if (r.becameLeech) becameLeech = { lapses: st.lapses, skill: k };
          }
        }
      }
      skills[k] = recordAnswer(st, q >= 3);
    }
    if (firsts.size) setResults((r) => new Map([...r, ...firsts]));
    const toneErrors = (w.toneErrors ?? 0) + (toneError ? 1 : 0);
    updateWord({ ...w, skills, toneErrors: toneErrors || undefined }).catch((e) => console.error('Failed to save answer', e));
    if (becameLeech) setLeech({ id: w.id, ...becameLeech });
    return firsts;
  };

  const answer = (grades: Grades, toneError = false) => {
    if (!current || !word) return;
    gradeCard(word, current, grades, toneError);
    const missed = Object.values(grades).some((q) => q! < 3);
    if (missed) setRetried((r) => new Set(r).add(stepKey(retryOf(current))));
    setQueue(([head, ...rest]) => (missed ? [...rest, retryOf(head)] : rest));
    setStep((s) => s + 1);
  };
  /** A card that tests one skill. */
  const answerOne = (k: Skill) => (q: number, toneError?: boolean) => answer({ [k]: q }, toneError);

  // Match pairs: several single-skill cards of the same direction (different words) at once.
  const matchSteps = useMemo(() => {
    const c = current?.card;
    if (!(mode === 'choice' && choiceStyle === 'match' && c?.kind === 'single' && c.ex === 'choice')) return [];
    const seen = new Set<string>();
    return queue
      .filter((s) => s.card.kind === 'single' && s.card.ex === 'choice' && s.card.dir === c.dir && !seen.has(s.id) && seen.add(s.id))
      .slice(0, MATCH_BATCH);
  }, [mode, choiceStyle, current, queue]);
  const matchRound = matchSteps.length > 1;
  const answerBatch = (list: { id: string; quality: number }[]) => {
    const q = new Map(list.map((r) => [r.id, r.quality]));
    let seen = results;
    for (const s of matchSteps) {
      const w = wordOf(s.id);
      if (!w || s.card.kind !== 'single') continue;
      const firsts = gradeCard(w, s, { [s.card.skill]: q.get(s.id) ?? Grade.Again }, false, seen);
      seen = new Map([...seen, ...firsts]);
    }
    const inRound = new Set(matchSteps);
    setQueue((qu) => [...qu.filter((s) => !inRound.has(s)), ...matchSteps.filter((s) => (q.get(s.id) ?? 0) < 3)]);
    setStep((s) => s + 1);
  };

  /** Drop the current card without grading it. */
  const skip = () => {
    setQueue(([, ...rest]) => rest);
    setStep((s) => s + 1);
  };

  /** Practice missed: one card per word for the skills missed; accuracy only, no schedule changes. */
  const missedSteps = (): Step[] => {
    const bySkill = new Map<string, Skill[]>();
    for (const [key, q] of results) {
      if (q >= 3) continue;
      const [id, k] = key.split('|') as [string, Skill];
      bySkill.set(id, [...(bySkill.get(id) ?? []), k]);
    }
    return [...bySkill].flatMap(([id, skills]) => {
      const w = wordOf(id);
      return w ? cardsFor(w, skills, planOpts).map((s) => ({ ...s, scheduled: [] })) : [];
    });
  };

  const restartWith = (steps: Step[]) => {
    const shuffled = shuffle(steps);
    setPool([...new Set(shuffled.map((s) => s.id))].map((id) => wordOf(id)!).filter(Boolean));
    setUpdateSchedule(false);
    setQueue(shuffled);
    setTotal(shuffled.length);
    setResults(new Map());
    setRetried(new Set());
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
          {firstTry} of {graded.length} answers right on the first try
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

  const choicePool = learnedPool.length >= 4 ? learnedPool : allWords;
  const c = current.card;
  const writingCard = (onAnswer: (q: number) => void) =>
    writingStyle === 'free' ? (
      <FreeDraw key={`${writingStyle}-${step}`} word={word} onAnswer={onAnswer} onSkip={skip} />
    ) : (
      <Writing key={`${writingStyle}-${step}`} word={word} onAnswer={onAnswer} onSkip={skip} />
    );

  let card;
  if (matchRound) {
    const batch = matchSteps.map((s) => wordOf(s.id)).filter((w): w is Word => !!w);
    card = <MatchPairs key={step} words={batch} direction={c.kind === 'single' ? c.dir : 'zh-en'} onDone={answerBatch} />;
  } else if (c.kind === 'pair') {
    card = (
      <TwoStepCard
        key={step}
        word={word}
        pool={choicePool}
        meaningEx={c.m}
        pinyinEx={c.p}
        onDone={(r) => answer({ meaning: r.meaning, pinyin: r.pinyin }, r.toneError)}
      />
    );
  } else if (c.kind === 'flash') card = <Flashcard key={step} word={word} direction={c.dir} skills={c.skills} onAnswer={answer} />;
  else if (c.kind === 'cloze')
    card = <SentenceCloze key={step} word={word} onAnswer={(q) => answer({ meaning: q, recall: q })} onSkip={skip} />;
  else if (c.ex === 'writing') card = writingCard(answerOne(c.skill));
  else if (c.ex === 'listen') card = <ListenChoice key={step} word={word} pool={choicePool} onAnswer={answerOne('pinyin')} />;
  else if (c.ex === 'typing') card = <Typing key={step} word={word} direction={c.dir} onAnswer={answerOne(c.skill)} />;
  else card = <MultipleChoice key={step} word={word} allWords={choicePool} direction={c.dir} onAnswer={answerOne(c.skill)} />;

  const label = matchRound ? 'match pairs' : testedSkills(c).map((k) => SKILL_LABEL[k].toLowerCase()).join(' + ');

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
        {title} · {label}
        {retried.has(stepKey(current)) && ' · retry'}
      </div>
      {card}
    </div>
  );
}
