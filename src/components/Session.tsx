import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../store';
import { cardsFor, DELAYED_RECALL, practiceCard, retryOf, spreadSteps, testedSkills, type SessionMode, type Step } from '../lib/planner';
import { activeSkills, Grade, isLearned, recordAnswer, reviewWithLeech, SKILL_LABEL, skillState } from '../lib/srs';
import type { Direction, Skill, Skills, Word } from '../lib/types';
import { Flashcard } from './Flashcard';
import { MultipleChoice } from './MultipleChoice';
import { WritingFlow } from './WritingFlow';
import { updateSettings, usePinyinVisibility, useSettings } from '../lib/settings';
import { LeechPrompt } from './LeechPrompt';
import { Typing } from './Typing';
import { MatchPairs } from './MatchPairs';
import { ListenChoice, listeningAvailable } from './LearnCards';
import { TwoStepCard } from './TwoStepCard';
import { Icon } from './Icon';
import { QuietBadge } from './QuietBadge';
import { endQuietSession, isQuiet, startQuiet } from '../lib/quiet';
import { dialoguePositions, withContext, type ContextStep } from '../lib/contextReview';
import { retrievability } from '../lib/fsrs';
import { RUSTY_RETRIEVABILITY } from '../lib/planner';
import { ContextCardView, type ContextResult } from './ContextCards';

export type { SessionMode } from '../lib/planner';

interface Props {
  title: string;
  /** One card per word, in this order. */
  words: Word[];
  mode: SessionMode;
  /** Manual mode: which way cards go. */
  direction: Direction;
  /** Automatic mode: the skill to test per word (its highest-priority one), else picked here. */
  skillFor?: Map<string, Skill>;
  /** Test this skill on every word (e.g. pinyin for "Tones to practice"). */
  skill?: Skill;
  /** Leave early (✕). */
  onExit(): void;
  /** "Done" at the end; defaults to onExit. */
  onFinish?(): void;
  /** "Another round" at the end (a new session). */
  onAnotherRound?(): void;
}

type Grades = Partial<Record<Skill, number>>;
type Item = Step | ContextStep;
const isContext = (s: Item | undefined): s is ContextStep => s?.card.kind === 'context';

const skillKey = (id: string, k: Skill) => `${id}|${k}`;

/** Words per Match-pairs round. */
const MATCH_BATCH = 5;

/**
 * A practice session: one card per word. Every answer counts toward accuracy; the first answer
 * to each skill in the session also updates its FSRS card. A missed card comes back once, later,
 * as an easier card (so a word appears at most twice). The end shows a short summary.
 */
