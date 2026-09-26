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

export function ReviewScreen({ onGoToWords }: { onGoToWords(): void }) {
  const { words, streak, daily } = useStore();
  const settings = useSettings();
  const [session, setSession] = useState<Word[] | null>(null);
  const [tags, setTags] = useState<string[]>([]);

  const on = today();
  const allDue = useMemo(() => words.filter((w) => isDue(w, on)), [words, on]);
  const due = wordsInTags(allDue, tags);
  const tagNames = tags.map(tagLabel).join(', ');
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
        title={tags.length ? `Daily review · ${tagNames}` : 'Daily review'}
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
            {tags.length > 0 && `${tagNames}: `}
            {due.length - newCount} to review · {newCount} new
          </p>
        ) : tags.length > 0 && allDue.length > 0 ? (
          <p className="muted">Nothing due in {tagNames} today. {allDue.length} due in other words.</p>
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
