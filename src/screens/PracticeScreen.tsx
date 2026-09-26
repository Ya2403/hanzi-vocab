import { useState } from 'react';
import { useStore } from '../store';
import { updateSettings, useSettings } from '../lib/settings';
import { shuffle } from '../lib/words';
import type { Word } from '../lib/types';
import { Session } from '../components/Session';
import { modeAvailable, SessionOptions } from '../components/SessionOptions';
import { Segmented } from '../components/Segmented';
import { TagPicker, tagLabel, wordsInTags } from '../components/TagPicker';

type Count = '10' | '20' | '50' | 'all';

export function PracticeScreen() {
  const { words } = useStore();
  const settings = useSettings();
  // Categories can be preselected via a link like #practice?tag=HSK1 (from the word list).
  const [tags, setTags] = useState<string[]>(() => {
    const t = new URLSearchParams(location.hash.split('?')[1]).get('tag');
    return t ? [t] : [];
  });
  const [count, setCount] = useState<Count>('20');
  const [session, setSession] = useState<Word[] | null>(null);

  const pool = wordsInTags(words, tags);
  const size = count === 'all' ? pool.length : Math.min(pool.length, Number(count));

  if (session) {
    return (
      <Session
        title={`Practice${tags.length ? ` · ${tags.map(tagLabel).join(', ')}` : ''}`}
        words={session}
        mode={settings.practiceMode}
        direction={settings.practiceDirection}
        updateSchedule={false}
        onExit={() => setSession(null)}
      />
    );
  }

  const canStart = size > 0 && modeAvailable(settings.practiceMode, words.length);

  return (
    <section className="screen">
      <div className="card form setup-card">
        <div className="setup-col">
          <h2>Free practice</h2>
          <p className="muted small">Drill any words without affecting your review schedule. Answers still count toward your streak.</p>
          <SessionOptions
            mode={settings.practiceMode}
            direction={settings.practiceDirection}
            onMode={(practiceMode) => updateSettings({ practiceMode })}
            onDirection={(practiceDirection) => updateSettings({ practiceDirection })}
            totalWords={words.length}
          />
        </div>
        <div className="setup-col">
          <TagPicker words={words} selected={tags} onChange={setTags} label="Words" />
          <Segmented
            label="Cards"
            value={count}
            onChange={setCount}
            options={[
              { value: '10', label: '10' },
              { value: '20', label: '20' },
              { value: '50', label: '50' },
              { value: 'all', label: 'All' },
            ]}
          />
          <button className="btn primary block" disabled={!canStart} onClick={() => setSession(shuffle(pool).slice(0, size))}>
            {size ? `Start (${size} card${size === 1 ? '' : 's'})` : 'No words to practice'}
          </button>
        </div>
      </div>
    </section>
  );
}
