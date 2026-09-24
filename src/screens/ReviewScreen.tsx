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

export function ReviewScreen({ onGoToWords }: { onGoToWords(): void }) {
  const { words, streak, daily } = useStore();
  const settings = useSettings();
  const [session, setSession] = useState<Word[] | null>(null);
  const [tag, setTag] = useState('');

  const on = today();
  const allDue = useMemo(() => words.filter((w) => isDue(w, on)), [words, on]);
  const tags = useMemo(() => [...new Set(words.flatMap((w) => w.tags))].sort(), [words]);
  const due = tag ? allDue.filter((w) => w.tags.includes(tag)) : allDue;
  const newCount = due.filter(isNew).length;
  const reviewedToday = daily.date === on ? daily.reviews : 0;

  const nextUp = useMemo(() => {
    const upcoming = words.filter((w) => !isDue(w, on)).map((w) => w.srs.due).sort();
    if (!upcoming.length) return null;
    return { date: upcoming[0], count: upcoming.filter((d) => d === upcoming[0]).length };
  }, [words, on]);

  if (session) {
    return (
      <Session
        title={tag ? `Daily review · ${tag}` : 'Daily review'}
        words={session}
        mode={settings.reviewMode}
        direction={settings.reviewDirection}
        updateSchedule
        onExit={() => setSession(null)}
      />
    );
  }

  // Overdue words first, then new ones; shuffled within each group.
  const start = () => {
    const review = shuffle(due.filter((w) => !isNew(w))).sort((a, b) => a.srs.due.localeCompare(b.srs.due));
    setSession([...review, ...shuffle(due.filter(isNew))]);
  };
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
            {tag && `“${tag}”: `}
            {due.length - newCount} to review · {newCount} new
          </p>
        ) : tag && allDue.length > 0 ? (
          <p className="muted">Nothing due in “{tag}” today. {allDue.length} due in other words.</p>
        ) : words.length === 0 ? (
          <p className="muted">Add some words to start reviewing.</p>
        ) : (
          <p className="muted">
            All caught up! 🎉
            {nextUp && ` Next: ${nextUp.count} word${nextUp.count > 1 ? 's' : ''} on ${formatDate(nextUp.date)}.`}
          </p>
        )}
      </div>

      {words.length === 0 ? (
        <button className="btn primary block" onClick={onGoToWords}>
          Go to word list
        </button>
      ) : (
        <div className="card form">
          <SessionOptions
            mode={settings.reviewMode}
            direction={settings.reviewDirection}
            onMode={(reviewMode) => updateSettings({ reviewMode })}
            onDirection={(reviewDirection) => updateSettings({ reviewDirection })}
            totalWords={words.length}
          />
          {tags.length > 0 && (
            <label className="field">
              <span className="field-label">Words</span>
              <select className="select" value={tag} onChange={(e) => setTag(e.target.value)}>
                <option value="">All due words ({allDue.length})</option>
                {tags.map((t) => (
                  <option key={t} value={t}>
                    {t} ({allDue.filter((w) => w.tags.includes(t)).length} due)
                  </option>
                ))}
              </select>
            </label>
          )}
          <button className="btn primary block" disabled={!canStart} onClick={start}>
            {due.length ? `Start review (${due.length})` : 'Nothing due'}
          </button>
          <p className="hint">
            Answers here update each word’s spaced-repetition schedule (SM-2). Missed words come back until you get them right.
          </p>
        </div>
      )}
    </section>
  );
}
