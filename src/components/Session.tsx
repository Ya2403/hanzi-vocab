import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../store';
import { cardsFor, DELAYED_RECALL, practiceCard, retryOf, spreadSteps, testedSkills, type SessionMode, type Step } from '../lib/planner';
import { activeSkills, Grade, isLearned, recordAnswer, reviewWithLeech, SKILL_LABEL, skillState, withSkill } from '../lib/srs';
import { skillStrength } from '../lib/planner';
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
import { mixTypes, RUSTY_RETRIEVABILITY } from '../lib/planner';
import { entryKind, isWordEntry, recordWordAnswer, recordWordLookup } from '../lib/entries';
import { NO_HINTS_SHARE } from '../lib/hints';
import { HintProvider, NoHintsLabel } from './Hints';
import { targetChar } from '../lib/wordPractice';
import { ContextCardView, type ContextResult } from './ContextCards';
import { HanziText } from './HanziText';
import { ChatChoice, WhichChar } from './ChoiceCards';
import { BuildWord } from './TileCards';
import { Dictation } from './TypedCards';
import { loadHanziDict } from '../lib/hanziDict';

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
  /** Test this skill on every word. */
  skill?: Skill;
  /** Words standing in for a character: word id → the character (id) whose skill they review. */
  targets?: Map<string, string>;
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

/** The exercise type of a card (for mixing types). */
const exerciseType = (s: Item): string =>
  isContext(s) ? `context:${s.card.ex}` : s.card.kind === 'single' ? `${s.card.ex}:${s.card.dir}` : s.card.kind;

/** Words per Match-pairs round. */
const MATCH_BATCH = 5;

/**
 * A practice session: one card per word. Every answer counts toward accuracy; the first answer
 * to each skill in the session also updates its FSRS card. A missed card comes back once, later,
 * as an easier card (so a word appears at most twice). The end shows a short summary.
 */