export function Session({ title, words: initialWords, mode, direction, skillFor, skill, onExit, onFinish, onAnotherRound }: Props) {
  const { words: allWords, sentences, dialogues, links, updateWord, updateWords, recordReview, completeSession } = useStore();
  const { writingStyle, leechThreshold, showPinyin, choiceStyle, useSentences } = useSettings();
  const lineOf = useMemo(() => dialoguePositions(dialogues, sentences), [dialogues, sentences]);

  // Full-screen practice: the app header is hidden while a session is open (see .in-session in CSS).
  useEffect(() => {
    document.body.classList.add('in-session');
    return () => {
      document.body.classList.remove('in-session');
      endQuietSession(); // "Can't listen now" lasts the rest of this session (and at least 15 minutes)
    };
  }, []);
  const pinyin = usePinyinVisibility();
  const planOpts = { mode, listening: listeningAvailable && !isQuiet(), choiceStyle };

  const [leech, setLeech] = useState<{ id: string; lapses: number; skill: Skill } | null>(null);
  const [queue, setQueue] = useState<Item[]>(() => {
    const steps = spreadSteps(
      initialWords.map((w): Step =>
        skill === 'pinyin'
          ? // Tone practice: type the pinyin, so the tones are really checked.
            { id: w.id, card: { kind: 'single', skill, ex: 'typing', dir: 'zh-py' }, scheduled: [skill] }
          : skill
            ? { ...cardsFor(w, [skill], planOpts)[0], scheduled: [skill] }
            : practiceCard(w, direction, { ...planOpts, skill: skillFor?.get(w.id) }),
      ),
    );
    // Automatic mode: some word reviews happen in a sentence that contains the word.
    if (mode !== 'auto' || skill) return steps;
    return withContext(steps, new Map(initialWords.map((w) => [w.id, w])), { links, lineOf: (id) => lineOf.get(id) }, { use: useSentences });
  });
  const [total, setTotal] = useState(() => queue.length);
  /** First answer per word|skill this session. */
  const [results, setResults] = useState<Map<string, number>>(new Map());
  /** Words already given their one retry. */
  const [retried, setRetried] = useState<Set<string>>(new Set());
  const [answeredCards, setAnsweredCards] = useState(0);
  const [step, setStep] = useState(0);

  const byId = useMemo(() => new Map(initialWords.map((w) => [w.id, w])), [initialWords]);
  const liveById = useMemo(() => new Map(allWords.map((w) => [w.id, w])), [allWords]);
  const learnedPool = useMemo(() => allWords.filter(isLearned), [allWords]);
  const current = queue[0];
  // Prefer the stored version, so edits made mid-session (e.g. a note from the leech prompt) show up.
  const wordOf = (id: string) => liveById.get(id) ?? byId.get(id);
  const word = current && wordOf(current.id);
  const done = total - queue.length;

  // A finished session counts for the streak (once).
  const counted = useRef(false);
  useEffect(() => {
    if (!current && answeredCards > 0 && !counted.current) {
      counted.current = true;
      completeSession().catch(() => {});
    }
  }, [current, answeredCards]);

  /**
   * Save one card's answers in a single write: the first answer to each tested skill this
   * session updates its FSRS card (and can flag a leech); every answer records accuracy.
   * Skills the word isn't reviewed on (e.g. hidden writing) aren't touched.
   */
  const gradeCard = (w: Word, s: Item, grades: Grades, toneError = false, fresh = results) => {
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
        if (s.scheduled.includes(k) && !s.delayed) {
          const r = reviewWithLeech(st, q, leechThreshold);
          st = r.srs;
          if (r.becameLeech) becameLeech = { lapses: st.lapses, skill: k };
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

  /** A missed word comes back once, later, as an easier card. */
  const requeue = (missed: Item[]) => {
    const again = missed.filter((s) => !retried.has(s.id));
    if (again.length) setRetried((r) => new Set([...r, ...again.map((s) => s.id)]));
    // A missed sentence card comes back as the easy word card for the same skill.
    return again.map((s): Step => {
      if (!isContext(s)) return retryOf(s);
      const w = wordOf(s.id)!;
      return retryOf(practiceCard(w, direction, { ...planOpts, mode: 'auto', skill: s.card.skill }));
    });
  };

  /**
   * A sentence card: the target word's skill (and words also highlighted) are graded like a
   * word card. The other learned words of a reply record accuracy on recall; a wrong one that
   * is also rusty gets an Again.
   */
  const answerContext = (r: ContextResult) => {
    if (!current || !word || !isContext(current)) return;
    gradeCard(word, current, { [current.card.skill]: r.q });
    let seen = results;
    for (const [id, q] of r.also ?? []) {
      const w = wordOf(id);
      if (!w) continue;
      const firsts = gradeCard(w, { id, card: current.card, scheduled: ['meaning'] }, { meaning: q }, false, seen);
      seen = new Map([...seen, ...firsts]);
    }
    if (r.others?.size) {
      const now = Date.now();
      const updated = [...r.others].flatMap(([id, ok]) => {
        const w = wordOf(id);
        if (!w || !isLearned(w)) return [];
        let st = skillState(w, 'recall');
        if (!ok && retrievability(st, now) < RUSTY_RETRIEVABILITY) st = reviewWithLeech(st, Grade.Again, leechThreshold, now).srs;
        return [{ ...w, skills: { ...w.skills, recall: recordAnswer(st, ok, now) } }];
      });
      if (updated.length) updateWords(updated).catch((e) => console.error('Failed to save answer', e));
    }
    setAnsweredCards((n) => n + 1);
    // The target and any highlighted word that was missed come back once as a word card.
    const missedAlso = [...(r.also ?? [])].filter(([id, q]) => q < 3 && wordOf(id)).map(([id]): ContextStep => ({ id, card: { ...current.card, skill: 'meaning' }, scheduled: ['meaning'] }));
    const retry = requeue([...(r.q < 3 ? [current] : []), ...missedAlso]);
    if (retry.length) setTotal((t) => t + retry.length);
    setQueue(([, ...rest]) => [...rest, ...retry]);
    setStep((x) => x + 1);
  };

  const answer = (grades: Grades, toneError = false) => {
    if (!current || !word) return;
    gradeCard(word, current, grades, toneError);
    setAnsweredCards((n) => n + 1);
    const c = current.card;
    if (c.kind === 'single' && c.ex === 'writing') {
      // Writing doesn't repeat right away: it comes back once, blank, 3–5 cards later
      // (if the session still has that many cards).
      setQueue(([head, ...rest]) => {
        if (head.delayed || rest.length < DELAYED_RECALL.min) return rest;
        const at = Math.min(rest.length, DELAYED_RECALL.min + Math.floor(Math.random() * (DELAYED_RECALL.max - DELAYED_RECALL.min + 1)));
        return [...rest.slice(0, at), { ...(head as Step), delayed: true, scheduled: [] }, ...rest.slice(at)];
      });
      setStep((s) => s + 1);
      return;
    }
    const missed = Object.values(grades).some((q) => q! < 3);
    const retry = missed ? requeue([current]) : [];
    if (retry.length) setTotal((t) => t + 1);
    setQueue(([, ...rest]) => [...rest, ...retry]);
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
      .filter((s): s is Step => !isContext(s))
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
    setAnsweredCards((n) => n + matchSteps.length);
    const inRound = new Set<Item>(matchSteps);
    const retry = requeue(matchSteps.filter((s) => (q.get(s.id) ?? 0) < 3));
    if (retry.length) setTotal((t) => t + retry.length);
    setQueue((qu) => [...qu.filter((s) => !inRound.has(s)), ...retry]);
    setStep((s) => s + 1);
  };

  /** "Can't listen now": skip this card ungraded and swap any other listening cards for multiple choice. */
  const cantListen = () => {
    startQuiet();
    setQueue(([, ...rest]) => rest.map((s): Item => (s.card.kind === 'single' && s.card.ex === 'listen' ? { ...s, card: { ...s.card, ex: 'choice' as const } } : s)));
    setTotal((t) => t - 1);
    setStep((s) => s + 1);
  };

  /** Drop the current card without grading it. */
  const skip = () => {
    setQueue(([, ...rest]) => rest);
    setStep((s) => s + 1);
  };

  // Rendered on top of whatever is showing (the next card, or the summary after the last one).
  const leechPrompt = leech && <LeechPrompt wordId={leech.id} lapses={leech.lapses} skill={SKILL_LABEL[leech.skill]} onClose={() => setLeech(null)} />;

  if (!current || !word) {
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
          {answeredCards} exercise{answeredCards === 1 ? '' : 's'} · {pct}% right on the first try
        </p>
        {missed.length > 0 && (
          <>
            <h3>Needs attention</h3>
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
          {onAnotherRound && (
            <button className="btn" onClick={onAnotherRound}>
              Another round
            </button>
          )}
          <button className="btn primary" onClick={onFinish ?? onExit} autoFocus>
            Done
          </button>
        </div>
        {leechPrompt}
      </div>
    );
  }

  const sessionBar = (label: string) => (
    <>
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
        <QuietBadge />
      </div>
      {leechPrompt}
      <div className="session-title muted small">
        {title} · {label}
        {current.delayed && ' · recall'}
        {retried.has(current.id) && results.has(skillKey(current.id, isContext(current) ? current.card.skill : testedSkills(current.card)[0])) && ' · again'}
      </div>
    </>
  );

  const choicePool = learnedPool.length >= 4 ? learnedPool : allWords;
  if (isContext(current)) {
    const sentence = sentences.find((x) => x.id === current.card.sentenceId);
    const pos = lineOf.get(current.card.sentenceId);
    const prevLine = pos && pos.index > 0 ? pos.lines[pos.index - 1] : undefined;
    const speakerOf = (id: string) => dialogues.flatMap((d) => d.lines).find((l) => l.sentenceId === id)?.speaker;
    const ex = current.card.ex === 'cloze' ? 'fill the blank' : current.card.ex === 'reply' ? 'reply' : 'read and check';
    return (
      <div className="session">
        {sessionBar(`${SKILL_LABEL[current.card.skill].toLowerCase()} · ${ex}`)}
        {sentence ? (
          <ContextCardView
            key={step}
            card={current.card}
            word={word}
            sentence={sentence}
            prev={prevLine && pos ? { sentence: prevLine, speaker: speakerOf(prevLine.id), lines: pos.lines } : undefined}
            onAnswer={answerContext}
          />
        ) : (
          <button className="btn" onClick={skip}>
            Skip (sentence not found)
          </button>
        )}
      </div>
    );
  }
  const c = current.card;
  const writingCard = (onAnswer: (q: number) => void) => (
    <WritingFlow key={`${writingStyle}-${step}`} word={word} onAnswer={onAnswer} onSkip={skip} blankOnly={current.delayed} />
  );

  let card;
  if (matchRound) {
    const batch = matchSteps.map((s) => wordOf(s.id)).filter((w): w is Word => !!w);
    card = <MatchPairs key={step} words={batch} direction={c.kind === 'single' ? c.dir : 'zh-en'} onDone={answerBatch} />;
  } else if (c.kind === 'pair') {
    card = <TwoStepCard key={step} word={word} pool={choicePool} pinyinEx={c.p} onDone={(r) => answer({ meaning: r.meaning, pinyin: r.pinyin }, r.toneError)} />;
  } else if (c.kind === 'flash') card = <Flashcard key={step} word={word} direction={c.dir} skills={c.skills} onAnswer={answer} />;
  else if (c.ex === 'writing') card = writingCard(answerOne(c.skill));
  else if (c.ex === 'listen') card = <ListenChoice key={step} word={word} pool={choicePool} onAnswer={answerOne('pinyin')} onCantListen={cantListen} />;
  else if (c.ex === 'typing') card = <Typing key={step} word={word} direction={c.dir} onAnswer={answerOne(c.skill)} />;
  else card = <MultipleChoice key={step} word={word} allWords={choicePool} direction={c.dir} onAnswer={answerOne(c.skill)} />;

  const label = matchRound ? 'match pairs' : testedSkills(c).map((k) => SKILL_LABEL[k].toLowerCase()).join(' + ');

  return (
    <div className="session">
      {sessionBar(label)}
      {card}
    </div>
  );
}
