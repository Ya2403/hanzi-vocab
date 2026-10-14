import { useMemo, useState } from 'react';
import { useStore } from '../store';
import { pendingReading, READING_EXERCISES } from '../lib/dailyReading';
import { today } from '../lib/date';
import { balanceHint } from '../lib/planner';
import { planSession } from '../lib/wordPractice';
import { updateSettings, useSettings } from '../lib/settings';
import { isLearned } from '../lib/srs';
import { isCharEntry, isWordEntry } from '../lib/entries';
import { liveStreak } from '../lib/streak';
import type { Dialogue, Skill, Word } from '../lib/types';
import { TodayReadingCard } from '../components/DailyReading';
import { dialogueText, Reader } from '../components/Reader';
import { Session } from '../components/Session';
import { modeAvailable, SessionOptions } from '../components/SessionOptions';
import { Segmented } from '../components/Segmented';
import { TagFilter } from '../components/TagFilter';
import { tagLabel, wordsInTags } from '../components/TagPicker';

const SIZES = ['10', '20', '30'] as const;

/**
 * The home screen. One button starts a session of a fixed number of exercises; which characters
 * come up is decided in the background from each skill's FSRS retrievability, recent misses
 * and accuracy (about 80% the ones that need it most, 20% random stronger ones). Some of them are
 * practised through one of their words, and words that need work come up on their own.
 */
export function PracticeScreen({ onGoToLearn, onGoToWords }: { onGoToLearn(): void; onGoToWords(): void }) {
  const { words, sentences, dialogues, charLinks, streak, daily } = useStore();
  const settings = useSettings();
  // A focus can be preselected via a link like #practice?tag=HSK1 (from the word list).
  const [tags, setTags] = useState<string[]>(() => {
    const t = new URLSearchParams(location.hash.split('?')[1]).get('tag');
    return t ? [t] : [];
  });
  // A session starts with today's reading when it hasn't been read yet.
  const [session, setSession] = useState<{ words: Word[]; skillFor: Map<string, Skill>; targets: Map<string, string>; key: number; reading?: Dialogue } | null>(null);
  const [reading, setReading] = useState<Dialogue | null>(null);

  // Sessions pick character skills (words come in through their characters).
  const learned = useMemo(() => words.filter((w) => isCharEntry(w) && isLearned(w)), [words]);
  const pool = wordsInTags(learned, tags);
  const unlockedWords = useMemo(() => words.filter((w) => isWordEntry(w) && isLearned(w)), [words]);
  const size = Number(SIZES.includes(String(settings.practiceSize) as (typeof SIZES)[number]) ? settings.practiceSize : 20);
  const pending = pendingReading(dialogues);
  const wordSize = pending ? Math.max(1, size - READING_EXERCISES) : size;
  const count = Math.min(pool.length, wordSize);
  const mode = settings.autoExercise ? 'auto' : settings.practiceMode;
  const hint = useMemo(() => balanceHint(learned), [learned]);
  const on = today();

  const start = () => {
    const picked = planSession(pool, wordsInTags(unlockedWords, tags), wordSize, charLinks, { use: settings.wordsInPractice });
    setSession({
      words: picked.map((p) => p.entry),
      skillFor: new Map(picked.map((p) => [p.entry.id, p.skill])),
      targets: new Map(picked.flatMap((p) => (p.target ? [[p.entry.id, p.target.id] as const] : []))),
      key: Date.now(),
      reading: pending,
    });
  };

  if (reading) return <Reader text={dialogueText(reading, sentences)} onClose={() => setReading(null)} />;
  if (session?.reading) {
    // The reading first; closing it (finished or not) goes on to the words.
    return <Reader key={session.key} text={dialogueText(session.reading, sentences)} onClose={() => setSession({ ...session, reading: undefined })} />;
  }
  if (session) {
    return (
      <Session
        key={session.key}
        title={`Practice${tags.length ? ` · ${tags.map(tagLabel).join(', ')}` : ''}`}
        words={session.words}
        skillFor={session.skillFor}
        targets={session.targets}
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
              {pending ? `Today’s reading + ${count} word exercise${count === 1 ? '' : 's'}` : `${count} exercise${count === 1 ? '' : 's'}`} · 🔥 {liveStreak(streak, on)} day streak · {daily.date === on ? daily.reviews : 0} answers today
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

      {learned.length > 0 && <TodayReadingCard onRead={setReading} />}

      {learned.length > 0 && (
        <details className="card form exercise-settings">
          <summary>Exercise settings</summary>
          <label className="toggle">
            <input type="checkbox" checked={settings.autoExercise} onChange={(e) => updateSettings({ autoExercise: e.target.checked })} />
            <span>Choose exercises automatically</span>
          </label>
          <Segmented
            label="Words in practice"
            value={settings.wordsInPractice}
            onChange={(v) => updateSettings({ wordsInPractice: v })}
            options={[
              { value: 'off', label: 'Off' },
              { value: 'some', label: 'Some' },
              { value: 'lot', label: 'A lot' },
            ]}
          />
          <p className="hint">
            A character can be practised through one of its unlocked words (about 40% of the time with Some, 75% with A lot). A word answer
            counts for its characters. Words that need work (missed or looked up) also come up on their own.
          </p>
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
