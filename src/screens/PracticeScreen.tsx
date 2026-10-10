import { useMemo, useState } from 'react';
import { useStore } from '../store';
import { today } from '../lib/date';
import { balanceHint, pickSession } from '../lib/planner';
import { updateSettings, useSettings } from '../lib/settings';
import { isLearned } from '../lib/srs';
import { liveStreak } from '../lib/streak';
import type { Skill, Word } from '../lib/types';
import { Session } from '../components/Session';
import { modeAvailable, SessionOptions } from '../components/SessionOptions';
import { Segmented } from '../components/Segmented';
import { TagFilter } from '../components/TagFilter';
import { tagLabel, wordsInTags } from '../components/TagPicker';

const SIZES = ['10', '20', '30'] as const;

/**
 * The home screen. One button starts a session of a fixed number of exercises; which words
 * come up is decided in the background from each skill's FSRS retrievability, recent misses
 * and accuracy (about 80% the words that need it most, 20% random stronger ones).
 */
export function PracticeScreen({ onGoToLearn, onGoToWords }: { onGoToLearn(): void; onGoToWords(): void }) {
  const { words, streak, daily } = useStore();
  const settings = useSettings();
  // A focus can be preselected via a link like #practice?tag=HSK1 (from the word list).
  const [tags, setTags] = useState<string[]>(() => {
    const t = new URLSearchParams(location.hash.split('?')[1]).get('tag');
    return t ? [t] : [];
  });
  const [session, setSession] = useState<{ words: Word[]; skillFor: Map<string, Skill>; key: number } | null>(null);

  const learned = useMemo(() => words.filter(isLearned), [words]);
  const pool = wordsInTags(learned, tags);
  const size = Number(SIZES.includes(String(settings.practiceSize) as (typeof SIZES)[number]) ? settings.practiceSize : 20);
  const count = Math.min(pool.length, size);
  const mode = settings.autoExercise ? 'auto' : settings.practiceMode;
  const hint = useMemo(() => balanceHint(learned), [learned]);
  const on = today();

  const start = () => {
    const picked = pickSession(pool, size);
    setSession({ words: picked.map((p) => p.word), skillFor: new Map(picked.map((p) => [p.word.id, p.skill])), key: Date.now() });
  };

  if (session) {
    return (
      <Session
        key={session.key}
        title={`Practice${tags.length ? ` · ${tags.map(tagLabel).join(', ')}` : ''}`}
        words={session.words}
        skillFor={session.skillFor}
        mode={mode}
        direction={settings.practiceDirection}
        onExit={() => setSession(null)}
        onAnotherRound={start}
      />
    );
  }

  const canStart = count > 0 && (settings.autoExercise || modeAvailable(settings.practiceMode, words.length));

  return (
    <section className="screen">
      <div className="card hero practice-hero">
        {learned.length === 0 ? (
          <>
            <h2>Nothing to practice yet</h2>
            <p className="muted">Learn some words first; they show up here as soon as they’re learned.</p>
            <div className="row center">
              <button className="btn primary" onClick={onGoToLearn}>
                Go to Learn
              </button>
              {words.length === 0 && (
                <button className="btn" onClick={onGoToWords}>
                  Add words
                </button>
              )}
            </div>
          </>
        ) : (
          <>
            <button className="btn primary continue-btn" onClick={start} disabled={!canStart}>
              Start practice
            </button>
            <p className="muted small practice-sub">
              {count} exercise{count === 1 ? '' : 's'} · 🔥 {liveStreak(streak, on)} day streak · {daily.date === on ? daily.reviews : 0} answers today
            </p>
            <p className={`balance-hint ${hint.refresh ? 'refresh' : 'good'}`}>
              {hint.refresh ? (
                <>Lots to refresh ({hint.rusty} rusty words): practice before learning new words.</>
              ) : (
                <>
                  You’re in good shape{hint.rusty ? ` (${hint.rusty} rusty)` : ''}: a good time to learn new words.{' '}
                  <button className="link-btn" onClick={onGoToLearn}>
                    Learn new words →
                  </button>
                </>
              )}
            </p>
            <div className="practice-options">
              <Segmented
                label="Exercises per session"
                value={String(size) as (typeof SIZES)[number]}
                onChange={(v) => updateSettings({ practiceSize: Number(v) })}
                options={SIZES.map((v) => ({ value: v, label: v }))}
              />
              <TagFilter words={words} selected={tags} onChange={setTags} label="Focus" emptyLabel="Everything I’ve learned" />
            </div>
          </>
        )}
      </div>

      {learned.length > 0 && (
        <details className="card form exercise-settings">
          <summary>Exercise settings</summary>
          <label className="toggle">
            <input type="checkbox" checked={settings.autoExercise} onChange={(e) => updateSettings({ autoExercise: e.target.checked })} />
            <span>Choose exercises automatically</span>
          </label>
          {settings.autoExercise && (
            <>
              <Segmented
                label="Use sentences in reviews"
                value={settings.useSentences}
                onChange={(v) => updateSettings({ useSentences: v })}
                options={[
                  { value: 'off', label: 'Off' },
                  { value: 'some', label: 'Some' },
                  { value: 'max', label: 'As much as possible' },
                ]}
              />
              <p className="hint">
                Words can be reviewed inside a sentence that contains them (one where your other words are learned): fill the
                blank, reply in a dialogue, or read and check. Some = about 40% of the reviews that have such a sentence.
              </p>
            </>
          )}
          {settings.autoExercise ? (
            <p className="hint">
              Each word is tested on the skill that needs it most. Meaning and pinyin are asked together (the meaning first, then the
              pronunciation), recall on its own card. Each part is multiple choice until you know it well, then typing; medium
              pinyin sometimes gets listening.
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
        </details>
      )}
    </section>
  );
}
