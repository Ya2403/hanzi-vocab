import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../store';
import { loadHanziDict, type HanziDict } from '../lib/hanziDict';
import { isRadicalOnly, learnedSrs, learnedToday, nextBatch, planLearning, type LearnPlan } from '../lib/learn';
import { useSettings } from '../lib/settings';
import { recordAnswer } from '../lib/srs';
import { shuffle } from '../lib/words';
import type { Word } from '../lib/types';
import { Icon } from './Icon';
import { ListenChoice, listeningAvailable, TeachCard } from './LearnCards';
import { MultipleChoice } from './MultipleChoice';
import { Typing } from './Typing';

type Round = 'meaning' | 'listen' | 'produce' | 'typing';

const ROUND_LABEL: Record<Round, string> = {
  meaning: '中 → EN',
  listen: 'Listening',
  produce: 'EN → 中',
  typing: 'Typing',
};

/** Radical-only entries have no reading of their own: recognition rounds only. */
const roundApplies = (r: Round, w: Word) => !isRadicalOnly(w) || r === 'meaning' || r === 'produce';

type Stage =
  | { kind: 'loading' }
  | { kind: 'teach'; i: number }
  | { kind: 'check'; i: number }
  | { kind: 'round'; r: number; queue: string[] }
  | { kind: 'batchDone' }
  | { kind: 'summary' };

/** Pad a distractor pool to at least `n` words with others from the list. */
function withFill(pool: Word[], others: Word[], n: number): Word[] {
  if (pool.length >= n) return pool;
  const ids = new Set(pool.map((w) => w.id));
  return [...pool, ...shuffle(others.filter((w) => !ids.has(w.id))).slice(0, n - pool.length)];
}

