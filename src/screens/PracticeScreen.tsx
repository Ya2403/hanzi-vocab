import { useState } from 'react';
import { useStore } from '../store';
import { pickPractice } from '../lib/planner';
import { updateSettings, useSettings } from '../lib/settings';
import { isLearned } from '../lib/srs';
import type { Sentence, Word } from '../lib/types';
import { isSentenceLearned } from '../lib/sentenceLearn';
import { pickSentencePractice, practiceSplit } from '../lib/sentenceReview';
import { Session } from '../components/Session';
import { modeAvailable, SessionOptions } from '../components/SessionOptions';
import { Segmented } from '../components/Segmented';
import { TagFilter } from '../components/TagFilter';
import { tagLabel, wordsInTags } from '../components/TagPicker';

/**
 * Free practice on learned words (and sentences), weakest first (recent misses, low accuracy,
 * low ease, due soon, not seen lately). Correct answers don't change the schedule; a miss brings
 * the review forward to tomorrow at the latest.
 */
export function PracticeScreen() {
  const { words, sentences } = useStore();
  const settings = useSettings();
  // Categories can be preselected via a link like #practice?tag=HSK1 (from the word list).
  const [tags, setTags] = useState<string[]>(() => {
    const t = new URLSearchParams(location.hash.split('?')[1]).get('tag');
    return t ? [t] : [];
  });
  const [session, setSession] = useState<{ words: Word[]; sentences: Sentence[] } | null>(null);

  const learned = words.filter(isLearned);
  const pool = wordsInTags(learned, tags);
  const sentencePool = sentences.filter((s) => isSentenceLearned(s) && (!tags.length || s.tags.some((t) => tags.includes(t))));
  const split = practiceSplit(settings.practiceSize, pool.length, sentencePool.length, settings.practiceSentences);
  const size = split.words + split.sentences;
  const mode = settings.autoExercise ? 'auto' : settings.practiceMode;

  if (session) {
    return (
      <Session
        title={`Practice${tags.length ? ` · ${tags.map(tagLabel).join(', ')}` : ''}`}
        words={session.words}
        sentences={session.sentences}
        mode={mode}
        direction={settings.practiceDirection}
        updateSchedule={false}
        onExit={() => setSession(null)}
      />
    );
  }

  const canStart = size > 0 && (settings.autoExercise || !split.words || modeAvailable(settings.practiceMode, words.length));

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
            label="Practice"
            value={settings.practiceSentences ? 'both' : 'words'}
            onChange={(v) => updateSettings({ practiceSentences: v === 'both' })}
            options={[
              { value: 'words', label: 'Words only' },
              { value: 'both', label: 'Words + sentences' },
            ]}
          />
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
          <button className="btn primary block" disabled={!canStart} onClick={() => setSession({ words: pickPractice(pool, split.words), sentences: pickSentencePractice(sentencePool, split.sentences) })}>
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
              Each word is tested on its weakest skill. Meaning and pinyin are asked together (the meaning first, then the pronunciation), recall on its own card. Each part is multiple choice until you know it well, then typing; medium pinyin sometimes gets listening. Missed cards come back as multiple choice.
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
