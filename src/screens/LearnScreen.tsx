import { useState } from 'react';
import { useStore } from '../store';
import { learnedToday } from '../lib/learn';
import { updateSettings, useSettings } from '../lib/settings';
import { isNew } from '../lib/srs';
import type { Word } from '../lib/types';
import { LearnSession } from '../components/LearnSession';
import { Segmented } from '../components/Segmented';
import { TagPicker, tagLabel, wordsInTags } from '../components/TagPicker';

export function LearnScreen({ onGoToWords }: { onGoToWords(): void }) {
  const { words } = useStore();
  const { learnBatchSize, learnDailyLimit, learnTyping } = useSettings();
  const [tags, setTags] = useState<string[]>([]);
  const [session, setSession] = useState<{ pool: Word[]; title: string } | null>(null);

  const newWords = words.filter(isNew);
  const pool = wordsInTags(newWords, tags);
  const doneToday = learnedToday(words);
  const allowance = Math.max(0, learnDailyLimit - doneToday);
  const toLearn = Math.min(pool.length, allowance);

  if (session) return <LearnSession pool={session.pool} title={session.title} onExit={() => setSession(null)} />;

  return (
    <section className="screen">
      <div className="card hero">
        <div className="hero-stats">
          <div>
            <div className="stat-value">{newWords.length}</div>
            <div className="stat-label">new words</div>
          </div>
          <div>
            <div className="stat-value">
              {doneToday}
              <span className="stat-of">/{learnDailyLimit}</span>
            </div>
            <div className="stat-label">learned today</div>
          </div>
          <div>
            <div className="stat-value">{learnBatchSize}</div>
            <div className="stat-label">per batch</div>
          </div>
        </div>
        <p className="muted small">
          Each word gets a teaching card and a quick check, then the batch goes through rounds: meaning, listening, EN → 中
          {learnTyping ? ', typing' : ''}. Learned words start in Review tomorrow.
        </p>
      </div>

      {!newWords.length ? (
        <div className="card empty">
          <h2>No new words to learn</h2>
          <p>Every word in your list has been learned. Add more words to keep going.</p>
          <button className="btn primary" onClick={onGoToWords}>
            Go to word list
          </button>
        </div>
      ) : (
        <div className="card form setup-card">
          <div className="setup-col">
            <TagPicker words={newWords} selected={tags} onChange={setTags} label="Learn from (new words)" />
            <button
              className="btn primary block"
              disabled={!toLearn}
              onClick={() => setSession({ pool, title: tags.length ? `Learn · ${tags.map(tagLabel).join(', ')}` : 'Learn' })}
            >
              {toLearn ? `Start learning (${toLearn} word${toLearn === 1 ? '' : 's'})` : allowance === 0 ? 'Daily limit reached' : 'Nothing new here'}
            </button>
            {allowance === 0 && (
              <p className="hint">You’ve learned {doneToday} new words today, your daily limit. Come back tomorrow, or raise the limit.</p>
            )}
          </div>
          <div className="setup-col">
            <Segmented
              label="Words per batch"
              value={String(learnBatchSize) as '4' | '6' | '8' | '10'}
              onChange={(v) => updateSettings({ learnBatchSize: Number(v) })}
              options={[
                { value: '4', label: '4' },
                { value: '6', label: '6' },
                { value: '8', label: '8' },
                { value: '10', label: '10' },
              ]}
            />
            <label className="field">
              <span className="field-label">New words per day</span>
              <input
                className="input narrow"
                type="number"
                min={1}
                max={100}
                value={learnDailyLimit}
                onChange={(e) => {
                  const n = Math.round(Number(e.target.value));
                  if (n >= 1 && n <= 100) updateSettings({ learnDailyLimit: n });
                }}
              />
            </label>
            <label className="toggle">
              <input type="checkbox" checked={learnTyping} onChange={(e) => updateSettings({ learnTyping: e.target.checked })} />
              <span>Finish each batch with a typing round</span>
            </label>
          </div>
        </div>
      )}
    </section>
  );
}
