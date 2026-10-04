import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../store';
import { today } from '../lib/date';
import { buildTiles, isSentenceLearned, learnedSentenceSkills, responseOptions, translationOptions, type SkillStats } from '../lib/sentenceLearn';
import { autoSpeak } from '../lib/quiet';
import { newSrs, recordAnswer } from '../lib/srs';
import { shuffle } from '../lib/words';
import type { Sentence, SentenceSkill } from '../lib/types';
import { Icon } from './Icon';
import { BuildSentence, DialogueResponse, ReadThrough, SentenceReveal, TranslationChoice, type ReadLine } from './SentenceExercises';
import { SpeakButton } from './SpeakButton';

type Round = 'translate' | 'build' | 'response';
const ROUND_LABEL: Record<Round, string> = { translate: 'Translation', build: 'Build the sentence', response: 'What comes next?' };
const ROUND_SKILL: Record<Round, SentenceSkill> = { translate: 'understand', build: 'produce', response: 'understand' };

type Stage =
  | { kind: 'read' }
  | { kind: 'line'; i: number; asking: boolean }
  | { kind: 'round'; r: number; queue: number[] }
  | { kind: 'reread' }
  | { kind: 'done' };

/**
 * Learn a dialogue (or a group of loose sentences):
 * 1. read through the whole dialogue (dialogues only);
 * 2. line by line: see each line, then pick its translation out of 3;
 * 3. rounds on all of it, easy to hard: translation → build from tiles → what comes next (dialogues);
 *    misses come back later in the same round;
 * 4. read through again with translations hidden (dialogues only).
 * Then every sentence is learned: both skills first due tomorrow.
 */
export function LearnSentenceSession({
  title,
  lines,
  isDialogue,
  onExit,
  onFinish,
  finishLabel,
}: {
  title: string;
  /** In order; for a dialogue, all its lines (with speakers). */
  lines: ReadLine[];
  isDialogue: boolean;
  onExit(): void;
  onFinish?(): void;
  finishLabel?: string;
}) {
  const { sentences, words, updateSentences, recordReview } = useStore();
  const items = lines.map((l) => l.sentence);
  const rounds = useMemo<Round[]>(() => ['translate', 'build', ...(isDialogue && items.length > 2 ? (['response'] as Round[]) : [])], []);
  const [stage, setStage] = useState<Stage>(isDialogue ? { kind: 'read' } : { kind: 'line', i: 0, asking: false });
  const [step, setStep] = useState(0);
  const [misses, setMisses] = useState(0);
  const [answers, setAnswers] = useState(0);
  const stats = useRef(new Map<string, Partial<Record<SentenceSkill, SkillStats>>>());
  const known = useMemo(() => new Set(words.map((w) => w.hanzi.trim())), [words]);
  const others = useMemo(() => sentences.filter((s) => s.translation.trim()), [sentences]);

  useEffect(() => {
    document.body.classList.add('in-session');
    return () => document.body.classList.remove('in-session');
  }, []);

  /** Every answer counts toward the streak and the sentence's statistics. */
  const count = (s: Sentence, skill: SentenceSkill, q: number) => {
    setAnswers((n) => n + 1);
    if (q < 3) setMisses((m) => m + 1);
    recordReview().catch(() => {});
    const by = stats.current.get(s.id) ?? {};
    const { answered, correct, recent, lastSeen } = recordAnswer({ ...newSrs(), ...by[skill] }, q >= 3);
    stats.current.set(s.id, { ...by, [skill]: { answered, correct, recent, lastSeen } });
  };

  const next = (st: Stage) => {
    setStage(st);
    setStep((x) => x + 1);
  };

  /** Indexes a round works on (the dialogue response needs a line before it). */
  const roundItems = (r: Round) => items.map((_, i) => i).filter((i) => r !== 'response' || i > 0);
  const startRound = (r: number) => (r < rounds.length ? next({ kind: 'round', r, queue: shuffle(roundItems(rounds[r])) }) : next(isDialogue ? { kind: 'reread' } : { kind: 'done' }));

  const saved = useRef(false);
  const finish = async () => {
    if (saved.current) return next({ kind: 'done' });
    saved.current = true;
    const on = today();
    // Lines of a dialogue that were already learned keep their schedule.
    const fresh = items.filter((s) => !isSentenceLearned(s));
    await updateSentences(fresh.map((s) => ({ ...s, skills: learnedSentenceSkills(stats.current.get(s.id), on), learnedOn: on })));
    next({ kind: 'done' });
  };

  useEffect(() => {
    if (stage.kind === 'done' && !saved.current) finish();
  }, [stage.kind]);

  // ---------- Rendering ----------

  const progress =
    stage.kind === 'read'
      ? 0
      : stage.kind === 'line'
        ? ((stage.i + (stage.asking ? 0.5 : 0)) / items.length) * 0.35
        : stage.kind === 'round'
          ? 0.35 + ((stage.r + (roundItems(rounds[stage.r]).length - stage.queue.length) / roundItems(rounds[stage.r]).length) / rounds.length) * 0.55
          : stage.kind === 'reread'
            ? 0.9
            : 1;
  const label =
    stage.kind === 'read'
      ? 'Read through'
      : stage.kind === 'line'
        ? `Line ${stage.i + 1} of ${items.length}`
        : stage.kind === 'round'
          ? `Round ${stage.r + 1} of ${rounds.length}: ${ROUND_LABEL[rounds[stage.r]]} · ${stage.queue.length} left`
          : stage.kind === 'reread'
            ? 'Read it again'
            : 'Done';

  const bar = (
    <>
      <div className="session-bar">
        <button className="icon-btn" onClick={onExit} aria-label="End session" title="End session">
          <Icon name="close" />
        </button>
        <div className="progress">
          <div className="progress-fill" style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
        <span className="muted small">{items.length} sentences</span>
      </div>
      <div className="session-title muted small">
        {title} · {label}
      </div>
    </>
  );

  if (stage.kind === 'done') {
    return (
      <div className="summary card">
        <div className="summary-score">{items.length}</div>
        <h2>{items.length === 1 ? 'sentence learned' : 'sentences learned'}</h2>
        <p className="muted">
          First review: tomorrow. {answers > 0 && `${answers} answers, ${misses} missed and repeated.`}
        </p>
        <button className="btn primary" onClick={onFinish ?? onExit} autoFocus>
          {finishLabel ?? 'Done'}
        </button>
      </div>
    );
  }

  if (stage.kind === 'read' || stage.kind === 'reread') {
    return (
      <div className="session">
        {bar}
        <ReadThrough
          key={stage.kind}
          lines={lines}
          title={title}
          hideTranslations={stage.kind === 'reread'}
          doneLabel={stage.kind === 'read' ? 'Start learning the lines' : 'Finish'}
          onDone={() => (stage.kind === 'read' ? next({ kind: 'line', i: 0, asking: false }) : finish())}
        />
      </div>
    );
  }

  if (stage.kind === 'line') {
    const s = items[stage.i];
    const after = () => (stage.i + 1 < items.length ? next({ kind: 'line', i: stage.i + 1, asking: false }) : startRound(0));
    return (
      <div className="session">
        {bar}
        {!stage.asking ? (
          <LineCard key={step} line={lines[stage.i]} onDone={() => next({ ...stage, asking: true })} />
        ) : (
          <ChoiceStep
            key={step}
            sentence={s}
            near={items}
            pool={others}
            n={3}
            kicker="Quick check: what does it mean?"
            onAnswer={(q) => {
              count(s, 'understand', q);
              after();
            }}
          />
        )}
      </div>
    );
  }

  // Rounds
  const round = rounds[stage.r];
  const i = stage.queue[0];
  const s = items[i];
  const answer = (q: number) => {
    count(s, ROUND_SKILL[round], q);
    const [head, ...rest] = stage.queue;
    const queue = q < 3 ? [...rest, head] : rest; // misses come back later in the same round
    if (queue.length) next({ kind: 'round', r: stage.r, queue });
    else startRound(stage.r + 1);
  };

  return (
    <div className="session">
      {bar}
      {round === 'translate' && <ChoiceStep key={step} sentence={s} near={items} pool={others} n={4} onAnswer={answer} />}
      {round === 'build' && <BuildStep key={step} sentence={s} pool={items.length > 1 ? items : others} known={known} onAnswer={answer} />}
      {round === 'response' && (
        <ResponseStep key={step} items={items} i={i} promptSpeaker={lines[i - 1].speaker} onAnswer={answer} />
      )}
    </div>
  );
}