export function Session({ title, words: initialWords, mode, direction, skillFor, skill, targets, onExit, onFinish, onAnotherRound }: Props) {
  const { words: allWords, sentences, dialogues, links, charLinks, updateWord, updateWords, recordReview, completeSession } = useStore();
  const { writingStyle, leechThreshold, showPinyin, choiceStyle, useSentences, tapHints } = useSettings();
  const lineOf = useMemo(() => dialoguePositions(dialogues, sentences), [dialogues, sentences]);

  // Look-alike distractors need the character data: load it early (it's cached offline).
  useEffect(() => {
    loadHanziDict().catch(() => {});
  }, []);

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
  /** A word reviews a character's skill: given, or its weakest learned character. */
  const targetOf = (w: Word): string | undefined => targets?.get(w.id) ?? (isWordEntry(w) ? targetChar(w, charLinks)?.id : undefined);
  /** A word card's exercise follows its target character's strength (words have no schedule). */
  const planned = (w: Word, target: string | undefined): Word => {
    const t = target && allWords.find((x) => x.id === target);
    return t ? { ...w, skills: t.skills, learnedOn: t.learnedOn } : w;
  };
  const cardOf = (w: Word, k?: Skill, opts = planOpts): Step => {
    const target = targetOf(w);
    // Names: meaning only.
    if (entryKind(w) === 'name') return { id: w.id, card: { kind: 'single', skill: 'meaning', ex: 'choice', dir: 'zh-en' }, scheduled: ['meaning'], target };
    const base = skill ? { ...cardsFor(planned(w, target), [skill], opts)[0], scheduled: [skill] } : practiceCard(planned(w, target), direction, { ...opts, skill: k });
    // A word's easy recall card: Which character? half of the time (the target character blanked).
    if (target && base.card.kind === 'single' && base.card.ex === 'translate' && Math.random() < 0.5)
      return { ...base, id: w.id, target, card: { ...base.card, ex: 'whichChar' } };
    return { ...base, id: w.id, target };
  };
  const [queue, setQueue] = useState<Item[]>(() => {
    const steps = spreadSteps(initialWords.map((w): Step => cardOf(w, skillFor?.get(w.id))));
    // Automatic mode: some word reviews happen in a sentence that contains the word.
    if (mode !== 'auto' || skill) return steps;
    // A word's exercise follows its target character's strength (see planned).
    const plannedById = new Map(initialWords.map((w) => [w.id, planned(w, targetOf(w))]));
    // Automatic mode: never the same exercise type more than twice in a row.
    return mixTypes(withContext(steps, plannedById, { links, lineOf: (id) => lineOf.get(id) }, { use: useSentences, listening: planOpts.listening }), exerciseType);
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
   * Save one card's answers. A character: see gradeChar. A word: see gradeWord. Returns the
   * first answers (entry|skill → grade) recorded for this session's summary.
   */
  const gradeCard = (w: Word, s: Item, grades: Grades, toneError = false, fresh = results, wrongChars?: string[]) =>
    isWordEntry(w) ? gradeWord(w, s, grades, fresh, wrongChars) : gradeChar(w, s, grades, toneError, fresh);

  /**
   * A word card counts for its characters. Right: a Good review for the target character's
   * tested skill, accuracy only for the other characters. Wrong: a miss for the character that was
   * wrong (the typed one, when known; otherwise the target), and "needs work" for the word. The
   * word's own statistics record the answer either way.
   */
  const gradeWord = (w: Word, s: Item, grades: Grades, fresh: Map<string, number>, wrongChars?: string[]) => {
    recordReview().catch(() => {});
    const now = Date.now();
    const list = Object.entries(grades) as [Skill, number][];
    const ok = list.every(([, q]) => q >= 3);
    const firsts = new Map<string, number>();
    for (const [k, q] of list) if (!fresh.has(skillKey(w.id, k))) firsts.set(skillKey(w.id, k), q);
    const updates: Word[] = [recordWordAnswer(w, ok, now)];
    const target = s.target ? wordOf(s.target) : undefined;
    const culprits = new Set(wrongChars ?? []);
    let becameLeech: { id: string; lapses: number; skill: Skill } | null = null;
    for (const slot of charLinks.charsOf.get(w.id) ?? []) {
      const c = slot.entry && wordOf(slot.entry.id);
      if (!c || !isLearned(c)) continue;
      const isTarget = c.id === target?.id;
      const charOk = ok || (wrongChars ? !culprits.has(slot.char) : !isTarget);
      const active = activeSkills(c);
      const skills: Skills = { ...c.skills };
      for (const [k, q] of list) {
        if (!active.includes(k)) continue;
        let st = skillState(c, k);
        const key = skillKey(c.id, k);
        if (isTarget && s.scheduled.includes(k) && !s.delayed && !fresh.has(key)) {
          const qc = ok ? q : charOk ? Grade.Good : Grade.Again;
          firsts.set(key, qc);
          const r = reviewWithLeech(st, qc, leechThreshold, now);
          st = r.srs;
          if (r.becameLeech) becameLeech = { id: c.id, lapses: st.lapses, skill: k };
        }
        skills[k] = recordAnswer(st, charOk, now);
      }
      updates.push({ ...c, skills });
    }
    if (firsts.size) setResults((r) => new Map([...r, ...firsts]));
    updateWords(updates).catch((e) => console.error('Failed to save answer', e));
    if (becameLeech) setLeech(becameLeech);
    return firsts;
  };

  /**
   * A character card, in a single write: the first answer to each tested skill this session
   * updates its FSRS card (and can flag a leech); every answer records accuracy. Skills the
   * character isn't reviewed on (e.g. hidden writing) aren't touched.
   */
  const gradeChar = (w: Word, s: Item, grades: Grades, toneError: boolean, fresh: Map<string, number>) => {
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
      return retryOf(cardOf(w, s.card.skill, { ...planOpts, mode: 'auto' }));
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
      const firsts = gradeCard(w, { id, card: current.card, scheduled: ['meaning'], target: targetOf(w) }, { meaning: q }, false, seen);
      seen = new Map([...seen, ...firsts]);
    }
    if (r.others?.size) {
      const now = Date.now();
      const updated = [...r.others].flatMap(([id, ok]) => {
        const w = wordOf(id);
        if (!w || !isLearned(w)) return [];
        if (isWordEntry(w)) return [recordWordAnswer(w, ok, now)];
        let st = skillState(w, 'recall');
        if (!ok && retrievability(st, now) < RUSTY_RETRIEVABILITY) st = reviewWithLeech(st, Grade.Again, leechThreshold, now).srs;
        return [{ ...w, skills: { ...w.skills, recall: recordAnswer(st, ok, now) } }];
      });
      if (updated.length) updateWords(updated).catch((e) => console.error('Failed to save answer', e));
    }
    setAnsweredCards((n) => n + 1);
    // The target and any highlighted word that was missed come back once as a word card.
    const missedAlso = [...(r.also ?? [])]
      .filter(([id, q]) => q < 3 && wordOf(id))
      .map(([id]): ContextStep => ({ id, card: { ...current.card, skill: 'meaning' }, scheduled: ['meaning'], target: targetOf(wordOf(id)!) }));
    const retry = requeue([...(r.q < 3 ? [current] : []), ...missedAlso]);
    if (retry.length) setTotal((t) => t + retry.length);
    setQueue(([, ...rest]) => [...rest, ...retry]);
    setStep((x) => x + 1);
  };

  const answer = (grades: Grades, toneError = false, wrongChars?: string[]) => {
    if (!current || !word) return;
    gradeCard(word, current, grades, toneError, results, wrongChars);
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
  /** A card that tests one skill (typing can tell which characters were wrong). */
  const answerOne = (k: Skill) => (q: number, wrongChars?: string[]) => answer({ [k]: q }, false, wrongChars);

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

  /** "Can't listen now": skip this card ungraded and swap any other listening cards (listening, dictation) for multiple choice. */
  const cantListen = () => {
    startQuiet();
    const quietCard = (s: Item): Item => {
      if (s.card.kind === 'single' && (s.card.ex === 'listen' || s.card.ex === 'dictation')) return { ...s, card: { ...s.card, ex: 'choice' as const } };
      if (isContext(s) && s.card.ex === 'dictation') {
        const w = wordOf(s.id);
        return w ? cardOf(w, 'pinyin', { ...planOpts, listening: false }) : s;
      }
      return s;
    };
    setQueue(([, ...rest]) => rest.map(quietCard));
    setTotal((t) => t - 1);
    setStep((s) => s + 1);
  };

  /** Drop the current card without grading it. */
  const skip = () => {
    setQueue(([, ...rest]) => rest);
    setStep((s) => s + 1);
  };

  // Hints: items tapped for a hint this session (a lookup each), and "Practise these" from the summary.
  const [lookedUp, setLookedUp] = useState<Map<string, Word>>(new Map());
  const [practice, setPractice] = useState<Word[] | null>(null);
  /** A learned item tapped for a hint: a character's meaning is graded Again; a word gets a miss and "needs work". */
  const lookup = (item: Word) => {
    const w = wordOf(item.id) ?? item;
    const next = isWordEntry(w) ? recordWordLookup(w) : withSkill(w, 'meaning', recordAnswer(reviewWithLeech(skillState(w, 'meaning'), Grade.Again, leechThreshold).srs, false));
    updateWord(next).catch((e) => console.error('Failed to save lookup', e));
    setLookedUp((m) => new Map(m).set(w.id, w));
  };
  // For items with strong recall, about 1 exercise in 4 has no hints at all.
  const noHints = useMemo(() => {
    if (!current || !word) return false;
    const item = current.target ? wordOf(current.target) : isWordEntry(word) ? undefined : word;
    if (!item?.skills.recall) return false;
    return skillStrength(skillState(item, 'recall'), item.learnedOn) === 'strong' && Math.random() < NO_HINTS_SHARE;
  }, [step, current?.id]);
  const hintsOn = tapHints && !noHints;

  if (practice) return <Session title="Looked-up words" words={practice} mode="auto" direction="mixed" onExit={() => setPractice(null)} />;

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
                  <span className="hanzi" lang="zh-CN"><HanziText text={w.hanzi} /></span>
                  {pinyin.answer && <span className="pinyin">{w.pinyin}</span>}
                  <span className="meaning">{w.meaning}</span>
                </li>
              ))}
            </ul>
          </>
        )}
        {lookedUp.size > 0 && (
          <>
            <h3>Words you looked up</h3>
            <ul className="missed">
              {[...lookedUp.values()].map((w) => (
                <li key={w.id}>
                  <span className="hanzi" lang="zh-CN">
                    <HanziText text={w.hanzi} />
                  </span>
                  {pinyin.answer && <span className="pinyin">{w.pinyin}</span>}
                  <span className="meaning">{w.meaning}</span>
                </li>
              ))}
            </ul>
            <button className="btn" onClick={() => setPractice([...lookedUp.values()].map((w) => wordOf(w.id) ?? w))}>
              Practise these
            </button>
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
        {tapHints && noHints && (
          <>
            {' '}
            <NoHintsLabel />
          </>
        )}
      </div>
    </>
  );

  const choicePool = learnedPool.length >= 4 ? learnedPool : allWords;
  if (isContext(current)) {
    const sentence = sentences.find((x) => x.id === current.card.sentenceId);
    const pos = lineOf.get(current.card.sentenceId);
    const prevLine = pos && pos.index > 0 ? pos.lines[pos.index - 1] : undefined;
    const speakerOf = (id: string) => dialogues.flatMap((d) => d.lines).find((l) => l.sentenceId === id)?.speaker;
    const ex = {
      cloze: 'fill the blank',
      reply: 'reply',
      chat: 'complete the chat',
      build: 'build in Chinese',
      complete: 'complete the sentence',
      type: 'type the sentence',
      dictation: 'dictation',
    }[current.card.ex];
    const dialogue = dialogues.find((d) => d.lines.some((l) => l.sentenceId === current.card.sentenceId));
    const contextCard = sentence && (
      <ContextCardView
        key={step}
        card={current.card.ex === 'chat' ? { ...current.card, ex: 'cloze', part: 'choice' } : current.card}
        word={word}
        sentence={sentence}
        prev={prevLine && pos ? { sentence: prevLine, speaker: speakerOf(prevLine.id), lines: pos.lines } : undefined}
        onAnswer={answerContext}
        onCantListen={cantListen}
      />
    );
    return (
      <div className="session">
        {sessionBar(`${SKILL_LABEL[current.card.skill].toLowerCase()} · ${ex}`)}
        <HintProvider key={step} enabled={hintsOn} onLookup={lookup}>
        {sentence && current.card.ex === 'chat' && dialogue && pos ? (
          <ChatChoice key={step} dialogue={dialogue} lines={pos.lines} index={pos.index} onAnswer={(q) => answerContext({ q })} fallback={contextCard} />
        ) : sentence ? (
          contextCard
        ) : (
          <button className="btn" onClick={skip}>
            Skip (sentence not found)
          </button>
        )}
        </HintProvider>
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
    card = <TwoStepCard key={step} word={word} pool={choicePool} onDone={(r) => answer({ meaning: r.meaning, pinyin: r.pinyin }, r.toneError)} />;
  } else if (c.kind === 'flash') card = <Flashcard key={step} word={word} direction={c.dir} skills={c.skills} onAnswer={answer} />;
  else if (c.ex === 'writing') card = writingCard(answerOne(c.skill));
  else if (c.ex === 'listen') card = <ListenChoice key={step} word={word} pool={choicePool} onAnswer={answerOne('pinyin')} onCantListen={cantListen} />;
  else if (c.ex === 'typing') card = <Typing key={step} word={word} onAnswer={answerOne(c.skill)} />;
  else if (c.ex === 'whichChar')
    card = <WhichChar key={step} word={word} target={current.target ? wordOf(current.target)?.hanzi : undefined} onAnswer={answerOne(c.skill)} onSkip={skip} />;
  else if (c.ex === 'build') card = <BuildWord key={step} word={word} onAnswer={answerOne(c.skill)} />;
  else if (c.ex === 'dictation') card = <Dictation key={step} word={word} onAnswer={answerOne(c.skill)} onCantListen={cantListen} />;
  else if (c.ex === 'translate') card = <MultipleChoice key={step} word={word} allWords={choicePool} direction="en-zh" variant="translate" onAnswer={answerOne(c.skill)} />;
  else card = <MultipleChoice key={step} word={word} allWords={choicePool} direction={c.dir} onAnswer={answerOne(c.skill)} />;

  const exLabel = c.kind !== 'single' ? '' : ({ whichChar: ' · which character', translate: ' · translation', build: ' · build in Chinese', dictation: ' · dictation', typing: ' · typing' } as Record<string, string>)[c.ex] ?? '';
  const label = matchRound ? 'match pairs' : testedSkills(c).map((k) => SKILL_LABEL[k].toLowerCase()).join(' + ') + exLabel;

  return (
    <div className="session">
      {sessionBar(label)}
      <HintProvider key={step} enabled={hintsOn} onLookup={lookup}>
        {card}
      </HintProvider>
    </div>
  );
}
