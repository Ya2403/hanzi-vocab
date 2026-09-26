import { useMemo, useState } from 'react';
import { useStore } from '../store';
import { formatDate, today } from '../lib/date';
import { isDue, isNew } from '../lib/srs';
import { liveStreak } from '../lib/streak';
import { updateSettings, useSettings } from '../lib/settings';
import { shuffle } from '../lib/words';
import type { Word } from '../lib/types';
import { Session } from '../components/Session';
import { modeAvailable, SessionOptions } from '../components/SessionOptions';
import { TagPicker, tagLabel, wordsInTags } from '../components/TagPicker';

export function ReviewScreen({ onGoToWords, onGoToLearn }: { onGoToWords(): void; onGoToLearn(): void }) {
  const { words, streak, daily } = useStore();
  const settings = useSettings();
  const [session, setSession] = useState<Word[] | null>(null);
  const [tags, setTags] = useState<string[]>([]);

  const on = today();
  // New words are taught in Learn first; Review only schedules learned ones.
  const allDue = useMemo(() => words.filter((w) => isDue(w, on) && !isNew(w)), [words, on]);
  const newWords = words.filter(isNew).length;
  const due = wordsInTags(allDue, tags);
  const tagNames = tags.map(tagLabel).join(', ');
  const reviewedToday = daily.date === on ? daily.reviews : 0;

  const nextUp = useMemo(() => {
    const upcoming = words.filter((w) => !isDue(w, on) && !isNew(w)).map((w) => w.srs.due).sort();
    if (!upcoming.length) return null;
    return { date: upcoming[0], count: upcoming.filter((d) => d === upcoming[0]).length };
  }, [words, on]);

  if (session) {
    return (
      <Session
        title={tags.length ? `Daily review · ${tagNames}` : 'Daily review'}
        words={session}
        mode={settings.reviewMode}
        direction={settings.reviewDirection}
        updateSchedule
        onExit={() => setSession(null)}
      />
    );
  }

  // Most overdue first (shuffled within the same due date).
  const start = () => setSession(shuffle(due).sort((a, b) => a.srs.due.localeCompare(b.srs.due)));
  const canStart = due.length > 0 && modeAvailable(settings.reviewMode, words.length);

  return (
    <section className="screen">
      <div className="card hero">
        <div className="hero-stats">
          <div>
            <div className="stat-value">{allDue.length}</div>
            <div className="stat-label">due today</div>
          </div>
          <div>
            <div className="stat-value">{reviewedToday}</div>
            <div className="stat-label">answered today</div>
          </div>
          <div>
            <div className="stat-value">🔥 {liveStreak(streak, on)}</div>
            <div className="stat-label">day streak</div>
          </div>
        </div>
        {due.length > 0 ? (
          <p className="muted">
            {tags.length > 0 && `${tagNames}: `}
            {due.length} to review
          </p>
        ) : tags.length > 0 && allDue.length > 0 ? (
          <p className="muted">Nothing due in {tagNames} today. {allDue.length} due in other words.</p>
        ) : words.length === 0 ? (
          <p className="muted">Add some words to start reviewing.</p>
        ) : !words.some((w) => !isNew(w)) ? (
          <p className="muted">Nothing to review yet: learn some words first.</p>
        ) : (
          <p className="muted">
            All caught up! 🎉
            {nextUp && ` Next: ${nextUp.count} word${nextUp.count > 1 ? 's' : ''} on ${formatDate(nextUp.date)}.`}
          </p>
        )}
        {newWords > 0 && (
          <button className="link-btn" onClick={onGoToLearn}>
            {newWords} new word{newWords === 1 ? '' : 's'} waiting in Learn →
          </button>
        )}
      </div>

      <LearnProgress words={words} />

      {words.length === 0 ? (
        <button className="btn primary block" onClick={onGoToWords}>
          Go to word list
        </button>
      ) : (
        <div className="card form setup-card">
          <div className="setup-col">
            <SessionOptions
              mode={settings.reviewMode}
              direction={settings.reviewDirection}
              onMode={(reviewMode) => updateSettings({ reviewMode })}
              onDirection={(reviewDirection) => updateSettings({ reviewDirection })}
              totalWords={words.length}
            />
          </div>
          <div className="setup-col">
            <TagPicker
              words={words}
              selected={tags}
              onChange={setTags}
              label="Words (due count)"
              countOf={(list) => list.filter((w) => isDue(w, on)).length}
            />
            <button className="btn primary block" disabled={!canStart} onClick={start}>
              {due.length ? `Start review (${due.length})` : 'Nothing due'}
            </button>
            <p className="hint">
              Answers here update each word’s spaced-repetition schedule (SM-2). Missed words come back until you get them right.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}

/** Learned / total per category, e.g. "HSK lesson 1: 24/86 learned". */
function LearnProgress({ words }: { words: Word[] }) {
  const rows = useMemo(() => {
    const tags = [...new Set(words.flatMap((w) => w.tags))].sort();
    return tags.map((t) => {
      const inTag = words.filter((w) => w.tags.includes(t));
      return { tag: t, total: inTag.length, learned: inTag.filter((w) => !isNew(w)).length };
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
