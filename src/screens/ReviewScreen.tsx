import { useMemo, useState } from 'react';
import { useStore } from '../store';
import { formatDate, today } from '../lib/date';
import { learnedToday } from '../lib/learn';
import { pickPractice } from '../lib/planner';
import { isDueLearned, isLearned, isNew } from '../lib/srs';
import { liveStreak } from '../lib/streak';
import { updateSettings, useSettings } from '../lib/settings';
import { shuffle } from '../lib/words';
import type { Word } from '../lib/types';
import { Session } from '../components/Session';
import { LearnSession } from '../components/LearnSession';
import { modeAvailable, SessionOptions } from '../components/SessionOptions';
import { TagFilter } from '../components/TagFilter';
import { tagLabel, wordsInTags } from '../components/TagPicker';

/** Most overdue first (shuffled within the same due date). */
const reviewOrder = (list: Word[]) => shuffle(list).sort((a, b) => a.srs.due.localeCompare(b.srs.due));

type Flow =
  | { phase: 'home' }
  | { phase: 'review'; words: Word[]; title: string; chain: boolean }
  | { phase: 'learn' }
  | { phase: 'done' }
  | { phase: 'practice'; words: Word[] };

/**
 * Home of the app. "Continue" runs everything due today in order — reviews, then new words
 * (up to the daily limit), then "Done for today" with an optional extra practice round.
 */