/** Options are drawn once per card (re-renders mustn't reshuffle them under the answer). */
function ChoiceStep({ sentence, near, pool, n, kicker, onAnswer }: { sentence: Sentence; near: Sentence[]; pool: Sentence[]; n: number; kicker?: string; onAnswer(q: number): void }) {
  const [options] = useState(() => translationOptions(sentence, near, pool, n));
  return <TranslationChoice sentence={sentence} options={options} kicker={kicker} onAnswer={onAnswer} />;
}

function ResponseStep({ items, i, promptSpeaker, onAnswer }: { items: Sentence[]; i: number; promptSpeaker?: string; onAnswer(q: number): void }) {
  const [options] = useState(() => responseOptions(items, i, 3));
  return <DialogueResponse prompt={items[i - 1]} promptSpeaker={promptSpeaker} answer={items[i]} options={options} onAnswer={onAnswer} />;
}

/** Tiles are drawn once per card. */
function BuildStep({ sentence, pool, known, onAnswer }: { sentence: Sentence; pool: Sentence[]; known: Set<string>; onAnswer(q: number): void }) {
  const [{ tiles, answer }] = useState(() => buildTiles(sentence, pool, Math.random, known));
  return <BuildSentence sentence={sentence} tiles={tiles} answer={answer} onAnswer={onAnswer} />;
}

/** Step 2: one line, read and heard, before its quick check. */
function LineCard({ line, onDone }: { line: ReadLine; onDone(): void }) {
  useEffect(() => autoSpeak(line.sentence.zh), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (document.querySelector('.modal-backdrop') || e.repeat) return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onDone();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  return (
    <div className="practice sentence-practice">
      <div className="card teach-card">
        <div className="card-kicker">New sentence {line.speaker ? `· ${line.speaker}` : ''}</div>
        <SentenceReveal sentence={line.sentence} />
        <div className="row center">
          <SpeakButton text={line.sentence.zh} size={26} />
        </div>
      </div>
      <button className="btn primary teach-done" onClick={onDone} autoFocus>
        Got it
      </button>
    </div>
  );
}
