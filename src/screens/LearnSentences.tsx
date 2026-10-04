import { useMemo, useState } from 'react';
import { useStore } from '../store';
import { canLearn, isSentenceLearned, learnGroups, readiness, sentencesLearnedToday, type LearnGroup } from '../lib/sentenceLearn';
import { updateSettings, useSettings } from '../lib/settings';
import type { Word } from '../lib/types';
import { LearnSentenceSession } from '../components/LearnSentenceSession';
import { LearnSession } from '../components/LearnSession';
import type { ReadLine } from '../components/SentenceExercises';

type Session = { kind: 'sentences'; title: string; lines: ReadLine[]; dialogue: boolean } | { kind: 'words'; title: string; pool: Word[] };

/** Learn tab → Sentences: dialogues and tag groups, which are ready, and the daily limit. */
export function LearnSentences({ onGoToSentences }: { onGoToSentences(): void }) {
  const { sentences, dialogues, links } = useStore();
  const { sentenceDailyLimit, sentenceReadyPercent } = useSettings();
  const [session, setSession] = useState<Session | null>(null);

  const doneToday = sentencesLearnedToday(sentences);
  const allowance = Math.max(0, sentenceDailyLimit - doneToday);
  const groups = useMemo(() => learnGroups(sentences, dialogues), [sentences, dialogues]);
  const newCount = sentences.filter(canLearn).length;
  const untranslated = sentences.filter((s) => !isSentenceLearned(s) && !s.translation.trim()).length;

  const rows = groups.map((g) => {
    const fresh = g.sentences.filter(canLearn);
    const noTranslation = g.sentences.filter((s) => !isSentenceLearned(s) && !s.translation.trim()).length;
    return { g, fresh, noTranslation, r: readiness(fresh, links, sentenceReadyPercent) };
  });
  const open = rows.filter((x) => x.fresh.length || x.noTranslation);
  const finished = rows.filter((x) => !x.fresh.length && !x.noTranslation);

  if (session?.kind === 'words') return <LearnSession pool={session.pool} title={session.title} onExit={() => setSession(null)} />;
  if (session?.kind === 'sentences')
    return <LearnSentenceSession title={session.title} lines={session.lines} isDialogue={session.dialogue} onExit={() => setSession(null)} />;

  /** A dialogue is learned as a whole (all its translated lines), within the daily limit unless nothing was learned today. */
  const start = (g: LearnGroup, fresh: typeof rows[number]['fresh']) => {
    if (g.dialogue) {
      const lines = g.sentences.filter((s) => s.translation.trim()).map((s) => ({ sentence: s, speaker: g.speakers.get(s.id) }));
      setSession({ kind: 'sentences', title: g.title, lines, dialogue: true });
    } else {
      setSession({ kind: 'sentences', title: g.title, lines: fresh.slice(0, allowance).map((s) => ({ sentence: s })), dialogue: false });
    }
  };
  const fits = (g: LearnGroup, n: number) => (g.dialogue ? n <= allowance || doneToday === 0 : allowance > 0);

  return (
    <>
      <div className="card hero">
        <div className="hero-stats">
          <div>
            <div className="stat-value">{newCount}</div>
            <div className="stat-label">new sentences</div>
          </div>
          <div>
            <div className="stat-value">
              {doneToday}
              <span className="stat-of">/{sentenceDailyLimit}</span>
            </div>
            <div className="stat-label">learned today</div>
          </div>
          <div>
            <div className="stat-value">{dialogues.length}</div>
            <div className="stat-label">dialogues</div>
          </div>
        </div>
        <p className="muted small">
          Dialogues are learned as a whole: read it through, then line by line, then rounds (translation → build the sentence → what
          comes next), then read it once more. A sentence is ready when {sentenceReadyPercent}% of its words are learned.
        </p>
        {untranslated > 0 && (
          <p className="hint warn">
            {untranslated} sentence{untranslated === 1 ? '' : 's'} can’t be learned yet: no translation.{' '}
            <button className="link-btn" onClick={onGoToSentences}>
              Add translations
            </button>
          </p>
        )}
      </div>

      {!open.length ? (
        <div className="card empty">
          <h2>No new sentences to learn</h2>
          <p>Add sentences or a lesson dialogue in Words → Sentences / Dialogues.</p>
          <button className="btn primary" onClick={onGoToSentences}>
            Go to sentences
          </button>
        </div>
      ) : (
        <ul className="learn-groups">
          {open.map(({ g, fresh, noTranslation, r }) => {
            const n = g.dialogue ? fresh.length : Math.min(fresh.length, allowance);
            const ok = fits(g, fresh.length);
            return (
              <li key={g.key} className="card learn-group">
                <div className="learn-group-head">
                  <span className="learn-group-title" lang="zh-CN">
                    {g.dialogue ? '💬 ' : ''}
                    {g.title}
                  </span>
                  {fresh.length > 0 &&
                    (r.ready ? <span className="status ready">ready</span> : <span className="status needs">{r.missing.length} words to learn first</span>)}
                </div>
                <div className="muted small">
                  {fresh.length} new sentence{fresh.length === 1 ? '' : 's'}
                  {g.dialogue && fresh.length < g.sentences.length && ` of ${g.sentences.length} lines`}
                  {noTranslation > 0 && ` · ${noTranslation} without translation`}
                  {r.total > 0 && ` · words ${r.learned}/${r.total} learned`}
                </div>
                {fresh.length > 0 && (
                  <div className="row learn-group-actions">
                    {!r.ready && (
                      <button className="btn small-btn primary" onClick={() => setSession({ kind: 'words', title: `Words for ${g.title}`, pool: r.missing })}>
                        Learn the {r.missing.length} words first
                      </button>
                    )}
                    <button className={`btn small-btn ${r.ready ? 'primary' : 'ghost'}`} disabled={!ok} onClick={() => start(g, fresh)}>
                      {r.ready ? `Learn ${n} sentence${n === 1 ? '' : 's'}` : 'Learn anyway'}
                    </button>
                  </div>
                )}
                {fresh.length > 0 && !ok && (
                  <p className="hint">
                    {allowance === 0
                      ? `Daily limit reached (${sentenceDailyLimit} new sentences). Come back tomorrow, or raise the limit below.`
                      : `This dialogue has ${fresh.length} new lines; ${allowance} left today. Learn it tomorrow, or raise the limit below.`}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {finished.length > 0 && (
        <details className="card learned-groups">
          <summary className="small">Learned: {finished.map((x) => x.g.title).join(' · ')}</summary>
        </details>
      )}

      <div className="card form">
        <label className="field">
          <span className="field-label">New sentences per day</span>
          <input
            className="input narrow"
            type="number"
            min={1}
            max={50}
            value={sentenceDailyLimit}
            onChange={(e) => {
              const v = Math.round(Number(e.target.value));
              if (v >= 1 && v <= 50) updateSettings({ sentenceDailyLimit: v });
            }}
          />
        </label>
        <label className="field">
          <span className="field-label">Ready when this % of a sentence’s words are learned</span>
          <input
            className="input narrow"
            type="number"
            min={0}
            max={100}
            step={10}
            value={sentenceReadyPercent}
            onChange={(e) => {
              const v = Math.round(Number(e.target.value));
              if (v >= 0 && v <= 100) updateSettings({ sentenceReadyPercent: v });
            }}
          />
        </label>
      </div>
    </>
  );
}
