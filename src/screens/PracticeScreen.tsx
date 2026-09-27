import { useState } from 'react';
import { useStore } from '../store';
import { pickPractice } from '../lib/planner';
import { updateSettings, useSettings } from '../lib/settings';
import { isLearned } from '../lib/srs';
import type { Word } from '../lib/types';
import { Session } from '../components/Session';
import { modeAvailable, SessionOptions } from '../components/SessionOptions';
import { Segmented } from '../components/Segmented';
import { TagFilter } from '../components/TagFilter';
import { tagLabel, wordsInTags } from '../components/TagPicker';

/**
 * Free practice on learned words, weakest first (recent misses, low accuracy, low ease, due
 * soon, not seen lately). Correct answers don't change the schedule; a miss brings the
 * word's review forward to tomorrow at the latest.
 */
export function PracticeScreen() {
  const { words } = useStore();
  const settings = useSettings();
  // Categories can be preselected via a link like #practice?tag=HSK1 (from the word list).
  const [tags, setTags] = useState<string[]>(() => {
    const t = new URLSearchParams(location.hash.split('?')[1]).get('tag');
    return t ? [t] : [];
  });
  const [session, setSession] = useState<Word[] | null>(null);

  const learned = words.filter(isLearned);
  const pool = wordsInTags(learned, tags);
  const size = Math.min(pool.length, settings.practiceSize);
  const mode = settings.autoExercise ? 'auto' : settings.practiceMode;

  if (session) {
    return (
      <Session
        title={`Practice${tags.length ? ` · ${tags.map(tagLabel).join(', ')}` : ''}`}
        words={session}
        mode={mode}
        direction={settings.practiceDirection}
        updateSchedule={false}
        onExit={() => setSession(null)}
      />
    );
  }

  const canStart = size > 0 && (settings.autoExercise || modeAvailable(settings.practiceMode, words.length));

  return (
    <section className="screen">
      <div className="card form setup-card">
        <div className="setup-col">
          <h2>Practice</h2>
          <p className="muted small">
            Picks your weakest learned words first. Answers don’t change the schedule, except that a miss brings the word
            back in Review tomorrow at the latest.
          </p>
          {learned.length === 0 ? (
            <p className="hint">No learned words yet. Learn some new words first, and they’ll show up here.</p>
          ) : (
            <TagFilter words={words} selected={tags} onChange={setTags} />
          )}
          <Segmented
            label="Cards"
            value={String(settings.practiceSize) as '10' | '20' | '50'}
            onChange={(v) => updateSettings({ practiceSize: Number(v) })}
            options={[
              { value: '10', label: '10' },
              { value: '20', label: '20' },
              { value: '50', label: '50' },
            ]}
          />
          <button className="btn primary block" disabled={!canStart} onClick={() => setSession(pickPractice(pool, size))}>
            {size ? `Start practice (${size} card${size === 1 ? '' : 's'})` : 'No learned words here'}
          </button>
        </div>
        <div className="setup-col">
          <label className="toggle">
            <input type="checkbox" checked={settings.autoExercise} onChange={(e) => updateSettings({ autoExercise: e.target.checked })} />
            <span>Choose exercises automatically</span>
          </label>
          {settings.autoExercise ? (
            <p className="hint">
              Weak or recently learned words get multiple choice (中 → EN), medium ones listening or EN → 中, strong ones
              typing, and very strong ones (3+ week intervals) sometimes writing. Missed words come back as easier cards.
            </p>
          ) : (
            <SessionOptions
              mode={settings.practiceMode}
              direction={settings.practiceDirection}
              onMode={(practiceMode) => updateSettings({ practiceMode })}
              onDirection={(practiceDirection) => updateSettings({ practiceDirection })}
              totalWords={words.length}
            />
          )}
        </div>
      </div>
    </section>
  );
}