export function LearnSession({
  pool,
  title,
  onExit,
  onFinish,
  finishLabel,
}: {
  pool: Word[];
  title: string;
  /** Leave early (✕). */
  onExit(): void;
  /** The summary's main button; defaults to onExit (Continue flow: go on to "Done for today"). */
  onFinish?(): void;
  finishLabel?: string;
}) {
  const { words, updateWord, updateWords, recordReview } = useStore();
  const { learnBatchSize, learnDailyLimit, learnTyping } = useSettings();
  const rounds = useMemo<Round[]>(
    () => ['meaning', ...(listeningAvailable ? (['listen'] as Round[]) : []), 'produce', ...(learnTyping ? (['typing'] as Round[]) : [])],
    [learnTyping],
  );

  const [dict, setDict] = useState<HanziDict | null>(null);
  const [plan, setPlan] = useState<LearnPlan | null>(null);
  const [remaining, setRemaining] = useState<Set<string>>(() => new Set(pool.map((w) => w.id)));
  const [batch, setBatch] = useState<Word[]>([]);
  const [stage, setStage] = useState<Stage>({ kind: 'loading' });
  const [step, setStep] = useState(0); // remount key for cards
  const [learned, setLearned] = useState<Word[]>([]);
  const [misses, setMisses] = useState(0);
  const [answered, setAnswered] = useState(0);

  // Full-screen like other sessions.
  useEffect(() => {
    document.body.classList.add('in-session');
    return () => document.body.classList.remove('in-session');
  }, []);

  const allowance = Math.max(0, learnDailyLimit - learnedToday(words));

  const startBatch = (p: LearnPlan, rem: Set<string>, d: HanziDict | null) => {
    const size = Math.min(learnBatchSize, allowance);
    const next = size > 0 ? nextBatch(p, rem, size, d) : [];
    if (!next.length) {
      setStage({ kind: 'summary' });
      return;
    }
    setBatch(next);
    setStage({ kind: 'teach', i: 0 });
    setStep((s) => s + 1);
  };

  // Component data improves the order; without it (offline) the plan falls back to tags/added order.
  useEffect(() => {
    let live = true;
    loadHanziDict()
      .catch(() => null)
      .then((d) => {
        if (!live) return;
        const p = planLearning(pool, d);
        setDict(d);
        setPlan(p);
        startBatch(p, remaining, d);
      });
    return () => {
      live = false;
    };
  }, []); // pool is fixed for this session

  const liveWord = (w: Word) => words.find((x) => x.id === w.id) ?? w;
  const others = words.filter((w) => !batch.some((b) => b.id === w.id));
  const taughtSoFar = (i: number) => [...learned, ...batch.slice(0, i)];

  /** Every Learn answer counts toward the streak and the word's accuracy statistics. */
  const count = (w: Word, q: number) => {
    setAnswered((n) => n + 1);
    recordReview().catch(() => {});
    const live = liveWord(w);
    updateWord({ ...live, srs: recordAnswer(live.srs, q >= 3) }).catch(() => {});
  };

  const startRound = (r: number) => {
    for (let k = r; k < rounds.length; k++) {
      const queue = shuffle(batch.filter((w) => roundApplies(rounds[k], w))).map((w) => w.id);
      if (queue.length) {
        setStage({ kind: 'round', r: k, queue });
        setStep((s) => s + 1);
        return;
      }
    }
    finishBatch();
  };

  const finishBatch = () => {
    const on = learnedSrs();
    // Keep the answer statistics gathered while learning.
    const done = batch.map((w) => {
      const { answered, correct, recent, lastSeen } = liveWord(w).srs;
      return { ...liveWord(w), srs: { ...on, answered, correct, recent, lastSeen } };
    });
    updateWords(done).catch((e) => console.error('Failed to save learned words', e));
    setLearned((l) => [...l, ...done]);
    setRemaining((rem) => {
      const next = new Set(rem);
      batch.forEach((w) => next.delete(w.id));
      return next;
    });
    setStage({ kind: 'batchDone' });
  };

  // ---------- Rendering ----------

  const bar = (label: string, fraction: number) => (
    <>
      <div className="session-bar">
        <button className="icon-btn" onClick={onExit} aria-label="End session" title="End session">
          <Icon name="close" />
        </button>
        <div className="progress">
          <div className="progress-fill" style={{ width: `${Math.round(fraction * 100)}%` }} />
        </div>
        <span className="muted small">
          {learned.length} learned
        </span>
      </div>
      <div className="session-title muted small">
        {title} · {label}
      </div>
    </>
  );

  if (stage.kind === 'loading' || !plan) {
    return (
      <div className="session">
        {bar('Preparing', 0)}
        <p className="muted">Ordering your new words…</p>
      </div>
    );
  }

  if (stage.kind === 'summary') {
    const limitReached = allowance === 0 && remaining.size > 0;
    return (
      <div className="summary card">
        <div className="summary-score">{learned.length}</div>
        <h2>{learned.length === 1 ? 'word learned' : 'words learned'}</h2>
        <p className="muted">
          {learned.length ? 'First review: tomorrow, in the Review tab.' : 'Nothing new to learn here.'}
          {answered > 0 && ` ${answered} answers, ${misses} missed and repeated.`}
        </p>
        {limitReached && <p className="hint">Daily limit reached ({learnDailyLimit} new words). Change it in the Learn settings.</p>}
        {learned.length > 0 && (
          <ul className="missed">
            {learned.map((w) => (
              <li key={w.id}>
                <span className="hanzi" lang="zh-CN">{w.hanzi}</span>
                <span className="pinyin">{w.pinyin}</span>
                <span className="meaning">{w.meaning}</span>
              </li>
            ))}
          </ul>
        )}
        <button className="btn primary" onClick={onFinish ?? onExit} autoFocus>
          {finishLabel ?? 'Done'}
        </button>
      </div>
    );
  }

  if (stage.kind === 'batchDone') {
    const more = remaining.size > 0 && allowance > 0;
    return (
      <div className="session">
        {bar('Batch complete', 1)}
        <div className="card summary">
          <h2>Batch learned 🎉</h2>
          <p className="lead" lang="zh-CN">
            {batch.map((w) => w.hanzi).join('  ')}
          </p>
          <p className="muted">
            {more
              ? `${Math.min(remaining.size, allowance)} more new word${Math.min(remaining.size, allowance) === 1 ? '' : 's'} available today.`
              : allowance === 0
                ? 'That’s your daily limit.'
                : 'No new words left here.'}
          </p>
          <div className="row center">
            {more && (
              <button className="btn primary" onClick={() => startBatch(plan, remaining, dict)} autoFocus>
                Next batch
              </button>
            )}
            <button className={`btn ${more ? '' : 'primary'}`} onClick={() => setStage({ kind: 'summary' })}>
              Finish
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (stage.kind === 'teach' || stage.kind === 'check') {
    const w = liveWord(batch[stage.i]);
    const frac = (stage.i + (stage.kind === 'check' ? 0.5 : 0)) / batch.length / 2;
    return (
      <div className="session">
        {bar(`Learning ${stage.i + 1} of ${batch.length}${stage.kind === 'check' ? ' · quick check' : ''}`, frac)}
        {stage.kind === 'teach' ? (
          <TeachCard key={step} word={w} onDone={() => setStage({ kind: 'check', i: stage.i })} />
        ) : (
          <MultipleChoice
            key={step}
            word={w}
            // Distractors: words already taught this session, topped up from the list.
            allWords={withFill(taughtSoFar(stage.i), others, 3)}
            direction="zh-en"
            onAnswer={(q) => {
              count(w, q);
              if (q < 3) setMisses((m) => m + 1);
              if (stage.i + 1 < batch.length) {
                setStage({ kind: 'teach', i: stage.i + 1 });
                setStep((s) => s + 1);
              } else startRound(0);
            }}
          />
        )}
      </div>
    );
  }

  // Rounds
  const round = rounds[stage.r];
  const w = liveWord(batch.find((b) => b.id === stage.queue[0])!);
  const roundPool = withFill(batch, others, 4);
  const inRound = batch.filter((b) => roundApplies(round, b)).length;
  const answer = (q: number) => {
    count(w, q);
    const [head, ...rest] = stage.queue;
    if (q < 3) setMisses((m) => m + 1);
    const queue = q < 3 ? [...rest, head] : rest; // misses come back later in the same round
    if (queue.length) {
      setStage({ kind: 'round', r: stage.r, queue });
      setStep((s) => s + 1);
    } else startRound(stage.r + 1);
  };
  const frac = 0.5 + ((stage.r + (inRound - new Set(stage.queue).size) / inRound) / rounds.length) * 0.5;

  return (
    <div className="session">
      {bar(`Round ${stage.r + 1} of ${rounds.length}: ${ROUND_LABEL[round]} · ${new Set(stage.queue).size} left`, frac)}
      {round === 'meaning' && <MultipleChoice key={step} word={w} allWords={roundPool} direction="zh-en" onAnswer={answer} />}
      {round === 'listen' && <ListenChoice key={step} word={w} pool={roundPool} onAnswer={answer} />}
      {round === 'produce' && <MultipleChoice key={step} word={w} allWords={roundPool} direction="en-zh" onAnswer={answer} />}
      {round === 'typing' && <Typing key={step} word={w} direction="en-zh" onAnswer={answer} />}
    </div>
  );
}