export function ReviewScreen({ onGoToWords, onGoToLearn }: { onGoToWords(): void; onGoToLearn(): void }) {
  const { words, streak, daily } = useStore();
  const settings = useSettings();
  const [flow, setFlow] = useState<Flow>({ phase: 'home' });
  const [tags, setTags] = useState<string[]>([]);

  const on = today();
  const allDue = useMemo(() => words.filter((w) => isDueLearned(w, on)), [words, on]);
  const newWords = useMemo(() => words.filter(isNew), [words]);
  const newLeft = Math.min(newWords.length, Math.max(0, settings.learnDailyLimit - learnedToday(words, on)));
  const learnedWords = words.filter(isLearned);
  const filteredDue = wordsInTags(allDue, tags);
  const reviewedToday = daily.date === on ? daily.reviews : 0;
  const mode = settings.autoExercise ? 'auto' : settings.reviewMode;

  const nextUp = useMemo(() => {
    const upcoming = words.filter((w) => isLearned(w) && !isDueLearned(w, on)).map((w) => w.srs.due).sort();
    if (!upcoming.length) return null;
    return { date: upcoming[0], count: upcoming.filter((d) => d === upcoming[0]).length };
  }, [words, on]);

  const home = () => setFlow({ phase: 'home' });
  /** After reviews: new words (if any left today), else done. */
  const afterReviews = () => setFlow(newLeft > 0 ? { phase: 'learn' } : { phase: 'done' });
  const practiceMore = () => setFlow({ phase: 'practice', words: pickPractice(learnedWords, settings.practiceSize) });

  const continueFlow = () => {
    if (allDue.length) setFlow({ phase: 'review', words: reviewOrder(allDue), title: 'Reviews', chain: true });
    else afterReviews();
  };

  // ---------- Running phases ----------

  if (flow.phase === 'review') {
    return (
      <Session
        title={flow.title}
        words={flow.words}
        mode={mode}
        direction={settings.reviewDirection}
        updateSchedule
        onExit={home}
        onFinish={flow.chain ? afterReviews : home}
        finishLabel={flow.chain ? (newLeft > 0 ? `Continue: ${newLeft} new word${newLeft === 1 ? '' : 's'}` : 'Continue') : 'Done'}
      />
    );
  }
  if (flow.phase === 'learn') {
    return (
      <LearnSession
        pool={newWords}
        title="New words"
        onExit={home}
        onFinish={() => setFlow({ phase: 'done' })}
        finishLabel="Continue"
      />
    );
  }
  if (flow.phase === 'practice') {
    return (
      <Session
        title="Practice more"
        words={flow.words}
        mode={settings.autoExercise ? 'auto' : settings.practiceMode}
        direction={settings.practiceDirection}
        updateSchedule={false}
        onExit={home}
      />
    );
  }
  if (flow.phase === 'done') {
    return (
      <section className="screen">
        <div className="card summary done-today">
          <div className="summary-score">🎉</div>
          <h2>Done for today</h2>
          <p className="muted">
            {reviewedToday} answers today · 🔥 {liveStreak(streak, on)} day streak
            {nextUp && ` · next reviews ${formatDate(nextUp.date)}`}
          </p>
          <div className="row center">
            <button className="btn primary" onClick={practiceMore} disabled={!learnedWords.length} autoFocus>
              Practice more ({Math.min(settings.practiceSize, learnedWords.length)})
            </button>
            <button className="btn" onClick={home}>
              Back
            </button>
          </div>
          <p className="hint">Practice more picks your weakest words. It doesn’t change their schedule, except that a miss brings a review forward.</p>
        </div>
      </section>
    );
  }

  // ---------- Home ----------

  const nothingLeft = !allDue.length && newLeft === 0;

  return (
    <section className="screen">
      <div className="card hero continue-card">
        {words.length === 0 ? (
          <>
            <h2>Welcome!</h2>
            <p className="muted">Add some words to get started.</p>
            <button className="btn primary block" onClick={onGoToWords}>
              Go to word list
            </button>
          </>
        ) : (
          <>
            <p className="continue-summary">
              <b>{allDue.length}</b> review{allDue.length === 1 ? '' : 's'} · <b>{newLeft}</b> new word{newLeft === 1 ? '' : 's'} left today
            </p>
            <button className="btn primary continue-btn" onClick={nothingLeft ? () => setFlow({ phase: 'done' }) : continueFlow}>
              {nothingLeft ? 'All done for today ✓' : 'Continue'}
            </button>
            <div className="hero-stats">
              <div>
                <div className="stat-value">{reviewedToday}</div>
                <div className="stat-label">answered today</div>
              </div>
              <div>
                <div className="stat-value">🔥 {liveStreak(streak, on)}</div>
                <div className="stat-label">day streak</div>
              </div>
              <div>
                <div className="stat-value">{learnedWords.length}</div>
                <div className="stat-label">learned words</div>
              </div>
            </div>
            {nothingLeft && nextUp && (
              <p className="muted small">
                Next: {nextUp.count} review{nextUp.count > 1 ? 's' : ''} on {formatDate(nextUp.date)}.
                {newWords.length > 0 && ` ${newWords.length} new words wait in Learn (daily limit reached).`}
              </p>
            )}
            {newWords.length > 0 && (
              <button className="link-btn" onClick={onGoToLearn}>
                Learn tab: pick which new words to learn →
              </button>
            )}
          </>
        )}
      </div>

      {learnedWords.length > 0 && (
        <div className="card form setup-card">
          <div className="setup-col">
            <h2>Review a selection</h2>
            <TagFilter words={words} selected={tags} onChange={setTags} showDue />
            <button
              className="btn block"
              disabled={!filteredDue.length || (!settings.autoExercise && !modeAvailable(settings.reviewMode, words.length))}
              onClick={() =>
                setFlow({
                  phase: 'review',
                  words: reviewOrder(filteredDue),
                  title: tags.length ? `Review · ${tags.map(tagLabel).join(', ')}` : 'Reviews',
                  chain: false,
                })
              }
            >
              {filteredDue.length ? `Review ${filteredDue.length} due` : tags.length ? 'Nothing due in this selection' : 'Nothing due'}
            </button>
          </div>
          <div className="setup-col">
            <label className="toggle">
              <input type="checkbox" checked={settings.autoExercise} onChange={(e) => updateSettings({ autoExercise: e.target.checked })} />
              <span>Choose exercises automatically</span>
            </label>
            {settings.autoExercise ? (
              <p className="hint">
                Each card’s exercise follows how well you know the word: weak words get multiple choice, then listening and
                EN → 中, strong words typing, and very strong words sometimes writing.
              </p>
            ) : (
              <SessionOptions
                mode={settings.reviewMode}
                direction={settings.reviewDirection}
                onMode={(reviewMode) => updateSettings({ reviewMode })}
                onDirection={(reviewDirection) => updateSettings({ reviewDirection })}
                totalWords={words.length}
              />
            )}
          </div>
        </div>
      )}

      <LearnProgress words={words} />
    </section>
  );
}

/** Learned / total per category, e.g. "HSK lesson 1: 24/86 learned". */
function LearnProgress({ words }: { words: Word[] }) {
  const rows = useMemo(() => {
    const tags = [...new Set(words.flatMap((w) => w.tags))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    return tags.map((t) => {
      const inTag = words.filter((w) => w.tags.includes(t));
      return { tag: t, total: inTag.length, learned: inTag.filter(isLearned).length };
    });
  }, [words]);
  if (!rows.length) return null;
  return (
    <div className="card learn-progress">
      <h2>Learn progress</h2>
      <ul>
        {rows.map((r) => (
          <li key={r.tag}>
            <span className="lp-tag">{r.tag}</span>
            <span className="lp-bar" aria-hidden="true">
              <span style={{ width: `${(r.learned / r.total) * 100}%` }} />
            </span>
            <span className="lp-count small">
              {r.learned}/{r.total} learned
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
